"""A freshly set-up database has no vehicles; a dealer adds the first one."""

from alembic import command
from alembic.config import Config
from sqlalchemy import func, select

from app.db import get_engine, get_sessionmaker
from app.models import Vehicle
from tests.conftest import VEHICLE
from tests.test_dealer_role import DEALER, register_dealer, token_for


def test_migrating_a_fresh_database_adds_no_vehicles():
    cfg = Config("alembic.ini")
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    # Pooled connections may hold prepared statements for the types just recreated.
    get_engine().dispose()

    with get_sessionmaker()() as session:
        assert session.scalar(select(func.count()).select_from(Vehicle)) == 0


def test_a_dealer_adds_the_first_vehicle_to_an_empty_inventory(client):
    register_dealer(client)
    headers = token_for(client, DEALER["email"], DEALER["password"])
    assert client.get("/api/vehicles/search", headers=headers).json()["total"] == 0

    created = client.post("/api/vehicles", json=VEHICLE, headers=headers)

    assert created.status_code == 201, created.text
    listing = client.get("/api/vehicles/search", headers=headers).json()
    assert listing["total"] == 1
    assert listing["items"][0]["id"] == created.json()["id"]
