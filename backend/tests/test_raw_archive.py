"""Raw-payload export, deletion and retention.

The analytical contract is simple: deleting a payload must not change a single
canonical observation. These tests pin that down, plus the checksum gate that
stands between an export and a delete.
"""

from __future__ import annotations

import csv
import gzip
import io
import json
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.core.config import Settings
from app.db.models import (
    DataSource,
    FireObservation,
    RawExport,
    RawObservation,
    RawPayloadBlock,
)
from app.db.session import session_scope
from app.services import integrity, raw_archive, raw_payloads


def _settings(tmp_path) -> Settings:
    return Settings(local_data_directory=str(tmp_path))


def _source_id(session) -> tuple[object, str]:
    source = session.scalars(select(DataSource).order_by(DataSource.source_code)).first()
    assert source is not None
    return source.id, source.source_code


def _add_raw(session, day: date, count: int, prefix: str = "rec") -> None:
    source_id, _ = _source_id(session)
    for index in range(count):
        session.add(
            RawObservation(
                source_id=source_id,
                source_record_id=f"{prefix}-{day.isoformat()}-{index}",
                content_hash=f"{prefix}{day:%Y%m%d}{index:04d}".ljust(64, "0"),
                acq_date=day,
                payload={
                    "latitude": -3.1,
                    "longitude": -60.2,
                    "acq_date": day.isoformat(),
                    "acq_time": "1345",
                    "confidence": "nominal",
                },
            )
        )
    session.commit()


def _add_canonical(session, day: date, prefix: str = "canon") -> None:
    source_id, source_code = _source_id(session)
    session.add(
        FireObservation(
            source_id=source_id,
            source_code=source_code,
            source_record_id=f"{prefix}-{day.isoformat()}",
            sensor="MODIS",
            satellite="Terra",
            latitude=-3.1,
            longitude=-60.2,
            acquired_at=datetime(day.year, day.month, day.day, 13, 45, tzinfo=UTC),
            source_product="MODIS_SP",
            quality_flags={},
        )
    )
    session.commit()


def test_export_then_delete_roundtrip(tmp_path) -> None:
    old_day = date(2024, 1, 10)
    settings = _settings(tmp_path)
    with session_scope() as session:
        _add_raw(session, old_day, 3)
        inventory = raw_archive.inventory(session, settings)
        assert inventory["totals"]["rows"] == 3
        assert inventory["days"][0]["day"] == old_day.isoformat()
        assert inventory["days"][0]["exportable"] is True

        record = raw_archive.create_export(session, settings, start_date=old_day, end_date=old_day)
        assert record.rows == 3
        assert record.size_bytes > 0
        assert len(record.sha256) == 64
        assert record.codec == "gzip"
        assert record.compressed_sha256 and len(record.compressed_sha256) == 64
        assert record.uncompressed_size and record.uncompressed_size > 0
        assert record.verified_at is not None
        path = raw_archive.export_root(settings) / record.path
        assert path.is_file()
        manifest = json.loads(
            path.with_name(path.name + ".manifest.json").read_text(encoding="utf-8")
        )
        assert manifest["compressed_sha256"] == record.compressed_sha256
        assert manifest["uncompressed_sha256"] == record.sha256

        with gzip.open(path, "rt", encoding="utf-8", newline="") as handle:
            rows = list(csv.reader(handle))
        assert rows[0] == list(raw_archive.CSV_HEADER)
        assert len(rows) == 4
        assert rows[1][0]  # source code
        assert old_day.isoformat() in rows[1][4]

        with pytest.raises(ValueError, match="checksum"):
            raw_archive.delete_export(
                session,
                export_id=record.id,
                confirm_sha256="0" * 64,
                settings=settings,
            )

        result = raw_archive.delete_export(
            session,
            export_id=record.id,
            confirm_sha256=record.sha256,
            settings=settings,
        )
        assert result["rows_deleted"] == 3

        remaining = session.scalar(select(func.count()).select_from(RawObservation))
        assert remaining == 0
        stored = session.get(RawExport, record.id)
        assert stored is not None and stored.status == "deleted"
        assert stored.rows_deleted == 3


def test_delete_refuses_a_corrupt_archive(tmp_path) -> None:
    day = date(2024, 1, 12)
    settings = _settings(tmp_path)
    with session_scope() as session:
        _add_raw(session, day, 2)
        record = raw_archive.create_export(session, settings, start_date=day, end_date=day)
        artifact = raw_archive.export_root(settings) / record.path
        data = bytearray(artifact.read_bytes())
        data[-1] ^= 0xFF
        artifact.write_bytes(data)

        with pytest.raises(ValueError, match="integrity"):
            raw_archive.delete_export(
                session,
                export_id=record.id,
                confirm_sha256=record.sha256,
                settings=settings,
            )
        assert session.get(RawExport, record.id).status == "ready"


