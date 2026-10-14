"""SQL access for ``audit_log``. The log is written by database triggers (migration 004); the API only reads it."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

import psycopg


def _where(
    *, project_id: uuid.UUID | None, actor_id: uuid.UUID | None, entity: str | None, action: str | None,
    day_from: dt.date | None, day_to: dt.date | None,
) -> tuple[str, list[Any]]:
    """WHERE clause for the optional filters; values are always bound, never formatted into the text."""
    clauses, params = [], []
    for column, value in (("a.project_id", project_id), ("a.actor_id", actor_id), ("a.entity", entity), ("a.action", action)):
        if value is not None:
            clauses.append(f"{column} = %s")
            params.append(value)
    if day_from is not None:
        clauses.append("a.occurred_at >= %s::date")  # midnight UTC: the session and the column are UTC
        params.append(day_from)
    if day_to is not None:
        clauses.append("a.occurred_at < %s::date + 1")
        params.append(day_to)
    return (" WHERE " + " AND ".join(clauses)) if clauses else "", params


def search(
    conn: psycopg.Connection[Any], *, project_id: uuid.UUID | None = None, actor_id: uuid.UUID | None = None,
    entity: str | None = None, action: str | None = None, day_from: dt.date | None = None, day_to: dt.date | None = None,
    limit: int, offset: int,
) -> tuple[list[dict[str, Any]], int]:
    """One page of history, newest first, and the total number of matching entries."""
    where, params = _where(
        project_id=project_id, actor_id=actor_id, entity=entity, action=action, day_from=day_from, day_to=day_to
    )
    total = conn.execute(f"SELECT count(*) AS n FROM audit_log a{where}", params).fetchone()["n"]  # noqa: S608  # nosec B608 - fixed text, bound values
    rows = conn.execute(
        f"""
        SELECT a.*, p.name AS project_name
        FROM audit_log a LEFT JOIN projects p ON p.id = a.project_id{where}
        ORDER BY a.occurred_at DESC, a.id DESC LIMIT %s OFFSET %s
        """,  # noqa: S608  # nosec B608 - fixed text, bound values
        [*params, limit, offset],
    ).fetchall()
    return rows, total


def user_names(conn: psycopg.Connection[Any], ids: set[uuid.UUID]) -> dict[str, str]:
    """Current names for a set of user ids, keyed by the id as text."""
    if not ids:
        return {}
    rows = conn.execute("SELECT id, name FROM users WHERE id = ANY(%s)", (list(ids),)).fetchall()
    return {str(r["id"]): r["name"] for r in rows}
