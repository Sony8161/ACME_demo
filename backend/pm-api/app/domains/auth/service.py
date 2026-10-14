"""Authentication rules."""

from __future__ import annotations

import math
from typing import Any

import psycopg

from app.config import get_settings
from app.core import dates, security
from app.core.deps import CurrentUser
from app.core.errors import AuthError, TooManyRequestsError, ValidationError
from app.domains.auth.schemas import TokenResponse
from app.domains.users import repository as users_repo
from app.domains.users.schemas import UserOut

_INVALID_CREDENTIALS = "Invalid username or password"


def _token_response(row: dict[str, Any]) -> TokenResponse:
    token, expires_at = security.create_access_token(
        user_id=str(row["id"]), role=row["role"], token_version=row["token_version"]
    )
    return TokenResponse(access_token=token, expires_at=expires_at, user=UserOut.model_validate(row))


def login(conn: psycopg.Connection[Any], username: str, password: str) -> TokenResponse:
    """Verify credentials and issue an access token."""
    settings = get_settings()
    row = users_repo.get_auth_by_username(conn, username.strip())
    if row is None:
        security.verify_against_dummy()
        raise AuthError(_INVALID_CREDENTIALS, code="invalid_credentials")
    if row["locked_until"] is not None and row["locked_until"] > dates.now():
        # Even the right password is refused while locked, so guessing cannot continue past the limit.
        wait = max(1, math.ceil((row["locked_until"] - dates.now()).total_seconds()))
        raise TooManyRequestsError(
            f"Too many failed sign-ins. Try again in {math.ceil(wait / 60)} minute(s), or ask an admin for a new password.",
            code="account_locked",
            headers={"Retry-After": str(wait)},
        )
    if not security.verify_password(password, row["password_hash"]):
        users_repo.record_failed_login(conn, row["id"], settings.max_failed_logins, settings.login_lock_minutes)
        # Commit now: the request is about to fail with a 401, which rolls back, and the count must survive that.
        conn.commit()
        raise AuthError(_INVALID_CREDENTIALS, code="invalid_credentials")
    if row["archived_at"] is not None:
        raise AuthError("This account has been archived", code="account_inactive")
    if row["failed_logins"] or row["locked_until"] is not None:
        users_repo.clear_failed_logins(conn, row["id"])
    return _token_response(row)


def refresh(conn: psycopg.Connection[Any], user: CurrentUser) -> TokenResponse:
    """Issue a fresh token for a still-valid session (sliding expiry)."""
    row = users_repo.get_by_id(conn, user.id)
    if row is None or row["archived_at"] is not None:
        raise AuthError("This account is no longer active", code="account_inactive")
    return _token_response(row)


def change_password(
    conn: psycopg.Connection[Any], user: CurrentUser, current_password: str, new_password: str
) -> TokenResponse:
    """Change the caller's password; returns a new token because old ones are revoked."""
    row = users_repo.get_auth_by_username(conn, user.username)
    if row is None or not security.verify_password(current_password, row["password_hash"]):
        raise ValidationError(
            "Current password is incorrect",
            details=[{"field": "current_password", "message": "Current password is incorrect"}],
        )
    if current_password == new_password:
        raise ValidationError(
            "New password must differ from the current password",
            details=[{"field": "new_password", "message": "Must differ from the current password"}],
        )
    security.validate_password_strength(new_password)
    updated = users_repo.set_password(
        conn, user.id, security.hash_password(new_password), must_change_password=False
    )
    if updated is None:  # pragma: no cover - the user was loaded a moment ago
        raise AuthError("This account is no longer active", code="account_inactive")
    return _token_response(updated)
