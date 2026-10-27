"""A customer's own purchases and enquiries, as they may see them."""

import enum
from datetime import datetime

from pydantic import BaseModel, Field

from app.models import EnquiryKind
from app.schemas.common import Money


class AccountPage(BaseModel):
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0, le=1_000_000)


class AccountPurchase(BaseModel):
    """Never includes the dealer's cost or profit."""

    id: int
    invoice_number: str
    vehicle_id: int | None
    vehicle_label: str
    quantity: int
    unit_price: Money
    total_price: Money
    sold_at: datetime
    # The dealer's name, or the store's for vehicles no dealer listed.
    seller: str


class AccountPurchaseList(BaseModel):
    items: list[AccountPurchase]
    total: int


class EnquiryProgress(enum.StrEnum):
    """The dealer's pipeline, simplified for the customer; their notes are never shown."""

    SENT = "sent"  # not yet picked up
    IN_PROGRESS = "in_progress"  # contacted or negotiating
    TEST_DRIVE_SCHEDULED = "test_drive_scheduled"
    COMPLETED = "completed"  # converted into a sale
    CLOSED = "closed"


class AccountEnquiry(BaseModel):
    id: int
    kind: EnquiryKind | None
    vehicle_id: int | None
    vehicle_label: str | None
    progress: EnquiryProgress
    sent_at: datetime


class AccountEnquiryList(BaseModel):
    items: list[AccountEnquiry]
    total: int
