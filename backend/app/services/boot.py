"""Boot readiness probe for the console.

A first page load runs this sequence for real: every stage queries the live
platform, and the console only reveals the workspace when every stage passes.
Nothing here is decorative — the values come from PostgreSQL, the payload blocks,
the archive manifests and the harmonization audit trail.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.modules import MODULES
from app.db.models import (
    AlgorithmRun,
    FireEvent,
    ObservationMatch,
    RawObservation,
    RawPayloadBlock,
)
from app.services import integrity
from app.services.data_status import build_data_status
from app.services.db_health import check_database

StageResult = tuple[bool, str, dict[str, Any]]
StageCheck = Callable[[], StageResult]


def _timed(key: str, label: str, check: StageCheck) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        ok, detail, metrics = check()
    except Exception as exc:  # noqa: BLE001 - a boot probe must report, not raise
        ok, detail, metrics = False, f"{type(exc).__name__}: {exc}"[:220], {}
    return {
        "key": key,
        "label": label,
        "ok": ok,
        "detail": detail,
        "metrics": metrics,
        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
    }


def _archive_root(settings: Settings) -> Path:
    return Path(settings.local_data_directory) / "raw_exports"


def run_boot_checks(
    session: Session, settings: Settings, *, stage: str | None = None
) -> dict[str, Any]:
    """Run the boot stages against the live system and report what they found.

    ``stage`` runs a single check, which is how the console sequences them: each
    step is a real request whose result is shown before the next one starts.
    """
    started = time.perf_counter()

    def platform() -> StageResult:
        database = check_database(settings)
        metrics = {
            "app": settings.app_name,
            "version": settings.app_version,
            "environment": settings.environment,
            "dialect": database.dialect,
            "latency_ms": database.latency_ms,
            "modules": len(MODULES),
        }
        if not database.connected:
            return False, database.error or "database is unreachable", metrics
        return (
            True,
            f"{settings.app_name} {settings.app_version} · {database.dialect} · "
            f"{database.latency_ms} ms · {len(MODULES)} modules",
            metrics,
        )

    def fireseal() -> StageResult:
        blocks = int(
            session.scalar(select(func.count()).select_from(RawPayloadBlock)) or 0
        )
        rows_in_blocks = int(
            session.scalar(select(func.coalesce(func.sum(RawPayloadBlock.rows), 0))) or 0
        )
        compressed_bytes = int(
            session.scalar(select(func.coalesce(func.sum(RawPayloadBlock.compressed_bytes), 0)))
            or 0
        )
        raw_rows = int(session.scalar(select(func.count()).select_from(RawObservation)) or 0)
        pointers = int(
            session.scalar(
                select(func.count())
                .select_from(RawObservation)
                .where(RawObservation.block_id.isnot(None))
            )
            or 0
        )
        inline = int(
            session.scalar(
                select(func.count())
                .select_from(RawObservation)
                .where(RawObservation.payload.isnot(None))
            )
            or 0
        )

        root = _archive_root(settings)
        manifests = (
            sorted(root.glob("*.manifest.json"), key=lambda p: p.stat().st_mtime, reverse=True)
            if root.is_dir()
            else []
        )
        newest_verified: str | None = None
        if manifests:
            artifact = manifests[0].with_name(manifests[0].name.removesuffix(".manifest.json"))
            report = integrity.verify_archive(artifact)  # raises IntegrityError on failure
            newest_verified = Path(str(report["path"])).name

        ok = inline == 0 and pointers == raw_rows
        detail = (
            f"{blocks:,} payload blocks · {pointers:,} pointers · {inline:,} inline payloads · "
            f"{len(manifests):,} archives"
            + (" · newest verified" if newest_verified else "")
        )
        return (
            ok,
            detail,
            {
                "blocks": blocks,
                "rows_in_blocks": rows_in_blocks,
                "compressed_bytes": compressed_bytes,
                "raw_rows": raw_rows,
                "block_pointers": pointers,
                "inline_payloads": inline,
                "archives": len(manifests),
                "newest_verified": newest_verified,
            },
        )

    def harmonization() -> StageResult:
        rows = session.execute(
            select(ObservationMatch.match_status, func.count()).group_by(
                ObservationMatch.match_status
            )
        ).all()
        counts = {str(status): int(count) for status, count in rows}
        latest = session.scalars(
            select(AlgorithmRun)
            .where(AlgorithmRun.kind == "harmonization")
            .order_by(AlgorithmRun.started_at.desc())
            .limit(1)
        ).first()
        events = int(session.scalar(select(func.count()).select_from(FireEvent)) or 0)
        version = latest.algorithm_version if latest is not None else "not run"
        ok = latest is None or latest.status != "failed"
        detail = (
            f"{counts.get('probable', 0):,} probable · {counts.get('possible', 0):,} possible · "
            f"{counts.get('rejected', 0):,} rejected · {events:,} events · {version}"
        )
        return (
            ok,
            detail,
            {
                "probable": counts.get("probable", 0),
                "possible": counts.get("possible", 0),
                "rejected": counts.get("rejected", 0),
                "events": events,
                "algorithm_version": version,
                "last_run_status": latest.status if latest is not None else None,
            },
        )

    def data() -> StageResult:
        status = build_data_status(session, settings)
        rollup_days: int | None
        try:
            rollup_days = int(
                session.scalar(text("SELECT count(DISTINCT day) FROM daily_activity")) or 0
            )
        except Exception:  # noqa: BLE001 - the rollup may not exist before migrations run
            rollup_days = None
        stored = status.observations_stored or 0
        coverage_end = getattr(status, "coverage_end", None)
        if coverage_end is None and status.last_observation_at is not None:
            coverage_end = status.last_observation_at.date()
        detail = (
            f"{stored:,} detections · coverage to {coverage_end or 'n/a'} · "
            f"{status.freshness} · "
            + (f"{rollup_days:,} rollup days" if rollup_days is not None else "rollups idle")
        )
        return (
            True,
            detail,
            {
                "observations_stored": stored,
                "freshness": status.freshness,
                "coverage_end": coverage_end.isoformat() if coverage_end else None,
                "last_observation_at": status.last_observation_at.isoformat()
                if status.last_observation_at
                else None,
                "synthetic_observations": status.synthetic_observations,
                "rollup_days": rollup_days,
            },
        )

    stages = [
        _timed("platform", "Activating Hermes", platform),
        _timed("fireseal", "Sealing FireSeal", fireseal),
        _timed("harmonization", "Harmonising sensors", harmonization),
        _timed("data", "Initiating console", data),
    ]
    if stage is not None:
        stages = [item for item in stages if item["key"] == stage]
        if not stages:
            raise ValueError(f"unknown boot stage: {stage}")

    return {
        "ok": all(item["ok"] for item in stages),
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
        "stages": stages,
    }
