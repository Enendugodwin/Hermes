"""Integrity receipt fields for raw-payload archives.

Revision ID: 0017_archive_integrity
Revises: 0016_auth_rbac
Create Date: 2026-11-07
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0017_archive_integrity"
down_revision = "0016_auth_rbac"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "raw_exports",
        sa.Column("codec", sa.String(length=16), nullable=False, server_default="gzip"),
    )
    op.add_column(
        "raw_exports",
        sa.Column("compressed_sha256", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "raw_exports",
        sa.Column("uncompressed_size", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "raw_exports",
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("raw_exports", "verified_at")
    op.drop_column("raw_exports", "uncompressed_size")
    op.drop_column("raw_exports", "compressed_sha256")
    op.drop_column("raw_exports", "codec")
