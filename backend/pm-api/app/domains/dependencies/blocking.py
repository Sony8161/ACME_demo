"""The rule that a milestone or project cannot be started or completed while something it waits for is unfinished.

Kept apart from the service so the milestone and project services can use it without importing each other.
"""

from __future__ import annotations

import uuid
from typing import Any

import psycopg

from app.core.errors import ConflictError
from app.domains.dependencies import repository as repo


def _unfinished(rows: list[dict[str, Any]]) -> list[str]:
    """Names of what is still unfinished: not completed, and not cancelled or archived away."""
    return [
        f"{r['name']} ({r['project_name']})" if r["project_id"] != r["item_id"] else r["name"]
        for r in rows
        if r["status"] != "completed" and r["archived_at"] is None
    ]


def _refuse(subject: str, action: str, names: list[str]) -> None:
    shown = ", ".join(names[:3]) + (f" and {len(names) - 3} more" if len(names) > 3 else "")
    raise ConflictError(
        f"This {subject} cannot be {action} yet: it is waiting for {shown}. Finish that first, or remove the dependency.",
        code="blocked",
        details=[{"field": "dependencies", "message": n} for n in names],
    )


def assert_milestone_free(conn: psycopg.Connection[Any], milestone_id: uuid.UUID, action: str) -> None:
    """Raise a 409 ``blocked`` when the milestone waits for an unfinished milestone."""
    names = _unfinished(repo.milestone_links(conn, milestone_id, waiting=True))
    if names:
        _refuse("milestone", action, names)


def assert_project_free(conn: psycopg.Connection[Any], project_id: uuid.UUID, action: str) -> None:
    """Raise a 409 ``blocked`` when the project waits for an unfinished project."""
    names = _unfinished(repo.project_links(conn, project_id, waiting=True))
    if names:
        _refuse("project", action, names)
