from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ApplicationStatus, DealerApplication, User
from app.schemas.dealers import ApplicationOut, RejectRequest
from app.security import get_current_user, require_admin
from app.services.dealers import (
    application_for_user,
    approve_application,
    list_applications,
    reject_application,
)

router = APIRouter(prefix="/dealer-applications", tags=["dealer applications"])

ApplicationId = Annotated[int, Path(ge=1, le=2_147_483_647)]


@router.get("/me", response_model=ApplicationOut)
def my_application(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> DealerApplication:
    return application_for_user(db, user.id)


@router.get("", response_model=list[ApplicationOut])
def list_all(
    status: Annotated[ApplicationStatus | None, Query()] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[DealerApplication]:
    return list(list_applications(db, status))


@router.post("/{application_id}/approve", response_model=ApplicationOut)
def approve(
    application_id: ApplicationId,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> DealerApplication:
    return approve_application(db, application_id, admin.id)


@router.post("/{application_id}/reject", response_model=ApplicationOut)
def reject(
    application_id: ApplicationId,
    payload: RejectRequest | None = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> DealerApplication:
    return reject_application(db, application_id, admin.id, payload.note if payload else None)
