import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Index, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Role(enum.StrEnum):
    CUSTOMER = "customer"
    ADMIN = "admin"


def _enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    return [member.value for member in enum_cls]


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[Role] = mapped_column(
        Enum(Role, name="user_role", values_callable=_enum_values),
        default=Role.CUSTOMER,
        server_default=Role.CUSTOMER.value,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Category(enum.StrEnum):
    SEDAN = "sedan"
    SUV = "suv"
    HATCHBACK = "hatchback"
    COUPE = "coupe"
    CONVERTIBLE = "convertible"
    TRUCK = "truck"
    VAN = "van"
    WAGON = "wagon"


class FuelType(enum.StrEnum):
    PETROL = "petrol"
    DIESEL = "diesel"
    HYBRID = "hybrid"
    ELECTRIC = "electric"


class Transmission(enum.StrEnum):
    MANUAL = "manual"
    AUTOMATIC = "automatic"


class Vehicle(Base):
    __tablename__ = "vehicles"
    __table_args__ = (
        CheckConstraint("price > 0", name="ck_vehicles_price_positive"),
        CheckConstraint("quantity >= 0", name="ck_vehicles_quantity_non_negative"),
        CheckConstraint("year BETWEEN 1900 AND 2100", name="ck_vehicles_year_range"),
        Index("ix_vehicles_make_model", "make", "model"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    make: Mapped[str] = mapped_column(String(50))
    model: Mapped[str] = mapped_column(String(50))
    trim: Mapped[str | None] = mapped_column(String(50))
    year: Mapped[int]
    category: Mapped[Category] = mapped_column(
        Enum(Category, name="vehicle_category", values_callable=_enum_values), index=True
    )
    fuel_type: Mapped[FuelType] = mapped_column(
        Enum(FuelType, name="fuel_type", values_callable=_enum_values)
    )
    transmission: Mapped[Transmission] = mapped_column(
        Enum(Transmission, name="transmission", values_callable=_enum_values)
    )
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), index=True)
    quantity: Mapped[int] = mapped_column(default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    @property
    def label(self) -> str:
        return " ".join(str(part) for part in (self.year, self.make, self.model, self.trim) if part)


class Purchase(Base):
    __tablename__ = "purchases"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_purchases_quantity_positive"),
        CheckConstraint("unit_price > 0", name="ck_purchases_unit_price_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Nullable so sales history survives when a vehicle is removed from inventory.
    vehicle_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehicles.id", ondelete="SET NULL"), index=True
    )
    vehicle_label: Mapped[str] = mapped_column(String(170))
    quantity: Mapped[int]
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    @property
    def total_price(self) -> Decimal:
        return self.unit_price * self.quantity
