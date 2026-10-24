"""Dealer onboarding: applications are approved or rejected by an existing admin."""

from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import ApplicationStatus, DealerApplication, Role, User


def _not_found(application_id: int) -> AppError:
    return AppError(404, "APPLICATION_NOT_FOUND", f"Dealer application {application_id} not found")


def list_applications(
    db: Session, status: ApplicationStatus | None = None
) -> Sequence[DealerApplication]:
    stmt = select(DealerApplication).order_by(DealerApplication.created_at, DealerApplication.id)
    if status is not None:
        stmt = stmt.where(DealerApplication.status == status)
    return db.scalars(stmt).all()


def application_for_user(db: Session, user_id: int) -> DealerApplication:
    application = db.scalar(select(DealerApplication).where(DealerApplication.user_id == user_id))
    if application is None:
        raise AppError(404, "APPLICATION_NOT_FOUND", "You have not applied to become a dealer")
    return application


def _review(
    db: Session,
    application_id: int,
    reviewer_id: int,
    status: ApplicationStatus,
    note: str | None = None,
) -> DealerApplication:
    """Move a *pending* application to `status` in one conditional UPDATE.

    Only one reviewer can win, even if several act at the same moment.
    """
    user_id = db.scalar(
        update(DealerApplication)
        .where(
            DealerApplication.id == application_id,
            DealerApplication.status == ApplicationStatus.PENDING,
        )
        .values(
            status=status,
            reviewed_at=datetime.now(UTC),
            reviewed_by_id=reviewer_id,
            review_note=note,
        )
        .returning(DealerApplication.user_id)
        .execution_options(synchronize_session=False)
    )
    if user_id is None:
        db.rollback()
        if db.get(DealerApplication, application_id) is None:
            raise _not_found(application_id)
        raise AppError(409, "APPLICATION_NOT_PENDING", "This application has already been reviewed")
    if status is ApplicationStatus.APPROVED:
        db.execute(
            update(User)
            .where(User.id == user_id)
            .values(role=Role.ADMIN)
            .execution_options(synchronize_session=False)
        )
    db.commit()
    application = db.get(DealerApplication, application_id, populate_existing=True)
    if application is None:  # pragma: no cover - deleted concurrently
        raise _not_found(application_id)
    db.refresh(application.applicant)
    return application


def approve_application(db: Session, application_id: int, reviewer_id: int) -> DealerApplication:
    return _review(db, application_id, reviewer_id, ApplicationStatus.APPROVED)


def reject_application(
    db: Session, application_id: int, reviewer_id: int, note: str | None
) -> DealerApplication:
    return _review(db, application_id, reviewer_id, ApplicationStatus.REJECTED, note)
