import enum
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    ValidationInfo,
    computed_field,
    field_serializer,
    field_validator,
)

from app.media import photo_url, thumb_url
from app.models import Category, FuelType, Transmission

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
Price = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]


class VehicleFields(BaseModel):
    make: Name
    model: Name
    trim: Annotated[str, StringConstraints(strip_whitespace=True, max_length=50)] | None = None
    year: int
    category: Category
    fuel_type: FuelType
    transmission: Transmission
    price: Price
    # Per unit, for gross profit. Only the owning dealer and admins ever see it.
    acquisition_cost: Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)] | None = None

    @field_validator("trim")
    @classmethod
    def _blank_trim_is_none(cls, value: str | None) -> str | None:
        return value or None

    @field_validator("year")
    @classmethod
    def _plausible_year(cls, value: int) -> int:
        latest = date.today().year + 1
        if not 1900 <= value <= latest:
            raise ValueError(f"year must be between 1900 and {latest}")
        return value


class VehicleCreate(VehicleFields):
    quantity: int = Field(default=0, ge=0, le=10_000)


class VehicleUpdate(VehicleFields):
    # Stock changes only through purchase/restock, so "quantity" is rejected here.
    model_config = ConfigDict(extra="forbid")


class PhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    file_key: str = Field(exclude=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def url(self) -> str:
        return photo_url(self.file_key)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def thumb_url(self) -> str:
        return thumb_url(self.file_key)


class VehicleOut(VehicleFields):
    model_config = ConfigDict(from_attributes=True)

    id: int
    quantity: int
    # Read-only here; photos change only through the photo endpoints.
    photos: list[PhotoOut] = []

    @field_serializer("price")
    def _price_as_fixed_point(self, value: Decimal) -> str:
        return f"{value:.2f}"

    @field_serializer("acquisition_cost")
    def _cost_as_fixed_point(self, value: Decimal | None) -> str | None:
        return None if value is None else f"{value:.2f}"


class Availability(enum.StrEnum):
    ALL = "all"
    IN_STOCK = "in_stock"
    OUT_OF_STOCK = "out_of_stock"


class SortOrder(enum.StrEnum):
    NEWEST = "newest"
    PRICE_ASC = "price_asc"
    PRICE_DESC = "price_desc"
    YEAR_DESC = "year_desc"
    YEAR_ASC = "year_asc"
    MAKE_ASC = "make_asc"


OptionalText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None
NonNegativePrice = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)] | None


class VehicleQuery(BaseModel):
    q: OptionalText = None
    make: OptionalText = None
    model: OptionalText = None
    category: Category | None = None
    min_price: NonNegativePrice = None
    max_price: NonNegativePrice = None
    availability: Availability = Availability.ALL
    sort: SortOrder = SortOrder.NEWEST
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0, le=1_000_000)

    @field_validator("max_price")
    @classmethod
    def _range_is_ordered(cls, value: Decimal | None, info: ValidationInfo) -> Decimal | None:
        low = info.data.get("min_price")
        if value is not None and low is not None and value < low:
            raise ValueError("max_price must be greater than or equal to min_price")
        return value


class AvailabilityCounts(BaseModel):
    all: int
    in_stock: int
    out_of_stock: int


class VehicleList(BaseModel):
    items: list[VehicleOut]
    total: int
    counts: AvailabilityCounts


class PurchaseRequest(BaseModel):
    quantity: int = Field(default=1, ge=1, le=10)


class RestockRequest(BaseModel):
    quantity: int = Field(ge=1, le=1000)


class PurchaseOut(BaseModel):
    """A customer's own purchase: never includes the dealer's cost or profit."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    vehicle_id: int | None
    vehicle_label: str
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    created_at: datetime

    @field_serializer("unit_price", "total_price")
    def _money(self, value: Decimal) -> str:
        return f"{value:.2f}"


class PurchaseResult(BaseModel):
    purchase: PurchaseOut
    vehicle: VehicleOut
