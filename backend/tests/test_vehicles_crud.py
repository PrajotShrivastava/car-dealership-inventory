from datetime import date

import pytest

from tests.conftest import VEHICLE


class TestAuthorization:
    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("get", "/api/vehicles"),
            ("get", "/api/vehicles/1"),
            ("post", "/api/vehicles"),
            ("put", "/api/vehicles/1"),
            ("delete", "/api/vehicles/1"),
        ],
    )
    def test_every_vehicle_endpoint_requires_authentication(self, client, method, path):
        response = client.request(method, path, json=VEHICLE)

        assert response.status_code == 401

    def test_customer_cannot_create(self, client, customer_headers):
        response = client.post("/api/vehicles", json=VEHICLE, headers=customer_headers)

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "FORBIDDEN"

    def test_customer_cannot_update(self, client, customer_headers, make_vehicle):
        vehicle = make_vehicle()
        update = {k: v for k, v in VEHICLE.items() if k != "quantity"}

        response = client.put(
            f"/api/vehicles/{vehicle['id']}", json=update, headers=customer_headers
        )

        assert response.status_code == 403

    def test_customer_cannot_delete(self, client, customer_headers, make_vehicle):
        vehicle = make_vehicle()

        response = client.delete(f"/api/vehicles/{vehicle['id']}", headers=customer_headers)

        assert response.status_code == 403


class TestCreate:
    def test_admin_creates_vehicle(self, client, admin_headers):
        response = client.post("/api/vehicles", json=VEHICLE, headers=admin_headers)

        assert response.status_code == 201
        body = response.json()
        assert isinstance(body["id"], int)
        assert body["make"] == "Ford"
        assert body["price"] == "35990.00"
        assert body["quantity"] == 4

    def test_trims_text_and_allows_missing_trim(self, client, admin_headers):
        payload = {**VEHICLE, "make": "  Ford  ", "trim": None}

        body = client.post("/api/vehicles", json=payload, headers=admin_headers).json()

        assert body["make"] == "Ford"
        assert body["trim"] is None

    @pytest.mark.parametrize(
        ("field", "value"),
        [
            ("make", "   "),
            ("model", ""),
            ("price", "0"),
            ("price", "-1"),
            ("price", "12.345"),
            ("quantity", -1),
            ("year", 1899),
            ("year", date.today().year + 2),
            ("category", "spaceship"),
            ("fuel_type", "steam"),
            ("transmission", "cvt-ish"),
        ],
    )
    def test_rejects_invalid_field(self, client, admin_headers, field, value):
        response = client.post(
            "/api/vehicles", json={**VEHICLE, field: value}, headers=admin_headers
        )

        assert response.status_code == 422
        assert field in {d["field"] for d in response.json()["error"]["details"]}


class TestRead:
    def test_empty_inventory_lists_nothing(self, client, customer_headers):
        response = client.get("/api/vehicles", headers=customer_headers)

        assert response.status_code == 200
        assert response.json()["items"] == []
        assert response.json()["total"] == 0

    def test_customer_lists_and_fetches_vehicles(self, client, customer_headers, make_vehicle):
        vehicle = make_vehicle()

        listing = client.get("/api/vehicles", headers=customer_headers).json()
        detail = client.get(f"/api/vehicles/{vehicle['id']}", headers=customer_headers)

        assert [v["id"] for v in listing["items"]] == [vehicle["id"]]
        assert listing["total"] == 1
        assert detail.status_code == 200
        assert detail.json() == vehicle

    def test_missing_vehicle_is_404(self, client, customer_headers):
        response = client.get("/api/vehicles/9999", headers=customer_headers)

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "VEHICLE_NOT_FOUND"


class TestUpdate:
    def test_admin_updates_details(self, client, admin_headers, make_vehicle):
        vehicle = make_vehicle()
        update = {k: v for k, v in VEHICLE.items() if k != "quantity"} | {"price": "33500.50"}

        response = client.put(f"/api/vehicles/{vehicle['id']}", json=update, headers=admin_headers)

        assert response.status_code == 200
        assert response.json()["price"] == "33500.50"
        assert response.json()["quantity"] == vehicle["quantity"]

    def test_quantity_cannot_be_edited_directly(self, client, admin_headers, make_vehicle):
        vehicle = make_vehicle()

        response = client.put(
            f"/api/vehicles/{vehicle['id']}",
            json={**VEHICLE, "quantity": 99},
            headers=admin_headers,
        )

        assert response.status_code == 422
        assert "quantity" in {d["field"] for d in response.json()["error"]["details"]}

    def test_updating_missing_vehicle_is_404(self, client, admin_headers):
        update = {k: v for k, v in VEHICLE.items() if k != "quantity"}

        response = client.put("/api/vehicles/9999", json=update, headers=admin_headers)

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "VEHICLE_NOT_FOUND"


class TestDelete:
    def test_admin_deletes_vehicle(self, client, admin_headers, make_vehicle):
        vehicle = make_vehicle()

        response = client.delete(f"/api/vehicles/{vehicle['id']}", headers=admin_headers)

        assert response.status_code == 204
        assert (
            client.get(f"/api/vehicles/{vehicle['id']}", headers=admin_headers).status_code == 404
        )

    def test_deleting_missing_vehicle_is_404(self, client, admin_headers):
        response = client.delete("/api/vehicles/9999", headers=admin_headers)

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "VEHICLE_NOT_FOUND"
