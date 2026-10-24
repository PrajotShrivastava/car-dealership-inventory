"""Demo accounts for local development and manual testing only.

Guarded twice: APP_ENV must be "development" (the default is "production") and
the database must be on localhost. Passwords are public by design.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.config import get_settings
from app.db import get_sessionmaker
from app.models import Role, User
from app.security import hash_password

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


class DemoSeedRefusedError(RuntimeError):
    pass


@dataclass(frozen=True)
class DemoAccount:
    email: str
    password: str
    full_name: str
    role: Role

    @property
    def label(self) -> str:
        return self.role.value


DEMO_ACCOUNTS = (
    DemoAccount("demo-admin@example.com", "demo-admin-pass", "Demo Admin", Role.ADMIN),
    DemoAccount("demo-customer@example.com", "demo-customer-pass", "Demo Customer", Role.CUSTOMER),
    DemoAccount("demo-dealer@example.com", "demo-dealer-pass", "Demo Dealer", Role.DEALER),
)


def _check_environment() -> None:
    settings = get_settings()
    if settings.app_env != "development":
        raise DemoSeedRefusedError(
            f"Refusing to create demo accounts: APP_ENV is {settings.app_env!r}, not 'development'"
        )
    host = make_url(settings.database_url).host
    if host not in LOCAL_HOSTS:
        raise DemoSeedRefusedError(
            f"Refusing to create demo accounts: database host {host!r} is not localhost"
        )


def seed_demo_users() -> int:
    """Create any missing demo accounts. Returns how many were created."""
    _check_environment()
    created = 0
    with get_sessionmaker()() as session:
        for account in DEMO_ACCOUNTS:
            if session.scalar(select(User.id).where(User.email == account.email)) is not None:
                continue
            user = User(
                email=account.email,
                password_hash=hash_password(account.password),
                full_name=account.full_name,
                role=account.role,
            )
            session.add(user)
            created += 1
        session.commit()
    return created
