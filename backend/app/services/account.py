"""The signed-in customer's purchases (with invoices) and the enquiries they sent."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import Lead, LeadStatus, Purchase, User
from app.schemas.account import (
    AccountEnquiry,
    AccountEnquiryList,
    AccountPage,
    AccountPurchase,
    AccountPurchaseList,
    EnquiryProgress,
)
from app.services.invoice import invoice_number

# Shown as the seller when no dealer listed the vehicle (or the dealer's account is gone).
STORE_NAME = "DriveStock"

PROGRESS = {
    LeadStatus.NEW: EnquiryProgress.SENT,
    LeadStatus.CONTACTED: EnquiryProgress.IN_PROGRESS,
    LeadStatus.NEGOTIATION: EnquiryProgress.IN_PROGRESS,
    LeadStatus.TEST_DRIVE_SCHEDULED: EnquiryProgress.TEST_DRIVE_SCHEDULED,
    LeadStatus.CONVERTED: EnquiryProgress.COMPLETED,
    LeadStatus.LOST: EnquiryProgress.CLOSED,
}


def seller_of(db: Session, purchase: Purchase) -> tuple[str, str | None]:
    """The seller's name and email for the customer's invoice."""
    dealer = db.get(User, purchase.dealer_id) if purchase.dealer_id is not None else None
    return (dealer.full_name, dealer.email) if dealer else (STORE_NAME, None)


def get_purchase(db: Session, customer_id: int, purchase_id: int) -> Purchase:
    """The customer's own purchase; anyone else's is reported as missing."""
    purchase = db.get(Purchase, purchase_id)
    if purchase is None or purchase.user_id != customer_id:
        raise AppError(404, "PURCHASE_NOT_FOUND", f"Purchase {purchase_id} not found")
    return purchase


def list_purchases(db: Session, customer_id: int, page: AccountPage) -> AccountPurchaseList:
    mine = Purchase.user_id == customer_id
    purchases = db.scalars(
        select(Purchase)
        .where(mine)
        .order_by(Purchase.sold_at.desc(), Purchase.id.desc())
        .limit(page.limit)
        .offset(page.offset)
    ).all()
    dealer_ids = {p.dealer_id for p in purchases if p.dealer_id is not None}
    names: dict[int, str] = {
        dealer_id: name
        for dealer_id, name in db.execute(
            select(User.id, User.full_name).where(User.id.in_(dealer_ids))
        )
    }
    return AccountPurchaseList(
        items=[
            AccountPurchase(
                id=p.id,
                invoice_number=invoice_number(p.id),
                vehicle_id=p.vehicle_id,
                vehicle_label=p.vehicle_label,
                quantity=p.quantity,
                unit_price=p.unit_price,
                total_price=p.total_price,
                sold_at=p.sold_at,
                seller=names.get(p.dealer_id, STORE_NAME) if p.dealer_id else STORE_NAME,
            )
            for p in purchases
        ],
        total=db.scalar(select(func.count()).select_from(Purchase).where(mine)) or 0,
    )


def list_enquiries(db: Session, customer_id: int, page: AccountPage) -> AccountEnquiryList:
    mine = Lead.customer_id == customer_id
    leads = db.scalars(
        select(Lead)
        .where(mine)
        .order_by(Lead.created_at.desc(), Lead.id.desc())
        .limit(page.limit)
        .offset(page.offset)
    ).all()
    return AccountEnquiryList(
        items=[
            AccountEnquiry(
                id=lead.id,
                kind=lead.enquiry_kind,
                vehicle_id=lead.vehicle_id,
                vehicle_label=lead.vehicle_label,
                progress=PROGRESS[lead.status],
                sent_at=lead.created_at,
            )
            for lead in leads
        ],
        total=db.scalar(select(func.count()).select_from(Lead).where(mine)) or 0,
    )
