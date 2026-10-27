from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, StringConstraints, ValidationInfo, field_validator

from app.models import SaleChannel
from app.schemas.common import (
    EARLIEST_DATE,
    Amount,
    Money,
    PersonName,
    Phone,
    TimeZone,
    blank_to_none,
    today_in,
)


class SaleCreate(BaseModel):
    vehicle_id: Annotated[int, Field(ge=1, le=2_147_483_647)]
    quantity: int = Field(default=1, ge=1, le=10)
    # The final selling price of one unit.
    unit_price: Amount
    # Before sold_on, which is checked against "today" in this zone.
    tz: TimeZone = "UTC"
    sold_on: date
    customer_name: PersonName
    customer_email: EmailStr | None = None
    customer_phone: Phone | None = None
    lead_id: Annotated[int, Field(ge=1, le=2_147_483_647)] | None = None
    # A fresh UUID per sale form: resubmitting the same one records the sale only once.
    request_id: UUID

    _blank = field_validator("customer_email", "customer_phone", mode="before")(blank_to_none)

    @field_validator("sold_on")
    @classmethod
    def _not_in_the_future(cls, value: date, info: ValidationInfo) -> date:
        if value < EARLIEST_DATE:
            raise ValueError(f"sale date must be on or after {EARLIEST_DATE}")
        tz = info.data.get("tz", "UTC")
        if value > today_in(tz if isinstance(tz, str) else "UTC"):
            raise ValueError("sale date can't be in the future")
        return value


class SaleQuery(BaseModel):
    q: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None
    vehicle_id: Annotated[int, Field(ge=1, le=2_147_483_647)] | None = None
    channel: SaleChannel | None = None
    date_from: date | None = None
    date_to: date | None = None
    tz: TimeZone = "UTC"
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0, le=1_000_000)

    @field_validator("date_to")
    @classmethod
    def _range_is_ordered(cls, value: date | None, info: ValidationInfo) -> date | None:
        start = info.data.get("date_from")
        if value is not None and start is not None and value < start:
            raise ValueError("date_to must be on or after date_from")
        return value


class Customer(BaseModel):
    name: str | None
    email: str | None
    phone: str | None


class SaleOut(BaseModel):
    id: int
    channel: SaleChannel
    sold_at: datetime
    vehicle_id: int | None
    vehicle_label: str
    quantity: int
    unit_price: Money
    total_price: Money
    # The dealer's view only: cost per unit and gross profit (None when the cost is unknown).
    unit_cost: Money | None
    gross_profit: Money | None
    customer: Customer
    lead_id: int | None


class SaleTotals(BaseModel):
    sales: int
    units: int
    revenue: Money
    gross_profit: Money | None
    sales_with_cost: int


class SaleList(BaseModel):
    items: list[SaleOut]
    total: int
    totals: SaleTotals
