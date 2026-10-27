"""A customer's own account: their purchases with invoices, and the enquiries they sent."""

from datetime import timedelta

import pytest

from tests.conftest import _auth_headers
from tests.test_sales import record, utc_today
from tests.test_vehicle_ownership import MINE, add, dealer


@pytest.fixture
def mine(client):
    return dealer(client, MINE)


def buy(client, headers, vehicle_id, quantity=1):
    response = client.post(
        f"/api/vehicles/{vehicle_id}/purchase", json={"quantity": quantity}, headers=headers
    )
    assert response.status_code == 200, response.text
    return response.json()["purchase"]


def ask(client, headers, vehicle_id, kind="question"):
    body = (
        {"kind": "question", "message": "Still available?"}
        if kind == "question"
        else {"kind": "test_drive", "preferred_date": (utc_today() + timedelta(days=2)).isoformat()}
    )
    response = client.post(f"/api/vehicles/{vehicle_id}/enquiries", json=body, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def get(client, headers, path, **params):
    response = client.get(f"/api/account/{path}", params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


class TestPurchases:
    def test_lists_the_customers_purchases_newest_first(
        self, client, mine, customer_headers, make_vehicle
    ):
        kia = add(client, mine, make="Kia", model="Seltos", price="25000.00", quantity=5)
        store = make_vehicle(make="Ford", model="Puma", price="22000.00")
        first = buy(client, customer_headers, kia["id"], quantity=2)
        second = buy(client, customer_headers, store["id"])

        body = get(client, customer_headers, "purchases")

        assert body["total"] == 2
        newest, oldest = body["items"]
        assert newest["id"] == second["id"]
        assert newest["seller"] == "DriveStock"  # added by an admin, so no dealer
        assert oldest["id"] == first["id"]
        assert oldest["seller"] == "Dana Dealer"
        assert oldest["invoice_number"] == f"INV-{first['id']:06d}"
        assert oldest["vehicle_label"].endswith("Kia Seltos ST-Line")
        assert (oldest["quantity"], oldest["unit_price"], oldest["total_price"]) == (
            2,
            "25000.00",
            "50000.00",
        )

    def test_never_reveals_cost_or_profit(self, client, mine, customer_headers):
        car = add(client, mine, acquisition_cost="20000.00")
        buy(client, customer_headers, car["id"])

        [item] = get(client, customer_headers, "purchases")["items"]

        assert not {"unit_cost", "gross_profit", "acquisition_cost"} & set(item)

    def test_shows_only_the_customers_own_purchases(self, client, mine, customer_headers):
        car = add(client, mine, quantity=5)
        someone = _auth_headers(client, "someone@example.com")
        buy(client, someone, car["id"])
        record(client, mine, car["id"])  # a walk-in sale recorded by the dealer

        assert get(client, customer_headers, "purchases") == {"items": [], "total": 0}

    def test_pages_through_purchases(self, client, mine, customer_headers):
        car = add(client, mine, quantity=5)
        for _ in range(3):
            buy(client, customer_headers, car["id"])

        body = get(client, customer_headers, "purchases", limit=2, offset=2)

        assert body["total"] == 3
        assert len(body["items"]) == 1


class TestInvoice:
    def test_downloads_the_customers_invoice(self, client, mine, customer_headers):
        car = add(client, mine)
        purchase = buy(client, customer_headers, car["id"])

        response = client.get(
            f"/api/account/purchases/{purchase['id']}/invoice",
            params={"tz": "Asia/Kolkata"},
            headers=customer_headers,
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert f'filename="invoice-{purchase["id"]}.pdf"' in response.headers["content-disposition"]
        assert response.content.startswith(b"%PDF")

    def test_works_for_a_vehicle_no_dealer_listed(self, client, customer_headers, make_vehicle):
        purchase = buy(client, customer_headers, make_vehicle()["id"])

        response = client.get(
            f"/api/account/purchases/{purchase['id']}/invoice", headers=customer_headers
        )

        assert response.status_code == 200

    def test_the_store_has_no_email_line(self):
        from datetime import UTC, datetime
        from decimal import Decimal

        from app.models import Purchase, SaleChannel, User
        from app.services.invoice import invoice_lines

        sale = Purchase(
            id=7,
            channel=SaleChannel.ONLINE,
            vehicle_label="2024 Ford Puma",
            quantity=1,
            unit_price=Decimal("22000.00"),
            sold_at=datetime(2026, 10, 27, 12, tzinfo=UTC),
        )
        sale.buyer = User(full_name="Test Customer", email="customer@example.com")

        lines = list(invoice_lines(sale, dealer_name="DriveStock", dealer_email=None))

        assert lines[lines.index("Sold by") + 1 : lines.index("Bill to")] == ["DriveStock"]

    def test_another_customers_invoice_looks_missing(self, client, mine, customer_headers):
        car = add(client, mine)
        theirs = buy(client, _auth_headers(client, "someone@example.com"), car["id"])

        response = client.get(
            f"/api/account/purchases/{theirs['id']}/invoice", headers=customer_headers
        )

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "PURCHASE_NOT_FOUND"

    def test_a_dealer_recorded_sale_is_not_a_customer_purchase(
        self, client, mine, customer_headers
    ):
        car = add(client, mine)
        sale = record(client, mine, car["id"]).json()

        response = client.get(
            f"/api/account/purchases/{sale['id']}/invoice", headers=customer_headers
        )

        assert response.status_code == 404


class TestEnquiries:
    def test_lists_what_the_customer_sent_newest_first(self, client, mine, customer_headers):
        kia = add(client, mine, make="Kia", model="Seltos")
        ford = add(client, mine, make="Ford", model="Puma")
        question = ask(client, customer_headers, kia["id"])
        drive = ask(client, customer_headers, ford["id"], kind="test_drive")

        body = get(client, customer_headers, "enquiries")

        assert body["total"] == 2
        newest, oldest = body["items"]
        assert (newest["id"], newest["kind"], newest["progress"]) == (
            drive["id"],
            "test_drive",
            "sent",
        )
        assert newest["vehicle_label"].endswith("Ford Puma ST-Line")
        assert (oldest["id"], oldest["kind"]) == (question["id"], "question")

    @pytest.mark.parametrize(
        ("status", "progress"),
        [
            ("new", "sent"),
            ("contacted", "in_progress"),
            ("negotiation", "in_progress"),
            ("test_drive_scheduled", "test_drive_scheduled"),
            ("converted", "completed"),
            ("lost", "closed"),
        ],
    )
    def test_shows_the_dealers_progress_simplified(
        self, client, mine, customer_headers, status, progress
    ):
        car = add(client, mine)
        lead_id = ask(client, customer_headers, car["id"])["id"]
        client.patch(f"/api/leads/{lead_id}", json={"status": status}, headers=mine)

        [item] = get(client, customer_headers, "enquiries")["items"]

        assert item["progress"] == progress

    def test_never_shows_the_dealers_notes_or_follow_up(self, client, mine, customer_headers):
        car = add(client, mine)
        lead_id = ask(client, customer_headers, car["id"])["id"]
        client.patch(
            f"/api/leads/{lead_id}",
            json={"notes": "Price-sensitive, offer $500 off", "budget": "20000.00"},
            headers=mine,
        )

        [item] = get(client, customer_headers, "enquiries")["items"]

        assert set(item) == {"id", "kind", "vehicle_id", "vehicle_label", "progress", "sent_at"}

    def test_the_kind_survives_the_dealer_editing_the_source(self, client, mine, customer_headers):
        car = add(client, mine)
        lead_id = ask(client, customer_headers, car["id"], kind="test_drive")["id"]
        client.patch(f"/api/leads/{lead_id}", json={"source": "Phone"}, headers=mine)

        [item] = get(client, customer_headers, "enquiries")["items"]

        assert item["kind"] == "test_drive"

    def test_leads_entered_by_dealers_are_not_listed(self, client, mine, customer_headers):
        client.post(
            "/api/leads",
            json={"name": "Test Customer", "email": "customer@example.com"},
            headers=mine,
        )

        assert get(client, customer_headers, "enquiries")["total"] == 0


class TestAccess:
    @pytest.mark.parametrize(
        "path", ["purchases", "enquiries", "purchases/1/invoice"], ids=["p", "e", "i"]
    )
    def test_needs_sign_in(self, client, path):
        assert client.get(f"/api/account/{path}").status_code == 401

    @pytest.mark.parametrize("path", ["purchases", "enquiries", "purchases/1/invoice"])
    def test_dealers_and_admins_have_no_customer_account(self, client, mine, admin_headers, path):
        assert client.get(f"/api/account/{path}", headers=mine).status_code == 403
        assert client.get(f"/api/account/{path}", headers=admin_headers).status_code == 403

    @pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 101}, {"offset": -1}])
    def test_rejects_invalid_paging(self, client, customer_headers, params):
        response = client.get("/api/account/purchases", params=params, headers=customer_headers)

        assert response.status_code == 422
