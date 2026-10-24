import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

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
        CheckConstraint(
            "catalog_image_id ~ '^[0-9a-f]{16}$'", name="ck_vehicles_catalog_image_id_format"
        ),
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
    # Unused: left over from the removed CarDatabase integration (migration 0005). Kept
    # mapped so the model matches the schema; nothing reads or writes it, and it is not
    # exposed by the API. Dropping it needs a new migration (see docs).
    catalog_image_id: Mapped[str | None] = mapped_column(String(16))
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


class ApplicationStatus(enum.StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class DealerApplication(Base):
    """A request to become an admin (dealer). Grants nothing until an admin approves it."""

    __tablename__ = "dealer_applications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    business_name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(30))
    message: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ApplicationStatus] = mapped_column(
        Enum(ApplicationStatus, name="application_status", values_callable=_enum_values),
        default=ApplicationStatus.PENDING,
        server_default=ApplicationStatus.PENDING.value,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    review_note: Mapped[str | None] = mapped_column(String(500))

    applicant: Mapped[User] = relationship(foreign_keys=[user_id], lazy="joined")
