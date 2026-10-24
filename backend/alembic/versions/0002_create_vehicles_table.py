"""create vehicles table

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-24 09:53:55.565976

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "vehicles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("make", sa.String(length=50), nullable=False),
        sa.Column("model", sa.String(length=50), nullable=False),
        sa.Column("trim", sa.String(length=50), nullable=True),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column(
            "category",
            sa.Enum(
                "sedan",
                "suv",
                "hatchback",
                "coupe",
                "convertible",
                "truck",
                "van",
                "wagon",
                name="vehicle_category",
            ),
            nullable=False,
        ),
        sa.Column(
            "fuel_type",
            sa.Enum("petrol", "diesel", "hybrid", "electric", name="fuel_type"),
            nullable=False,
        ),
        sa.Column(
            "transmission", sa.Enum("manual", "automatic", name="transmission"), nullable=False
        ),
        sa.Column("price", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("quantity", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("price > 0", name="ck_vehicles_price_positive"),
        sa.CheckConstraint("quantity >= 0", name="ck_vehicles_quantity_non_negative"),
        sa.CheckConstraint("year BETWEEN 1900 AND 2100", name="ck_vehicles_year_range"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_vehicles_category"), "vehicles", ["category"], unique=False)
    op.create_index("ix_vehicles_make_model", "vehicles", ["make", "model"], unique=False)
    op.create_index(op.f("ix_vehicles_price"), "vehicles", ["price"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_vehicles_price"), table_name="vehicles")
    op.drop_index("ix_vehicles_make_model", table_name="vehicles")
    op.drop_index(op.f("ix_vehicles_category"), table_name="vehicles")
    op.drop_table("vehicles")
    for enum_name in ("vehicle_category", "fuel_type", "transmission"):
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
