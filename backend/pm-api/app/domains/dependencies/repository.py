"""SQL access for ``milestone_dependencies`` and ``project_dependencies``. A link is archived, never deleted."""

from __future__ import annotations

import uuid
from typing import Any, Literal

import psycopg
from psycopg import sql

Kind = Literal["milestone", "project"]
_TABLE = {"milestone": "milestone_dependencies", "project": "project_dependencies"}


def _table(kind: Kind) -> sql.Identifier:
    return sql.Identifier(_TABLE[kind])


def milestone_info(conn: psycopg.Connection[Any], milestone_id: uuid.UUID) -> dict[str, Any] | None:
    """A milestone with its project, whoever may see it (callers decide who may know about it)."""
    return conn.execute(
        """
        SELECT m.id, m.name, m.project_id, m.status, m.archived_at, m.start_date, m.due_date,
               p.name AS project_name, p.manager_id, p.archived_at AS project_archived_at
        FROM milestones m JOIN projects p ON p.id = m.project_id WHERE m.id = %s
        """,
        (milestone_id,),
    ).fetchone()


def project_info(conn: psycopg.Connection[Any], project_id: uuid.UUID) -> dict[str, Any] | None:
    """A project row for dependency checks."""
    return conn.execute("SELECT id, name, manager_id, status, archived_at FROM projects WHERE id = %s", (project_id,)).fetchone()


def exists(conn: psycopg.Connection[Any], kind: Kind, predecessor: uuid.UUID, successor: uuid.UUID) -> bool:
    """True when this link is already live."""
    query = sql.SQL("SELECT 1 FROM {t} WHERE predecessor_id = %s AND successor_id = %s AND archived_at IS NULL").format(
        t=_table(kind)
    )
    return conn.execute(query, (predecessor, successor)).fetchone() is not None


def would_loop(conn: psycopg.Connection[Any], kind: Kind, predecessor: uuid.UUID, successor: uuid.UUID) -> bool:
    """True when ``predecessor`` already waits (directly or through others) for ``successor``: a link would close a circle."""
    query = sql.SQL(
        """
        WITH RECURSIVE later(id) AS (
            SELECT successor_id FROM {t} WHERE predecessor_id = %(start)s AND archived_at IS NULL
            UNION
            SELECT d.successor_id FROM {t} d JOIN later l ON d.predecessor_id = l.id WHERE d.archived_at IS NULL
        )
        SELECT 1 FROM later WHERE id = %(target)s LIMIT 1
        """
    ).format(t=_table(kind))
    return conn.execute(query, {"start": successor, "target": predecessor}).fetchone() is not None


def insert(
    conn: psycopg.Connection[Any], kind: Kind, predecessor: uuid.UUID, successor: uuid.UUID, created_by: uuid.UUID
) -> uuid.UUID:
    """Add a link and return its id."""
    query = sql.SQL("INSERT INTO {t} (predecessor_id, successor_id, created_by) VALUES (%s, %s, %s) RETURNING id").format(
        t=_table(kind)
    )
    row = conn.execute(query, (predecessor, successor, created_by)).fetchone()
    if row is None:  # pragma: no cover - RETURNING always yields the inserted row
        raise RuntimeError("INSERT returned no row")
    return row["id"]


def get_live(conn: psycopg.Connection[Any], kind: Kind, dependency_id: uuid.UUID, successor: uuid.UUID) -> dict[str, Any] | None:
    """A live link, looked up through the milestone or project that waits."""
    query = sql.SQL("SELECT * FROM {t} WHERE id = %s AND successor_id = %s AND archived_at IS NULL").format(t=_table(kind))
    return conn.execute(query, (dependency_id, successor)).fetchone()


def archive(conn: psycopg.Connection[Any], kind: Kind, dependency_id: uuid.UUID) -> None:
    """Remove a link from the plan (archived, never deleted)."""
    conn.execute(sql.SQL("UPDATE {t} SET archived_at = now() WHERE id = %s").format(t=_table(kind)), (dependency_id,))


def milestone_links(conn: psycopg.Connection[Any], milestone_id: uuid.UUID, *, waiting: bool) -> list[dict[str, Any]]:
    """Live links of a milestone with the milestone on the other end (``waiting``: what it waits for, else what waits for it)."""
    mine, other = ("successor_id", "predecessor_id") if waiting else ("predecessor_id", "successor_id")
    query = sql.SQL(
        """
        SELECT d.id AS dependency_id, o.id AS item_id, o.name, o.project_id, p.name AS project_name, o.status, o.archived_at,
               (s.start_date < pr.due_date) AS schedule_conflict
        FROM milestone_dependencies d
        JOIN milestones o ON o.id = d.{other}
        JOIN projects p ON p.id = o.project_id
        JOIN milestones s ON s.id = d.successor_id
        JOIN milestones pr ON pr.id = d.predecessor_id
        WHERE d.{mine} = %s AND d.archived_at IS NULL
        ORDER BY o.due_date, lower(o.name)
        """
    ).format(mine=sql.Identifier(mine), other=sql.Identifier(other))
    return conn.execute(query, (milestone_id,)).fetchall()


def project_links(conn: psycopg.Connection[Any], project_id: uuid.UUID, *, waiting: bool) -> list[dict[str, Any]]:
    """Live links of a project with the project on the other end (same meaning of ``waiting``)."""
    mine, other = ("successor_id", "predecessor_id") if waiting else ("predecessor_id", "successor_id")
    query = sql.SQL(
        """
        SELECT d.id AS dependency_id, o.id AS item_id, o.name, o.id AS project_id, o.name AS project_name,
               o.status, o.archived_at,
               false AS schedule_conflict
        FROM project_dependencies d JOIN projects o ON o.id = d.{other}
        WHERE d.{mine} = %s AND d.archived_at IS NULL
        ORDER BY o.start_date, lower(o.name)
        """
    ).format(mine=sql.Identifier(mine), other=sql.Identifier(other))
    return conn.execute(query, (project_id,)).fetchall()
