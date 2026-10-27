"""Login hardening: rotating refresh tokens, sign-out (here and everywhere), and limits on
failed sign-ins."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update

from app.config import get_settings
from app.db import get_sessionmaker
from app.main import create_app
from app.models import LoginFailure, RefreshToken
from app.routers.auth import REFRESH_COOKIE

EMAIL = "rita@example.com"
PASSWORD = "correct-horse-1"


@pytest.fixture
def account(client):
    response = client.post(
        "/api/auth/register",
        json={"email": EMAIL, "password": PASSWORD, "full_name": "Rita Rao"},
    )
    assert response.status_code == 201


def login(client, email=EMAIL, password=PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def refresh(client, token=None):
    """POST /auth/refresh with the client's cookie, or with `token` instead."""
    if token is not None:
        client.cookies.clear()
        client.cookies.set(REFRESH_COOKIE, token)
    return client.post("/api/auth/refresh")


def new_browser():
    return TestClient(create_app())


class TestSignIn:
    def test_sets_an_httponly_refresh_cookie_for_the_auth_routes_only(self, client, account):
        response = login(client)

        assert response.status_code == 200
        cookie = response.headers["set-cookie"]
        assert cookie.startswith(f"{REFRESH_COOKIE}=")
        assert "HttpOnly" in cookie
        assert "Path=/api/auth" in cookie
        assert "SameSite=strict" in cookie
        assert f"Max-Age={30 * 24 * 60 * 60}" in cookie
        assert REFRESH_COOKIE not in response.json()  # never readable by page scripts

    def test_access_tokens_last_fifteen_minutes(self, client, account):
        token = login(client).json()["access_token"]

        claims = jwt.decode(token, options={"verify_signature": False})

        assert claims["exp"] - claims["iat"] == get_settings().jwt_expire_minutes * 60
        assert type(get_settings()).model_fields["jwt_expire_minutes"].default == 15
        assert claims["ver"] == 0

    def test_only_a_hash_of_the_refresh_token_is_stored(self, client, account):
        token = login(client).cookies[REFRESH_COOKIE]

        with get_sessionmaker()() as session:
            [row] = session.query(RefreshToken).all()
        assert token not in row.token_hash
        assert len(row.token_hash) == 64

    def test_cookies_are_secure_outside_development(self, monkeypatch):
        monkeypatch.delenv("COOKIE_SECURE")
        monkeypatch.setenv("APP_ENV", "production")
        get_settings.cache_clear()
        try:
            assert get_settings().secure_cookies is True
            monkeypatch.setenv("APP_ENV", "development")
            get_settings.cache_clear()
            assert get_settings().secure_cookies is False
        finally:
            get_settings.cache_clear()


class TestRefresh:
    def test_issues_a_new_access_token_and_replaces_the_cookie(self, client, account):
        first = login(client).cookies[REFRESH_COOKIE]

        response = refresh(client)

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["user"]["email"] == EMAIL
        assert client.get("/api/auth/me", headers=bearer(body["access_token"])).status_code == 200
        assert response.cookies[REFRESH_COOKIE] != first

    def test_each_refresh_token_works_once(self, client, account):
        login(client)
        assert refresh(client).status_code == 200
        assert refresh(client).status_code == 200  # the rotated cookie keeps working

    def test_reusing_a_spent_token_ends_the_whole_session(self, client, account):
        stolen = login(client).cookies[REFRESH_COOKIE]
        latest = refresh(client).cookies[REFRESH_COOKIE]  # the real user moves on

        replay = refresh(new_browser(), stolen)

        assert replay.status_code == 401
        assert replay.json()["error"]["code"] == "SESSION_EXPIRED"
        # The legitimate holder is signed out too: someone else had a copy.
        assert refresh(client, latest).status_code == 401

    def test_reuse_leaves_other_sessions_alone(self, client, account):
        laptop = new_browser()
        login(laptop)
        stolen = login(client).cookies[REFRESH_COOKIE]
        refresh(client)
        refresh(new_browser(), stolen)

        assert refresh(laptop).status_code == 200

    def test_needs_the_cookie(self, client):
        response = client.post("/api/auth/refresh")

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "SESSION_EXPIRED"

    def test_rejects_an_unknown_token(self, client, account):
        assert refresh(client, "made-up-token").status_code == 401

    def test_rejects_an_expired_token(self, client, account):
        login(client)
        with get_sessionmaker()() as session:
            session.execute(
                update(RefreshToken).values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
            )
            session.commit()

        assert refresh(client).status_code == 401


