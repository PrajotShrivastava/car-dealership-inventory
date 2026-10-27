"""Vehicles belong to the dealer who listed them; dealers see and change only their own."""

import pytest
from sqlalchemy import select

from app.db import get_sessionmaker
from app.models import Purchase, Vehicle
from tests.conftest import VEHICLE
from tests.test_vehicle_photos import files, image_bytes

OTHER = {"full_name": "Olly Other", "email": "olly@motors.example", "password": "dealer-pass-2"}
MINE = {"full_name": "Dana Dealer", "email": "dana@motors.example", "password": "dealer-pass-1"}


def dealer(client, account):
    assert client.post("/api/auth/register-dealer", json=account).status_code == 201
    login = client.post(
        "/api/auth/login", json={"email": account["email"], "password": account["password"]}
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


@pytest.fixture
def mine(client):
    return dealer(client, MINE)


@pytest.fixture
def other(client):
    return dealer(client, OTHER)


def add(client, headers, **overrides):
    response = client.post("/api/vehicles", json={**VEHICLE, **overrides}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def owner_of(vehicle_id):
    with get_sessionmaker()() as session:
        return session.scalar(select(Vehicle.dealer_id).where(Vehicle.id == vehicle_id))


def user_id(client, headers):
    return client.get("/api/auth/me", headers=headers).json()["id"]


class TestOwnership:
    def test_a_dealer_owns_the_vehicles_they_add(self, client, mine):
        vehicle = add(client, mine)

        assert owner_of(vehicle["id"]) == user_id(client, mine)

    def test_vehicles_added_by_an_admin_belong_to_no_dealer(self, client, admin_headers):
        vehicle = add(client, admin_headers)

        assert owner_of(vehicle["id"]) is None

    def test_a_purchase_records_the_dealer_who_sold_it(self, client, mine, customer_headers):
        vehicle = add(client, mine, quantity=3)

        client.post(
            f"/api/vehicles/{vehicle['id']}/purchase",
            json={"quantity": 2},
            headers=customer_headers,
        )

        with get_sessionmaker()() as session:
            sale = session.scalars(select(Purchase)).one()
        assert sale.dealer_id == user_id(client, mine)
        assert sale.quantity == 2

    def test_the_sale_keeps_its_dealer_after_the_vehicle_is_deleted(
        self, client, mine, customer_headers
    ):
        vehicle = add(client, mine, quantity=3)
        client.post(f"/api/vehicles/{vehicle['id']}/purchase", headers=customer_headers)

        client.delete(f"/api/vehicles/{vehicle['id']}", headers=mine)

        with get_sessionmaker()() as session:
            sale = session.scalars(select(Purchase)).one()
        assert sale.vehicle_id is None
        assert sale.dealer_id == user_id(client, mine)


class TestDealerIsolation:
    def test_a_dealer_lists_only_their_own_vehicles(self, client, mine, other):
        add(client, mine, make="Kia", model="Sportage")
        add(client, other, make="Audi", model="Q3")

        for path in ("/api/vehicles", "/api/vehicles/search"):
            body = client.get(path, headers=mine).json()
            assert [v["make"] for v in body["items"]] == ["Kia"]
            assert body["total"] == 1
            assert body["counts"]["all"] == 1

    def test_customers_and_admins_still_see_every_vehicle(
        self, client, mine, other, customer_headers, admin_headers
    ):
        add(client, mine, make="Kia")
        add(client, other, make="Audi")

        for headers in (customer_headers, admin_headers):
            assert client.get("/api/vehicles/search", headers=headers).json()["total"] == 2

    @pytest.mark.parametrize(
        "method, suffix, body",
        [
            ("get", "", None),
            ("put", "", {k: v for k, v in VEHICLE.items() if k != "quantity"}),
            ("delete", "", None),
            ("post", "/restock", {"quantity": 1}),
            ("post", "/purchase", {"quantity": 1}),
        ],
    )
    def test_another_dealers_vehicle_looks_like_it_does_not_exist(
        self, client, mine, other, method, suffix, body
    ):
        theirs = add(client, other)

        kwargs = {"json": body} if body is not None else {}
        response = client.request(
            method.upper(), f"/api/vehicles/{theirs['id']}{suffix}", headers=mine, **kwargs
        )

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "VEHICLE_NOT_FOUND"
        with get_sessionmaker()() as session:
            unchanged = session.get(Vehicle, theirs["id"])
        assert unchanged is not None
        assert unchanged.quantity == VEHICLE["quantity"]

    def test_photos_of_another_dealers_vehicle_cannot_be_changed(self, client, mine, other):
        theirs = add(client, other)
        uploaded = client.post(
            f"/api/vehicles/{theirs['id']}/photos", files=files(image_bytes()), headers=other
        ).json()
        photo_id = uploaded["photos"][0]["id"]

        upload = client.post(
            f"/api/vehicles/{theirs['id']}/photos", files=files(image_bytes()), headers=mine
        )
        removal = client.delete(f"/api/vehicles/{theirs['id']}/photos/{photo_id}", headers=mine)

        assert upload.status_code == 404
        assert removal.status_code == 404
        assert len(client.get(f"/api/vehicles/{theirs['id']}", headers=other).json()["photos"]) == 1

    def test_admins_can_still_manage_a_dealers_vehicle(self, client, mine, admin_headers):
        vehicle = add(client, mine, quantity=1)

        restocked = client.post(
            f"/api/vehicles/{vehicle['id']}/restock", json={"quantity": 2}, headers=admin_headers
        )

        assert restocked.status_code == 200
        assert restocked.json()["quantity"] == 3
