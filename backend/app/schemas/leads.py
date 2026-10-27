import enum
from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

from app.models import LeadStatus
from app.schemas.common import (
    EARLIEST_DATE,
    Amount,
    Money,
    PersonName,
    Phone,
    TimeZone,
    blank_to_none,
)

VehicleRef = Annotated[int, Field(ge=1, le=2_147_483_647)]
Source = Annotated[str, StringConstraints(strip_whitespace=True, max_length=50)]
Notes = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


def _plausible(value: date | None) -> date | None:
    if value is not None and value < EARLIEST_DATE:
        raise ValueError(f"follow-up date must be on or after {EARLIEST_DATE}")
    return value


class LeadCreate(BaseModel):
    name: PersonName
    email: EmailStr | None = None
    phone: Phone | None = None
    vehicle_id: VehicleRef | None = None
    budget: Amount | None = None
    source: Source | None = None
    notes: Notes | None = None
    follow_up_on: date | None = None
    status: LeadStatus = LeadStatus.NEW

    _blank = field_validator("email", "phone", "source", "notes", mode="before")(blank_to_none)
    _date = field_validator("follow_up_on")(_plausible)


class LeadUpdate(BaseModel):
    """Only the fields sent are changed; send null to clear an optional field."""

    model_config = ConfigDict(extra="forbid")

    name: PersonName | None = None
    email: EmailStr | None = None
    phone: Phone | None = None
    vehicle_id: VehicleRef | None = None
    budget: Amount | None = None
    source: Source | None = None
    notes: Notes | None = None
    follow_up_on: date | None = None
    status: LeadStatus | None = None

    _blank = field_validator("email", "phone", "source", "notes", mode="before")(blank_to_none)
    _date = field_validator("follow_up_on")(_plausible)

    @field_validator("name", "status")
    @classmethod
    def _required_when_sent(cls, value: object) -> object:
        if value is None:
            raise ValueError("can't be cleared")
        return value


class FollowUpFilter(enum.StrEnum):
    OVERDUE = "overdue"
    TODAY = "today"
    UPCOMING = "upcoming"  # the next 7 days, after today
    NONE = "none"  # open leads with no follow-up date


class LeadQuery(BaseModel):
    q: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None
    status: LeadStatus | None = None
    follow_up: FollowUpFilter | None = None
    tz: TimeZone = "UTC"
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0, le=1_000_000)


class LeadEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    kind: str
    old_value: str | None
    new_value: str | None
    created_at: datetime


class LeadOut(BaseModel):
    id: int
    name: str
    email: str | None
    phone: str | None
    vehicle_id: int | None
    vehicle_label: str | None
    budget: Money | None
    source: str | None
    notes: str | None
    follow_up_on: date | None
    status: LeadStatus
    created_at: datetime
    updated_at: datetime
    # The sale this lead converted into, if one was recorded from it.
    sale_id: int | None
    events: list[LeadEventOut]


class Reminders(BaseModel):
    overdue: int
    today: int
    upcoming: int


class LeadList(BaseModel):
    items: list[LeadOut]
    total: int
    counts: dict[LeadStatus, int]
    reminders: Reminders
