"""add vehicles.catalog_image_id

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-24 18:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nullable: existing vehicles simply have no photo.
    op.add_column("vehicles", sa.Column("catalog_image_id", sa.String(length=16), nullable=True))
    op.create_check_constraint(
        "ck_vehicles_catalog_image_id_format",
        "vehicles",
        "catalog_image_id ~ '^[0-9a-f]{16}$'",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("ck_vehicles_catalog_image_id_format", "vehicles", type_="check")
    op.drop_column("vehicles", "catalog_image_id")
