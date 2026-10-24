"""Reset the *test* database for Playwright end-to-end runs.

Migrates to head, empties every table, loads the demo inventory and creates
an e2e admin. Refuses to touch a database whose name does not end in `_test`.
Usage (from backend/): DATABASE_URL=$TEST_DATABASE_URL python scripts/prepare_e2e_db.py
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.cli import create_admin, seed_vehicles  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db import Base, get_engine  # noqa: E402

E2E_ADMIN_EMAIL = "e2e-admin@drivestock.dev"
E2E_ADMIN_PASSWORD = os.environ.get("E2E_ADMIN_PASSWORD", "e2e-admin-pass")


def main() -> None:
    db_name = get_settings().database_url.rsplit("/", 1)[-1]
    if not db_name.endswith("_test"):
        sys.exit(f"Refusing to reset '{db_name}': e2e runs only against a *_test database")
    command.upgrade(Config(str(Path(__file__).resolve().parent.parent / "alembic.ini")), "head")
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    with get_engine().begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    seed_vehicles()
    create_admin(E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, "E2E Admin")
    print(f"e2e database '{db_name}' ready")


if __name__ == "__main__":
    main()
