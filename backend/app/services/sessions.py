"""Sign-in sessions: rotating refresh tokens, revocation, and limits on failed sign-ins."""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import AppError
from app.models import LoginFailure, RefreshToken, User


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(UTC)


def _expired_session() -> AppError:
    return AppError(401, "SESSION_EXPIRED", "Your session has ended. Please sign in again.")


def start_session(db: Session, user: User, family_id: str | None = None) -> str:
    """Store (the hash of) a new refresh token and return the token itself."""
    token = secrets.token_urlsafe(32)
    db.add(
        RefreshToken(
            user_id=user.id,
            family_id=family_id or str(uuid.uuid4()),
            token_hash=_hash(token),
            expires_at=_now() + timedelta(days=get_settings().refresh_token_days),
        )
    )
    return token


def rotate_session(db: Session, token: str) -> tuple[User, str]:
    """Spend `token` for the next one in its session. Reusing a spent token ends the session,
    since only a copy (e.g. a stolen one) could still be presenting it."""
    # Locked so two concurrent refreshes can't both spend the same token.
    current = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == _hash(token)).with_for_update()
    )
    if current is None:
        raise _expired_session()
    if current.revoked_at is not None:
        _revoke_family(db, current.family_id)
        db.commit()
        raise _expired_session()
    if current.expires_at <= _now():
        raise _expired_session()
    user = db.get(User, current.user_id)
    if user is None:
        raise _expired_session()
    current.revoked_at = _now()
    next_token = start_session(db, user, current.family_id)
    db.commit()
    return user, next_token


def _revoke_family(db: Session, family_id: str) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now())
    )


def end_session(db: Session, token: str) -> None:
    """Sign out: the token's whole session stops working. Unknown tokens are ignored."""
    current = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == _hash(token)))
    if current is not None:
        _revoke_family(db, current.family_id)
        db.commit()


def end_all_sessions(db: Session, user: User) -> None:
    """Sign out everywhere: every refresh token, and every access token already issued."""
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now())
    )
    user.token_version += 1
    db.commit()


def check_login_allowed(db: Session, email: str, ip: str) -> None:
    """Refuse a sign-in attempt while this email or address has too many recent failures.

    Checked before the password, so a locked-out attempt can't confirm a guess.
    """
    settings = get_settings()
    since = _now() - timedelta(minutes=settings.login_window_minutes)
    for column, value, limit in (
        (LoginFailure.email, email, settings.login_max_failures_per_email),
        (LoginFailure.ip, ip, settings.login_max_failures_per_ip),
    ):
        count, oldest = db.execute(
            select(func.count(), func.min(LoginFailure.created_at)).where(
                column == value, LoginFailure.created_at > since
            )
        ).one()
        if count >= limit:
            # Seconds until the oldest counted failure leaves the window.
            retry_after = max(1, int((oldest - since).total_seconds()) + 1)
            minutes = -(-retry_after // 60)
            message = f"Too many failed sign-in attempts. Try again in {minutes} minute(s)."
            raise AppError(429, "TOO_MANY_ATTEMPTS", message, {"Retry-After": str(retry_after)})


def record_login_failure(db: Session, email: str, ip: str) -> None:
    settings = get_settings()
    # Old rows no longer count towards any limit, so they're pruned as new ones arrive.
    db.execute(
        delete(LoginFailure).where(
            LoginFailure.created_at < _now() - timedelta(minutes=settings.login_window_minutes)
        )
    )
    db.add(LoginFailure(email=email, ip=ip))
    db.commit()


def clear_login_failures(db: Session, email: str) -> None:
    """A successful sign-in forgives that email's failures (not the address's)."""
    db.execute(delete(LoginFailure).where(LoginFailure.email == email))
