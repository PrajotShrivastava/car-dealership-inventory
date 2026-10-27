from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas.dashboard import DashboardOut, DashboardQuery
from app.security import require_dealer
from app.services.dashboard import build_dashboard

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def dashboard(
    query: Annotated[DashboardQuery, Query()],
    db: Session = Depends(get_db),
    dealer: User = Depends(require_dealer),
) -> DashboardOut:
    """The signed-in dealer's sales and inventory figures; months follow `tz`."""
    return build_dashboard(db, dealer.id, months=query.months, tz=query.zone, now=datetime.now(UTC))
