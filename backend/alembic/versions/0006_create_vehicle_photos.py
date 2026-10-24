"""create vehicle_photos table

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-24 20:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: str | Sequence[str] | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Additive only: existing tables and rows are untouched.
    op.create_table(
        "vehicle_photos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("vehicle_id", sa.Integer(), nullable=False),
        sa.Column("file_key", sa.String(length=32), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("file_key ~ '^[0-9a-f]{32}$'", name="ck_vehicle_photos_file_key_format"),
        sa.CheckConstraint("position >= 0", name="ck_vehicle_photos_position_non_negative"),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("file_key"),
    )
    op.create_index(
        op.f("ix_vehicle_photos_vehicle_id"), "vehicle_photos", ["vehicle_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_vehicle_photos_vehicle_id"), table_name="vehicle_photos")
    op.drop_table("vehicle_photos")
