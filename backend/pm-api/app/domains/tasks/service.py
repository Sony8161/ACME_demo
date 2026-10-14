"""Reading the task board: who may see which tasks."""

from __future__ import annotations

import uuid
from typing import Any

import psycopg

from app.core import dates
from app.core.deps import CurrentUser
from app.domains.projects import service as projects
from app.domains.tasks import repository as repo
from app.domains.tasks.schemas import TaskList, TaskOut


def _out(rows: list[dict[str, Any]]) -> TaskList:
    return TaskList(items=[TaskOut.model_validate(r) for r in rows], total=len(rows))


def project_tasks(
    conn: psycopg.Connection[Any], actor: CurrentUser, project_id: uuid.UUID, *, status: str | None,
    assignee_id: uuid.UUID | None, milestone_id: uuid.UUID | None,
) -> TaskList:
    """Every live task of a project you may see (an employee sees the project while their work on it has not ended)."""
    projects.get_visible(conn, actor, project_id)
    rows = repo.list_for_project(
        conn, project_id, dates.today(), status=status, assignee_id=assignee_id, milestone_id=milestone_id
    )
    return _out(rows)


def my_tasks(conn: psycopg.Connection[Any], actor: CurrentUser) -> TaskList:
    """Tasks that are mine, soonest due first."""
    return _out(repo.list_mine(conn, actor.id, dates.today()))
