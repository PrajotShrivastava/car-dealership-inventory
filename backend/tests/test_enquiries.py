"""Customers ask about a vehicle or request a test drive; it arrives as a lead for its dealer."""

from datetime import timedelta

import pytest

from tests.test_sales import utc_today
from tests.test_vehicle_ownership import MINE, OTHER, add, dealer


@pytest.fixture
def mine(client):
    return dealer(client, MINE)


@pytest.fixture
def other(client):
    return dealer(client, OTHER)


def enquire(client, headers, vehicle_id, **fields):
    return client.post(f"/api/vehicles/{vehicle_id}/enquiries", json=fields, headers=headers)


def question(client, headers, vehicle_id, **fields):
    return enquire(
        client, headers, vehicle_id, kind="question", message="Any service history?", **fields
    )


def request_drive(client, headers, vehicle_id, days=2, **fields):
    preferred = (utc_today() + timedelta(days=days)).isoformat()
    return enquire(
        client, headers, vehicle_id, kind="test_drive", preferred_date=preferred, **fields
    )


def leads_of(client, headers):
    return client.get("/api/leads", headers=headers).json()["items"]


class TestQuestions:
    def test_a_question_becomes_a_new_lead_for_the_vehicles_dealer(
        self, client, mine, other, customer_headers
    ):
        car = add(client, mine, make="Kia", model="Seltos")

        response = question(client, customer_headers, car["id"], phone="+91 99887 76655")

        assert response.status_code == 201, response.text
        assert response.json()["kind"] == "question"
        assert response.json()["vehicle_id"] == car["id"]
        [lead] = leads_of(client, mine)
        assert lead["name"] == "Test Customer"
        assert lead["email"] == "customer@example.com"
        assert lead["phone"] == "+91 99887 76655"
        assert lead["vehicle_id"] == car["id"]
        assert lead["vehicle_label"].endswith("Kia Seltos ST-Line")
        assert lead["source"] == "Website enquiry"
        assert lead["notes"] == "Any service history?"
        assert lead["status"] == "new"
        assert lead["follow_up_on"] == utc_today().isoformat()
        assert leads_of(client, other) == []

    def test_the_response_reveals_none_of_the_dealers_lead(self, client, mine, customer_headers):
        car = add(client, mine)

        body = question(client, customer_headers, car["id"]).json()

        assert set(body) == {"id", "kind", "vehicle_id", "created_at"}

    def test_needs_a_message(self, client, mine, customer_headers):
        car = add(client, mine)

        response = enquire(client, customer_headers, car["id"], kind="question", message="  ")

        assert response.status_code == 422

    def test_takes_no_preferred_date(self, client, mine, customer_headers):
        car = add(client, mine)

        response = question(client, customer_headers, car["id"], preferred_date="2030-01-01")

        assert response.status_code == 422


class TestTestDrives:
    def test_a_request_records_the_preferred_date(self, client, mine, customer_headers):
        car = add(client, mine)
        preferred = utc_today() + timedelta(days=3)

        response = request_drive(client, customer_headers, car["id"], days=3, message="After 5pm")

        assert response.status_code == 201, response.text
        [lead] = leads_of(client, mine)
        assert lead["source"] == "Test drive request"
        assert lead["notes"] == (f"Preferred test drive date: {preferred:%a %d %b %Y}\n\nAfter 5pm")
        assert lead["follow_up_on"] == utc_today().isoformat()

    def test_today_is_allowed(self, client, mine, customer_headers):
        car = add(client, mine)

        assert request_drive(client, customer_headers, car["id"], days=0).status_code == 201

    @pytest.mark.parametrize(
        "fields",
        [
            {"kind": "test_drive"},
            {"kind": "test_drive", "preferred_date": "2001-01-01"},
            {"kind": "carrier_pigeon", "message": "hi"},
            {"kind": "question", "message": "x" * 2001},
            {"kind": "question", "message": "hi", "phone": "ring ring"},
            {"kind": "question", "message": "hi", "tz": "Mars/Olympus"},
            {"kind": "question", "message": "hi", "name": "Someone Else"},
        ],
    )
    def test_rejects_invalid_requests(self, client, mine, customer_headers, fields):
        car = add(client, mine)

        assert enquire(client, customer_headers, car["id"], **fields).status_code == 422
        assert leads_of(client, mine) == []


class TestDuplicates:
    def test_a_second_open_question_about_the_same_vehicle_is_refused(
        self, client, mine, customer_headers
    ):
        car = add(client, mine)
        question(client, customer_headers, car["id"])

        response = question(client, customer_headers, car["id"])

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "ALREADY_ENQUIRED"
        assert len(leads_of(client, mine)) == 1

    def test_a_question_and_a_test_drive_are_separate(self, client, mine, customer_headers):
        car = add(client, mine)

        assert question(client, customer_headers, car["id"]).status_code == 201
        assert request_drive(client, customer_headers, car["id"]).status_code == 201
        assert len(leads_of(client, mine)) == 2

    def test_another_enquiry_is_welcome_once_the_lead_is_closed(
        self, client, mine, customer_headers
    ):
        car = add(client, mine)
        question(client, customer_headers, car["id"])
        [lead] = leads_of(client, mine)
        client.patch(f"/api/leads/{lead['id']}", json={"status": "lost"}, headers=mine)

        assert question(client, customer_headers, car["id"]).status_code == 201

    def test_other_customers_can_ask_about_the_same_vehicle(self, client, mine, customer_headers):
        from tests.conftest import _auth_headers

        car = add(client, mine)
        question(client, customer_headers, car["id"])

        second = _auth_headers(client, "second@example.com")

        assert question(client, second, car["id"]).status_code == 201


class TestWhoAndWhat:
    def test_needs_sign_in(self, client, mine):
        car = add(client, mine)

        assert client.post(f"/api/vehicles/{car['id']}/enquiries", json={}).status_code == 401

    def test_dealers_cannot_enquire(self, client, mine):
        car = add(client, mine)

        response = question(client, mine, car["id"])

        assert response.status_code == 403

    def test_admins_cannot_enquire(self, client, admin_headers, make_vehicle):
        car = make_vehicle()

        assert question(client, admin_headers, car["id"]).status_code == 403

    def test_a_missing_vehicle_is_404(self, client, customer_headers):
        response = question(client, customer_headers, 999)

        assert response.status_code == 404

    def test_a_vehicle_with_no_dealer_cannot_take_enquiries(
        self, client, customer_headers, make_vehicle
    ):
        car = make_vehicle()  # added by an admin, so no dealer owns it

        response = question(client, customer_headers, car["id"])

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "NO_DEALER"


class TestVehicleFlag:
    def test_dealer_listings_accept_enquiries(self, client, mine, customer_headers):
        car = add(client, mine)

        body = client.get(f"/api/vehicles/{car['id']}", headers=customer_headers).json()

        assert body["accepts_enquiries"] is True
        assert "dealer_id" not in body

    def test_listings_without_a_dealer_do_not(self, client, customer_headers, make_vehicle):
        car = make_vehicle()

        body = client.get(f"/api/vehicles/{car['id']}", headers=customer_headers).json()

        assert body["accepts_enquiries"] is False
