"""dealer-recorded sales with costs, and customer leads with their history

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-26 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0009"
down_revision: str | Sequence[str] | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SALE_CHANNEL = postgresql.ENUM("online", "dealer", name="sale_channel", create_type=False)
LEAD_STATUS = postgresql.ENUM(
    "new",
    "contacted",
    "test_drive_scheduled",
    "negotiation",
    "converted",
    "lost",
    name="lead_status",
    create_type=False,
)


def upgrade() -> None:
    """Upgrade schema."""
    # Additive only: existing purchases stay as online sales, dated when they were made.
    bind = op.get_bind()
    SALE_CHANNEL.create(bind, checkfirst=True)
    LEAD_STATUS.create(bind, checkfirst=True)

    # What one unit cost the dealer, for gross profit. Never shown to customers.
    op.add_column("vehicles", sa.Column("acquisition_cost", sa.Numeric(12, 2), nullable=True))
    op.create_check_constraint(
        "ck_vehicles_acquisition_cost_non_negative", "vehicles", "acquisition_cost >= 0"
    )

    op.create_table(
        "leads",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "dealer_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "vehicle_id",
            sa.Integer(),
            sa.ForeignKey("vehicles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("vehicle_label", sa.String(170), nullable=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(254), nullable=True),
        sa.Column("phone", sa.String(30), nullable=True),
        sa.Column("budget", sa.Numeric(12, 2), nullable=True),
        sa.Column("source", sa.String(50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("follow_up_on", sa.Date(), nullable=True),
        sa.Column("status", LEAD_STATUS, nullable=False, server_default="new"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("budget > 0", name="ck_leads_budget_positive"),
    )
    op.create_index("ix_leads_dealer_id_status", "leads", ["dealer_id", "status"])
    op.create_index("ix_leads_dealer_id_follow_up_on", "leads", ["dealer_id", "follow_up_on"])

    op.create_table(
        "lead_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "lead_id",
            sa.Integer(),
            sa.ForeignKey("leads.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("old_value", sa.String(50), nullable=True),
        sa.Column("new_value", sa.String(50), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )

    # Purchases become the one sales ledger: online orders and dealer-recorded sales.
    op.add_column(
        "purchases", sa.Column("channel", SALE_CHANNEL, nullable=False, server_default="online")
    )
    op.add_column("purchases", sa.Column("sold_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE purchases SET sold_at = created_at")
    op.alter_column("purchases", "sold_at", nullable=False, server_default=sa.func.now())
    # Dealer-recorded sales have a named customer instead of a signed-in buyer.
    op.alter_column("purchases", "user_id", nullable=True)
    op.add_column("purchases", sa.Column("customer_name", sa.String(100), nullable=True))
    op.add_column("purchases", sa.Column("customer_email", sa.String(254), nullable=True))
    op.add_column("purchases", sa.Column("customer_phone", sa.String(30), nullable=True))
    op.add_column("purchases", sa.Column("unit_cost", sa.Numeric(12, 2), nullable=True))
    op.add_column("purchases", sa.Column("request_id", sa.String(36), nullable=True))
    op.add_column(
        "purchases",
        sa.Column(
            "lead_id", sa.Integer(), sa.ForeignKey("leads.id", ondelete="SET NULL"), nullable=True
        ),
    )
    op.create_check_constraint(
        "ck_purchases_has_customer",
        "purchases",
        "(channel = 'online' AND user_id IS NOT NULL) "
        "OR (channel = 'dealer' AND customer_name IS NOT NULL)",
    )
    op.create_check_constraint("ck_purchases_unit_cost_non_negative", "purchases", "unit_cost >= 0")
    # A lead converts into at most one sale; a retried submission records one sale.
    op.create_unique_constraint("uq_purchases_lead_id", "purchases", ["lead_id"])
    op.create_unique_constraint(
        "uq_purchases_dealer_id_request_id", "purchases", ["dealer_id", "request_id"]
    )
    op.drop_index("ix_purchases_dealer_id_created_at", table_name="purchases")
    op.create_index("ix_purchases_dealer_id_sold_at", "purchases", ["dealer_id", "sold_at"])


def downgrade() -> None:
    """Downgrade schema."""
    # Dealer-recorded sales have no buyer account, so they can't fit the old schema. Refuse
    # rather than delete sales history.
    dealer_sales = op.get_bind().scalar(
        sa.text("SELECT count(*) FROM purchases WHERE channel = 'dealer'")
    )
    if dealer_sales:
        raise RuntimeError(
            f"Cannot downgrade: {dealer_sales} dealer-recorded sale(s) exist and would be lost."
        )
    op.drop_index("ix_purchases_dealer_id_sold_at", table_name="purchases")
    op.create_index("ix_purchases_dealer_id_created_at", "purchases", ["dealer_id", "created_at"])
    op.drop_constraint("uq_purchases_dealer_id_request_id", "purchases", type_="unique")
    op.drop_constraint("uq_purchases_lead_id", "purchases", type_="unique")
    op.drop_constraint("ck_purchases_unit_cost_non_negative", "purchases", type_="check")
    op.drop_constraint("ck_purchases_has_customer", "purchases", type_="check")
    for column in (
        "lead_id",
        "request_id",
        "unit_cost",
        "customer_phone",
        "customer_email",
        "customer_name",
        "sold_at",
        "channel",
    ):
        op.drop_column("purchases", column)
    op.alter_column("purchases", "user_id", nullable=False)
    op.drop_table("lead_events")
    op.drop_index("ix_leads_dealer_id_follow_up_on", table_name="leads")
    op.drop_index("ix_leads_dealer_id_status", table_name="leads")
    op.drop_table("leads")
    op.drop_constraint("ck_vehicles_acquisition_cost_non_negative", "vehicles", type_="check")
    op.drop_column("vehicles", "acquisition_cost")
    LEAD_STATUS.drop(op.get_bind(), checkfirst=True)
    SALE_CHANNEL.drop(op.get_bind(), checkfirst=True)
