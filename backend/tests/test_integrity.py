"""Verified archive codec: atomic publish, checksums and quarantine."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import polars as pl
import pytest

from app.services import integrity


def _write_archive(tmp_path: Path, payload: bytes, *, level: int = 6):
    final = tmp_path / "archive.csv.gz"
    temporary = final.with_name(final.name + ".part")
    with temporary.open("wb") as handle:
        gz = integrity.gzip_writer(handle, level=level)
        gz.write(payload)
        gz.close()
        handle.flush()
        os.fsync(handle.fileno())
    manifest = integrity.finalize_gzip_archive(
        temporary,
        final,
        uncompressed_sha256=hashlib.sha256(payload).hexdigest(),
        uncompressed_bytes=len(payload),
        rows=payload.count(b"\n"),
        compression_level=level,
    )
    return final, manifest


def test_roundtrip_writes_manifest_and_verifies(tmp_path) -> None:
    payload = b"a,b\n1,2\n3,4\n"
    final, manifest = _write_archive(tmp_path, payload)

    assert final.is_file()
    assert not final.with_name(final.name + ".part").exists()
    assert manifest.compressed_bytes == final.stat().st_size
    assert manifest.uncompressed_bytes == len(payload)
    assert manifest.rows == 3
    assert json.loads(integrity.manifest_path(final).read_text())["codec"] == "gzip"

    report = integrity.verify_archive(final)
    assert report["ok"] is True
    assert report["uncompressed_bytes"] == len(payload)


def test_gzip_is_deterministic(tmp_path) -> None:
    first, one = _write_archive(tmp_path, b"same bytes\n")
    (tmp_path / "second").mkdir()
    second, two = _write_archive(tmp_path / "second", b"same bytes\n")
    assert first.read_bytes() == second.read_bytes()
    assert one.compressed_sha256 == two.compressed_sha256


def test_tampered_compressed_bytes_are_rejected(tmp_path) -> None:
    final, _ = _write_archive(tmp_path, b"a,b\n1,2\n")
    data = bytearray(final.read_bytes())
    data[-1] ^= 0xFF
    final.write_bytes(data)

    with pytest.raises(integrity.IntegrityError, match="compressed checksum"):
        integrity.verify_archive(final)


def test_tampered_manifest_content_hash_is_rejected(tmp_path) -> None:
    final, _ = _write_archive(tmp_path, b"a,b\n1,2\n")
    sidecar = integrity.manifest_path(final)
    manifest = json.loads(sidecar.read_text())
    manifest["uncompressed_sha256"] = "0" * 64
    sidecar.write_text(json.dumps(manifest))

    with pytest.raises(integrity.IntegrityError, match="content checksum"):
        integrity.verify_archive(final)


def test_failed_verification_quarantines_the_artifact(tmp_path) -> None:
    final = tmp_path / "bad.csv.gz"
    temp = final.with_name(final.name + ".part")
    temp.write_bytes(b"not a gzip stream")

    with pytest.raises(integrity.IntegrityError):
        integrity.finalize_gzip_archive(
            temp,
            final,
            uncompressed_sha256="0" * 64,
            uncompressed_bytes=10,
            rows=1,
            compression_level=6,
        )

    assert not final.exists()
    assert not temp.exists()
    quarantined = [path for path in tmp_path.glob("*.corrupt-*") if path.suffix != ".json"]
    assert len(quarantined) == 1
    assert quarantined[0].with_name(quarantined[0].name + ".json").is_file()


def test_parquet_row_count_is_verified(tmp_path) -> None:
    path = tmp_path / "detections.parquet"
    pl.DataFrame({"x": [1, 2, 3]}).write_parquet(path, compression="zstd")

    assert integrity.verify_parquet(path, expected_rows=3)["rows"] == 3
    with pytest.raises(integrity.IntegrityError, match="row count"):
        integrity.verify_parquet(path, expected_rows=4)
