"""Dealer-recorded sales: one ledger with online purchases, costs, profit and invoices."""

import threading
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import get_sessionmaker
from app.main import create_app
from app.models import Purchase, SaleChannel, Vehicle
from tests.conftest import VEHICLE
from tests.test_vehicle_ownership import MINE, OTHER, add, dealer


def utc_today() -> date:
    """Today as the API sees it when no tz is sent (UTC), whatever this machine's zone."""
    return datetime.now(UTC).date()


@pytest.fixture
def mine(client):
    return dealer(client, MINE)


@pytest.fixture
def other(client):
    return dealer(client, OTHER)


def sale(vehicle_id, **overrides):
    return {
        "vehicle_id": vehicle_id,
        "quantity": 1,
        "unit_price": "30000.00",
        "sold_on": utc_today().isoformat(),
        "customer_name": "Priya Shah",
        "customer_email": "priya@example.com",
        "customer_phone": "+91 98765 43210",
        "request_id": str(uuid.uuid4()),
        **overrides,
    }


def record(client, headers, vehicle_id, **overrides):
    return client.post("/api/sales", json=sale(vehicle_id, **overrides), headers=headers)


def stock(vehicle_id):
    with get_sessionmaker()() as session:
        return session.get(Vehicle, vehicle_id).quantity  # type: ignore[union-attr]


class TestRecordingASale:
    def test_records_the_sale_and_takes_the_units_out_of_stock(self, client, mine):
        car = add(client, mine, quantity=3, acquisition_cost="24000.00")

        response = record(client, mine, car["id"], quantity=2, unit_price="31000.00")

        assert response.status_code == 201, response.text
        body = response.json()
        assert body["channel"] == "dealer"
        assert body["quantity"] == 2
        assert body["unit_price"] == "31000.00"
        assert body["total_price"] == "62000.00"
        assert body["unit_cost"] == "24000.00"
        assert body["gross_profit"] == "14000.00"
        assert body["customer"] == {
            "name": "Priya Shah",
            "email": "priya@example.com",
            "phone": "+91 98765 43210",
        }
        assert stock(car["id"]) == 1

    def test_profit_is_unknown_not_zero_without_a_cost(self, client, mine):
        car = add(client, mine, quantity=1)

        body = record(client, mine, car["id"]).json()

        assert body["unit_cost"] is None
        assert body["gross_profit"] is None

    def test_the_cost_is_kept_as_it_was_when_sold(self, client, mine):
        car = add(client, mine, quantity=2, acquisition_cost="20000.00")
        first = record(client, mine, car["id"]).json()
        fields = {k: v for k, v in VEHICLE.items() if k != "quantity"}
        client.put(
            f"/api/vehicles/{car['id']}",
            json={**fields, "acquisition_cost": "25000.00"},
            headers=mine,
        )

        again = client.get(f"/api/sales/{first['id']}", headers=mine).json()

        assert again["unit_cost"] == "20000.00"

    def test_selling_the_last_unit_leaves_it_out_of_stock(self, client, mine):
        car = add(client, mine, quantity=1)

        record(client, mine, car["id"])
        response = record(client, mine, car["id"])

        assert stock(car["id"]) == 0
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "OUT_OF_STOCK"

    def test_cannot_sell_more_units_than_are_in_stock(self, client, mine):
        car = add(client, mine, quantity=2)

        response = record(client, mine, car["id"], quantity=3)

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "INSUFFICIENT_STOCK"
        assert stock(car["id"]) == 2

    def test_a_backdated_sale_is_dated_on_its_sale_day(self, client, mine):
        car = add(client, mine, quantity=1)
        day = utc_today() - timedelta(days=40)

        body = record(client, mine, car["id"], sold_on=day.isoformat(), tz="Asia/Kolkata").json()

        assert body["sold_at"].startswith(day.isoformat())


