from collections.abc import Sequence
from typing import Any

from sqlalchemy import ColumnElement, and_, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import InstrumentedAttribute, Session

from app.errors import AppError
from app.models import Purchase, Vehicle
from app.schemas.vehicles import Availability, AvailabilityCounts, SortOrder, VehicleQuery

_ORDERING: dict[SortOrder, tuple[ColumnElement[Any], ...]] = {
    SortOrder.NEWEST: (Vehicle.created_at.desc(), Vehicle.id.desc()),
    SortOrder.PRICE_ASC: (Vehicle.price.asc(), Vehicle.id.asc()),
    SortOrder.PRICE_DESC: (Vehicle.price.desc(), Vehicle.id.desc()),
    SortOrder.YEAR_DESC: (Vehicle.year.desc(), Vehicle.id.desc()),
    SortOrder.YEAR_ASC: (Vehicle.year.asc(), Vehicle.id.asc()),
    SortOrder.MAKE_ASC: (Vehicle.make.asc(), Vehicle.model.asc(), Vehicle.id.asc()),
    # New cars without a recorded mileage count as zero miles.
    SortOrder.MILEAGE_ASC: (func.coalesce(Vehicle.mileage, 0).asc(), Vehicle.id.asc()),
}


def escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def contains(column: InstrumentedAttribute[Any], term: str) -> ColumnElement[bool]:
    return column.ilike(f"%{escape_like(term)}%", escape="\\")


def _attribute_filters(query: VehicleQuery) -> list[ColumnElement[bool]]:
    """Every filter except availability (which is faceted separately)."""
    conditions: list[ColumnElement[bool]] = []
    for word in (query.q or "").split():
        conditions.append(
            or_(
                contains(Vehicle.make, word),
                contains(Vehicle.model, word),
                contains(Vehicle.trim, word),
                contains(Vehicle.colour, word),
                contains(Vehicle.vin, word),
                func.array_to_string(Vehicle.features, " ").ilike(
                    f"%{escape_like(word)}%", escape="\\"
                ),
            )
        )
    if query.make:
        conditions.append(func.lower(Vehicle.make) == query.make.lower())
    if query.model:
        conditions.append(func.lower(Vehicle.model) == query.model.lower())
    if query.category:
        conditions.append(Vehicle.category == query.category)
    if query.min_price is not None:
        conditions.append(Vehicle.price >= query.min_price)
    if query.max_price is not None:
        conditions.append(Vehicle.price <= query.max_price)
    if query.condition:
        conditions.append(Vehicle.condition == query.condition)
    if query.max_mileage is not None:
        conditions.append(func.coalesce(Vehicle.mileage, 0) <= query.max_mileage)
    return conditions


def _availability_filter(availability: Availability) -> list[ColumnElement[bool]]:
    if availability is Availability.IN_STOCK:
        return [Vehicle.quantity > 0]
    if availability is Availability.OUT_OF_STOCK:
        return [Vehicle.quantity == 0]
    return []


def search_vehicles(
    db: Session, query: VehicleQuery, dealer_id: int | None = None
) -> tuple[Sequence[Vehicle], int, AvailabilityCounts]:
    """`dealer_id` limits the search (and its counts) to that dealer's listings."""
    attribute_filters = _attribute_filters(query)
    if dealer_id is not None:
        attribute_filters.append(Vehicle.dealer_id == dealer_id)
    filters = and_(True, *attribute_filters, *_availability_filter(query.availability))

    items_stmt = (
        select(Vehicle)
        .where(filters)
        .order_by(*_ORDERING[query.sort])
        .limit(query.limit)
        .offset(query.offset)
    )
    items = db.scalars(items_stmt).all()
    total = db.scalar(select(func.count()).select_from(Vehicle).where(filters)) or 0

    counts_row = db.execute(
        select(
            func.count(),
            func.count().filter(Vehicle.quantity > 0),
            func.count().filter(Vehicle.quantity == 0),
        ).where(and_(True, *attribute_filters))
    ).one()
    counts = AvailabilityCounts(
        all=counts_row[0], in_stock=counts_row[1], out_of_stock=counts_row[2]
    )
    return items, total, counts


MAX_STOCK = 100_000


def vehicle_not_found(vehicle_id: int) -> AppError:
    return AppError(404, "VEHICLE_NOT_FOUND", f"Vehicle {vehicle_id} not found")


def vin_single_unit() -> AppError:
    return AppError(
        409,
        "VIN_SINGLE_UNIT",
        "A vehicle with a VIN is a single car, so its stock can be at most 1",
    )


def save_vehicle(db: Session, vehicle: Vehicle) -> Vehicle:
    """Commit a new or edited vehicle, reporting a VIN already in the inventory as a conflict."""
    db.add(vehicle)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if "uq_vehicles_dealer_id_vin" in str(exc.orig):
            raise AppError(
                409, "VIN_TAKEN", f"A vehicle with VIN {vehicle.vin} is already in the inventory"
            ) from exc
        raise
    db.refresh(vehicle)
    return vehicle


def purchase_vehicle(db: Session, vehicle_id: int, user_id: int, quantity: int) -> Purchase:
    """Atomically take `quantity` units out of stock and record the sale.

    The conditional UPDATE only matches while enough stock remains, so concurrent
    buyers can never drive the quantity negative or oversell.
    """
    vehicle = db.scalars(
        update(Vehicle)
        .where(Vehicle.id == vehicle_id, Vehicle.quantity >= quantity)
        .values(quantity=Vehicle.quantity - quantity)
        .returning(Vehicle)
        .execution_options(populate_existing=True)
    ).first()

    if vehicle is None:
        db.rollback()
        current = db.get(Vehicle, vehicle_id)
        if current is None:
            raise vehicle_not_found(vehicle_id)
        if current.quantity == 0:
            raise AppError(409, "OUT_OF_STOCK", f"{current.label} is out of stock")
        raise AppError(
            409,
            "INSUFFICIENT_STOCK",
            f"Only {current.quantity} unit(s) of {current.label} available",
        )

    record = Purchase(
        user_id=user_id,
        vehicle_id=vehicle.id,
        dealer_id=vehicle.dealer_id,
        vehicle_label=vehicle.label,
        quantity=quantity,
        unit_price=vehicle.price,
        unit_cost=vehicle.acquisition_cost,
    )
    db.add(record)
    db.commit()
    return record


def restock_vehicle(db: Session, vehicle_id: int, quantity: int) -> Vehicle:
    vehicle = db.scalars(
        update(Vehicle)
        .where(
            Vehicle.id == vehicle_id,
            Vehicle.quantity + quantity <= MAX_STOCK,
            or_(Vehicle.vin.is_(None), Vehicle.quantity + quantity <= 1),
        )
        .values(quantity=Vehicle.quantity + quantity)
        .returning(Vehicle)
        .execution_options(populate_existing=True)
    ).first()
    if vehicle is None:
        db.rollback()
        current = db.get(Vehicle, vehicle_id)
        if current is None:
            raise vehicle_not_found(vehicle_id)
        if current.vin is not None:
            raise vin_single_unit()
        raise AppError(
            409,
            "STOCK_LIMIT_EXCEEDED",
            f"Restocking would exceed the {MAX_STOCK:,}-unit limit "
            f"({current.quantity:,} currently in stock)",
        )
    db.commit()
    return vehicle
