"""leads remember whether a website enquiry was a question or a test drive request

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-27 15:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0012"
down_revision: str | Sequence[str] | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ENQUIRY_KIND = postgresql.ENUM("question", "test_drive", name="enquiry_kind", create_type=False)


def upgrade() -> None:
    """Upgrade schema."""
    # Kept apart from `source`, which the dealer may edit. NULL for leads entered by hand.
    ENQUIRY_KIND.create(op.get_bind(), checkfirst=True)
    op.add_column("leads", sa.Column("enquiry_kind", ENQUIRY_KIND, nullable=True))
    # Enquiries sent before this column existed are recognised by the source they were given.
    op.execute(
        """
        UPDATE leads SET enquiry_kind = CASE source
            WHEN 'Website enquiry' THEN 'question'::enquiry_kind
            WHEN 'Test drive request' THEN 'test_drive'::enquiry_kind
        END
        WHERE customer_id IS NOT NULL
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("leads", "enquiry_kind")
    ENQUIRY_KIND.drop(op.get_bind(), checkfirst=True)
