import os
import shutil
import tempfile
from collections.abc import Iterator

import pytest
from pydantic_settings import BaseSettings, SettingsConfigDict


class _TestEnv(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    test_database_url: str


_test_url = _TestEnv().test_database_url  # type: ignore[call-arg]
if not _test_url.rsplit("/", 1)[-1].endswith("_test"):
    raise RuntimeError("TEST_DATABASE_URL must point at a database whose name ends in '_test'")
# Must happen before app modules read settings.
os.environ["DATABASE_URL"] = _test_url
# Uploaded photos go to a throwaway folder, never the real media directory.
_media_dir = tempfile.mkdtemp(prefix="drivestock-media-")
os.environ["MEDIA_DIR"] = _media_dir

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db import Base, get_engine  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _migrated_database() -> Iterator[None]:
    cfg = Config("alembic.ini")
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield
    shutil.rmtree(_media_dir, ignore_errors=True)


@pytest.fixture(autouse=True)
def _clean_tables() -> Iterator[None]:
    yield
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    if tables:
        with get_engine().begin() as conn:
            conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


# --- auth helpers -----------------------------------------------------------


def _auth_headers(client: TestClient, email: str, *, admin: bool = False) -> dict[str, str]:
    from app.cli import create_admin

    password = "test-pass-123"
    if admin:
        create_admin(email, password, "Test Admin")
    else:
        client.post(
            "/api/auth/register",
            json={"email": email, "password": password, "full_name": "Test Customer"},
        )
    token = client.post("/api/auth/login", json={"email": email, "password": password}).json()[
        "access_token"
    ]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def customer_headers(client: TestClient) -> dict[str, str]:
    return _auth_headers(client, "customer@example.com")


@pytest.fixture
def admin_headers(client: TestClient) -> dict[str, str]:
    return _auth_headers(client, "admin@example.com", admin=True)


VEHICLE = {
    "make": "Ford",
    "model": "Kuga",
    "trim": "ST-Line",
    "year": 2023,
    "category": "suv",
    "fuel_type": "hybrid",
    "transmission": "automatic",
    "price": "35990.00",
    "quantity": 4,
}


@pytest.fixture
def make_vehicle(client: TestClient, admin_headers: dict[str, str]):  # type: ignore[no-untyped-def]
    def _make(**overrides):  # type: ignore[no-untyped-def]
        response = client.post(
            "/api/vehicles", json={**VEHICLE, **overrides}, headers=admin_headers
        )
        assert response.status_code == 201, response.text
        return response.json()

    return _make
