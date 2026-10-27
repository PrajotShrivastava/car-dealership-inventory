"""leads remember the customer account that sent an enquiry from the website

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-27 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010"
down_revision: str | Sequence[str] | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Null for leads a dealer entered by hand; set for enquiries sent by a signed-in customer.
    op.add_column(
        "leads",
        sa.Column(
            "customer_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_leads_customer_id_vehicle_id", "leads", ["customer_id", "vehicle_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_leads_customer_id_vehicle_id", table_name="leads")
    op.drop_column("leads", "customer_id")
