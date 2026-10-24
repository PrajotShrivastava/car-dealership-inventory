import pytest
from sqlalchemy import select

from app.cli import create_admin, main
from app.db import get_sessionmaker
from app.models import Role, User
from app.security import verify_password


def test_create_admin_creates_an_admin_with_a_hashed_password():
    create_admin("Admin@DriveStock.dev", "admin-pass-123", "Site Admin")

    with get_sessionmaker()() as session:
        admin = session.scalars(select(User)).one()
    assert admin.email == "admin@drivestock.dev"
    assert admin.role == Role.ADMIN
    assert verify_password("admin-pass-123", admin.password_hash)


def test_create_admin_refuses_an_existing_email():
    create_admin("admin@drivestock.dev", "admin-pass-123", "Site Admin")

    with pytest.raises(ValueError, match="already exists"):
        create_admin("admin@drivestock.dev", "another-pass-123", "Other")


def test_create_admin_validates_password_length():
    with pytest.raises(ValueError):
        create_admin("admin@drivestock.dev", "short", "Site Admin")


def test_cli_entrypoint_reads_password_from_environment(monkeypatch, capsys):
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass-123")

    exit_code = main(["create-admin", "--email", "boss@drivestock.dev", "--name", "Boss"])

    assert exit_code == 0
    assert "boss@drivestock.dev" in capsys.readouterr().out
