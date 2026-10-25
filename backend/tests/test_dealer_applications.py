"""Review of dealer applications made before dealers could sign up directly.

New dealer sign-ups no longer create applications (see test_dealer_role.py); these
records exist only in older data, so the tests insert them directly.
"""

import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import select

from app.db import get_sessionmaker
from app.errors import AppError
from app.models import DealerApplication, User
from app.services.dealers import approve_application
from tests.conftest import VEHICLE

APPLICANT = {
    "full_name": "Dana Dealer",
    "email": "dana@motors.example",
    "password": "dealer-pass-1",
}


def token_for(client, email, password):
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def applicant(client):
    """A customer with a pending application, as in data created before this change."""
    user = client.post("/api/auth/register", json=APPLICANT).json()
    with get_sessionmaker()() as session:
        application = DealerApplication(user_id=user["id"], business_name="Dana Motors")
        session.add(application)
        session.commit()
        application_id = application.id
    return {"id": application_id}, token_for(client, APPLICANT["email"], APPLICANT["password"])


class TestMyApplication:
    def test_pending_applicant_has_no_inventory_permissions(self, client, applicant):
        _, headers = applicant

        assert client.post("/api/vehicles", json=VEHICLE, headers=headers).status_code == 403

    def test_customers_without_an_application_get_404(self, client, customer_headers):
        response = client.get("/api/dealer-applications/me", headers=customer_headers)

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "APPLICATION_NOT_FOUND"

    def test_applicant_sees_their_application(self, client, applicant):
        _, headers = applicant

        response = client.get("/api/dealer-applications/me", headers=headers)

        assert response.status_code == 200
        assert response.json()["status"] == "pending"

    def test_requires_authentication(self, client):
        assert client.get("/api/dealer-applications/me").status_code == 401


class TestReview:
    def test_admin_lists_pending_applications(self, client, admin_headers, applicant):
        response = client.get(
            "/api/dealer-applications", params={"status": "pending"}, headers=admin_headers
        )

        assert response.status_code == 200
        assert [a["business_name"] for a in response.json()] == ["Dana Motors"]

    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("get", "/api/dealer-applications"),
            ("post", "/api/dealer-applications/1/approve"),
            ("post", "/api/dealer-applications/1/reject"),
        ],
    )
    def test_review_endpoints_are_admin_only(self, client, applicant, method, path):
        _, applicant_headers = applicant

        assert client.request(method, path, json={}).status_code == 401
        assert client.request(method, path, json={}, headers=applicant_headers).status_code == 403

    def test_approval_makes_the_applicant_a_dealer_immediately(
        self, client, admin_headers, applicant
    ):
        application, applicant_headers = applicant

        response = client.post(
            f"/api/dealer-applications/{application['id']}/approve", headers=admin_headers
        )

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "approved"
        assert body["reviewed_at"] is not None
        assert body["applicant"]["role"] == "dealer"
        # Same token as before: the role is read from the database on each request.
        created = client.post("/api/vehicles", json=VEHICLE, headers=applicant_headers)
        assert created.status_code == 201
        # A dealer, not an admin: reviewing applications stays admin-only.
        listing = client.get("/api/dealer-applications", headers=applicant_headers)
        assert listing.status_code == 403
        with get_sessionmaker()() as session:
            record = session.scalars(select(DealerApplication)).one()
            reviewer = session.scalar(select(User).where(User.email == "admin@example.com"))
        assert record.reviewed_by_id == reviewer.id

    def test_rejection_keeps_customer_access_and_records_the_note(
        self, client, admin_headers, applicant
    ):
        application, applicant_headers = applicant

        response = client.post(
            f"/api/dealer-applications/{application['id']}/reject",
            json={"note": "Could not verify the business."},
            headers=admin_headers,
        )

        assert response.status_code == 200
        assert response.json()["status"] == "rejected"
        assert response.json()["review_note"] == "Could not verify the business."
        assert response.json()["applicant"]["role"] == "customer"
        assert (
            client.post("/api/vehicles", json=VEHICLE, headers=applicant_headers).status_code == 403
        )
        mine = client.get("/api/dealer-applications/me", headers=applicant_headers).json()
        assert mine["status"] == "rejected"

    @pytest.mark.parametrize("second", ["approve", "reject"])
    def test_an_application_is_reviewed_only_once(self, client, admin_headers, applicant, second):
        application, _ = applicant
        client.post(f"/api/dealer-applications/{application['id']}/approve", headers=admin_headers)

        response = client.post(
            f"/api/dealer-applications/{application['id']}/{second}", headers=admin_headers
        )

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "APPLICATION_NOT_PENDING"

    def test_missing_application_is_404(self, client, admin_headers):
        response = client.post("/api/dealer-applications/9999/approve", headers=admin_headers)

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "APPLICATION_NOT_FOUND"

    def test_status_filter_is_validated(self, client, admin_headers):
        response = client.get(
            "/api/dealer-applications", params={"status": "maybe"}, headers=admin_headers
        )

        assert response.status_code == 422

    def test_concurrent_approvals_succeed_exactly_once(self, client, admin_headers, applicant):
        application, _ = applicant
        with get_sessionmaker()() as session:
            admin_id = session.scalar(select(User.id).where(User.email == "admin@example.com"))
        attempts = 10
        barrier = threading.Barrier(attempts)

        def attempt() -> bool:
            barrier.wait()
            with get_sessionmaker()() as session:
                try:
                    approve_application(session, application["id"], admin_id)
                    return True
                except AppError:
                    return False

        with ThreadPoolExecutor(max_workers=attempts) as pool:
            results = list(pool.map(lambda _: attempt(), range(attempts)))

        assert results.count(True) == 1
