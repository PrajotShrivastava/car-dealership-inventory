"""vehicles.catalog_image_id is unused (left from a removed integration) but must stay intact."""

from sqlalchemy import select, update

from app.db import get_sessionmaker
from app.models import Vehicle
from tests.conftest import VEHICLE

LEGACY_ID = "6a972e430fb1b038"


def _set_legacy_id(vehicle_id: int) -> None:
    with get_sessionmaker()() as session:
        session.execute(
            update(Vehicle).where(Vehicle.id == vehicle_id).values(catalog_image_id=LEGACY_ID)
        )
        session.commit()


def _legacy_id(vehicle_id: int) -> str | None:
    with get_sessionmaker()() as session:
        return session.scalar(select(Vehicle.catalog_image_id).where(Vehicle.id == vehicle_id))


def test_not_exposed_by_the_api(client, customer_headers, make_vehicle):
    vehicle = make_vehicle()
    _set_legacy_id(vehicle["id"])

    body = client.get(f"/api/vehicles/{vehicle['id']}", headers=customer_headers).json()

    assert "catalog_image_id" not in body


def test_new_vehicles_leave_it_empty(make_vehicle):
    assert _legacy_id(make_vehicle()["id"]) is None


def test_editing_a_vehicle_leaves_an_existing_value_untouched(client, admin_headers, make_vehicle):
    vehicle = make_vehicle()
    _set_legacy_id(vehicle["id"])
    fields = {k: v for k, v in VEHICLE.items() if k != "quantity"}

    response = client.put(
        f"/api/vehicles/{vehicle['id']}",
        json={**fields, "price": "33500.00"},
        headers=admin_headers,
    )

    assert response.status_code == 200
    assert _legacy_id(vehicle["id"]) == LEGACY_ID


def test_api_rejects_attempts_to_set_it(client, admin_headers, make_vehicle):
    vehicle = make_vehicle()
    fields = {k: v for k, v in VEHICLE.items() if k != "quantity"}

    response = client.put(
        f"/api/vehicles/{vehicle['id']}",
        json={**fields, "catalog_image_id": LEGACY_ID},
        headers=admin_headers,
    )

    # VehicleUpdate forbids unknown fields, so the column can't be written through the API.
    assert response.status_code == 422
    assert _legacy_id(vehicle["id"]) is None
