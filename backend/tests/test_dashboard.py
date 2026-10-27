"""Dealer dashboard: figures come from the dealer's own vehicles and recorded purchases."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import event

from app.db import get_engine, get_sessionmaker
from app.models import (
    Category,
    FuelType,
    Lead,
    LeadStatus,
    Purchase,
    Role,
    SaleChannel,
    Transmission,
    User,
    Vehicle,
)
from app.services.dashboard import LOW_STOCK_THRESHOLD, build_dashboard
from tests.conftest import VEHICLE
from tests.test_vehicle_ownership import MINE, OTHER, add, dealer

NOW = datetime(2026, 10, 15, 12, 0, tzinfo=UTC)
UTC_ZONE = ZoneInfo("UTC")


# --- direct fixtures: rows with chosen dates, for calculations ---------------------------


def make_user(session, email, role=Role.DEALER):
    user = User(email=email, password_hash="x", full_name=email.split("@")[0], role=role)
    session.add(user)
    session.flush()
    return user


def make_vehicle(session, owner, make="Ford", model="Kuga", price="20000.00", quantity=5, **extra):
    vehicle = Vehicle(
        make=make,
        model=model,
        year=2024,
        category=Category.SUV,
        fuel_type=FuelType.PETROL,
        transmission=Transmission.AUTOMATIC,
        price=Decimal(price),
        quantity=quantity,
        dealer_id=owner.id if owner else None,
        **extra,
    )
    session.add(vehicle)
    session.flush()
    return vehicle


def sell(session, vehicle, buyer, quantity=1, when=NOW, unit_price=None, unit_cost=None):
    sale = Purchase(
        user_id=buyer.id,
        vehicle_id=vehicle.id,
        dealer_id=vehicle.dealer_id,
        vehicle_label=vehicle.label,
        quantity=quantity,
        unit_price=Decimal(unit_price) if unit_price else vehicle.price,
        unit_cost=Decimal(unit_cost) if unit_cost is not None else None,
        sold_at=when,
        created_at=when,
    )
    session.add(sale)
    session.flush()
    return sale


@pytest.fixture
def db():
    with get_sessionmaker()() as session:
        yield session


@pytest.fixture
def people(db):
    return {
        "dealer": make_user(db, "dealer@example.com"),
        "rival": make_user(db, "rival@example.com"),
        "buyer": make_user(db, "buyer@example.com", Role.CUSTOMER),
    }


def dashboard(db, dealer_user, months=6, tz=UTC_ZONE, now=NOW):
    db.commit()
    return build_dashboard(db, dealer_user.id, months=months, tz=tz, now=now)


# --- calculations -------------------------------------------------------------------------


class TestEmptyDealer:
    def test_everything_is_zero_and_no_insight_is_made_up(self, db, people):
        result = dashboard(db, people["dealer"])

        s = result.summary
        assert (s.total_listings, s.available_stock, s.units_sold) == (0, 0, 0)
        assert (s.in_stock, s.low_stock, s.out_of_stock, s.never_sold) == (0, 0, 0, 0)
        assert s.total_revenue == s.revenue_this_month == s.inventory_value == Decimal("0")
        assert s.has_sales_before_this_month is False
        assert result.best_seller is None and result.top_revenue is None
        assert result.top_sellers == result.recent_sales == result.recent_listings == []
        assert [m.units for m in result.monthly] == [0] * 6


class TestInventoryFigures:
    def test_listings_stock_value_and_stock_levels(self, db, people):
        d = people["dealer"]
        make_vehicle(db, d, model="A", price="10000.00", quantity=5)  # in stock
        make_vehicle(db, d, model="B", price="20000.00", quantity=LOW_STOCK_THRESHOLD)  # low
        make_vehicle(db, d, model="C", price="30000.00", quantity=1)  # low
        make_vehicle(db, d, model="D", price="40000.00", quantity=0)  # out

        s = dashboard(db, d).summary

        assert s.total_listings == 4
        assert s.available_stock == 5 + LOW_STOCK_THRESHOLD + 1
        assert (s.in_stock, s.low_stock, s.out_of_stock) == (1, 2, 1)
        assert s.inventory_value == Decimal("10000") * 5 + Decimal("20000") * 2 + Decimal("30000")
        assert s.low_stock_threshold == LOW_STOCK_THRESHOLD

    def test_low_and_out_of_stock_lists_name_the_vehicles(self, db, people):
        d = people["dealer"]
        make_vehicle(db, d, model="Plenty", quantity=9)
        make_vehicle(db, d, model="Last", quantity=1)
        make_vehicle(db, d, model="Gone", quantity=0)

        result = dashboard(db, d)

        assert [v.model for v in result.low_stock] == ["Last"]
        assert [v.model for v in result.out_of_stock] == ["Gone"]


class TestSales:
    def test_units_and_revenue_count_every_unit_at_the_recorded_price(self, db, people):
        d, buyer = people["dealer"], people["buyer"]
        car = make_vehicle(db, d, price="20000.00")
        sell(db, car, buyer, quantity=3)  # one purchase, three units
        sell(db, car, buyer, quantity=1, unit_price="18000.00")  # sold before a price change

        s = dashboard(db, d).summary

        assert s.units_sold == 4
        assert s.total_revenue == Decimal("78000.00")

    def test_this_month_and_last_month(self, db, people):
        d, buyer = people["dealer"], people["buyer"]
        car = make_vehicle(db, d, price="10000.00")
        sell(db, car, buyer, 2, when=datetime(2026, 10, 1, 0, 30, tzinfo=UTC))
        sell(db, car, buyer, 1, when=datetime(2026, 9, 30, 23, 30, tzinfo=UTC))
        sell(db, car, buyer, 4, when=datetime(2026, 8, 10, tzinfo=UTC))

        s = dashboard(db, d).summary

        assert (s.units_sold_this_month, s.revenue_this_month) == (2, Decimal("20000.00"))
        assert (s.units_sold_last_month, s.revenue_last_month) == (1, Decimal("10000.00"))
        assert s.has_sales_before_this_month is True

    def test_months_follow_the_dealers_timezone(self, db, people):
        d, buyer = people["dealer"], people["buyer"]
        car = make_vehicle(db, d)
        # 30 Sep 20:00 UTC is already 1 Oct in India (UTC+5:30).
        sell(db, car, buyer, 1, when=datetime(2026, 9, 30, 20, 0, tzinfo=UTC))

        utc = dashboard(db, d).summary
        india = dashboard(db, d, tz=ZoneInfo("Asia/Kolkata")).summary

        assert (utc.units_sold_this_month, utc.units_sold_last_month) == (0, 1)
        assert (india.units_sold_this_month, india.units_sold_last_month) == (1, 0)

    def test_monthly_series_covers_the_range_oldest_first_with_empty_months(self, db, people):
        d, buyer = people["dealer"], people["buyer"]
        car = make_vehicle(db, d, price="1000.00")
        sell(db, car, buyer, 2, when=datetime(2026, 10, 3, tzinfo=UTC))
        sell(db, car, buyer, 1, when=datetime(2026, 7, 20, tzinfo=UTC))
        sell(db, car, buyer, 1, when=datetime(2026, 7, 21, tzinfo=UTC))
        sell(db, car, buyer, 9, when=datetime(2026, 4, 30, tzinfo=UTC))  # outside 6 months

        monthly = dashboard(db, d, months=6).monthly

        assert [m.month for m in monthly] == [
            "2026-05",
            "2026-06",
            "2026-07",
            "2026-08",
            "2026-09",
            "2026-10",
        ]
        assert [m.units for m in monthly] == [0, 0, 2, 0, 0, 2]
        assert [m.revenue for m in monthly] == [Decimal(n) for n in (0, 0, 2000, 0, 0, 2000)]

    def test_shorter_and_longer_ranges(self, db, people):
        d = people["dealer"]
        assert len(dashboard(db, d, months=3).monthly) == 3
        twelve = dashboard(db, d, months=12).monthly
        assert (twelve[0].month, twelve[-1].month) == ("2025-11", "2026-10")

    def test_no_previous_month_comparison_without_earlier_sales(self, db, people):
        d, buyer = people["dealer"], people["buyer"]
        sell(db, make_vehicle(db, d), buyer, 1)

        assert dashboard(db, d).summary.has_sales_before_this_month is False

    def test_sales_of_a_deleted_vehicle_still_count(self, db, people):
        d, buyer = people["dealer"], people["buyer"]
        car = make_vehicle(db, d, price="5000.00")
        sell(db, car, buyer, 2)
        db.delete(car)
        db.flush()

        result = dashboard(db, d)

        assert (result.summary.units_sold, result.summary.total_revenue) == (2, Decimal("10000"))
        assert result.best_seller is not None
        assert result.best_seller.vehicle is None
        assert result.best_seller.label == "2024 Ford Kuga"
        assert result.recent_sales[0].vehicle_id is None


class TestInsights:
    def test_best_seller_top_revenue_and_never_sold(self, db, people):
        d, buyer = people["dealer"], people["buyer"]
        cheap = make_vehicle(db, d, model="Cheap", price="10000.00")
        pricey = make_vehicle(db, d, model="Pricey", price="90000.00")
        idle = make_vehicle(db, d, model="Idle")
        sell(db, cheap, buyer, 3)
        sell(db, pricey, buyer, 1)

        result = dashboard(db, d)

        assert result.best_seller is not None and result.best_seller.label.endswith("Cheap")
        assert result.best_seller.units_sold == 3
        assert result.top_revenue is not None and result.top_revenue.label.endswith("Pricey")
        assert result.top_revenue.revenue == Decimal("90000.00")
        assert [t.label.split()[-1] for t in result.top_sellers] == ["Cheap", "Pricey"]
        assert result.summary.never_sold == 1
        assert [v.id for v in result.never_sold] == [idle.id]

    def test_vehicle_rows_carry_units_sold(self, db, people):
        d, buyer = people["dealer"], people["buyer"]
        car = make_vehicle(db, d, quantity=1)
        sell(db, car, buyer, 4)

        low = dashboard(db, d).low_stock

        assert [(v.id, v.units_sold, v.revenue) for v in low] == [(car.id, 4, Decimal("80000"))]

    def test_recent_sales_newest_first_with_totals(self, db, people):
        d, buyer = people["dealer"], people["buyer"]
        car = make_vehicle(db, d, price="1500.50")
        first = sell(db, car, buyer, 1, when=datetime(2026, 10, 1, tzinfo=UTC))
        second = sell(db, car, buyer, 2, when=datetime(2026, 10, 2, tzinfo=UTC))

        sales = dashboard(db, d).recent_sales

        assert [s.id for s in sales] == [second.id, first.id]
        assert sales[0].total_price == Decimal("3001.00")

    def test_recent_listings_newest_first(self, db, people):
        d = people["dealer"]
        older = make_vehicle(db, d, model="Older", created_at=datetime(2026, 9, 1, tzinfo=UTC))
        newer = make_vehicle(db, d, model="Newer", created_at=datetime(2026, 10, 1, tzinfo=UTC))

        assert [v.id for v in dashboard(db, d).recent_listings] == [newer.id, older.id]


class TestIsolation:
    def test_another_dealers_vehicles_and_sales_are_never_counted(self, db, people):
        d, rival, buyer = people["dealer"], people["rival"], people["buyer"]
        mine = make_vehicle(db, d, model="Mine", price="1000.00", quantity=2)
        theirs = make_vehicle(db, rival, model="Theirs", price="99000.00", quantity=7)
        unowned = make_vehicle(db, None, model="House", quantity=4)
        sell(db, mine, buyer, 1)
        sell(db, theirs, buyer, 5)
        sell(db, unowned, buyer, 1)

        result = dashboard(db, d)

        s = result.summary
        assert (s.total_listings, s.available_stock, s.units_sold) == (1, 2, 1)
        assert s.total_revenue == Decimal("1000.00")
        assert s.inventory_value == Decimal("2000.00")
        assert [x.vehicle_label for x in result.recent_sales] == [mine.label]
        assert all(v.model == "Mine" for v in result.recent_listings)


class TestProfitAndCounts:
    def test_completed_sales_count_transactions_not_units(self, db, people):
        d, buyer = people["dealer"], people["buyer"]
        car = make_vehicle(db, d)
        sell(db, car, buyer, 3)
        sell(db, car, buyer, 1)

        s = dashboard(db, d).summary

        assert (s.sales_count, s.units_sold) == (2, 4)

    def test_gross_profit_counts_only_sales_with_a_known_cost(self, db, people):
        d, buyer = people["dealer"], people["buyer"]
        car = make_vehicle(db, d, price="30000.00")
        sell(db, car, buyer, 2, unit_cost="25000.00")  # 2 x 5000 profit
        sell(db, car, buyer, 1, unit_price="28000.00", unit_cost="26000.00")  # 2000
        sell(db, car, buyer, 1)  # cost unknown: revenue counts, profit doesn't

        s = dashboard(db, d).summary

        assert s.total_revenue == Decimal("118000.00")
        assert s.gross_profit == Decimal("12000.00")
        assert s.sales_with_cost == 2
        assert s.sales_count == 3

    def test_gross_profit_is_unknown_without_any_costs(self, db, people):
        d, buyer = people["dealer"], people["buyer"]
        sell(db, make_vehicle(db, d), buyer, 1)

        s = dashboard(db, d).summary

        assert s.gross_profit is None
        assert s.sales_with_cost == 0

    def test_a_loss_is_negative_profit(self, db, people):
        d, buyer = people["dealer"], people["buyer"]
        sell(db, make_vehicle(db, d), buyer, 1, unit_price="9000.00", unit_cost="10000.00")

        assert dashboard(db, d).summary.gross_profit == Decimal("-1000.00")

    def test_dealer_recorded_sales_count_on_their_sale_date(self, db, people):
        d = people["dealer"]
        car = make_vehicle(db, d, price="1000.00")
        db.add(
            Purchase(
                channel=SaleChannel.DEALER,
                vehicle_id=car.id,
                dealer_id=d.id,
                vehicle_label=car.label,
                quantity=1,
                unit_price=Decimal("1500.00"),
                customer_name="Walk-in Customer",
                sold_at=datetime(2026, 8, 20, tzinfo=UTC),  # recorded later, sold in August
                created_at=NOW,
            )
        )
        db.flush()

        result = dashboard(db, d)

        by_month = {m.month: m.units for m in result.monthly}
        assert by_month["2026-08"] == 1 and by_month["2026-10"] == 0
        assert result.recent_sales[0].channel == SaleChannel.DEALER
        assert result.recent_sales[0].customer_name == "Walk-in Customer"


class TestFollowUps:
    def lead(self, db, owner, name, days, status=LeadStatus.NEW):
        db.add(
            Lead(
                dealer_id=owner.id,
                name=name,
                status=status,
                follow_up_on=date(2026, 10, 15) + timedelta(days=days)
                if days is not None
                else None,
            )
        )
        db.flush()

    def test_overdue_today_and_upcoming_open_leads(self, db, people):
        d, rival = people["dealer"], people["rival"]
        self.lead(db, d, "Overdue", -3)
        self.lead(db, d, "Today", 0)
        self.lead(db, d, "Soon", 6)
        self.lead(db, d, "Far", 30)
        self.lead(db, d, "Undated", None)
        self.lead(db, d, "Closed", -1, LeadStatus.LOST)
        self.lead(db, d, "Won", 1, LeadStatus.CONVERTED)
        self.lead(db, rival, "Theirs", 0)

        f = dashboard(db, d).follow_ups

        assert (f.overdue, f.today, f.upcoming) == (1, 1, 1)
        assert [i.name for i in f.items] == ["Overdue", "Today", "Soon"]

    def test_today_is_the_dealers_local_date(self, db, people):
        d = people["dealer"]
        self.lead(db, d, "Tomorrow in UTC", 1)
        late = datetime(2026, 10, 15, 20, 0, tzinfo=UTC)  # already 16 Oct in India

        f = dashboard(db, d, tz=ZoneInfo("Asia/Kolkata"), now=late).follow_ups

        assert (f.today, f.upcoming) == (1, 0)


class TestQueryCount:
    # 11 queries (9 for sales and stock, 2 for follow-ups), plus one batched photo load per
    # vehicle list (6 lists, top two may share).
    MAX_QUERIES = 11 + 6 + 2

    def test_query_count_does_not_grow_with_vehicles_or_sales(self, db, people):
        d, buyer = people["dealer"], people["buyer"]

        def queries():
            statements: list[str] = []
            listener = lambda *args: statements.append(args[2])  # noqa: E731
            event.listen(get_engine(), "before_cursor_execute", listener)
            try:
                dashboard(db, d)
            finally:
                event.remove(get_engine(), "before_cursor_execute", listener)
            return len(statements)

        def stock_up(count):
            # Every list populated: sold and unsold, in, low and out of stock, one deleted.
            for i in range(count):
                car = make_vehicle(db, d, model=f"M{count}-{i}", quantity=(0, 1, 5)[i % 3])
                if i % 2:
                    sell(db, car, buyer, 1 + i % 3)
            db.delete(car)
            db.flush()

        stock_up(6)
        assert queries() <= self.MAX_QUERIES
        stock_up(60)
        assert queries() <= self.MAX_QUERIES


# --- the endpoint -------------------------------------------------------------------------


class TestEndpoint:
    def test_requires_sign_in(self, client):
        assert client.get("/api/dashboard").status_code == 401

    @pytest.mark.parametrize("who", ["customer_headers", "admin_headers"])
    def test_only_dealers_have_a_dashboard(self, client, request, who):
        response = client.get("/api/dashboard", headers=request.getfixturevalue(who))

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "FORBIDDEN"

    @pytest.mark.parametrize(
        "query", ["months=5", "months=0", "months=abc", "tz=Mars/Olympus", "tz=" + "x" * 80]
    )
    def test_rejects_invalid_parameters(self, client, query):
        headers = dealer(client, MINE)

        assert client.get(f"/api/dashboard?{query}", headers=headers).status_code == 422

    def test_a_real_multi_unit_purchase_shows_up(self, client, customer_headers):
        mine = dealer(client, MINE)
        car = add(client, mine, price="25000.00", quantity=5)
        bought = client.post(
            f"/api/vehicles/{car['id']}/purchase", json={"quantity": 3}, headers=customer_headers
        )
        assert bought.status_code == 200

        body = client.get("/api/dashboard?months=3&tz=Asia/Kolkata", headers=mine).json()

        assert body["summary"]["units_sold"] == 3
        assert body["summary"]["total_revenue"] == "75000.00"
        assert body["summary"]["units_sold_this_month"] == 3
        assert body["summary"]["available_stock"] == 2
        assert body["summary"]["inventory_value"] == "50000.00"
        assert len(body["monthly"]) == 3
        assert body["monthly"][-1]["units"] == 3
        assert body["recent_sales"][0]["quantity"] == 3
        assert body["recent_sales"][0]["total_price"] == "75000.00"
        assert body["best_seller"]["vehicle"]["id"] == car["id"]
        assert body["timezone"] == "Asia/Kolkata"

    def test_each_dealer_sees_only_their_own_figures(self, client, customer_headers):
        mine, other = dealer(client, MINE), dealer(client, OTHER)
        car = add(client, other, quantity=4)
        client.post(f"/api/vehicles/{car['id']}/purchase", headers=customer_headers)

        body = client.get("/api/dashboard", headers=mine).json()

        assert body["summary"]["total_listings"] == 0
        assert body["summary"]["units_sold"] == 0
        assert body["recent_sales"] == []
        assert client.get("/api/dashboard", headers=other).json()["summary"]["units_sold"] == 1

    def test_photo_and_vehicle_fields_on_rows(self, client):
        mine = dealer(client, MINE)
        add(client, mine, **{**VEHICLE, "quantity": 0})

        row = client.get("/api/dashboard", headers=mine).json()["out_of_stock"][0]

        assert row["make"] == VEHICLE["make"]
        assert row["price"] == VEHICLE["price"]
        assert row["category"] == VEHICLE["category"]
        assert row["photo"] is None
        assert row["units_sold"] == 0
