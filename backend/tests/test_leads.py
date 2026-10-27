"""Customer leads: each dealer's own, with follow-ups, history and conversion to a sale."""

import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select

from app.db import get_sessionmaker
from app.models import Lead, Vehicle
from tests.test_sales import record, stock, utc_today
from tests.test_vehicle_ownership import MINE, OTHER, add, dealer


@pytest.fixture
def mine(client):
    return dealer(client, MINE)


@pytest.fixture
def other(client):
    return dealer(client, OTHER)


def new_lead(client, headers, **fields):
    response = client.post("/api/leads", json={"name": "Arjun Mehta", **fields}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def kinds(lead):
    return [(e["kind"], e["old_value"], e["new_value"]) for e in lead["events"]]


class TestCreating:
    def test_creates_a_lead_with_every_field(self, client, mine):
        car = add(client, mine, make="Kia", model="Seltos")
        follow_up = (utc_today() + timedelta(days=3)).isoformat()

        lead = new_lead(
            client,
            mine,
            email="arjun@example.com",
            phone="+91 99887 76655",
            vehicle_id=car["id"],
            budget="25000.00",
            source="Walk-in",
            notes="Wants a test drive on Saturday.",
            follow_up_on=follow_up,
        )

        assert lead["status"] == "new"
        assert lead["vehicle_id"] == car["id"]
        assert lead["vehicle_label"].endswith("Kia Seltos ST-Line")
        assert lead["budget"] == "25000.00"
        assert lead["follow_up_on"] == follow_up
        assert lead["sale_id"] is None
        assert kinds(lead) == [("created", None, "new")]

    def test_only_a_name_is_required(self, client, mine):
        lead = new_lead(client, mine)

        assert lead["email"] is None and lead["vehicle_id"] is None and lead["status"] == "new"

    @pytest.mark.parametrize(
        "fields",
        [
            {"name": ""},
            {"name": "x" * 101},
            {"email": "nope"},
            {"phone": "ring ring"},
            {"budget": "0"},
            {"status": "maybe"},
            {"notes": "x" * 2001},
            {"follow_up_on": "1999-01-01"},
            {"source": "x" * 51},
        ],
    )
    def test_rejects_invalid_fields(self, client, mine, fields):
        body = {"name": "Arjun Mehta", **fields}

        assert client.post("/api/leads", json=body, headers=mine).status_code == 422

    def test_the_interested_vehicle_must_be_the_dealers_own(self, client, mine, other):
        theirs = add(client, other)

        response = client.post(
            "/api/leads", json={"name": "A", "vehicle_id": theirs["id"]}, headers=mine
        )

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "VEHICLE_NOT_FOUND"


class TestUpdating:
    def test_status_changes_are_recorded_in_the_history(self, client, mine):
        lead = new_lead(client, mine)

        client.patch(f"/api/leads/{lead['id']}", json={"status": "contacted"}, headers=mine)
        updated = client.patch(
            f"/api/leads/{lead['id']}", json={"status": "test_drive_scheduled"}, headers=mine
        ).json()

        assert updated["status"] == "test_drive_scheduled"
        assert kinds(updated)[1:] == [
            ("status", "new", "contacted"),
            ("status", "contacted", "test_drive_scheduled"),
        ]

    def test_scheduling_and_clearing_a_follow_up(self, client, mine):
        lead = new_lead(client, mine)
        day = (utc_today() + timedelta(days=5)).isoformat()

        scheduled = client.patch(
            f"/api/leads/{lead['id']}", json={"follow_up_on": day}, headers=mine
        ).json()
        cleared = client.patch(
            f"/api/leads/{lead['id']}", json={"follow_up_on": None}, headers=mine
        ).json()

        assert scheduled["follow_up_on"] == day
        assert cleared["follow_up_on"] is None
        assert kinds(cleared)[1:] == [("follow_up", None, day), ("follow_up", day, None)]

    def test_editing_details_keeps_unsent_fields(self, client, mine):
        lead = new_lead(client, mine, email="a@example.com", notes="first")

        edited = client.patch(
            f"/api/leads/{lead['id']}", json={"notes": "second", "phone": "555 0100"}, headers=mine
        ).json()

        assert (edited["notes"], edited["phone"], edited["email"]) == (
            "second",
            "555 0100",
            "a@example.com",
        )
        assert kinds(edited) == [("created", None, "new")]

    def test_details_show_the_full_history(self, client, mine):
        lead = new_lead(client, mine)
        client.patch(f"/api/leads/{lead['id']}", json={"status": "lost"}, headers=mine)

        detail = client.get(f"/api/leads/{lead['id']}", headers=mine).json()

        assert [e["kind"] for e in detail["events"]] == ["created", "status"]


class TestListing:
    @pytest.fixture
    def leads(self, client, mine):
        today = utc_today()
        made = {
            "overdue": new_lead(
                client, mine, name="Old Ollie", follow_up_on=str(today - timedelta(days=2))
            ),
            "today": new_lead(client, mine, name="Today Tara", follow_up_on=str(today)),
            "soon": new_lead(
                client, mine, name="Soon Sam", follow_up_on=str(today + timedelta(days=3))
            ),
            "later": new_lead(
                client, mine, name="Later Lee", follow_up_on=str(today + timedelta(days=30))
            ),
            "none": new_lead(client, mine, name="No Date Noor", email="noor@example.com"),
            "lost": new_lead(
                client,
                mine,
                name="Lost Lou",
                status="lost",
                follow_up_on=str(today - timedelta(days=9)),
            ),
        }
        return made

    def names(self, client, headers, **params):
        body = client.get("/api/leads", params=params, headers=headers).json()
        return [lead["name"] for lead in body["items"]]

    def test_ordered_by_next_follow_up(self, client, mine, leads):
        assert self.names(client, mine) == [
            "Lost Lou",
            "Old Ollie",
            "Today Tara",
            "Soon Sam",
            "Later Lee",
            "No Date Noor",
        ]

    def test_follow_up_filters_skip_closed_leads(self, client, mine, leads):
        assert self.names(client, mine, follow_up="overdue") == ["Old Ollie"]
        assert self.names(client, mine, follow_up="today") == ["Today Tara"]
        assert self.names(client, mine, follow_up="upcoming") == ["Soon Sam"]
        assert self.names(client, mine, follow_up="none") == ["No Date Noor"]

    def test_reminder_and_status_counts(self, client, mine, leads):
        body = client.get("/api/leads", headers=mine).json()

        assert body["reminders"] == {"overdue": 1, "today": 1, "upcoming": 1}
        assert body["counts"]["new"] == 5
        assert body["counts"]["lost"] == 1
        assert body["total"] == 6

    def test_today_follows_the_dealers_time_zone(self, client, mine):
        # A follow-up dated "tomorrow in UTC" can already be today further east.
        kiritimati = datetime.now(ZoneInfo("Pacific/Kiritimati")).date()
        new_lead(client, mine, name="East", follow_up_on=kiritimati.isoformat())

        far_east = client.get(
            "/api/leads", params={"tz": "Pacific/Kiritimati"}, headers=mine
        ).json()

        assert far_east["reminders"]["today"] == 1

    def test_search_and_status_filter(self, client, mine, leads):
        assert self.names(client, mine, q="noor@") == ["No Date Noor"]
        assert self.names(client, mine, q="tara") == ["Today Tara"]
        assert self.names(client, mine, status="lost") == ["Lost Lou"]

    def test_rejects_invalid_filters(self, client, mine):
        for params in ({"status": "x"}, {"follow_up": "soonish"}, {"limit": 500}, {"tz": "Z/Z"}):
            assert client.get("/api/leads", params=params, headers=mine).status_code == 422


class TestIsolation:
    def test_dealers_only_reach_their_own_leads(self, client, mine, other):
        theirs = new_lead(client, other, name="Their Lead")

        assert client.get("/api/leads", headers=mine).json()["total"] == 0
        assert client.get(f"/api/leads/{theirs['id']}", headers=mine).status_code == 404
        patched = client.patch(f"/api/leads/{theirs['id']}", json={"status": "lost"}, headers=mine)
        assert patched.status_code == 404
        assert client.get(f"/api/leads/{theirs['id']}", headers=other).json()["status"] == "new"

    @pytest.mark.parametrize("who", ["customer_headers", "admin_headers"])
    def test_only_dealers_have_leads(self, client, request, who):
        headers = request.getfixturevalue(who)

        assert client.get("/api/leads", headers=headers).status_code == 403
        assert client.post("/api/leads", json={"name": "A"}, headers=headers).status_code == 403


class TestConversion:
    def test_marking_converted_by_hand_sells_nothing(self, client, mine):
        car = add(client, mine, quantity=2)
        lead = new_lead(client, mine, vehicle_id=car["id"])

        converted = client.patch(
            f"/api/leads/{lead['id']}", json={"status": "converted"}, headers=mine
        ).json()

        assert converted["status"] == "converted"
        assert converted["sale_id"] is None
        assert stock(car["id"]) == 2
        assert client.get("/api/sales", headers=mine).json()["total"] == 0

    def test_recording_a_sale_from_a_lead_links_and_converts_it(self, client, mine):
        car = add(client, mine, quantity=2)
        lead = new_lead(client, mine, vehicle_id=car["id"], status="negotiation")

        sold = record(client, mine, car["id"], lead_id=lead["id"]).json()
        after = client.get(f"/api/leads/{lead['id']}", headers=mine).json()

        assert sold["lead_id"] == lead["id"]
        assert after["status"] == "converted"
        assert after["sale_id"] == sold["id"]
        assert kinds(after)[-2:] == [
            ("status", "negotiation", "converted"),
            ("sale", None, str(sold["id"])),
        ]
        assert stock(car["id"]) == 1

    def test_a_lead_converts_into_one_sale_only(self, client, mine):
        car = add(client, mine, quantity=5)
        lead = new_lead(client, mine)
        record(client, mine, car["id"], lead_id=lead["id"])

        again = record(client, mine, car["id"], lead_id=lead["id"])

        assert again.status_code == 409
        assert again.json()["error"]["code"] == "LEAD_ALREADY_CONVERTED"
        assert stock(car["id"]) == 4

    def test_a_lead_with_a_sale_stays_converted(self, client, mine):
        car = add(client, mine, quantity=1)
        lead = new_lead(client, mine)
        record(client, mine, car["id"], lead_id=lead["id"])

        response = client.patch(f"/api/leads/{lead['id']}", json={"status": "lost"}, headers=mine)

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "LEAD_HAS_SALE"

    def test_cannot_use_another_dealers_lead(self, client, mine, other):
        car = add(client, mine, quantity=1)
        theirs = new_lead(client, other)

        response = record(client, mine, car["id"], lead_id=theirs["id"])

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "LEAD_NOT_FOUND"
        assert stock(car["id"]) == 1

    def test_a_failed_sale_leaves_the_lead_unchanged(self, client, mine):
        car = add(client, mine, quantity=1)
        lead = new_lead(client, mine)

        response = record(client, mine, car["id"], quantity=2, lead_id=lead["id"])

        assert response.status_code == 409
        after = client.get(f"/api/leads/{lead['id']}", headers=mine).json()
        assert after["status"] == "new" and after["sale_id"] is None

    def test_history_survives_deleting_the_vehicle(self, client, mine):
        car = add(client, mine, make="Kia", model="Carens", quantity=1)
        lead = new_lead(client, mine, vehicle_id=car["id"])
        record(client, mine, car["id"], lead_id=lead["id"], request_id=str(uuid.uuid4()))

        client.delete(f"/api/vehicles/{car['id']}", headers=mine)

        after = client.get(f"/api/leads/{lead['id']}", headers=mine).json()
        assert after["vehicle_id"] is None
        assert "Kia Carens" in after["vehicle_label"]
        assert after["sale_id"] is not None
        with get_sessionmaker()() as session:
            assert session.scalar(select(Lead.status).where(Lead.id == lead["id"])) == "converted"
            assert session.get(Vehicle, car["id"]) is None
