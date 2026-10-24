import pytest
from fastapi.testclient import TestClient

from app.main import create_app

TOO_BIG = 2**31  # beyond Postgres INTEGER


def test_unexpected_errors_return_a_json_500_without_internals():
    app = create_app()

    @app.get("/api/_boom")
    def boom() -> None:
        raise RuntimeError("secret internal detail")

    response = TestClient(app, raise_server_exceptions=False).get("/api/_boom")

    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred"}
    }


@pytest.mark.parametrize(
    ("method", "suffix", "body"),
    [
        ("get", "", None),
        ("put", "", "update"),
        ("delete", "", None),
        ("post", "/purchase", {"quantity": 1}),
        ("post", "/restock", {"quantity": 1}),
    ],
)
def test_out_of_range_ids_are_rejected_cleanly(client, admin_headers, method, suffix, body):
    from tests.conftest import VEHICLE

    payload = {k: v for k, v in VEHICLE.items() if k != "quantity"} if body == "update" else body

    response = client.request(
        method, f"/api/vehicles/{TOO_BIG}{suffix}", json=payload, headers=admin_headers
    )

    assert response.status_code == 422


def test_huge_offset_is_rejected(client, customer_headers):
    response = client.get(
        "/api/vehicles/search", params={"offset": 10**12}, headers=customer_headers
    )

    assert response.status_code == 422


def test_restock_cannot_push_stock_past_the_limit(client, admin_headers, make_vehicle):
    from sqlalchemy import update

    from app.db import get_sessionmaker
    from app.models import Vehicle
    from app.services.inventory import MAX_STOCK

    vehicle = make_vehicle()
    with get_sessionmaker()() as session:  # beyond what the create endpoint allows
        session.execute(
            update(Vehicle).where(Vehicle.id == vehicle["id"]).values(quantity=MAX_STOCK - 500)
        )
        session.commit()

    response = client.post(
        f"/api/vehicles/{vehicle['id']}/restock", json={"quantity": 501}, headers=admin_headers
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "STOCK_LIMIT_EXCEEDED"
    detail = client.get(f"/api/vehicles/{vehicle['id']}", headers=admin_headers).json()
    assert detail["quantity"] == MAX_STOCK - 500
