"""Integrity-first archive codec for bulk payloads and datasets.

The pipeline is deliberately boring and verifiable:

1. **Write once, to a temporary file.**  The final path never exists in a
   partially written state.
2. **Hash the uncompressed bytes while writing.**  This is the logical content
   identity; it does not depend on the compressor version.
3. **Close, flush and fsync.**  The OS is told the bytes are durable before the
   rename.
4. **Read the artifact back.**  Decompress it in bounded chunks, recompute the
   SHA-256 and byte count, and compare with the writer's values.  This catches
   truncation, bit rot and a broken compressor, not just an API error.
5. **Atomically rename.**  ``os.replace`` publishes the file in one step.
6. **Write a manifest.**  Both hashes, both sizes, the row count and the codec
   level travel with the artifact so a later audit needs no database.
7. **Quarantine, never overwrite.**  A failed verification moves the temporary
   file aside with a report; the canonical analysis is untouched.

Gzip is written deterministically (``mtime=0``, no filename), so the same bytes
and level always produce the same artifact.  Parquet uses Zstandard inside
Polars; the manifest records the file hash and logical row count.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import shutil
from collections.abc import Callable, Iterable, Iterator
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import BinaryIO

CHUNK = 1024 * 1024
INTEGRITY_VERSION = "archive-integrity-v1"


class IntegrityError(RuntimeError):
    """An artifact failed verification; it must not be trusted."""


@dataclass(frozen=True)
class ArchiveManifest:
    path: str
    codec: str
    compression_level: int
    compressed_bytes: int
    uncompressed_bytes: int
    compressed_sha256: str
    uncompressed_sha256: str
    rows: int
    created_at: str
    integrity_version: str = INTEGRITY_VERSION
    extra: dict[str, object] = field(default_factory=dict)

    def to_dict(self) -> dict[str, object]:
        data = asdict(self)
        extra = data.pop("extra")
        data.update(extra or {})
        return data


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(CHUNK), b""):
            digest.update(block)
    return digest.hexdigest()


def _fsync_directory(path: Path) -> None:
    """Best-effort directory fsync (POSIX). Windows has no equivalent."""
    if os.name == "nt":
        return
    try:
        descriptor = os.open(path, os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def atomic_write(path: Path, write: Callable[[BinaryIO], None]) -> None:
    """Run ``write`` against a sibling ``.part`` file and publish atomically."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".part")
    try:
        with temporary.open("wb") as handle:
            write(handle)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        _fsync_directory(path.parent)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def gzip_writer(handle: BinaryIO, *, level: int = 6) -> gzip.GzipFile:
    """Deterministic gzip stream: no timestamp, no original filename."""
    return gzip.GzipFile(
        fileobj=handle,
        mode="wb",
        compresslevel=level,
        mtime=0,
    )


def iter_gzip_chunks(path: Path, *, chunk: int = CHUNK) -> Iterator[bytes]:
    """Yield decompressed bytes in bounded chunks (never loads the file)."""
    with gzip.open(path, "rb") as handle:
        while True:
            block = handle.read(chunk)
            if not block:
                return
            yield block


def gzip_bytes(data: bytes, *, level: int = 6) -> bytes:
    """Deterministic in-memory gzip for payload blocks."""
    return gzip.compress(data, compresslevel=level, mtime=0)


def verify_gzip_bytes(
    data: bytes,
    *,
    expected_sha256: str,
    expected_bytes: int | None = None,
) -> bytes:
    """Decompress an in-memory gzip block and verify its logical content."""
    try:
        content = gzip.decompress(data)
    except (OSError, EOFError, gzip.BadGzipFile) as exc:
        raise IntegrityError(f"compressed block could not be read: {exc}") from exc
    actual = hashlib.sha256(content).hexdigest()
    if actual != expected_sha256:
        raise IntegrityError(
            f"block content checksum mismatch (expected {expected_sha256}, got {actual})"
        )
    if expected_bytes is not None and len(content) != expected_bytes:
        raise IntegrityError(
            f"block content size mismatch (expected {expected_bytes}, got {len(content)})"
        )
    return content


def verify_gzip(
    path: Path,
    *,
    expected_sha256: str,
    expected_bytes: int | None = None,
) -> tuple[str, int]:
    """Read the gzip back, verify its CRC and logical content hash."""
    digest = hashlib.sha256()
    size = 0
    try:
        for block in iter_gzip_chunks(path):
            digest.update(block)
            size += len(block)
    except (OSError, EOFError, gzip.BadGzipFile) as exc:
        raise IntegrityError(f"gzip verification failed: {exc}") from exc

    actual = digest.hexdigest()
    if actual != expected_sha256:
        raise IntegrityError(
            f"content checksum mismatch (expected {expected_sha256}, got {actual})"
        )
    if expected_bytes is not None and size != expected_bytes:
        raise IntegrityError(f"content size mismatch (expected {expected_bytes}, got {size})")
    return actual, size


