from datetime import date, datetime
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, field_validator

from app.models import Category, LeadStatus, SaleChannel
from app.schemas.common import Money, TimeZone
from app.schemas.vehicles import PhotoOut

MONTH_RANGES = (3, 6, 12)


class DashboardQuery(BaseModel):
    months: int = 6
    tz: TimeZone = "UTC"

    @field_validator("months")
    @classmethod
    def _offered_range(cls, value: int) -> int:
        if value not in MONTH_RANGES:
            raise ValueError("months must be 3, 6 or 12")
        return value

    @property
    def zone(self) -> ZoneInfo:
        return ZoneInfo(self.tz)


class DashboardSummary(BaseModel):
    total_listings: int
    available_stock: int
    in_stock: int
    low_stock: int
    out_of_stock: int
    never_sold: int
    low_stock_threshold: int
    inventory_value: Money
    units_sold: int
    # Completed sale transactions (one purchase of several units is one sale).
    sales_count: int
    total_revenue: Money
    # Selling price minus acquisition cost, over sales whose cost is known; None if none are.
    gross_profit: Money | None
    sales_with_cost: int
    units_sold_this_month: int
    revenue_this_month: Money
    units_sold_last_month: int
    revenue_last_month: Money
    # False until the dealer has a sale before the current month: no comparison is shown.
    has_sales_before_this_month: bool


class MonthlySales(BaseModel):
    month: str  # "2026-10"
    units: int
    revenue: Money


class DashboardVehicle(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    make: str
    model: str
    trim: str | None
    year: int
    category: Category
    price: Money
    quantity: int
    units_sold: int
    revenue: Money
    photo: PhotoOut | None
    created_at: datetime


class TopVehicle(BaseModel):
    label: str
    units_sold: int
    revenue: Money
    # None when the vehicle has since been deleted; its sales still count.
    vehicle: DashboardVehicle | None


class RecentSale(BaseModel):
    id: int
    channel: SaleChannel
    created_at: datetime  # the sale date (sold_at)
    customer_name: str | None
    vehicle_id: int | None
    vehicle_label: str
    quantity: int
    unit_price: Money
    total_price: Money


class FollowUp(BaseModel):
    id: int
    name: str
    status: LeadStatus
    follow_up_on: date
    vehicle_label: str | None


class FollowUps(BaseModel):
    """Open leads (not converted or lost) due for a follow-up, by the dealer's local date."""

    overdue: int
    today: int
    upcoming: int  # within the next 7 days
    items: list[FollowUp]


class DashboardOut(BaseModel):
    timezone: str
    summary: DashboardSummary
    monthly: list[MonthlySales]
    best_seller: TopVehicle | None
    top_revenue: TopVehicle | None
    top_sellers: list[TopVehicle]
    low_stock: list[DashboardVehicle]
    out_of_stock: list[DashboardVehicle]
    never_sold: list[DashboardVehicle]
    recent_listings: list[DashboardVehicle]
    recent_sales: list[RecentSale]
    follow_ups: FollowUps
