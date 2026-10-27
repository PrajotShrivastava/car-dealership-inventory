"""record which dealer owns each vehicle and made each sale

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-25 18:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: str | Sequence[str] | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Additive only. Existing vehicles and purchases keep NULL (no owner): nothing records
    # who listed them, so ownership is assigned deliberately afterwards, never guessed here.
    op.add_column("vehicles", sa.Column("dealer_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "vehicles_dealer_id_fkey", "vehicles", "users", ["dealer_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_vehicles_dealer_id", "vehicles", ["dealer_id"])

    # The seller at the time of sale, so a dealer's sales survive deleting the vehicle.
    op.add_column("purchases", sa.Column("dealer_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "purchases_dealer_id_fkey",
        "purchases",
        "users",
        ["dealer_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_purchases_dealer_id_created_at", "purchases", ["dealer_id", "created_at"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_purchases_dealer_id_created_at", table_name="purchases")
    op.drop_constraint("purchases_dealer_id_fkey", "purchases", type_="foreignkey")
    op.drop_column("purchases", "dealer_id")
    op.drop_index("ix_vehicles_dealer_id", table_name="vehicles")
    op.drop_constraint("vehicles_dealer_id_fkey", "vehicles", type_="foreignkey")
    op.drop_column("vehicles", "dealer_id")