class TestDuplicatePrevention:
    def test_a_retried_submission_records_one_sale(self, client, mine):
        car = add(client, mine, quantity=5)
        payload = sale(car["id"])

        first = client.post("/api/sales", json=payload, headers=mine)
        second = client.post("/api/sales", json=payload, headers=mine)

        assert first.status_code == 201
        assert second.status_code == 200
        assert second.json()["id"] == first.json()["id"]
        assert stock(car["id"]) == 4
        with get_sessionmaker()() as session:
            assert len(session.scalars(select(Purchase)).all()) == 1

    def test_concurrent_sales_of_the_last_unit_sell_it_once(self, client, mine):
        car = add(client, mine, quantity=1)
        results: list[int] = []
        start = threading.Barrier(8)

        def attempt():
            local = TestClient(create_app())
            start.wait()
            results.append(record(local, mine, car["id"]).status_code)

        threads = [threading.Thread(target=attempt) for _ in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert sorted(results) == [201] + [409] * 7
        assert stock(car["id"]) == 0

    def test_concurrent_retries_of_one_submission_record_it_once(self, client, mine):
        car = add(client, mine, quantity=5)
        payload = sale(car["id"])
        results: list[int] = []
        start = threading.Barrier(6)

        def attempt():
            local = TestClient(create_app())
            start.wait()
            results.append(local.post("/api/sales", json=payload, headers=mine).status_code)

        threads = [threading.Thread(target=attempt) for _ in range(6)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert sorted(results) == [200] * 5 + [201]
        assert stock(car["id"]) == 4


class TestValidation:
    @pytest.mark.parametrize(
        "override",
        [
            {"unit_price": "0"},
            {"unit_price": "-5"},
            {"quantity": 0},
            {"quantity": 11},
            {"customer_name": "  "},
            {"customer_email": "not-an-email"},
            {"customer_phone": "call me maybe"},
            {"sold_on": (utc_today() + timedelta(days=2)).isoformat()},
            {"sold_on": "1999-12-31"},
            {"request_id": "not-a-uuid"},
            {"tz": "Nowhere/Land"},
        ],
    )
    def test_rejects_invalid_input(self, client, mine, override):
        car = add(client, mine, quantity=5)

        response = record(client, mine, car["id"], **override)

        assert response.status_code == 422
        assert stock(car["id"]) == 5

    def test_email_and_phone_are_optional(self, client, mine):
        car = add(client, mine, quantity=1)

        response = record(client, mine, car["id"], customer_email=None, customer_phone=None)

        assert response.status_code == 201


class TestAccess:
    def test_requires_sign_in(self, client):
        assert client.get("/api/sales").status_code == 401

    @pytest.mark.parametrize("who", ["customer_headers", "admin_headers"])
    def test_only_dealers_record_and_list_sales(self, client, request, who, make_vehicle):
        headers = request.getfixturevalue(who)
        car = make_vehicle()

        assert client.get("/api/sales", headers=headers).status_code == 403
        assert record(client, headers, car["id"]).status_code == 403

    def test_cannot_sell_another_dealers_vehicle(self, client, mine, other):
        theirs = add(client, other, quantity=3)

        response = record(client, mine, theirs["id"])

        assert response.status_code == 404
        assert stock(theirs["id"]) == 3

    def test_another_dealers_sale_and_invoice_look_missing(self, client, mine, other):
        theirs = record(client, other, add(client, other, quantity=1)["id"]).json()

        assert client.get(f"/api/sales/{theirs['id']}", headers=mine).status_code == 404
        assert client.get(f"/api/sales/{theirs['id']}/invoice", headers=mine).status_code == 404
        assert client.get("/api/sales", headers=mine).json()["total"] == 0


class TestOnlineSalesShareTheLedger:
    def test_an_online_purchase_appears_with_the_buyer_and_cost(
        self, client, mine, customer_headers
    ):
        car = add(client, mine, quantity=4, price="30000.00", acquisition_cost="26000.00")
        client.post(
            f"/api/vehicles/{car['id']}/purchase", json={"quantity": 2}, headers=customer_headers
        )

        item = client.get("/api/sales", headers=mine).json()["items"][0]

        assert item["channel"] == "online"
        assert item["customer"]["email"] == "customer@example.com"
        assert item["unit_cost"] == "26000.00"
        assert item["gross_profit"] == "8000.00"


class TestHistory:
    @pytest.fixture
    def history(self, client, mine):
        kuga = add(client, mine, make="Ford", model="Kuga", quantity=9, acquisition_cost="20000")
        zoe = add(client, mine, make="Renault", model="Zoe", quantity=9)
        today = utc_today()
        record(client, mine, kuga["id"], unit_price="25000", customer_name="Asha Rao")
        record(
            client,
            mine,
            kuga["id"],
            quantity=2,
            unit_price="24000",
            customer_name="Ben Cole",
            sold_on=(today - timedelta(days=45)).isoformat(),
        )
        record(client, mine, zoe["id"], unit_price="18000", customer_name="Chen Wu")
        return {"kuga": kuga, "zoe": zoe, "today": today}

    def test_newest_first_with_totals(self, client, mine, history):
        body = client.get("/api/sales", headers=mine).json()

        assert body["total"] == 3
        assert [i["customer"]["name"] for i in body["items"]][-1] == "Ben Cole"
        totals = body["totals"]
        assert totals["sales"] == 3
        assert totals["units"] == 4
        assert totals["revenue"] == "91000.00"
        # Only the two Kuga sales have a cost: (25000-20000) + 2 x (24000-20000).
        assert totals["gross_profit"] == "13000.00"
        assert totals["sales_with_cost"] == 2

    def test_search_by_customer_vehicle_or_reference(self, client, mine, history):
        def names(q):
            body = client.get("/api/sales", params={"q": q}, headers=mine).json()
            return {i["customer"]["name"] for i in body["items"]}

        assert names("asha") == {"Asha Rao"}
        assert names("zoe") == {"Chen Wu"}
        first_id = client.get("/api/sales", headers=mine).json()["items"][-1]["id"]
        assert names(f"#{first_id}") == {"Ben Cole"}

    def test_filter_by_vehicle_and_date_range(self, client, mine, history):
        today = history["today"]

        by_vehicle = client.get(
            "/api/sales", params={"vehicle_id": history["zoe"]["id"]}, headers=mine
        ).json()
        recent = client.get(
            "/api/sales",
            params={"date_from": (today - timedelta(days=7)).isoformat(), "tz": "Asia/Kolkata"},
            headers=mine,
        ).json()
        older = client.get(
            "/api/sales",
            params={"date_to": (today - timedelta(days=30)).isoformat()},
            headers=mine,
        ).json()

        assert by_vehicle["total"] == 1
        assert recent["total"] == 2
        assert [i["customer"]["name"] for i in older["items"]] == ["Ben Cole"]
        assert older["totals"]["revenue"] == "48000.00"

    def test_pages(self, client, mine, history):
        first = client.get("/api/sales", params={"limit": 2}, headers=mine).json()
        second = client.get("/api/sales", params={"limit": 2, "offset": 2}, headers=mine).json()

        assert len(first["items"]) == 2
        assert len(second["items"]) == 1
        assert first["total"] == second["total"] == 3

    @pytest.mark.parametrize(
        "params",
        [
            {"date_from": "2026-10-10", "date_to": "2026-10-01"},
            {"limit": 0},
            {"limit": 101},
            {"channel": "telepathy"},
        ],
    )
    def test_rejects_invalid_filters(self, client, mine, params):
        assert client.get("/api/sales", params=params, headers=mine).status_code == 422


class TestInvoice:
    def test_downloads_a_pdf_with_the_sale_details(self, client, mine):
        car = add(client, mine, make="Ford", model="Kuga", quantity=1, acquisition_cost="1")
        sold = record(client, mine, car["id"], unit_price="31500.00").json()

        response = client.get(f"/api/sales/{sold['id']}/invoice", headers=mine)

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert f'filename="invoice-{sold["id"]}.pdf"' in response.headers["content-disposition"]
        assert response.content.startswith(b"%PDF")

    def test_invoice_text(self):
        from app.services.invoice import invoice_lines

        record_ = Purchase(
            id=42,
            channel=SaleChannel.DEALER,
            vehicle_label="2024 Ford Kuga ST-Line",
            quantity=2,
            unit_price=Decimal("31500.00"),
            unit_cost=Decimal("20000.00"),
            sold_at=datetime(2026, 10, 3, 9, 30, tzinfo=UTC),
            customer_name="Priya Shah",
            customer_email="priya@example.com",
            customer_phone=None,
        )

        text = "\n".join(invoice_lines(record_, dealer_name="Dana Dealer", dealer_email="d@x.io"))

        assert "Invoice INV-000042" in text
        assert "3 Oct 2026" in text
        assert "Dana Dealer" in text and "d@x.io" in text
        assert "Priya Shah" in text and "priya@example.com" in text
        assert "2024 Ford Kuga ST-Line" in text
        assert "$63,000.00" in text
        # Customer-facing: never the dealer's cost or profit, and no invented taxes.
        assert "20,000" not in text and "profit" not in text.lower()
        assert "tax" not in text.lower().replace("taxes, fees and registration", "")


class TestCostPrivacy:
    def test_customers_never_see_acquisition_cost(self, client, mine, customer_headers):
        car = add(client, mine, acquisition_cost="21000.00")

        as_customer = client.get(f"/api/vehicles/{car['id']}", headers=customer_headers).json()
        listed = client.get("/api/vehicles/search", headers=customer_headers).json()["items"][0]
        as_owner = client.get(f"/api/vehicles/{car['id']}", headers=mine).json()

        assert as_customer["acquisition_cost"] is None
        assert listed["acquisition_cost"] is None
        assert as_owner["acquisition_cost"] == "21000.00"

    def test_admins_see_it(self, client, mine, admin_headers):
        car = add(client, mine, acquisition_cost="21000.00")

        body = client.get(f"/api/vehicles/{car['id']}", headers=admin_headers).json()

        assert body["acquisition_cost"] == "21000.00"

    def test_rejects_a_negative_cost(self, client, mine):
        response = client.post(
            "/api/vehicles", json={**VEHICLE, "acquisition_cost": "-1"}, headers=mine
        )

        assert response.status_code == 422
