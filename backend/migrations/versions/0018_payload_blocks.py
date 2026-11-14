"""Batch-compressed raw payloads and remove the canonical payload duplicate.

Revision ID: 0018_payload_blocks
Revises: 0017_archive_integrity
Create Date: 2026-11-08
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from app.db.base import GUID

revision = "0018_payload_blocks"
down_revision = "0017_archive_integrity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "raw_payload_blocks",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("source_id", GUID(), sa.ForeignKey("data_sources.id"), nullable=False),
        sa.Column("acq_date", sa.Date(), nullable=False),
        sa.Column("codec", sa.String(length=16), nullable=False, server_default="gzip"),
        sa.Column("compression_level", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("rows", sa.Integer(), nullable=False),
        sa.Column("uncompressed_bytes", sa.BigInteger(), nullable=False),
        sa.Column("compressed_bytes", sa.BigInteger(), nullable=False),
        sa.Column("uncompressed_sha256", sa.String(length=64), nullable=False),
        sa.Column("compressed_sha256", sa.String(length=64), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_raw_payload_blocks_acq_date", "raw_payload_blocks", ["acq_date"])
    op.create_index("ix_raw_payload_blocks_source_id", "raw_payload_blocks", ["source_id"])

    with op.batch_alter_table("raw_observations") as batch:
        batch.add_column(sa.Column("acq_date", sa.Date(), nullable=True))
        batch.add_column(sa.Column("block_id", GUID(), nullable=True))
        batch.add_column(sa.Column("block_row", sa.Integer(), nullable=True))
        batch.alter_column("payload", existing_type=sa.JSON(), nullable=True)
        batch.create_foreign_key(
            "fk_raw_observations_block_id",
            "raw_payload_blocks",
            ["block_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_index("ix_raw_observations_acq_date", ["acq_date"])
        batch.create_index("ix_raw_observations_block_id", ["block_id"])

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            """
            UPDATE raw_observations
            SET acq_date = (payload->>'acq_date')::date
            WHERE payload IS NOT NULL
              AND payload->>'acq_date' ~ '^\\d{4}-\\d{2}-\\d{2}'
            """
        )
    else:
        op.execute(
            """
            UPDATE raw_observations
            SET acq_date = substr(json_extract(payload, '$.acq_date'), 1, 10)
            WHERE payload IS NOT NULL
              AND json_extract(payload, '$.acq_date') IS NOT NULL
            """
        )

    # The canonical row duplicated the raw payload; keep one copy only.
    with op.batch_alter_table("fire_observations") as batch:
        batch.drop_column("source_payload")


def downgrade() -> None:
    with op.batch_alter_table("fire_observations") as batch:
        batch.add_column(sa.Column("source_payload", sa.JSON(), nullable=True))

    with op.batch_alter_table("raw_observations") as batch:
        batch.drop_index("ix_raw_observations_block_id")
        batch.drop_index("ix_raw_observations_acq_date")
        batch.drop_constraint("fk_raw_observations_block_id", type_="foreignkey")
        batch.drop_column("block_row")
        batch.drop_column("block_id")
        batch.drop_column("acq_date")
        batch.alter_column("payload", existing_type=sa.JSON(), nullable=False)

    op.drop_index("ix_raw_payload_blocks_source_id", table_name="raw_payload_blocks")
    op.drop_index("ix_raw_payload_blocks_acq_date", table_name="raw_payload_blocks")
    op.drop_table("raw_payload_blocks")
