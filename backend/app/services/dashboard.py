"""A dealer's sales and inventory figures, aggregated in the database.

Everything is scoped to one dealer: their listings (vehicles.dealer_id) and the sales made
from them (purchases.dealer_id, recorded at the time of sale), online or recorded by the
dealer. Sales count every unit at the price actually paid and are dated by when they
happened (sold_at). A sale is only written once it has succeeded, so every row is a
completed sale. Gross profit only covers sales whose acquisition cost is known.
"""

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, Select, and_, case, func, select
from sqlalchemy.orm import Session, lazyload

from app.models import Lead, Purchase, SaleChannel, Vehicle
from app.schemas.dashboard import (
    DashboardOut,
    DashboardSummary,
    DashboardVehicle,
    FollowUp,
    FollowUps,
    MonthlySales,
    RecentSale,
    TopVehicle,
)
from app.schemas.vehicles import PhotoOut
from app.services.leads import OPEN, UPCOMING_DAYS, reminder_counts

# 1 to 2 units left is "low stock", matching the inventory's stock badges.
LOW_STOCK_THRESHOLD = 2
LIST_SIZE = 5
RECENT_SALES = 8

ZERO = Decimal("0")


def _month_starts(now: datetime, tz: ZoneInfo, months: int) -> list[datetime]:
    """Local midnights on the 1st: the start of each month in range, then next month's."""
    local = now.astimezone(tz)
    starts = []
    for back in range(months - 1, -2, -1):
        index = local.year * 12 + local.month - 1 - back
        starts.append(datetime(index // 12, index % 12 + 1, 1, tzinfo=tz))
    return starts


def _revenue() -> ColumnElement[Any]:
    return Purchase.quantity * Purchase.unit_price


def _vehicle_sales(dealer_id: int) -> Any:
    """Units and revenue per vehicle still in inventory."""
    return (
        select(
            Purchase.vehicle_id.label("vehicle_id"),
            func.sum(Purchase.quantity).label("units"),
            func.sum(_revenue()).label("revenue"),
        )
        .where(Purchase.dealer_id == dealer_id, Purchase.vehicle_id.is_not(None))
        .group_by(Purchase.vehicle_id)
        .subquery()
    )


def _row(vehicle: Vehicle, units: int | None, revenue: Decimal | None) -> DashboardVehicle:
    return DashboardVehicle(
        id=vehicle.id,
        make=vehicle.make,
        model=vehicle.model,
        trim=vehicle.trim,
        year=vehicle.year,
        category=vehicle.category,
        price=vehicle.price,
        quantity=vehicle.quantity,
        units_sold=units or 0,
        revenue=revenue or ZERO,
        photo=PhotoOut.model_validate(vehicle.photos[0]) if vehicle.photos else None,
        created_at=vehicle.created_at,
    )


def build_dashboard(
    db: Session, dealer_id: int, *, months: int, tz: ZoneInfo, now: datetime
) -> DashboardOut:
    sales = _vehicle_sales(dealer_id)
    mine = Vehicle.dealer_id == dealer_id

    stock = db.execute(
        select(
            func.count(),
            func.coalesce(func.sum(Vehicle.quantity), 0),
            func.count().filter(Vehicle.quantity > LOW_STOCK_THRESHOLD),
            func.count().filter(Vehicle.quantity.between(1, LOW_STOCK_THRESHOLD)),
            func.count().filter(Vehicle.quantity == 0),
            func.count().filter(sales.c.units.is_(None)),
            func.coalesce(func.sum(Vehicle.price * Vehicle.quantity), ZERO),
        )
        .select_from(Vehicle)
        .outerjoin(sales, sales.c.vehicle_id == Vehicle.id)
        .where(mine)
    ).one()

    # One pass over the dealer's purchases: all-time totals plus a bucket per month.
    starts = _month_starts(now, tz, months)
    buckets: list[ColumnElement[Any]] = []
    for start, end in zip(starts, starts[1:], strict=False):
        in_month = and_(Purchase.sold_at >= start, Purchase.sold_at < end)
        buckets += [
            func.coalesce(func.sum(Purchase.quantity).filter(in_month), 0),
            func.coalesce(func.sum(_revenue()).filter(in_month), ZERO),
        ]
    this_month = starts[-2]
    known_cost = Purchase.unit_cost.is_not(None)
    totals = db.execute(
        select(
            func.coalesce(func.sum(Purchase.quantity), 0),
            func.coalesce(func.sum(_revenue()), ZERO),
            func.count().filter(Purchase.sold_at < this_month),
            func.count(),
            func.sum((Purchase.unit_price - Purchase.unit_cost) * Purchase.quantity).filter(
                known_cost
            ),
            func.count().filter(known_cost),
            *buckets,
        ).where(Purchase.dealer_id == dealer_id)
    ).one()
    per_month = [(totals[i], totals[i + 1]) for i in range(6, len(totals), 2)]
    monthly = [
        MonthlySales(month=f"{start:%Y-%m}", units=units, revenue=revenue)
        for start, (units, revenue) in zip(starts, per_month, strict=False)
    ]

    def vehicles(
        condition: ColumnElement[bool] | None, *order: ColumnElement[Any]
    ) -> list[DashboardVehicle]:
        stmt: Select[Any] = (
            select(Vehicle, sales.c.units, sales.c.revenue)
            .outerjoin(sales, sales.c.vehicle_id == Vehicle.id)
            .where(mine)
        )
        if condition is not None:
            stmt = stmt.where(condition)
        rows = db.execute(stmt.order_by(*order, Vehicle.id.desc()).limit(LIST_SIZE)).all()
        return [_row(*row) for row in rows]

    # Sales grouped by vehicle; a deleted vehicle's sales group by the label they recorded.
    removed_label = case((Purchase.vehicle_id.is_(None), Purchase.vehicle_label))
    units = func.sum(Purchase.quantity)
    revenue = func.sum(_revenue())

    def top(*order: ColumnElement[Any], limit: int) -> list[TopVehicle]:
        rows = db.execute(
            select(Purchase.vehicle_id, removed_label, units, revenue)
            .where(Purchase.dealer_id == dealer_id)
            .group_by(Purchase.vehicle_id, removed_label)
            .order_by(*order, Purchase.vehicle_id, removed_label)
            .limit(limit)
        ).all()
        ids = [row[0] for row in rows if row[0] is not None]
        current = {v.id: v for v in db.scalars(select(Vehicle).where(Vehicle.id.in_(ids)))}
        result = []
        for vehicle_id, label, sold, earned in rows:
            vehicle = current.get(vehicle_id) if vehicle_id is not None else None
            result.append(
                TopVehicle(
                    label=vehicle.label if vehicle else label,
                    units_sold=sold,
                    revenue=earned,
                    vehicle=_row(vehicle, sold, earned) if vehicle else None,
                )
            )
        return result

    top_sellers = top(units.desc(), revenue.desc(), limit=LIST_SIZE)
    top_revenue = top(revenue.desc(), units.desc(), limit=1)

    recent = db.scalars(
        select(Purchase)
        .where(Purchase.dealer_id == dealer_id)
        .order_by(Purchase.sold_at.desc(), Purchase.id.desc())
        .limit(RECENT_SALES)
    ).all()

    today = now.astimezone(tz).date()
    due = db.scalars(
        select(Lead)
        .where(
            Lead.dealer_id == dealer_id,
            OPEN,
            Lead.follow_up_on <= today + timedelta(days=UPCOMING_DAYS),
        )
        .order_by(Lead.follow_up_on, Lead.id)
        .limit(LIST_SIZE + 1)
        .options(lazyload(Lead.events))  # history isn't shown here
    ).all()
    reminders = reminder_counts(db, dealer_id, today)

    return DashboardOut(
        timezone=tz.key,
        summary=DashboardSummary(
            total_listings=stock[0],
            available_stock=stock[1],
            in_stock=stock[2],
            low_stock=stock[3],
            out_of_stock=stock[4],
            never_sold=stock[5],
            low_stock_threshold=LOW_STOCK_THRESHOLD,
            inventory_value=stock[6],
            units_sold=totals[0],
            sales_count=totals[3],
            total_revenue=totals[1],
            gross_profit=totals[4],
            sales_with_cost=totals[5],
            units_sold_this_month=per_month[-1][0],
            revenue_this_month=per_month[-1][1],
            units_sold_last_month=per_month[-2][0],
            revenue_last_month=per_month[-2][1],
            has_sales_before_this_month=totals[2] > 0,
        ),
        monthly=monthly,
        best_seller=top_sellers[0] if top_sellers else None,
        top_revenue=top_revenue[0] if top_revenue else None,
        top_sellers=top_sellers,
        low_stock=vehicles(
            Vehicle.quantity.between(1, LOW_STOCK_THRESHOLD), Vehicle.quantity.asc()
        ),
        out_of_stock=vehicles(Vehicle.quantity == 0, Vehicle.updated_at.desc()),
        never_sold=vehicles(sales.c.units.is_(None), Vehicle.created_at.desc()),
        recent_listings=vehicles(None, Vehicle.created_at.desc()),
        recent_sales=[
            RecentSale(
                id=sale.id,
                channel=sale.channel,
                created_at=sale.sold_at,
                customer_name=(
                    sale.buyer.full_name
                    if sale.channel is SaleChannel.ONLINE and sale.buyer
                    else sale.customer_name
                ),
                vehicle_id=sale.vehicle_id,
                vehicle_label=sale.vehicle_label,
                quantity=sale.quantity,
                unit_price=sale.unit_price,
                total_price=sale.total_price,
            )
            for sale in recent
        ],
        follow_ups=FollowUps(
            overdue=reminders.overdue,
            today=reminders.today,
            upcoming=reminders.upcoming,
            items=[
                FollowUp(
                    id=lead.id,
                    name=lead.name,
                    status=lead.status,
                    follow_up_on=lead.follow_up_on,
                    vehicle_label=lead.vehicle_label,
                )
                for lead in due
                if lead.follow_up_on is not None
            ],
        ),
    )
