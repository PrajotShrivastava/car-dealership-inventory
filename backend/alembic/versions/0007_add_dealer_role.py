"""add the dealer role

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-25 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: str | Sequence[str] | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Additive only: no existing row changes role.
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'dealer'")


def downgrade() -> None:
    """Downgrade schema."""
    # Postgres can't drop an enum value, so the type is rebuilt without it. Refuses to run
    # while dealer accounts exist rather than silently changing their roles.
    dealers = op.get_bind().scalar(sa.text("SELECT count(*) FROM users WHERE role = 'dealer'"))
    if dealers:
        raise RuntimeError(
            f"Cannot remove the dealer role: {dealers} dealer account(s) exist. "
            "Change their roles first."
        )
    op.execute("ALTER TYPE user_role RENAME TO user_role_old")
    op.execute("CREATE TYPE user_role AS ENUM ('customer', 'admin')")
    op.execute("ALTER TABLE users ALTER COLUMN role DROP DEFAULT")
    op.execute("ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::text::user_role")
    op.execute("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'customer'")
    op.execute("DROP TYPE user_role_old")
