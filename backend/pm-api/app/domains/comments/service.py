"""Who may read, write and remove comments.

Everyone who may see the project can read and write; its author, the project's manager and admins can remove one.
"""

from __future__ import annotations

import uuid
from typing import Any

import psycopg

from app.core.deps import CurrentUser
from app.core.errors import ForbiddenError, NotFoundError
from app.domains.comments import repository as repo
from app.domains.comments.schemas import CommentCreate, CommentList, CommentOut
from app.domains.deliverables import repository as deliverables_repo
from app.domains.milestones import service as milestones
from app.domains.projects import service as projects


def _task(
    conn: psycopg.Connection[Any], actor: CurrentUser, project_id: uuid.UUID, milestone_id: uuid.UUID, deliverable_id: uuid.UUID
) -> dict[str, Any]:
    """The project row, after checking the actor can see the project and the task is live. Anything else is a 404."""
    project = projects.get_visible(conn, actor, project_id)
    milestones.load_live(conn, actor, project_id, milestone_id)
    if deliverables_repo.get(conn, milestone_id, deliverable_id) is None:
        raise NotFoundError("Task not found")
    return project


def _out(row: dict[str, Any], actor: CurrentUser, project: dict[str, Any]) -> CommentOut:
    mine = row["author_id"] == actor.id
    return CommentOut(
        id=row["id"], author_id=row["author_id"], author_name=row["author_name"], body=row["body"], created_at=row["created_at"],
        can_remove=mine or actor.is_admin or project["manager_id"] == actor.id,
    )


def list_comments(
    conn: psycopg.Connection[Any], actor: CurrentUser, project_id: uuid.UUID, milestone_id: uuid.UUID, deliverable_id: uuid.UUID
) -> CommentList:
    project = _task(conn, actor, project_id, milestone_id, deliverable_id)
    items = [_out(r, actor, project) for r in repo.list_for_task(conn, deliverable_id)]
    return CommentList(items=items, total=len(items))


def add_comment(
    conn: psycopg.Connection[Any], actor: CurrentUser, project_id: uuid.UUID, milestone_id: uuid.UUID, deliverable_id: uuid.UUID,
    payload: CommentCreate,
) -> CommentOut:
    project = _task(conn, actor, project_id, milestone_id, deliverable_id)
    return _out(repo.insert(conn, deliverable_id, actor.id, payload.body), actor, project)


def remove_comment(
    conn: psycopg.Connection[Any], actor: CurrentUser, project_id: uuid.UUID, milestone_id: uuid.UUID, deliverable_id: uuid.UUID,
    comment_id: uuid.UUID,
) -> CommentOut:
    project = _task(conn, actor, project_id, milestone_id, deliverable_id)
    row = repo.get(conn, deliverable_id, comment_id)
    if row is None:
        raise NotFoundError("Comment not found")
    out = _out(row, actor, project)
    if not out.can_remove:
        raise ForbiddenError("Only its author, the project's manager or an admin can remove a comment")
    repo.archive(conn, comment_id)
    return out