def test_export_decompresses_block_storage(tmp_path, loaded_fixture) -> None:
    settings = _settings(tmp_path)
    with session_scope() as session:
        blocks = session.scalar(select(func.count()).select_from(RawPayloadBlock))
        assert blocks and blocks > 0

        record = raw_archive.create_export(
            session,
            settings,
            start_date=date(2026, 10, 28),
            end_date=date(2026, 10, 29),
        )
        path = raw_archive.export_root(settings) / record.path
        with gzip.open(path, "rt", encoding="utf-8", newline="") as handle:
            rows = list(csv.reader(handle))
        assert len(rows) == record.rows + 1
        assert "latitude" in rows[1][4]


def test_corrupt_payload_block_is_detected(loaded_fixture) -> None:
    with session_scope() as session:
        block = session.scalars(select(RawPayloadBlock)).first()
        assert block is not None
        block.data = b"\x00" + block.data[1:]
        block_id = block.id

    with session_scope() as session:
        block = session.get(RawPayloadBlock, block_id)
        assert block is not None
        with pytest.raises(integrity.IntegrityError):
            raw_payloads.decode_block(block)


def test_export_refuses_recent_window(tmp_path) -> None:
    settings = _settings(tmp_path)
    today = datetime.now(UTC).date()
    with session_scope() as session:
        _add_raw(session, today, 1)
        with pytest.raises(ValueError, match="older than"):
            raw_archive.create_export(session, settings, start_date=today, end_date=today)


def test_export_refuses_oversized_span(tmp_path) -> None:
    settings = _settings(tmp_path)
    start = date(2024, 1, 1)
    with session_scope() as session, pytest.raises(ValueError, match="at most"):
        raw_archive.create_export(session, settings, start_date=start, end_date=date(2024, 6, 1))


def test_delete_refuses_when_rows_changed(tmp_path) -> None:
    old_day = date(2024, 2, 2)
    settings = _settings(tmp_path)
    with session_scope() as session:
        _add_raw(session, old_day, 2)
        record = raw_archive.create_export(session, settings, start_date=old_day, end_date=old_day)
        _add_raw(session, old_day, 1, prefix="late")
        with pytest.raises(ValueError, match="changed"):
            raw_archive.delete_export(
                session,
                export_id=record.id,
                confirm_sha256=record.sha256,
                settings=settings,
            )


def test_retention_keeps_canonical_observations(tmp_path) -> None:
    old_day = datetime.now(UTC).date() - timedelta(days=200)
    fresh_day = datetime.now(UTC).date() - timedelta(days=3)
    settings = _settings(tmp_path)
    with session_scope() as session:
        _add_raw(session, old_day, 4, prefix="old")
        _add_raw(session, fresh_day, 2, prefix="fresh")
        _add_canonical(session, old_day)

        preview = raw_archive.retention_preview(session, settings, days=90)
        assert preview["rows"] == 4
        assert preview["oldest_day"] == old_day.isoformat()

        result = raw_archive.run_retention(session, settings, days=90, apply=True)
        assert result["applied"] is True
        assert result["rows_deleted"] == 4

        per_day = dict(
            session.execute(
                select(raw_archive.acq_date_expr(), func.count())
                .select_from(RawObservation)
                .group_by(raw_archive.acq_date_expr())
            ).all()
        )
        assert old_day not in per_day
        assert per_day[fresh_day] == 2

        canonical = session.scalar(
            select(func.count())
            .select_from(FireObservation)
            .where(FireObservation.source_record_id == f"canon-{old_day.isoformat()}")
        )
        assert canonical == 1


def test_api_inventory_and_export(client, tmp_path) -> None:
    old_day = date(2024, 3, 3)
    with session_scope() as session:
        _add_raw(session, old_day, 2, prefix="api")

    response = client.get("/api/v1/admin/raw/inventory")
    assert response.status_code == 200
    body = response.json()
    assert body["totals"]["rows"] == 2
    assert body["policy"]["retention_days"] == 90

    created = client.post(
        "/api/v1/admin/raw/exports",
        json={"start_date": old_day.isoformat(), "end_date": old_day.isoformat()},
    )
    assert created.status_code == 201, created.text
    export = created.json()
    assert export["rows"] == 2

    download = client.get(f"/api/v1/admin/raw/exports/{export['id']}/download")
    assert download.status_code == 200
    assert download.headers["x-checksum-sha256"] == export["sha256"]
    with gzip.open(io.BytesIO(download.content), "rt", encoding="utf-8", newline="") as handle:
        assert len(list(csv.reader(handle))) == 3

    refused = client.post(
        f"/api/v1/admin/raw/exports/{export['id']}/delete",
        json={"confirm_sha256": "f" * 64},
    )
    assert refused.status_code == 422

    deleted = client.post(
        f"/api/v1/admin/raw/exports/{export['id']}/delete",
        json={"confirm_sha256": export["sha256"]},
    )
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["rows_deleted"] == 2

    required_confirm = client.post("/api/v1/admin/raw/retention", json={})
    assert required_confirm.status_code == 400
