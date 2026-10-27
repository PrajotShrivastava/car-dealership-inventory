"""The sales ledger: dealer-recorded sales and online purchases, scoped to one dealer."""

import re
from datetime import UTC, datetime, time, timedelta
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, and_, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import Lead, LeadEvent, LeadStatus, Purchase, SaleChannel, User, Vehicle
from app.schemas.common import today_in
from app.schemas.sales import Customer, SaleCreate, SaleList, SaleOut, SaleQuery, SaleTotals
from app.services.inventory import contains, vehicle_not_found

ZERO = Decimal("0")


def sale_not_found(sale_id: int) -> AppError:
    return AppError(404, "SALE_NOT_FOUND", f"Sale {sale_id} not found")


def lead_not_found(lead_id: int) -> AppError:
    return AppError(404, "LEAD_NOT_FOUND", f"Lead {lead_id} not found")


def _already_converted() -> AppError:
    return AppError(
        409, "LEAD_ALREADY_CONVERTED", "This lead has already been converted into a sale"
    )


def sale_out(sale: Purchase) -> SaleOut:
    if sale.channel is SaleChannel.ONLINE and sale.buyer is not None:
        customer = Customer(name=sale.buyer.full_name, email=sale.buyer.email, phone=None)
    else:
        customer = Customer(
            name=sale.customer_name, email=sale.customer_email, phone=sale.customer_phone
        )
    return SaleOut(
        id=sale.id,
        channel=sale.channel,
        sold_at=sale.sold_at,
        vehicle_id=sale.vehicle_id,
        vehicle_label=sale.vehicle_label,
        quantity=sale.quantity,
        unit_price=sale.unit_price,
        total_price=sale.total_price,
        unit_cost=sale.unit_cost,
        gross_profit=sale.gross_profit,
        customer=customer,
        lead_id=sale.lead_id,
    )


def _by_request(db: Session, dealer_id: int, request_id: str) -> Purchase | None:
    return db.scalars(
        select(Purchase).where(Purchase.dealer_id == dealer_id, Purchase.request_id == request_id)
    ).first()


def _sold_at(data: SaleCreate) -> datetime:
    """Today's sales are timed now; an earlier sale day is stored as midday on that day."""
    if data.sold_on == today_in(data.tz):
        return datetime.now(UTC)
    return datetime.combine(data.sold_on, time(12), tzinfo=ZoneInfo(data.tz))


def record_sale(db: Session, dealer: User, data: SaleCreate) -> tuple[Purchase, bool]:
    """Record a dealer's sale in one transaction. Returns (sale, created).

    Stock is taken by a conditional UPDATE that only matches the dealer's own vehicle while
    enough units remain, so concurrent sales can never oversell. The same request_id
    always resolves to one sale, and a lead converts into at most one sale; losing either
    race rolls back the stock change with everything else.
    """
    request_id = str(data.request_id)
    existing = _by_request(db, dealer.id, request_id)
    if existing is not None:
        return existing, False

    lead: Lead | None = None
    if data.lead_id is not None:
        lead = db.get(Lead, data.lead_id)
        if lead is None or lead.dealer_id != dealer.id:
            raise lead_not_found(data.lead_id)
        if db.scalar(select(Purchase.id).where(Purchase.lead_id == lead.id)) is not None:
            raise _already_converted()

    vehicle = db.scalars(
        update(Vehicle)
        .where(
            Vehicle.id == data.vehicle_id,
            Vehicle.dealer_id == dealer.id,
            Vehicle.quantity >= data.quantity,
        )
        .values(quantity=Vehicle.quantity - data.quantity)
        .returning(Vehicle)
        .execution_options(populate_existing=True)
    ).first()
    if vehicle is None:
        db.rollback()
        current = db.get(Vehicle, data.vehicle_id)
        if current is None or current.dealer_id != dealer.id:
            raise vehicle_not_found(data.vehicle_id)
        if current.quantity == 0:
            raise AppError(409, "OUT_OF_STOCK", f"{current.label} is out of stock")
        raise AppError(
            409,
            "INSUFFICIENT_STOCK",
            f"Only {current.quantity} unit(s) of {current.label} available",
        )

    sale = Purchase(
        channel=SaleChannel.DEALER,
        dealer_id=dealer.id,
        vehicle_id=vehicle.id,
        vehicle_label=vehicle.label,
        quantity=data.quantity,
        unit_price=data.unit_price,
        unit_cost=vehicle.acquisition_cost,
        sold_at=_sold_at(data),
        customer_name=data.customer_name,
        customer_email=data.customer_email,
        customer_phone=data.customer_phone,
        lead_id=data.lead_id,
        request_id=request_id,
    )
    db.add(sale)
    try:
        db.flush()
        if lead is not None:
            if lead.status is not LeadStatus.CONVERTED:
                lead.events.append(
                    LeadEvent(kind="status", old_value=lead.status, new_value=LeadStatus.CONVERTED)
                )
                lead.status = LeadStatus.CONVERTED
            lead.events.append(LeadEvent(kind="sale", new_value=str(sale.id)))
        db.commit()
    except IntegrityError:
        db.rollback()
        replay = _by_request(db, dealer.id, request_id)
        if replay is not None:
            return replay, False
        if data.lead_id is not None:
            raise _already_converted() from None
        raise
    db.refresh(sale)
    return sale, True


