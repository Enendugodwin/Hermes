"""Verify raw-payload archives and Parquet datasets against their manifests.

    python -m scripts.verify_archives
    python -m scripts.verify_archives --quarantine

Exit code is 1 if anything fails, so this can run as a scheduled integrity check.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.core.config import get_settings
from app.services import integrity


def verify_raw_exports(root: Path, *, quarantine: bool) -> dict[str, int]:
    stats = {"ok": 0, "failed": 0, "missing_manifest": 0}
    if not root.is_dir():
        return stats
    for manifest in sorted(root.glob("*.manifest.json")):
        artifact = manifest.with_name(manifest.name.removesuffix(".manifest.json"))
        if not artifact.is_file():
            stats["missing_manifest"] += 1
            continue
        try:
            integrity.verify_archive(artifact)
            stats["ok"] += 1
        except integrity.IntegrityError as exc:
            stats["failed"] += 1
            print(f"FAIL raw {artifact.name}: {exc}")
            if quarantine:
                integrity.quarantine(artifact, reason=f"verify_failed: {exc}")
    return stats


def verify_datasets(root: Path, *, quarantine: bool) -> dict[str, int]:
    stats = {"ok": 0, "failed": 0, "missing_manifest": 0}
    if not root.is_dir():
        return stats
    for meta in sorted(root.rglob("*.meta.json")):
        try:
            entry = json.loads(meta.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            stats["failed"] += 1
            print(f"FAIL meta {meta}: {exc}")
            continue
        artifact = root / str(entry.get("path", ""))
        if not artifact.is_file():
            stats["missing_manifest"] += 1
            print(f"MISSING dataset {artifact}")
            continue
        try:
            if integrity.sha256_file(artifact) != entry.get("checksum"):
                raise integrity.IntegrityError("file checksum mismatch")
            integrity.verify_parquet(artifact, expected_rows=int(entry.get("records", 0)))
            stats["ok"] += 1
        except (integrity.IntegrityError, OSError) as exc:
            stats["failed"] += 1
            print(f"FAIL dataset {artifact}: {exc}")
            if quarantine:
                integrity.quarantine(artifact, reason=f"verify_failed: {exc}")
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--quarantine",
        action="store_true",
        help="move failed artifacts aside with a JSON report",
    )
    args = parser.parse_args()

    settings = get_settings()
    base = Path(settings.local_data_directory)
    raw = verify_raw_exports(base / "raw_exports", quarantine=args.quarantine)
    datasets = verify_datasets(base / "firewatch-data", quarantine=args.quarantine)

    print("raw archives:", raw)
    print("parquet datasets:", datasets)
    failed = sum(report["failed"] + report["missing_manifest"] for report in (raw, datasets))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
