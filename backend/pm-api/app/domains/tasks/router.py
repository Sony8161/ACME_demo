"""HTTP endpoints for the task board (read only: tasks are edited through the deliverables endpoints)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.core.deps import ActiveUser, DbConn
from app.domains.deliverables.schemas import TaskStatus
from app.domains.tasks import service
from app.domains.tasks.schemas import TaskList

project_tasks_router = APIRouter(prefix="/projects", tags=["tasks"])
my_tasks_router = APIRouter(prefix="/tasks", tags=["tasks"])


@project_tasks_router.get("/{project_id}/tasks", response_model=TaskList)
def list_project_tasks(
    project_id: uuid.UUID,
    actor: ActiveUser,
    conn: DbConn,
    status: TaskStatus | None = None,
    assignee_id: uuid.UUID | None = None,
    milestone_id: uuid.UUID | None = None,
) -> TaskList:
    """The project's board: every live task with its milestone and owner, most urgent first."""
    return service.project_tasks(conn, actor, project_id, status=status, assignee_id=assignee_id, milestone_id=milestone_id)


@my_tasks_router.get("/mine", response_model=TaskList)
def list_my_tasks(actor: ActiveUser, conn: DbConn) -> TaskList:
    """Tasks that are assigned to you, soonest due first."""
    return service.my_tasks(conn, actor)