class TestSignOut:
    def test_ends_this_session_and_clears_the_cookie(self, client, account):
        token = login(client).cookies[REFRESH_COOKIE]

        response = client.post("/api/auth/logout")

        assert response.status_code == 204
        assert f'{REFRESH_COOKIE}=""' in response.headers["set-cookie"]
        assert "Max-Age=0" in response.headers["set-cookie"]
        assert refresh(client, token).status_code == 401

    def test_works_without_a_cookie_or_access_token(self, client):
        assert client.post("/api/auth/logout").status_code == 204

    def test_other_sessions_stay_signed_in(self, client, account):
        laptop = new_browser()
        login(laptop)
        login(client)

        client.post("/api/auth/logout")

        assert refresh(laptop).status_code == 200


class TestSignOutEverywhere:
    def test_ends_every_session_and_every_access_token(self, client, account):
        laptop = new_browser()
        laptop_access = login(laptop).json()["access_token"]
        access = login(client).json()["access_token"]

        response = client.post("/api/auth/logout-all", headers=bearer(access))

        assert response.status_code == 204
        assert refresh(laptop).status_code == 401
        assert client.get("/api/auth/me", headers=bearer(laptop_access)).status_code == 401
        assert client.get("/api/auth/me", headers=bearer(access)).status_code == 401

    def test_signing_in_again_works(self, client, account):
        access = login(client).json()["access_token"]
        client.post("/api/auth/logout-all", headers=bearer(access))

        fresh = login(client).json()["access_token"]

        assert client.get("/api/auth/me", headers=bearer(fresh)).status_code == 200
        assert refresh(client).status_code == 200

    def test_needs_an_access_token(self, client):
        assert client.post("/api/auth/logout-all").status_code == 401

    def test_tokens_from_before_versions_still_work(self, client, account):
        user_id = client.get(
            "/api/auth/me", headers=bearer(login(client).json()["access_token"])
        ).json()["id"]
        settings = get_settings()
        now = datetime.now(UTC)
        legacy = jwt.encode(
            {"sub": str(user_id), "iat": now, "exp": now + timedelta(minutes=5)},
            settings.jwt_secret,
            algorithm=settings.jwt_algorithm,
        )

        assert client.get("/api/auth/me", headers=bearer(legacy)).status_code == 200


class TestFailedSignInLimits:
    def fail(self, client, email=EMAIL, times=1):
        for _ in range(times):
            assert login(client, email, "wrong-password").status_code == 401

    def test_locks_an_email_after_five_failures_even_with_the_right_password(self, client, account):
        self.fail(client, times=5)

        response = login(client)

        assert response.status_code == 429
        assert response.json()["error"]["code"] == "TOO_MANY_ATTEMPTS"
        assert "15 minute" in response.json()["error"]["message"]
        assert 1 <= int(response.headers["retry-after"]) <= 15 * 60

    def test_other_emails_can_still_sign_in(self, client, account):
        self.fail(client, email="someone@example.com", times=5)

        assert login(client).status_code == 200

    def test_a_successful_sign_in_forgives_earlier_failures(self, client, account):
        self.fail(client, times=4)
        assert login(client).status_code == 200

        self.fail(client, times=4)

        assert login(client).status_code == 200

    def test_unknown_emails_are_limited_the_same_way(self, client):
        self.fail(client, email="ghost@example.com", times=5)

        assert login(client, "ghost@example.com", "anything").status_code == 429

    def test_limits_one_address_trying_many_emails(self, client, account):
        for n in range(20):
            self.fail(client, email=f"guess{n}@example.com")

        assert login(client).status_code == 429

    def test_old_failures_no_longer_count(self, client, account):
        self.fail(client, times=5)
        with get_sessionmaker()() as session:
            session.execute(
                update(LoginFailure).values(created_at=datetime.now(UTC) - timedelta(minutes=16))
            )
            session.commit()

        assert login(client).status_code == 200

    def test_old_failures_are_pruned(self, client, account):
        self.fail(client, times=3)
        with get_sessionmaker()() as session:
            session.execute(
                update(LoginFailure).values(created_at=datetime.now(UTC) - timedelta(hours=1))
            )
            session.commit()

        self.fail(client)

        with get_sessionmaker()() as session:
            assert session.query(LoginFailure).count() == 1


class TestCors:
    def test_the_web_app_may_send_the_cookie(self, client):
        response = client.options(
            "/api/auth/refresh",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
            },
        )

        assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
        assert response.headers["access-control-allow-credentials"] == "true"
