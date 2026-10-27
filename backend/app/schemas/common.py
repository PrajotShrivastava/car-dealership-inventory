"""Field types shared by the API's schemas."""

from datetime import date, datetime
from decimal import Decimal
from functools import lru_cache
from typing import Annotated
from zoneinfo import ZoneInfo, available_timezones

from pydantic import AfterValidator, Field, PlainSerializer, StringConstraints

# Money as a fixed-point string ("1234.50"), like prices elsewhere in the API.
Money = Annotated[Decimal, PlainSerializer(lambda value: f"{value:.2f}", return_type=str)]
# An amount entered by a dealer: positive, at most 12 digits with 2 decimals.
Amount = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]
Cost = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]

PersonName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
# Digits with the usual separators, e.g. "+91 98765 43210" or "(555) 010-0100".
Phone = Annotated[
    str, StringConstraints(strip_whitespace=True, pattern=r"^\+?[0-9][0-9 ()\-.]{3,28}$")
]

EARLIEST_DATE = date(2000, 1, 1)


@lru_cache
def _timezones() -> frozenset[str]:
    return frozenset(available_timezones())


def _known_zone(value: str) -> str:
    if value not in _timezones():
        raise ValueError("must be an IANA time zone such as Europe/London")
    return value


# The viewer's IANA time zone, so "today" and "this month" are their calendar dates.
TimeZone = Annotated[str, Field(max_length=64), AfterValidator(_known_zone)]


def blank_to_none(value: str | None) -> str | None:
    return value or None


def today_in(tz: str, now: datetime | None = None) -> date:
    return (now or datetime.now(ZoneInfo(tz))).astimezone(ZoneInfo(tz)).date()
