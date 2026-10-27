"""Dealer sign-up creates a dealer directly; dealers manage inventory, only admins review."""

import pytest
from sqlalchemy import func, select

from app.db import get_sessionmaker
from app.models import DealerApplication, Role, User
from tests.conftest import VEHICLE
from tests.test_vehicle_photos import files, image_bytes

DEALER = {"full_name": "Dana Dealer", "email": "Dana@Motors.example", "password": "dealer-pass-1"}


def register_dealer(client, **overrides):
    return client.post("/api/auth/register-dealer", json={**DEALER, **overrides})


def token_for(client, email, password):
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def dealer_headers(client):
    assert register_dealer(client).status_code == 201
    return token_for(client, DEALER["email"], DEALER["password"])


class TestDealerRegistration:
    def test_creates_a_dealer_account_directly(self, client):
        response = register_dealer(client)

        assert response.status_code == 201
        body = response.json()
        assert body["email"] == "dana@motors.example"
        assert body["full_name"] == "Dana Dealer"
        assert body["role"] == "dealer"

    def test_the_dealer_role_is_what_the_database_stores(self, client):
        register_dealer(client)

        with get_sessionmaker()() as session:
            role = session.scalar(select(User.role).where(User.email == "dana@motors.example"))
        assert role is Role.DEALER

    def test_the_dealer_role_is_stored_and_returned_on_sign_in(self, client, dealer_headers):
        login = client.post(
            "/api/auth/login", json={"email": DEALER["email"], "password": DEALER["password"]}
        )

        assert login.json()["user"]["role"] == "dealer"
        assert client.get("/api/auth/me", headers=dealer_headers).json()["role"] == "dealer"

    def test_no_dealer_application_is_created(self, client, dealer_headers):
        response = client.get("/api/dealer-applications/me", headers=dealer_headers)

        assert response.status_code == 404
        with get_sessionmaker()() as session:
            assert session.scalar(select(func.count()).select_from(DealerApplication)) == 0

    @pytest.mark.parametrize("role", ["admin", "customer"])
    def test_another_role_cannot_be_requested(self, client, role):
        assert register_dealer(client, role=role).json()["role"] == "dealer"

    def test_rejects_duplicate_email(self, client, customer_headers):
        response = register_dealer(client, email="customer@example.com")

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "EMAIL_TAKEN"

    @pytest.mark.parametrize(
        ("field", "value"),
        [("password", "short"), ("email", "not-an-email"), ("full_name", "   ")],
    )
    def test_validates_input(self, client, field, value):
        response = register_dealer(client, **{field: value})

        assert response.status_code == 422
        assert field in {d["field"] for d in response.json()["error"]["details"]}

    def test_customer_sign_up_still_creates_a_customer(self, client):
        response = client.post(
            "/api/auth/register",
            json={"email": "buyer@example.com", "password": "buyer-pass-1", "full_name": "Buyer"},
        )
        headers = token_for(client, "buyer@example.com", "buyer-pass-1")

        assert response.json()["role"] == "customer"
        assert client.post("/api/vehicles", json=VEHICLE, headers=headers).status_code == 403


class TestDealerPermissions:
    def test_dealer_manages_inventory_straight_after_sign_up(self, client, dealer_headers):
        created = client.post("/api/vehicles", json=VEHICLE, headers=dealer_headers)
        assert created.status_code == 201
        vehicle_id = created.json()["id"]
        fields = {k: v for k, v in VEHICLE.items() if k != "quantity"}

        updated = client.put(
            f"/api/vehicles/{vehicle_id}",
            json={**fields, "price": "33990.00"},
            headers=dealer_headers,
        )
        restocked = client.post(
            f"/api/vehicles/{vehicle_id}/restock", json={"quantity": 2}, headers=dealer_headers
        )
        uploaded = client.post(
            f"/api/vehicles/{vehicle_id}/photos", files=files(image_bytes()), headers=dealer_headers
        )
        photo_id = uploaded.json()["photos"][0]["id"]
        photo_deleted = client.delete(
            f"/api/vehicles/{vehicle_id}/photos/{photo_id}", headers=dealer_headers
        )
        deleted = client.delete(f"/api/vehicles/{vehicle_id}", headers=dealer_headers)

        assert updated.status_code == 200
        assert updated.json()["price"] == "33990.00"
        assert restocked.json()["quantity"] == VEHICLE["quantity"] + 2
        assert uploaded.status_code == 201
        assert photo_deleted.status_code == 204
        assert deleted.status_code == 204

    def test_dealers_cannot_change_vehicles_they_did_not_list(
        self, client, dealer_headers, make_vehicle
    ):
        vehicle = make_vehicle()  # added by an admin, so no dealer owns it
        fields = {k: v for k, v in VEHICLE.items() if k != "quantity"}

        response = client.put(
            f"/api/vehicles/{vehicle['id']}",
            json={**fields, "trim": "Titanium"},
            headers=dealer_headers,
        )

        assert response.status_code == 404

    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("get", "/api/dealer-applications"),
            ("post", "/api/dealer-applications/1/approve"),
            ("post", "/api/dealer-applications/1/reject"),
        ],
    )
    def test_dealers_cannot_review_dealer_applications(self, client, dealer_headers, method, path):
        response = client.request(method, path, json={}, headers=dealer_headers)

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "FORBIDDEN"

    def test_admins_keep_the_inventory_tools(self, client, admin_headers):
        assert client.post("/api/vehicles", json=VEHICLE, headers=admin_headers).status_code == 201
