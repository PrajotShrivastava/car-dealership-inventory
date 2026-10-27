from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.errors import AppError
from app.models import Role, User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserOut
from app.security import create_access_token, get_current_user, hash_password, verify_password
from app.services.sessions import (
    check_login_allowed,
    clear_login_failures,
    end_all_sessions,
    end_session,
    record_login_failure,
    rotate_session,
    start_session,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_EMAIL_TAKEN = AppError(409, "EMAIL_TAKEN", "An account with this email already exists")

# httpOnly, so page scripts (and any injected ones) can't read it; sent only to /api/auth.
REFRESH_COOKIE = "drivestock_refresh"
_COOKIE_PATH = "/api/auth"
RefreshCookie = Annotated[str | None, Cookie(alias=REFRESH_COOKIE)]


def _set_refresh_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=settings.refresh_token_days * 24 * 60 * 60,
        path=_COOKIE_PATH,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="strict",
    )


def _clear_refresh_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        REFRESH_COOKIE,
        path=_COOKIE_PATH,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="strict",
    )


def _signed_in(response: Response, user: User, refresh_token: str) -> TokenResponse:
    _set_refresh_cookie(response, refresh_token)
    return TokenResponse(access_token=create_access_token(user), user=UserOut.model_validate(user))


def _create_user(db: Session, payload: RegisterRequest, role: Role = Role.CUSTOMER) -> User:
    """Add (not commit) an account. The role is set by the endpoint, never by the request."""
    if db.scalar(select(User.id).where(User.email == payload.email)) is not None:
        raise _EMAIL_TAKEN
    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=role,
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


@router.post("/register-dealer", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register_dealer(payload: RegisterRequest, db: Session = Depends(get_db)) -> User:
    """Create a dealer account, usable straight away (no approval step)."""
    user = _create_user(db, payload, role=Role.DEALER)
    _commit_registration(db)
    return user


@router.post(
    "/login",
    response_model=TokenResponse,
    responses={429: {"description": "Too many failed attempts for this email or address"}},
)
def login(
    payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)
) -> TokenResponse:
    """Returns an access token and sets the refresh-token cookie for /auth/refresh."""
    # Behind a reverse proxy, run uvicorn with --proxy-headers so this is the real client.
    ip = request.client.host if request.client else "unknown"
    check_login_allowed(db, payload.email, ip)
    user = db.scalar(select(User).where(User.email == payload.email))
    # Always verify (against a dummy hash for unknown emails) to avoid a timing oracle.
    password_ok = verify_password(payload.password, user.password_hash if user else None)
    if user is None or not password_ok:
        record_login_failure(db, payload.email, ip)
        raise AppError(401, "INVALID_CREDENTIALS", "Invalid email or password")
    clear_login_failures(db, payload.email)
    refresh_token = start_session(db, user)
    db.commit()
    return _signed_in(response, user, refresh_token)


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    response: Response,
    refresh_token: RefreshCookie = None,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """A new access token from the refresh-token cookie, which is replaced at the same time."""
    if not refresh_token:
        raise AppError(401, "SESSION_EXPIRED", "Your session has ended. Please sign in again.")
    user, next_token = rotate_session(db, refresh_token)
    return _signed_in(response, user, next_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(refresh_token: RefreshCookie = None, db: Session = Depends(get_db)) -> Response:
    """End this browser's session. Works without an access token, e.g. after it expired."""
    if refresh_token:
        end_session(db, refresh_token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response)
    return response


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Response:
    """End every session of this account, including access tokens already issued."""
    end_all_sessions(db, user)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response)
    return response


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
