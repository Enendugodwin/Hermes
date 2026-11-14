"""Move legacy inline raw payloads into batch-compressed blocks.

Idempotent: only rows with ``payload IS NOT NULL AND block_id IS NULL`` are
touched. Run after the 0018 migration; new ingests already write blocks.

    python -m scripts.compress_raw_payloads [--batch-size=2000] [--dry-run]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import uuid
from datetime import date

from sqlalchemy import func, null, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import RawObservation, RawPayloadBlock
from app.db.session import session_scope
from app.services import integrity


def _acq_day(row: RawObservation) -> date | None:
    if row.acq_date is not None:
        return row.acq_date
    value = str((row.payload or {}).get("acq_date", ""))[:10]
    try:
        return date.fromisoformat(value)
    except ValueError:
        return row.retrieved_at.date() if row.retrieved_at else None


def _compress_batch(
    session: Session, rows: list[RawObservation], *, level: int, block_rows: int
) -> tuple[int, int]:
    by_key: dict[tuple[date, object], list[RawObservation]] = {}
    for row in rows:
        day = _acq_day(row)
        if day is not None and row.payload is not None:
            row.acq_date = day
            by_key.setdefault((day, row.source_id), []).append(row)

    blocks_to_add: list[RawPayloadBlock] = []
    assignments: list[tuple[RawPayloadBlock, list[RawObservation]]] = []
    saved = 0
    for (day, source_id), day_rows in sorted(
        by_key.items(), key=lambda item: (item[0][0], str(item[0][1]))
    ):
        for start in range(0, len(day_rows), block_rows):
            chunk = day_rows[start : start + block_rows]
            content = b"\n".join(
                json.dumps(row.payload, sort_keys=True, separators=(",", ":")).encode()
                for row in chunk
            )
            compressed = integrity.gzip_bytes(content, level=level)
            block = RawPayloadBlock(
                id=uuid.uuid4(),
                source_id=source_id,
                acq_date=day,
                codec="gzip",
                compression_level=level,
                rows=len(chunk),
                uncompressed_bytes=len(content),
                compressed_bytes=len(compressed),
                uncompressed_sha256=hashlib.sha256(content).hexdigest(),
                compressed_sha256=hashlib.sha256(compressed).hexdigest(),
                data=compressed,
            )
            blocks_to_add.append(block)
            assignments.append((block, chunk))
            saved += len(content) - len(compressed)

    # Blocks must exist before rows point at them (FK).
    session.add_all(blocks_to_add)
    session.flush()
    for block, chunk in assignments:
        for index, row in enumerate(chunk):
            row.block_id = block.id
            row.block_row = index
        # JSON `None` would persist as JSON null; force a real SQL NULL.
        session.execute(
            update(RawObservation)
            .where(RawObservation.id.in_([row.id for row in chunk]))
            .values(payload=null())
        )
    return len(blocks_to_add), saved


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch-size", type=int, default=5000)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    settings = get_settings()
    total_rows = 0
    total_blocks = 0
    total_saved = 0
    while True:
        with session_scope() as session:
            remaining = session.scalar(
                select(func.count())
                .select_from(RawObservation)
                .where(RawObservation.payload.isnot(None), RawObservation.block_id.is_(None))
            )
            rows = list(
                session.scalars(
                    select(RawObservation)
                    .where(RawObservation.payload.isnot(None), RawObservation.block_id.is_(None))
                    .order_by(RawObservation.acq_date, RawObservation.source_id)
                    .limit(args.batch_size)
                ).all()
            )
            if not rows:
                break
            if args.dry_run:
                print(f"dry-run: {remaining} rows remain; would compress {len(rows)}")
                return 0
            blocks, saved = _compress_batch(
                session,
                rows,
                level=settings.archive_compression_level,
                block_rows=settings.raw_block_rows,
            )
            total_rows += len(rows)
            total_blocks += blocks
            total_saved += saved
            print(f"compressed {len(rows)} rows into {blocks} blocks; saved {saved:,} bytes")
            if blocks == 0:
                print("no rows had a usable acquisition date; stopping")
                break

    print(
        f"done: {total_rows:,} rows, {total_blocks:,} blocks, "
        f"{total_saved:,} bytes saved before DB overhead"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
