"""Business rules for deliverables: a checklist the manager ticks off while reviewing a milestone."""

from __future__ import annotations

import uuid
from typing import Any

import psycopg

from app.core import dates
from app.core.deps import CurrentUser
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.domains.assignments import repository as assignments_repo
from app.domains.deliverables import repository as repo
from app.domains.deliverables.schemas import DeliverableCreate, DeliverableList, DeliverableOut, DeliverableUpdate
from app.domains.milestones import service as milestones
from app.domains.projects import service as projects


def _out(row: dict[str, Any]) -> DeliverableOut:
    return DeliverableOut.model_validate(row)


def _load(
    conn: psycopg.Connection[Any], actor: CurrentUser, milestone_id: uuid.UUID, deliverable_id: uuid.UUID
) -> dict[str, Any]:
    row = repo.get(conn, milestone_id, deliverable_id, include_archived=actor.is_admin)
    if row is None:
        raise NotFoundError("Deliverable not found")
    return row


def list_deliverables(
    conn: psycopg.Connection[Any], actor: CurrentUser, project_id: uuid.UUID, milestone_id: uuid.UUID, *, include_archived: bool
) -> DeliverableList:
    """The checklist of a milestone you can see. Only admins can include archived deliverables."""
    projects.get_visible(conn, actor, project_id)
    milestones.load(conn, actor, project_id, milestone_id)
    rows = repo.list_for_milestone(conn, milestone_id, include_archived=include_archived and actor.is_admin)
    live = [r for r in rows if r["archived_at"] is None]
    done = sum(1 for r in live if r["done"])
    return DeliverableList(
        items=[_out(r) for r in rows], total=len(live), done=done, ready_to_complete=bool(live) and done == len(live)
    )


def _check_assignee(conn: psycopg.Connection[Any], milestone_id: uuid.UUID, assignee_id: uuid.UUID | None) -> None:
    """A task is owned by someone whose work on its milestone has not ended."""
    if assignee_id is None:
        return
    assignment = assignments_repo.get_active(conn, milestone_id, assignee_id)
    if assignment is None or assignment["end_date"] < dates.today():
        raise ValidationError(
            "Only someone on this milestone's team can own the task",
            details=[{"field": "assignee_id", "message": "Not on this milestone's team"}],
        )


# Fields that may be sent as null to clear them.
_CLEARABLE = frozenset({"due_date", "assignee_id"})

# What an employee may do to a task that is theirs: start it or put it back. Finishing is the manager's review.
_OWNER_STATUSES = ("todo", "in_progress")


def _open_milestone(
    conn: psycopg.Connection[Any], actor: CurrentUser, project_id: uuid.UUID, milestone_id: uuid.UUID
) -> None:
    projects.get_manageable(conn, actor, project_id)
    milestones.load_live(conn, actor, project_id, milestone_id)


def add_deliverable(
    conn: psycopg.Connection[Any], actor: CurrentUser, project_id: uuid.UUID, milestone_id: uuid.UUID, payload: DeliverableCreate
) -> DeliverableOut:
    """Add an item to the milestone's checklist."""
    _open_milestone(conn, actor, project_id, milestone_id)
    if repo.name_taken(conn, milestone_id, payload.name):
        raise ConflictError(
            "This milestone already has a deliverable with that name", details=[{"field": "name", "message": "Already in use"}]
        )
    _check_assignee(conn, milestone_id, payload.assignee_id)
    new_id = repo.insert(
        conn, milestone_id=milestone_id, name=payload.name, description=payload.description, priority=payload.priority,
        due_date=payload.due_date, assignee_id=payload.assignee_id,
    )
    return _out(_load(conn, actor, milestone_id, new_id))


def _owner_may_move(current: dict[str, Any], actor: CurrentUser, fields: dict[str, Any]) -> bool:
    """True when an employee is only starting or pausing their own, unfinished task."""
    return (
        current["assignee_id"] == actor.id
        and current["status"] != "done"
        and set(fields) == {"status"}
        and fields["status"] in _OWNER_STATUSES
    )


def update_deliverable(
    conn: psycopg.Connection[Any],
    actor: CurrentUser,
    project_id: uuid.UUID,
    milestone_id: uuid.UUID,
    deliverable_id: uuid.UUID,
    payload: DeliverableUpdate,
) -> DeliverableOut:
    """Edit a task, move it on the board, or tick it off after review (``done: true`` is the same as ``status: done``)."""
    fields = payload.model_dump(exclude_unset=True)
    if actor.role == "employee":
        projects.get_visible(conn, actor, project_id)
        milestones.load_live(conn, actor, project_id, milestone_id)
    else:
        _open_milestone(conn, actor, project_id, milestone_id)
    current = _load(conn, actor, milestone_id, deliverable_id)
    if actor.role == "employee" and not _owner_may_move(current, actor, fields):
        raise ForbiddenError("You can start or pause your own tasks. A manager reviews and finishes them.")
    if current["archived_at"] is not None:
        raise ConflictError("This deliverable is archived and can no longer be changed")
    for key, value in fields.items():
        if value is None and key not in _CLEARABLE:
            raise ValidationError("This field cannot be empty", details=[{"field": key, "message": "This field cannot be empty"}])
    done = fields.pop("done", None)
    status = fields.pop("status", None)
    if "name" in fields and fields["name"].lower() != current["name"].lower() and repo.name_taken(
        conn, milestone_id, fields["name"], exclude_id=deliverable_id
    ):
        raise ConflictError(
            "This milestone already has a deliverable with that name", details=[{"field": "name", "message": "Already in use"}]
        )
    if "assignee_id" in fields and fields["assignee_id"] != current["assignee_id"]:
        _check_assignee(conn, milestone_id, fields["assignee_id"])
    repo.update(conn, deliverable_id, fields)
    if status is not None:
        repo.set_status(conn, deliverable_id, status=status, user_id=actor.id)
    elif done is not None:
        repo.set_done(conn, deliverable_id, done=done, user_id=actor.id)
    return _out(_load(conn, actor, milestone_id, deliverable_id))


def archive_deliverable(
    conn: psycopg.Connection[Any], actor: CurrentUser, project_id: uuid.UUID, milestone_id: uuid.UUID, deliverable_id: uuid.UUID
) -> DeliverableOut:
    """Take an item off the checklist (archived, never deleted; admins can still see it)."""
    _open_milestone(conn, actor, project_id, milestone_id)
    _load(conn, actor, milestone_id, deliverable_id)
    repo.archive(conn, deliverable_id)
    row = repo.get(conn, milestone_id, deliverable_id, include_archived=True)
    if row is None:  # pragma: no cover - just archived
        raise NotFoundError("Deliverable not found")
    return _out(row)
