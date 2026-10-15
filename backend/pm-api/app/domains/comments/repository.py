"""SQL access for ``task_comments``. A removed comment is archived, never deleted."""

from __future__ import annotations

import uuid
from typing import Any

import psycopg

_SELECT = """
    SELECT c.id, c.deliverable_id, c.author_id, u.name AS author_name, c.body, c.created_at
    FROM task_comments c JOIN users u ON u.id = c.author_id
"""


def list_for_task(conn: psycopg.Connection[Any], deliverable_id: uuid.UUID) -> list[dict[str, Any]]:
    """The live comments of a task, oldest first."""
    return conn.execute(
        f"{_SELECT} WHERE c.deliverable_id = %s AND c.archived_at IS NULL ORDER BY c.created_at, c.id",  # noqa: S608
        (deliverable_id,),
    ).fetchall()


def get(conn: psycopg.Connection[Any], deliverable_id: uuid.UUID, comment_id: uuid.UUID) -> dict[str, Any] | None:
    """One live comment of a task."""
    return conn.execute(
        f"{_SELECT} WHERE c.id = %s AND c.deliverable_id = %s AND c.archived_at IS NULL",  # noqa: S608
        (comment_id, deliverable_id),
    ).fetchone()


def insert(conn: psycopg.Connection[Any], deliverable_id: uuid.UUID, author_id: uuid.UUID, body: str) -> dict[str, Any]:
    """Add a comment and return it with its author's name."""
    new = conn.execute(
        "INSERT INTO task_comments (deliverable_id, author_id, body) VALUES (%s, %s, %s) RETURNING id",
        (deliverable_id, author_id, body),
    ).fetchone()
    row = get(conn, deliverable_id, new["id"]) if new else None
    if row is None:  # pragma: no cover - the row was just inserted in this transaction
        raise RuntimeError("INSERT INTO task_comments returned no row")
    return row


def archive(conn: psycopg.Connection[Any], comment_id: uuid.UUID) -> None:
    """Take a comment out of view."""
    conn.execute("UPDATE task_comments SET archived_at = now() WHERE id = %s", (comment_id,))
