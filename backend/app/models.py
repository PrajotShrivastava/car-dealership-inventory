import enum
from datetime import date, datetime
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
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Role(enum.StrEnum):
    CUSTOMER = "customer"
    ADMIN = "admin"
    # Manages inventory (vehicles, stock, photos). Admins can do that too, plus review
    # dealer applications. Listed last to match the order of the database enum.
    DEALER = "dealer"


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
        CheckConstraint("acquisition_cost >= 0", name="ck_vehicles_acquisition_cost_non_negative"),
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
    # The dealer who listed it. NULL for vehicles added by an admin or listed before
    # ownership was recorded; those belong to no dealer's inventory or dashboard.
    dealer_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    # What one unit cost the dealer; gross profit = selling price - this. Never shown to
    # customers. NULL when unknown, in which case profit is unknown too (not zero).
    acquisition_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    # Unused: left over from the removed CarDatabase integration (migration 0005). Kept
    # mapped so the model matches the schema; nothing reads or writes it, and it is not
    # exposed by the API. Dropping it needs a new migration (see docs).
    catalog_image_id: Mapped[str | None] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Loaded with every vehicle (one extra query per batch) so responses always include them.
    photos: Mapped[list["VehiclePhoto"]] = relationship(
        order_by="VehiclePhoto.position",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )

    @property
    def label(self) -> str:
        return " ".join(str(part) for part in (self.year, self.make, self.model, self.trim) if part)


class VehiclePhoto(Base):
    """A photo uploaded by an admin. The image files live in the media folder under file_key."""

    __tablename__ = "vehicle_photos"
    __table_args__ = (
        CheckConstraint("file_key ~ '^[0-9a-f]{32}$'", name="ck_vehicle_photos_file_key_format"),
        CheckConstraint("position >= 0", name="ck_vehicle_photos_position_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(
        ForeignKey("vehicles.id", ondelete="CASCADE"), index=True
    )
    file_key: Mapped[str] = mapped_column(String(32), unique=True)
    position: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SaleChannel(enum.StrEnum):
    ONLINE = "online"  # bought by a signed-in customer in the app
    DEALER = "dealer"  # recorded by the dealer, e.g. a sale on the lot


class Purchase(Base):
    """One completed sale. Rows are only written once the sale has succeeded."""

    __tablename__ = "purchases"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_purchases_quantity_positive"),
        CheckConstraint("unit_price > 0", name="ck_purchases_unit_price_positive"),
        CheckConstraint("unit_cost >= 0", name="ck_purchases_unit_cost_non_negative"),
        CheckConstraint(
            "(channel = 'online' AND user_id IS NOT NULL) "
            "OR (channel = 'dealer' AND customer_name IS NOT NULL)",
            name="ck_purchases_has_customer",
        ),
        UniqueConstraint("lead_id", name="uq_purchases_lead_id"),
        UniqueConstraint("dealer_id", "request_id", name="uq_purchases_dealer_id_request_id"),
        Index("ix_purchases_dealer_id_sold_at", "dealer_id", "sold_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    channel: Mapped[SaleChannel] = mapped_column(
        Enum(SaleChannel, name="sale_channel", values_callable=_enum_values),
        default=SaleChannel.ONLINE,
        server_default=SaleChannel.ONLINE.value,
    )
    # The signed-in buyer of an online sale; NULL for dealer-recorded sales.
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # Nullable so sales history survives when a vehicle is removed from inventory.
    vehicle_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehicles.id", ondelete="SET NULL"), index=True
    )
    # The vehicle's dealer when it was sold, kept so their sales survive the vehicle's removal.
    dealer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    vehicle_label: Mapped[str] = mapped_column(String(170))
    quantity: Mapped[int]
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    # The vehicle's acquisition cost per unit when it was sold; NULL when unknown.
    unit_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    # When the sale happened (a dealer may record it later); reports use this date.
    sold_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # The customer of a dealer-recorded sale.
    customer_name: Mapped[str | None] = mapped_column(String(100))
    customer_email: Mapped[str | None] = mapped_column(String(254))
    customer_phone: Mapped[str | None] = mapped_column(String(30))
    lead_id: Mapped[int | None] = mapped_column(ForeignKey("leads.id", ondelete="SET NULL"))
    # Sent by the client with each submission, so a retried request records one sale.
    request_id: Mapped[str | None] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    buyer: Mapped[User | None] = relationship(foreign_keys=[user_id], lazy="joined")

    @property
    def total_price(self) -> Decimal:
        return self.unit_price * self.quantity

    @property
    def gross_profit(self) -> Decimal | None:
        """Selling price minus acquisition cost, or None when the cost isn't known."""
        if self.unit_cost is None:
            return None
        return (self.unit_price - self.unit_cost) * self.quantity


class ApplicationStatus(enum.StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class DealerApplication(Base):
    """A request to become a dealer, from before dealers could sign up directly.

    New sign-ups no longer create these; existing ones are still reviewed by an admin.
    """

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


class LeadStatus(enum.StrEnum):
    NEW = "new"
    CONTACTED = "contacted"
    TEST_DRIVE_SCHEDULED = "test_drive_scheduled"
    NEGOTIATION = "negotiation"
    CONVERTED = "converted"
    LOST = "lost"


class Lead(Base):
    """A prospective customer a dealer is following up with. Never deleted on conversion."""

    __tablename__ = "leads"
    __table_args__ = (
        CheckConstraint("budget > 0", name="ck_leads_budget_positive"),
        Index("ix_leads_dealer_id_status", "dealer_id", "status"),
        Index("ix_leads_dealer_id_follow_up_on", "dealer_id", "follow_up_on"),
        Index("ix_leads_customer_id_vehicle_id", "customer_id", "vehicle_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    dealer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # The customer account that sent the enquiry from the website; None for leads entered by hand.
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id", ondelete="SET NULL"))
    # The vehicle's name when it was chosen, kept if the vehicle is later removed.
    vehicle_label: Mapped[str | None] = mapped_column(String(170))
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(254))
    phone: Mapped[str | None] = mapped_column(String(30))
    budget: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    source: Mapped[str | None] = mapped_column(String(50))
    notes: Mapped[str | None] = mapped_column(Text)
    # A calendar date, compared with the dealer's local date: no time zone to get wrong.
    follow_up_on: Mapped[date | None]
    status: Mapped[LeadStatus] = mapped_column(
        Enum(LeadStatus, name="lead_status", values_callable=_enum_values),
        default=LeadStatus.NEW,
        server_default=LeadStatus.NEW.value,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    events: Mapped[list["LeadEvent"]] = relationship(
        order_by="LeadEvent.id",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )


class LeadEvent(Base):
    """One entry in a lead's history: created, status or follow-up changed, sale recorded."""

    __tablename__ = "lead_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    old_value: Mapped[str | None] = mapped_column(String(50))
    new_value: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
