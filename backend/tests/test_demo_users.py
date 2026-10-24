from collections.abc import Iterator

import pytest
from sqlalchemy import select

from app.cli import main
from app.config import Settings, get_settings
from app.db import get_sessionmaker
from app.demo import DEMO_ACCOUNTS, DemoSeedRefusedError, seed_demo_users
from app.models import ApplicationStatus, DealerApplication, Role, User


@pytest.fixture
def app_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[pytest.MonkeyPatch]:
    """Let a test change settings, then restore the cached settings."""
    get_settings.cache_clear()
    yield monkeypatch
    get_settings.cache_clear()


def test_app_env_defaults_to_production(app_env):
    app_env.delenv("APP_ENV", raising=False)

    # Ignore any local .env file: this checks the built-in default.
    settings = Settings(_env_file=None, database_url="postgresql://x/y", jwt_secret="s" * 32)

    assert settings.app_env == "production"


@pytest.mark.parametrize("env", ["production", "staging"])
def test_refuses_outside_development(app_env, env):
    app_env.setenv("APP_ENV", env)

    with pytest.raises(DemoSeedRefusedError, match="APP_ENV"):
        seed_demo_users()
    with get_sessionmaker()() as session:
        assert session.scalars(select(User)).all() == []


def test_refuses_a_non_local_database(app_env):
    app_env.setenv("APP_ENV", "development")
    app_env.setenv("DATABASE_URL", "postgresql+psycopg://u:p@db.example.com:5432/drivestock")

    with pytest.raises(DemoSeedRefusedError, match="localhost"):
        seed_demo_users()


def test_creates_admin_customer_and_pending_applicant_once(app_env):
    app_env.setenv("APP_ENV", "development")

    created = seed_demo_users()
    again = seed_demo_users()

    assert created == len(DEMO_ACCOUNTS) == 3
    assert again == 0
    with get_sessionmaker()() as session:
        roles = {u.email: u.role for u in session.scalars(select(User))}
        application = session.scalars(select(DealerApplication)).one()
    assert sorted(roles.values()) == [Role.ADMIN, Role.CUSTOMER, Role.CUSTOMER]
    assert application.status == ApplicationStatus.PENDING
    assert roles[application.applicant.email] == Role.CUSTOMER


def test_cli_reports_refusal_with_exit_code_1(app_env, capsys):
    app_env.setenv("APP_ENV", "production")

    assert main(["seed-demo-users"]) == 1
    assert "Refusing" in capsys.readouterr().err


def test_cli_prints_the_demo_credentials(app_env, capsys):
    app_env.setenv("APP_ENV", "development")

    assert main(["seed-demo-users"]) == 0
    out = capsys.readouterr().out
    for account in DEMO_ACCOUNTS:
        assert account.email in out
        assert account.password in out
