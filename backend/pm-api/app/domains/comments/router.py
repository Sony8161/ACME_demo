"""HTTP endpoints for task comments, nested under a task."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, status

from app.core.deps import ActiveUser, DbConn
from app.domains.comments import service
from app.domains.comments.schemas import CommentCreate, CommentList, CommentOut

router = APIRouter(
    prefix="/projects/{project_id}/milestones/{milestone_id}/deliverables/{deliverable_id}/comments", tags=["comments"]
)


@router.get("", response_model=CommentList)
def list_comments(
    project_id: uuid.UUID, milestone_id: uuid.UUID, deliverable_id: uuid.UUID, actor: ActiveUser, conn: DbConn
) -> CommentList:
    """A task's comments, oldest first. Anyone who can see the project can read them."""
    return service.list_comments(conn, actor, project_id, milestone_id, deliverable_id)


@router.post("", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
def add_comment(
    project_id: uuid.UUID,
    milestone_id: uuid.UUID,
    deliverable_id: uuid.UUID,
    payload: CommentCreate,
    actor: ActiveUser,
    conn: DbConn,
) -> CommentOut:
    """Write a comment (1 to 2000 characters of plain text). Anyone who can see the project can."""
    return service.add_comment(conn, actor, project_id, milestone_id, deliverable_id, payload)


@router.post("/{comment_id}/archive", response_model=CommentOut)
def remove_comment(
    project_id: uuid.UUID,
    milestone_id: uuid.UUID,
    deliverable_id: uuid.UUID,
    comment_id: uuid.UUID,
    actor: ActiveUser,
    conn: DbConn,
) -> CommentOut:
    """Remove a comment from view. Its author, the project's manager and admins can; it is archived, never deleted."""
    return service.remove_comment(conn, actor, project_id, milestone_id, deliverable_id, comment_id)
