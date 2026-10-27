from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas.common import TimeZone
from app.schemas.sales import SaleCreate, SaleList, SaleOut, SaleQuery
from app.security import require_dealer
from app.services.invoice import render_invoice
from app.services.sales import get_sale, list_sales, record_sale, sale_out

router = APIRouter(prefix="/sales", tags=["sales"])

SaleId = Annotated[int, Path(ge=1, le=2_147_483_647)]


@router.get("", response_model=SaleList)
def sales(
    query: Annotated[SaleQuery, Query()],
    db: Session = Depends(get_db),
    dealer: User = Depends(require_dealer),
) -> SaleList:
    """The signed-in dealer's completed sales, newest first, with totals for the filters."""
    return list_sales(db, dealer.id, query)


@router.post(
    "",
    response_model=SaleOut,
    status_code=status.HTTP_201_CREATED,
    responses={200: {"description": "Already recorded: the same request_id was sent before"}},
)
def create_sale(
    payload: SaleCreate,
    response: Response,
    db: Session = Depends(get_db),
    dealer: User = Depends(require_dealer),
) -> SaleOut:
    """Record a sale of one of the dealer's vehicles, taking the units out of stock."""
    sale, created = record_sale(db, dealer, payload)
    if not created:
        response.status_code = status.HTTP_200_OK
    return sale_out(sale)


@router.get("/{sale_id}", response_model=SaleOut)
def sale(
    sale_id: SaleId, db: Session = Depends(get_db), dealer: User = Depends(require_dealer)
) -> SaleOut:
    return sale_out(get_sale(db, dealer.id, sale_id))


@router.get(
    "/{sale_id}/invoice",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}, "description": "The invoice as a PDF"}},
)
def invoice(
    sale_id: SaleId,
    tz: Annotated[TimeZone, Query()] = "UTC",
    db: Session = Depends(get_db),
    dealer: User = Depends(require_dealer),
) -> Response:
    sale = get_sale(db, dealer.id, sale_id)
    pdf = render_invoice(sale, dealer_name=dealer.full_name, dealer_email=dealer.email, tz=tz)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="invoice-{sale.id}.pdf"'},
    )
