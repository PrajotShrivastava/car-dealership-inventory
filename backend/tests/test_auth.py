from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy import select

from app.config import get_settings
from app.db import get_sessionmaker
from app.models import User

VALID_USER = {"email": "Jane@Example.com", "password": "s3cure-pass", "full_name": "Jane Doe"}


def register(client, **overrides):
    return client.post("/api/auth/register", json={**VALID_USER, **overrides})


def login(client, email=VALID_USER["email"], password=VALID_USER["password"]):
    return client.post("/api/auth/login", json={"email": email, "password": password})


class TestRegister:
    def test_creates_a_customer_and_returns_public_profile(self, client):
        response = register(client)

        assert response.status_code == 201
        body = response.json()
        assert body["email"] == "jane@example.com"
        assert body["full_name"] == "Jane Doe"
        assert body["role"] == "customer"
        assert "password" not in body and "password_hash" not in body

    def test_stores_an_argon2_hash_never_the_plain_password(self, client):
        register(client)

        with get_sessionmaker()() as session:
            user = session.scalars(select(User)).one()
        assert user.password_hash.startswith("$argon2")
        assert VALID_USER["password"] not in user.password_hash

    def test_cannot_self_assign_admin_role(self, client):
        response = register(client, role="admin")

        assert response.status_code == 201
        assert response.json()["role"] == "customer"

    def test_rejects_duplicate_email_case_insensitively(self, client):
        register(client)

        response = register(client, email="JANE@example.COM")

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "EMAIL_TAKEN"

    def test_rejects_invalid_input_with_structured_errors(self, client):
        response = register(client, email="not-an-email", password="short", full_name="   ")

        assert response.status_code == 422
        error = response.json()["error"]
        assert error["code"] == "VALIDATION_ERROR"
        fields = {detail["field"] for detail in error["details"]}
        assert {"email", "password", "full_name"} <= fields


class TestLogin:
    def test_returns_bearer_token_and_user(self, client):
        register(client)

        response = login(client, email="jane@example.com")

        assert response.status_code == 200
        body = response.json()
        assert body["token_type"] == "bearer"
        assert body["access_token"]
        assert body["user"]["email"] == "jane@example.com"

    def test_wrong_password_and_unknown_email_get_the_same_generic_401(self, client):
        register(client)

        wrong_password = login(client, password="wrong-password")
        unknown_email = login(client, email="nobody@example.com")

        assert wrong_password.status_code == unknown_email.status_code == 401
        assert wrong_password.json() == unknown_email.json()
        assert wrong_password.json()["error"]["code"] == "INVALID_CREDENTIALS"


class TestMe:
    def test_returns_current_user_for_valid_token(self, client):
        register(client)
        token = login(client).json()["access_token"]

        response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})

        assert response.status_code == 200
        assert response.json()["email"] == "jane@example.com"

    def test_requires_a_token(self, client):
        response = client.get("/api/auth/me")

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "NOT_AUTHENTICATED"

    def test_rejects_a_tampered_token(self, client):
        register(client)
        token = login(client).json()["access_token"]

        response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}x"})

        assert response.status_code == 401

    def test_rejects_an_expired_token(self, client):
        user_id = register(client).json()["id"]
        settings = get_settings()
        expired = jwt.encode(
            {"sub": str(user_id), "exp": datetime.now(UTC) - timedelta(minutes=1)},
            settings.jwt_secret,
            algorithm=settings.jwt_algorithm,
        )

        response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired}"})

        assert response.status_code == 401
