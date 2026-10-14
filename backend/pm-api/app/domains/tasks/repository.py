"""SQL access for the task board: reads over ``deliverables`` joined with their milestone, project and owner."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

import psycopg
from psycopg import sql

_SELECT = """
    SELECT d.*, m.project_id, p.name AS project_name, m.name AS milestone_name, a.name AS assignee_name,
           (d.due_date IS NOT NULL AND d.due_date < %(today)s AND d.status <> 'done') AS is_overdue
    FROM deliverables d
    JOIN milestones m ON m.id = d.milestone_id AND m.archived_at IS NULL
    JOIN projects p ON p.id = m.project_id
    LEFT JOIN users a ON a.id = d.assignee_id
    WHERE d.archived_at IS NULL
"""
# Urgent first, then soonest due, then oldest.
_ORDER = """
    ORDER BY CASE d.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
             d.due_date NULLS LAST, d.created_at
"""


def list_for_project(
    conn: psycopg.Connection[Any], project_id: uuid.UUID, today: dt.date, *, status: str | None, assignee_id: uuid.UUID | None,
    milestone_id: uuid.UUID | None,
) -> list[dict[str, Any]]:
    """Live tasks of a project's live milestones, with optional filters."""
    query = sql.SQL(
        """
        {base}
          AND m.project_id = %(project)s
          AND (%(status)s::text IS NULL OR d.status = %(status)s)
          AND (%(assignee)s::uuid IS NULL OR d.assignee_id = %(assignee)s)
          AND (%(milestone)s::uuid IS NULL OR d.milestone_id = %(milestone)s)
        {order}
        """
    ).format(base=sql.SQL(_SELECT), order=sql.SQL(_ORDER))
    params = {"today": today, "project": project_id, "status": status, "assignee": assignee_id, "milestone": milestone_id}
    return conn.execute(query, params).fetchall()


def list_mine(conn: psycopg.Connection[Any], user_id: uuid.UUID, today: dt.date) -> list[dict[str, Any]]:
    """Tasks owned by ``user_id`` on milestones where their work has not ended (so no access to the past)."""
    query = sql.SQL(
        """
        {base}
          AND p.archived_at IS NULL
          AND d.assignee_id = %(user)s
          AND EXISTS (SELECT 1 FROM milestone_assignments ma WHERE ma.milestone_id = d.milestone_id AND ma.user_id = %(user)s
                      AND ma.archived_at IS NULL AND ma.end_date >= %(today)s)
        ORDER BY d.due_date NULLS LAST,
                 CASE d.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, d.created_at
        """
    ).format(base=sql.SQL(_SELECT))
    return conn.execute(query, {"today": today, "user": user_id}).fetchall()
