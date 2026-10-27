from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas.account import AccountEnquiryList, AccountPage, AccountPurchaseList
from app.schemas.common import TimeZone
from app.security import require_customer
from app.services.account import get_purchase, list_enquiries, list_purchases, seller_of
from app.services.invoice import render_invoice

router = APIRouter(prefix="/account", tags=["account"])

PurchaseId = Annotated[int, Path(ge=1, le=2_147_483_647)]


@router.get("/purchases", response_model=AccountPurchaseList)
def purchases(
    page: Annotated[AccountPage, Query()],
    db: Session = Depends(get_db),
    customer: User = Depends(require_customer),
) -> AccountPurchaseList:
    """The signed-in customer's purchases, newest first."""
    return list_purchases(db, customer.id, page)


@router.get(
    "/purchases/{purchase_id}/invoice",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}, "description": "The invoice as a PDF"}},
)
def purchase_invoice(
    purchase_id: PurchaseId,
    tz: Annotated[TimeZone, Query()] = "UTC",
    db: Session = Depends(get_db),
    customer: User = Depends(require_customer),
) -> Response:
    purchase = get_purchase(db, customer.id, purchase_id)
    name, email = seller_of(db, purchase)
    pdf = render_invoice(purchase, dealer_name=name, dealer_email=email, tz=tz)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="invoice-{purchase.id}.pdf"'},
    )


@router.get("/enquiries", response_model=AccountEnquiryList)
def enquiries(
    page: Annotated[AccountPage, Query()],
    db: Session = Depends(get_db),
    customer: User = Depends(require_customer),
) -> AccountEnquiryList:
    """Questions and test drive requests the customer sent, newest first, with their progress."""
    return list_enquiries(db, customer.id, page)
