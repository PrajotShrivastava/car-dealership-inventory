from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import AppError
from app.models import DealerApplication, User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserOut
from app.schemas.dealers import ApplicationOut, DealerRegisterRequest, DealerRegisterResponse
from app.security import create_access_token, get_current_user, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

_EMAIL_TAKEN = AppError(409, "EMAIL_TAKEN", "An account with this email already exists")


def _create_user(db: Session, payload: RegisterRequest) -> User:
    """Add (not commit) a customer account; admin rights only ever come from approval."""
    if db.scalar(select(User.id).where(User.email == payload.email)) is not None:
        raise _EMAIL_TAKEN
    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
    )
    db.add(user)
    return user


def _commit_registration(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:  # concurrent registration with the same email
        db.rollback()
        raise _EMAIL_TAKEN from exc


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> User:
    user = _create_user(db, payload)
    _commit_registration(db)
    return user


@router.post(
    "/register-dealer", response_model=DealerRegisterResponse, status_code=status.HTTP_201_CREATED
)
def register_dealer(
    payload: DealerRegisterRequest, db: Session = Depends(get_db)
) -> DealerRegisterResponse:
    """Create a customer account plus a *pending* dealer application in one transaction."""
    user = _create_user(db, payload)
    db.flush()
    application = DealerApplication(
        user_id=user.id,
        business_name=payload.business_name,
        phone=payload.phone,
        message=payload.message,
    )
    db.add(application)
    _commit_registration(db)
    db.refresh(application)
    return DealerRegisterResponse(
        user=UserOut.model_validate(user), application=ApplicationOut.model_validate(application)
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email))
    # Always verify (against a dummy hash for unknown emails) to avoid a timing oracle.
    password_ok = verify_password(payload.password, user.password_hash if user else None)
    if user is None or not password_ok:
        raise AppError(401, "INVALID_CREDENTIALS", "Invalid email or password")
    return TokenResponse(
        access_token=create_access_token(user.id), user=UserOut.model_validate(user)
    )


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