def finalize_gzip_archive(
    temporary: Path,
    final: Path,
    *,
    uncompressed_sha256: str,
    uncompressed_bytes: int,
    rows: int,
    compression_level: int,
    extra: dict[str, object] | None = None,
) -> ArchiveManifest:
    """Verify a finished temporary gzip, atomically publish it and write a manifest."""
    temporary = Path(temporary)
    final = Path(final)
    try:
        verify_gzip(
            temporary,
            expected_sha256=uncompressed_sha256,
            expected_bytes=uncompressed_bytes,
        )
    except IntegrityError:
        quarantine(temporary, reason="gzip_verification_failed")
        raise

    compressed_sha256 = sha256_file(temporary)
    compressed_bytes = temporary.stat().st_size
    os.replace(temporary, final)
    _fsync_directory(final.parent)

    manifest = ArchiveManifest(
        path=final.name,
        codec="gzip",
        compression_level=compression_level,
        compressed_bytes=compressed_bytes,
        uncompressed_bytes=uncompressed_bytes,
        compressed_sha256=compressed_sha256,
        uncompressed_sha256=uncompressed_sha256,
        rows=rows,
        created_at=datetime.now(UTC).isoformat(timespec="seconds"),
        extra=extra or {},
    )
    write_manifest(final, manifest)
    return manifest


def manifest_path(path: Path) -> Path:
    return Path(path).with_name(Path(path).name + ".manifest.json")


def write_manifest(path: Path, manifest: ArchiveManifest) -> Path:
    target = manifest_path(path)
    payload = json.dumps(manifest.to_dict(), indent=2, sort_keys=True).encode("utf-8")

    def write_payload(handle: BinaryIO, data: bytes = payload) -> None:
        handle.write(data)

    atomic_write(target, write_payload)
    return target


def read_manifest(path: Path) -> dict[str, object]:
    payload = manifest_path(path)
    if not payload.is_file():
        raise FileNotFoundError(payload)
    return json.loads(payload.read_text(encoding="utf-8"))


def verify_archive(path: Path, *, full_json: bool = False) -> dict[str, object]:
    """Verify one gzip artifact against its sidecar manifest.

    ``full_json`` is accepted for callers that want a stable report shape; the
    gzip path always verifies the complete logical content.
    """
    path = Path(path)
    manifest = read_manifest(path)
    compressed_sha256 = sha256_file(path)
    if compressed_sha256 != manifest["compressed_sha256"]:
        raise IntegrityError("compressed checksum mismatch")
    if path.stat().st_size != int(str(manifest["compressed_bytes"])):
        raise IntegrityError("compressed size mismatch")
    content_sha, content_bytes = verify_gzip(
        path,
        expected_sha256=str(manifest["uncompressed_sha256"]),
        expected_bytes=int(str(manifest["uncompressed_bytes"])),
    )
    return {
        "ok": True,
        "path": str(path),
        "compressed_sha256": compressed_sha256,
        "uncompressed_sha256": content_sha,
        "uncompressed_bytes": content_bytes,
        "rows": int(str(manifest.get("rows", 0))),
        "codec": manifest.get("codec", "gzip"),
        "codec_level": int(str(manifest.get("compression_level", 0))),
    }


def quarantine(path: Path, *, reason: str) -> Path:
    """Move an untrustworthy artifact aside with a JSON report."""
    path = Path(path)
    if not path.exists():
        return path
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    target = path.with_name(f"{path.name}.corrupt-{stamp}")
    shutil.move(str(path), str(target))
    report = target.with_name(target.name + ".json")
    report.write_text(
        json.dumps(
            {
                "original": str(path),
                "quarantined": str(target),
                "reason": reason,
                "at": datetime.now(UTC).isoformat(timespec="seconds"),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return target


def verify_parquet(path: Path, *, expected_rows: int | None = None) -> dict[str, object]:
    """Validate a Parquet file and (optionally) its logical row count."""
    import polars as pl

    path = Path(path)
    if not path.is_file():
        raise IntegrityError(f"missing parquet file: {path}")
    try:
        rows = int(pl.scan_parquet(path).select(pl.len()).collect().item())
    except Exception as exc:  # polars raises several engine-specific errors
        raise IntegrityError(f"parquet could not be read: {exc}") from exc
    if expected_rows is not None and rows != expected_rows:
        raise IntegrityError(f"parquet row count mismatch (expected {expected_rows}, got {rows})")
    return {"ok": True, "path": str(path), "rows": rows, "checksum": sha256_file(path)}


def iter_archive_manifests(root: Path) -> Iterable[Path]:
    for candidate in Path(root).rglob("*.manifest.json"):
        if candidate.is_file():
            yield candidate
