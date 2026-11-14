"""Raw-payload retention and the export-before-delete workflow.

Raw payloads are provenance, not analysis. The canonical observations, matches,
events and rollups are what the console reads, so payloads can be exported and
then removed without changing a single number on screen.

Two rules keep deletion honest:

* an export records the exact row count and SHA-256 of the CSV it produced;
* a delete is refused unless the caller presents that checksum and the range
  still holds exactly the exported number of rows.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.dialect import dialect_name
from app.db.models import DataSource, RawExport, RawObservation, RawPayloadBlock
from app.services import integrity, raw_payloads

CSV_HEADER = (
    "source_code",
    "source_record_id",
    "content_hash",
    "retrieved_at",
    "payload",
)


def acq_date_expr():
    """The acquisition day, indexed on the row (never decoded from a block)."""
    return RawObservation.acq_date


def export_root(settings: Settings) -> Path:
    root = Path(settings.local_data_directory) / "raw_exports"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _today() -> date:
    return datetime.now(UTC).date()


def _row_count(session: Session, start: date, end: date) -> int:
    expr = acq_date_expr()
    return int(
        session.scalar(
            select(func.count()).select_from(RawObservation).where(expr >= start, expr <= end)
        )
        or 0
    )


def inventory(session: Session, settings: Settings) -> dict[str, Any]:
    """Per-day payload footprint, plus the policy the console should show."""
    expr = acq_date_expr()
    day_rows = session.execute(
        select(expr.label("day"), func.count())
        .select_from(RawObservation)
        .group_by(expr)
        .order_by(expr.desc())
    ).all()

    sizes: dict[str, int] = {
        str(day): int(size or 0)
        for day, size in session.execute(
            select(RawPayloadBlock.acq_date, func.sum(RawPayloadBlock.compressed_bytes)).group_by(
                RawPayloadBlock.acq_date
            )
        ).all()
        if day is not None
    }
    if dialect_name(session) == "postgresql":
        # Legacy inline payloads still count toward the footprint until the
        # backfill script moves them into blocks.
        for day, size in session.execute(
            select(expr.label("day"), func.sum(func.pg_column_size(RawObservation.payload)))
            .select_from(RawObservation)
            .where(RawObservation.payload.isnot(None))
            .group_by(expr)
        ).all():
            if day is not None:
                sizes[str(day)] = sizes.get(str(day), 0) + int(size or 0)

    total_rows = sum(count for _, count in day_rows)
    today = _today()
    export_cutoff = today - timedelta(days=settings.raw_export_min_age_days)
    retention_cutoff = today - timedelta(days=settings.raw_retention_days)

    days = [
        {
            "day": day.isoformat(),
            "rows": int(count),
            "payload_bytes": sizes.get(day.isoformat()),
            "exportable": day <= export_cutoff,
            "past_retention": day < retention_cutoff,
        }
        for day, count in day_rows
        if day is not None
    ]

    return {
        "policy": {
            "retention_days": settings.raw_retention_days,
            "retention_cutoff": retention_cutoff.isoformat(),
            "export_min_age_days": settings.raw_export_min_age_days,
            "export_cutoff": export_cutoff.isoformat(),
            "export_max_days": settings.raw_export_max_days,
        },
        "totals": {
            "rows": total_rows,
            "payload_bytes": sum(sizes.values()) if sizes else None,
            "days": len(days),
            "past_retention_rows": sum(d["rows"] for d in days if d["past_retention"]),
        },
        "days": days,
    }


class _HashingSink(io.RawIOBase):
    """Forward bytes to the gzip stream while hashing the uncompressed CSV."""

    def __init__(self, target: Any, digest: Any) -> None:
        self._target = target
        self._digest = digest
        self.bytes_written = 0

    def writable(self) -> bool:  # noqa: D102 - io protocol
        return True

    def write(self, data: Any) -> int:  # noqa: D102 - io protocol
        self._digest.update(data)
        self.bytes_written += len(data)
        return self._target.write(data)


def create_export(
    session: Session,
    settings: Settings,
    *,
    start_date: date,
    end_date: date,
) -> RawExport:
    if end_date < start_date:
        raise ValueError("end_date must not be before start_date")
    span = (end_date - start_date).days + 1
    if span > settings.raw_export_max_days:
        raise ValueError(f"export at most {settings.raw_export_max_days} days at a time")
    latest_exportable = _today() - timedelta(days=settings.raw_export_min_age_days)
    if end_date > latest_exportable:
        raise ValueError(
            "only payloads older than "
            f"{settings.raw_export_min_age_days} days can be exported "
            f"(latest {latest_exportable.isoformat()})"
        )

    expr = acq_date_expr()
    statement = (
        select(
            DataSource.source_code,
            RawObservation.source_record_id,
            RawObservation.content_hash,
            RawObservation.retrieved_at,
            RawObservation.payload,
            RawObservation.block_id,
            RawObservation.block_row,
        )
        .join(DataSource, DataSource.id == RawObservation.source_id)
        .where(expr >= start_date, expr <= end_date)
        .order_by(expr, DataSource.source_code, RawObservation.source_record_id)
    )

    root = export_root(settings)
    filename = f"raw_{start_date}_{end_date}_{uuid.uuid4().hex[:8]}.csv.gz"
    path = root / filename
    temporary = path.with_name(path.name + ".part")
    digest = hashlib.sha256()
    rows = 0
    level = settings.archive_compression_level
    block_cache = raw_payloads.PayloadBlockCache()

    try:
        with temporary.open("wb") as handle:
            gz = integrity.gzip_writer(handle, level=level)
            sink = _HashingSink(gz, digest)
            text = io.TextIOWrapper(io.BufferedWriter(sink), encoding="utf-8", newline="")
            writer = csv.writer(text)
            writer.writerow(CSV_HEADER)
            for (
                source_code,
                record_id,
                content_hash,
                retrieved_at,
                payload,
                block_id,
                block_row,
            ) in session.execute(statement).yield_per(5_000):
                resolved = raw_payloads.payload_from(
                    session,
                    payload=payload,
                    block_id=block_id,
                    block_row=block_row,
                    cache=block_cache,
                )
                writer.writerow(
                    (
                        source_code,
                        record_id,
                        content_hash,
                        retrieved_at.isoformat() if retrieved_at else "",
                        json.dumps(resolved, sort_keys=True, separators=(",", ":")),
                    )
                )
                rows += 1
            text.flush()
            text.detach()
            gz.close()
            handle.flush()
            os.fsync(handle.fileno())
    except Exception:
        temporary.unlink(missing_ok=True)
        raise

    if rows == 0:
        temporary.unlink(missing_ok=True)
        raise ValueError("no raw payloads exist in that range")

    manifest = integrity.finalize_gzip_archive(
        temporary,
        path,
        uncompressed_sha256=digest.hexdigest(),
        uncompressed_bytes=sink.bytes_written,
        rows=rows,
        compression_level=level,
        extra={
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "kind": "raw_export",
        },
    )

    record = RawExport(
        start_date=start_date,
        end_date=end_date,
        rows=rows,
        size_bytes=manifest.compressed_bytes,
        sha256=manifest.uncompressed_sha256,
        codec=manifest.codec,
        compressed_sha256=manifest.compressed_sha256,
        uncompressed_size=manifest.uncompressed_bytes,
        verified_at=datetime.now(UTC),
        path=filename,
        status="ready",
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def _delete_orphan_blocks(session: Session, start: date, end: date) -> int:
    """Remove compressed blocks whose rows were all deleted."""
    referenced = select(RawObservation.block_id).where(RawObservation.block_id.isnot(None))
    result = session.execute(
        delete(RawPayloadBlock).where(
            RawPayloadBlock.acq_date >= start,
            RawPayloadBlock.acq_date <= end,
            RawPayloadBlock.id.notin_(referenced),
        )
    )
    return int(getattr(result, "rowcount", 0) or 0)


def delete_export(
    session: Session,
    *,
    export_id: uuid.UUID,
    confirm_sha256: str,
    settings: Settings | None = None,
) -> dict[str, Any]:
    settings = settings or get_settings()
    record = session.get(RawExport, export_id)
    if record is None:
        raise LookupError("export not found")
    if record.status != "ready":
        raise ValueError("that range has already been deleted")
    if confirm_sha256.strip().lower() != record.sha256.lower():
        raise ValueError("checksum does not match the export")

    current = _row_count(session, record.start_date, record.end_date)
    if current != record.rows:
        raise ValueError(
            "the raw rows changed since the export "
            f"(exported {record.rows:,}, found {current:,}); export again first"
        )

    # Never delete the source payloads unless the archive itself still verifies.
    artifact = export_root(settings) / record.path
    try:
        integrity.verify_archive(artifact)
    except FileNotFoundError as exc:
        raise ValueError(
            "the exported archive is missing; export it again before deleting"
        ) from exc
    except integrity.IntegrityError as exc:
        raise ValueError(
            f"the exported archive failed its integrity check; export it again ({exc})"
        ) from exc

    expr = acq_date_expr()
    result = session.execute(
        delete(RawObservation).where(
            expr >= record.start_date,
            expr <= record.end_date,
        )
    )
    deleted = int(getattr(result, "rowcount", 0) or 0)
    blocks_deleted = _delete_orphan_blocks(session, record.start_date, record.end_date)
    record.status = "deleted"
    record.deleted_at = datetime.now(UTC)
    record.rows_deleted = deleted
    session.commit()
    return {
        "export_id": str(record.id),
        "rows_deleted": deleted,
        "blocks_deleted": blocks_deleted,
    }


def retention_preview(
    session: Session, settings: Settings, *, days: int | None = None
) -> dict[str, Any]:
    days = settings.raw_retention_days if days is None else days
    if days < 1:
        raise ValueError("retention must keep at least one day")
    cutoff = _today() - timedelta(days=days)
    expr = acq_date_expr()
    rows = int(
        session.scalar(select(func.count()).select_from(RawObservation).where(expr < cutoff)) or 0
    )
    oldest = session.scalar(select(func.min(expr)).select_from(RawObservation))
    return {
        "days": days,
        "cutoff": cutoff.isoformat(),
        "rows": rows,
        "oldest_day": oldest.isoformat() if oldest else None,
    }


def run_retention(
    session: Session, settings: Settings, *, days: int | None = None, apply: bool = False
) -> dict[str, Any]:
    preview = retention_preview(session, settings, days=days)
    if not apply:
        return {**preview, "applied": False}

    expr = acq_date_expr()
    cutoff = date.fromisoformat(str(preview["cutoff"]))
    result = session.execute(delete(RawObservation).where(expr < cutoff))
    deleted = int(getattr(result, "rowcount", 0) or 0)
    blocks_deleted = _delete_orphan_blocks(session, date(1900, 1, 1), cutoff)
    session.commit()
    return {
        **preview,
        "applied": True,
        "rows_deleted": deleted,
        "blocks_deleted": blocks_deleted,
    }
