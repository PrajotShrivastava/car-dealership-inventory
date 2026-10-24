from datetime import date
from decimal import Decimal
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_serializer,
    field_validator,
)

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


class VehicleOut(VehicleFields):
    model_config = ConfigDict(from_attributes=True)

    id: int
    quantity: int

    @field_serializer("price")
    def _price_as_fixed_point(self, value: Decimal) -> str:
        return f"{value:.2f}"


class VehicleList(BaseModel):
    items: list[VehicleOut]
    total: int