def get_sale(db: Session, dealer_id: int, sale_id: int) -> Purchase:
    sale = db.get(Purchase, sale_id)
    if sale is None or sale.dealer_id != dealer_id:
        raise sale_not_found(sale_id)
    return sale


def _local_midnight(day: Any, tz: str) -> datetime:
    return datetime.combine(day, time(0), tzinfo=ZoneInfo(tz))


def _filters(dealer_id: int, query: SaleQuery) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = [Purchase.dealer_id == dealer_id]
    if query.vehicle_id is not None:
        conditions.append(Purchase.vehicle_id == query.vehicle_id)
    if query.channel is not None:
        conditions.append(Purchase.channel == query.channel)
    if query.date_from is not None:
        conditions.append(Purchase.sold_at >= _local_midnight(query.date_from, query.tz))
    if query.date_to is not None:
        end = _local_midnight(query.date_to + timedelta(days=1), query.tz)
        conditions.append(Purchase.sold_at < end)
    for word in (query.q or "").split():
        matches = [
            contains(Purchase.vehicle_label, word),
            contains(Purchase.customer_name, word),
            contains(Purchase.customer_email, word),
            Purchase.user_id.in_(
                select(User.id).where(
                    or_(contains(User.full_name, word), contains(User.email, word))
                )
            ),
        ]
        if reference := re.fullmatch(r"#?(\d{1,9})", word):
            matches.append(Purchase.id == int(reference.group(1)))
        conditions.append(or_(*matches))
    return conditions


def list_sales(db: Session, dealer_id: int, query: SaleQuery) -> SaleList:
    where = and_(*_filters(dealer_id, query))
    items = db.scalars(
        select(Purchase)
        .where(where)
        .order_by(Purchase.sold_at.desc(), Purchase.id.desc())
        .limit(query.limit)
        .offset(query.offset)
    ).all()
    known = Purchase.unit_cost.is_not(None)
    row = db.execute(
        select(
            func.count(),
            func.coalesce(func.sum(Purchase.quantity), 0),
            func.coalesce(func.sum(Purchase.quantity * Purchase.unit_price), ZERO),
            func.sum((Purchase.unit_price - Purchase.unit_cost) * Purchase.quantity).filter(known),
            func.count().filter(known),
        ).where(where)
    ).one()
    return SaleList(
        items=[sale_out(sale) for sale in items],
        total=row[0],
        totals=SaleTotals(
            sales=row[0], units=row[1], revenue=row[2], gross_profit=row[3], sales_with_cost=row[4]
        ),
    )
