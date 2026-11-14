"""Read raw payloads from batch-compressed blocks, on demand.

New ingests store a block of JSONL payloads per acquisition day and keep only a
``(block_id, block_row)`` pointer on each row. Legacy rows may still carry an
inline ``payload``. Both paths return the same dictionary.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from collections import OrderedDict
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import RawObservation, RawPayloadBlock
from app.services import integrity

BLOCK_CACHE_ENTRIES = 16


class PayloadBlockCache:
    """Small per-call LRU so an export does not decompress the same block twice."""

    def __init__(self, size: int = BLOCK_CACHE_ENTRIES) -> None:
        self.size = max(1, size)
        self._items: OrderedDict[uuid.UUID, list[dict[str, Any]]] = OrderedDict()

    def get(self, session: Session, block_id: uuid.UUID) -> list[dict[str, Any]]:
        cached = self._items.get(block_id)
        if cached is not None:
            self._items.move_to_end(block_id)
            return cached
        block = session.get(RawPayloadBlock, block_id)
        if block is None:
            raise LookupError(f"raw payload block {block_id} is missing")
        rows = decode_block(block)
        self._items[block_id] = rows
        if len(self._items) > self.size:
            self._items.popitem(last=False)
        return rows


def decode_block(block: RawPayloadBlock) -> list[dict[str, Any]]:
    """Verify and decode one compressed JSONL block."""
    compressed_sha = hashlib.sha256(block.data).hexdigest()
    if compressed_sha != block.compressed_sha256:
        raise integrity.IntegrityError(
            f"raw payload block {block.id} failed its compressed checksum"
        )
    content = integrity.verify_gzip_bytes(
        block.data,
        expected_sha256=block.uncompressed_sha256,
        expected_bytes=block.uncompressed_bytes,
    )
    rows: list[dict[str, Any]] = []
    for line in content.splitlines():
        if line:
            rows.append(json.loads(line))
    if len(rows) != block.rows:
        raise integrity.IntegrityError(
            f"raw payload block {block.id} row count mismatch "
            f"(expected {block.rows}, got {len(rows)})"
        )
    return rows


def payload_from(
    session: Session,
    *,
    payload: dict[str, Any] | None,
    block_id: uuid.UUID | None,
    block_row: int | None,
    cache: PayloadBlockCache | None = None,
) -> dict[str, Any]:
    """Resolve a payload from explicit columns (used by streaming exports)."""
    if payload is not None:
        return payload
    if block_id is None or block_row is None:
        raise LookupError("raw observation has no payload reference")
    cache = cache or PayloadBlockCache()
    rows = cache.get(session, block_id)
    try:
        return rows[block_row]
    except IndexError as exc:
        raise integrity.IntegrityError(
            f"raw observation points past the end of block {block_id}"
        ) from exc


def payload_for(
    session: Session,
    row: RawObservation,
    *,
    cache: PayloadBlockCache | None = None,
) -> dict[str, Any]:
    """Return the source payload for a raw row (block or legacy inline)."""
    return payload_from(
        session,
        payload=row.payload,
        block_id=row.block_id,
        block_row=row.block_row,
        cache=cache,
    )
