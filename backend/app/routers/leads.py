from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas.leads import LeadCreate, LeadList, LeadOut, LeadQuery, LeadUpdate
from app.security import require_dealer
from app.services.leads import create_lead, get_lead, list_leads, one_lead, update_lead

router = APIRouter(prefix="/leads", tags=["leads"])

LeadId = Annotated[int, Path(ge=1, le=2_147_483_647)]


@router.get("", response_model=LeadList)
def leads(
    query: Annotated[LeadQuery, Query()],
    db: Session = Depends(get_db),
    dealer: User = Depends(require_dealer),
) -> LeadList:
    """The dealer's leads, next follow-up first; follow-up filters use the `tz` date."""
    return list_leads(db, dealer.id, query)


@router.post("", response_model=LeadOut, status_code=status.HTTP_201_CREATED)
def new_lead(
    payload: LeadCreate, db: Session = Depends(get_db), dealer: User = Depends(require_dealer)
) -> LeadOut:
    return one_lead(db, create_lead(db, dealer.id, payload))


@router.get("/{lead_id}", response_model=LeadOut)
def lead(
    lead_id: LeadId, db: Session = Depends(get_db), dealer: User = Depends(require_dealer)
) -> LeadOut:
    return one_lead(db, get_lead(db, dealer.id, lead_id))


@router.patch("/{lead_id}", response_model=LeadOut)
def edit_lead(
    lead_id: LeadId,
    payload: LeadUpdate,
    db: Session = Depends(get_db),
    dealer: User = Depends(require_dealer),
) -> LeadOut:
    """Change any of the lead's details, its status or its next follow-up."""
    return one_lead(db, update_lead(db, dealer.id, lead_id, payload))
