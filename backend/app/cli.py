"""Operational commands: python -m app.cli <command> --help"""

import argparse
import getpass
import os
import sys
from collections.abc import Sequence

from pydantic import ValidationError
from sqlalchemy import select

from app.db import get_sessionmaker
from app.models import Role, User
from app.schemas.auth import RegisterRequest
from app.security import hash_password


def create_admin(email: str, password: str, full_name: str) -> User:
    try:
        data = RegisterRequest(email=email, password=password, full_name=full_name)
    except ValidationError as exc:
        raise ValueError(str(exc)) from exc
    with get_sessionmaker()() as session:
        if session.scalar(select(User.id).where(User.email == data.email)) is not None:
            raise ValueError(f"A user with email {data.email} already exists")
        admin = User(
            email=data.email,
            password_hash=hash_password(data.password),
            full_name=data.full_name,
            role=Role.ADMIN,
        )
        session.add(admin)
        session.commit()
        return admin


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    admin_cmd = commands.add_parser(
        "create-admin", help="Create an admin user (password from ADMIN_PASSWORD or a prompt)"
    )
    admin_cmd.add_argument("--email", required=True)
    admin_cmd.add_argument("--name", required=True)
    commands.add_parser(
        "seed-demo-users",
        help="Local development only: demo admin, customer and pending dealer applicant",
    )

    args = parser.parse_args(argv)
    try:
        if args.command == "create-admin":
            password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Admin password: ")
            admin = create_admin(args.email, password, args.name)
            print(f"Created admin {admin.email}")
        elif args.command == "seed-demo-users":
            from app.demo import DEMO_ACCOUNTS, DemoSeedRefusedError, seed_demo_users

            try:
                created = seed_demo_users()
            except DemoSeedRefusedError as exc:
                print(str(exc), file=sys.stderr)
                return 1
            print(f"Created {created} demo account(s). Local development only:")
            for account in DEMO_ACCOUNTS:
                print(f"  {account.label:<28} {account.email}  /  {account.password}")
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
