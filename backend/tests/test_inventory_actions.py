import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import func, select

from app.db import get_sessionmaker
from app.errors import AppError
from app.models import Purchase, User
from app.services.inventory import purchase_vehicle


def purchase(client, headers, vehicle_id, **body):
    return client.post(f"/api/vehicles/{vehicle_id}/purchase", json=body, headers=headers)


def restock(client, headers, vehicle_id, quantity):
    return client.post(
        f"/api/vehicles/{vehicle_id}/restock", json={"quantity": quantity}, headers=headers
    )


def stock_of(client, headers, vehicle_id):
    return client.get(f"/api/vehicles/{vehicle_id}", headers=headers).json()["quantity"]


def purchase_count():
    with get_sessionmaker()() as session:
        return session.scalar(select(func.count()).select_from(Purchase))


class TestPurchase:
    def test_requires_authentication(self, client, make_vehicle):
        vehicle = make_vehicle()

        assert client.post(f"/api/vehicles/{vehicle['id']}/purchase", json={}).status_code == 401

    def test_buys_one_unit_by_default_and_records_the_sale(
        self, client, customer_headers, make_vehicle
    ):
        vehicle = make_vehicle(quantity=3, price="20000.00")

        response = purchase(client, customer_headers, vehicle["id"])

        assert response.status_code == 200
        body = response.json()
        assert body["vehicle"]["quantity"] == 2
        assert body["purchase"]["quantity"] == 1
        assert body["purchase"]["unit_price"] == "20000.00"
        assert body["purchase"]["total_price"] == "20000.00"
        assert stock_of(client, customer_headers, vehicle["id"]) == 2
        assert purchase_count() == 1

    def test_buys_several_units(self, client, customer_headers, make_vehicle):
        vehicle = make_vehicle(quantity=3, price="1000.50")

        body = purchase(client, customer_headers, vehicle["id"], quantity=3).json()

        assert body["vehicle"]["quantity"] == 0
        assert body["purchase"]["total_price"] == "3001.50"

    def test_out_of_stock_is_rejected_without_side_effects(
        self, client, customer_headers, make_vehicle
    ):
        vehicle = make_vehicle(quantity=0)

        response = purchase(client, customer_headers, vehicle["id"])

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "OUT_OF_STOCK"
        assert stock_of(client, customer_headers, vehicle["id"]) == 0
        assert purchase_count() == 0

    def test_buying_more_than_available_is_rejected(self, client, customer_headers, make_vehicle):
        vehicle = make_vehicle(quantity=2)

        response = purchase(client, customer_headers, vehicle["id"], quantity=3)

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "INSUFFICIENT_STOCK"
        assert stock_of(client, customer_headers, vehicle["id"]) == 2

    def test_missing_vehicle_is_404(self, client, customer_headers):
        response = purchase(client, customer_headers, 9999)

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "VEHICLE_NOT_FOUND"

    @pytest.mark.parametrize("quantity", [0, -1, 11, "two"])
    def test_rejects_invalid_quantity(self, client, customer_headers, make_vehicle, quantity):
        vehicle = make_vehicle()

        response = purchase(client, customer_headers, vehicle["id"], quantity=quantity)

        assert response.status_code == 422

    def test_concurrent_purchases_never_oversell(self, client, customer_headers, make_vehicle):
        vehicle = make_vehicle(quantity=5)
        with get_sessionmaker()() as session:
            buyer_id = session.scalar(select(User.id).where(User.email == "customer@example.com"))
        attempts = 20
        barrier = threading.Barrier(attempts)

        def attempt() -> bool:
            barrier.wait()
            with get_sessionmaker()() as session:
                try:
                    purchase_vehicle(session, vehicle["id"], buyer_id, 1)
                    return True
                except AppError:
                    return False

        with ThreadPoolExecutor(max_workers=attempts) as pool:
            results = list(pool.map(lambda _: attempt(), range(attempts)))

        assert results.count(True) == 5
        assert stock_of(client, customer_headers, vehicle["id"]) == 0
        assert purchase_count() == 5


class TestRestock:
    def test_admin_adds_stock(self, client, admin_headers, make_vehicle):
        vehicle = make_vehicle(quantity=1)

        response = restock(client, admin_headers, vehicle["id"], 5)

        assert response.status_code == 200
        assert response.json()["quantity"] == 6

    def test_restocked_vehicle_becomes_purchasable(
        self, client, admin_headers, customer_headers, make_vehicle
    ):
        vehicle = make_vehicle(quantity=0)
        restock(client, admin_headers, vehicle["id"], 1)

        assert purchase(client, customer_headers, vehicle["id"]).status_code == 200

    def test_customer_cannot_restock(self, client, customer_headers, make_vehicle):
        vehicle = make_vehicle(quantity=1)

        response = restock(client, customer_headers, vehicle["id"], 5)

        assert response.status_code == 403
        assert stock_of(client, customer_headers, vehicle["id"]) == 1

    def test_requires_authentication(self, client, make_vehicle):
        vehicle = make_vehicle()

        response = client.post(f"/api/vehicles/{vehicle['id']}/restock", json={"quantity": 1})

        assert response.status_code == 401

    @pytest.mark.parametrize("quantity", [0, -3, 1001])
    def test_rejects_invalid_quantity(self, client, admin_headers, make_vehicle, quantity):
        vehicle = make_vehicle()

        assert restock(client, admin_headers, vehicle["id"], quantity).status_code == 422

    def test_missing_vehicle_is_404(self, client, admin_headers):
        response = restock(client, admin_headers, 9999, 1)

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "VEHICLE_NOT_FOUND"


def test_deleting_a_sold_vehicle_keeps_purchase_history(
    client, admin_headers, customer_headers, make_vehicle
):
    vehicle = make_vehicle(quantity=2)
    purchase(client, customer_headers, vehicle["id"])

    response = client.delete(f"/api/vehicles/{vehicle['id']}", headers=admin_headers)

    assert response.status_code == 204
    with get_sessionmaker()() as session:
        record = session.scalars(select(Purchase)).one()
    assert record.vehicle_id is None
    assert record.vehicle_label == "2023 Ford Kuga ST-Line"
