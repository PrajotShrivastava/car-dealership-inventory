"""vehicle condition, mileage, colour, VIN and features

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-27 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0011"
down_revision: str | Sequence[str] | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CONDITION = postgresql.ENUM("new", "used", "certified", name="vehicle_condition", create_type=False)


def upgrade() -> None:
    """Upgrade schema."""
    # Additive only. Existing listings become "new" with no mileage, colour, VIN or features.
    CONDITION.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "vehicles",
        sa.Column("condition", CONDITION, nullable=False, server_default="new"),
    )
    op.add_column("vehicles", sa.Column("mileage", sa.Integer(), nullable=True))
    op.add_column("vehicles", sa.Column("colour", sa.String(30), nullable=True))
    op.add_column("vehicles", sa.Column("vin", sa.String(17), nullable=True))
    op.add_column(
        "vehicles",
        sa.Column(
            "features",
            postgresql.ARRAY(sa.String(40)),
            nullable=False,
            server_default="{}",
        ),
    )
    op.create_index("ix_vehicles_condition", "vehicles", ["condition"])
    op.create_check_constraint(
        "ck_vehicles_mileage_range", "vehicles", "mileage BETWEEN 0 AND 2000000"
    )
    op.create_check_constraint(
        "ck_vehicles_vin_format", "vehicles", "vin ~ '^[A-HJ-NPR-Z0-9]{17}$'"
    )
    # A VIN identifies one physical car, so a listing with one never holds more than a unit.
    op.create_check_constraint(
        "ck_vehicles_vin_single_unit", "vehicles", "vin IS NULL OR quantity <= 1"
    )
    # One listing per VIN in each dealer's inventory (admin-added vehicles count as one group).
    op.create_index(
        "uq_vehicles_dealer_id_vin",
        "vehicles",
        ["dealer_id", "vin"],
        unique=True,
        postgresql_where=sa.text("vin IS NOT NULL"),
        postgresql_nulls_not_distinct=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_vehicles_dealer_id_vin", table_name="vehicles")
    op.drop_constraint("ck_vehicles_vin_single_unit", "vehicles", type_="check")
    op.drop_constraint("ck_vehicles_vin_format", "vehicles", type_="check")
    op.drop_constraint("ck_vehicles_mileage_range", "vehicles", type_="check")
    op.drop_index("ix_vehicles_condition", table_name="vehicles")
    for column in ("features", "vin", "colour", "mileage", "condition"):
        op.drop_column("vehicles", column)
    CONDITION.drop(op.get_bind(), checkfirst=True)
