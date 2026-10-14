"""Business rules for dependencies: who may link what, no loops, and what a person may see of the other end."""

from __future__ import annotations

import uuid
from typing import Any

import psycopg

from app.core.deps import CurrentUser
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.domains.dependencies import repository as repo
from app.domains.dependencies.schemas import DependencyList, DependencyRef, MilestoneLinkCreate, ProjectLinkCreate
from app.domains.milestones import service as milestones
from app.domains.projects import service as projects


def _can_see(conn: psycopg.Connection[Any], actor: CurrentUser, project_id: uuid.UUID) -> bool:
    try:
        projects.get_visible(conn, actor, project_id)
    except NotFoundError:
        return False
    return True


def _cancelled(row: dict[str, Any]) -> bool:
    return row["archived_at"] is not None and row["status"] != "completed"


def _ref(conn: psycopg.Connection[Any], actor: CurrentUser, kind: str, row: dict[str, Any]) -> DependencyRef:
    """One link as ``actor`` may see it: names of things in projects they may not see are hidden."""
    visible = actor.is_admin or _can_see(conn, actor, row["project_id"])
    status = "cancelled" if kind == "milestone" and _cancelled(row) else row["status"]
    hidden = "Another project's milestone" if kind == "milestone" else "Another project"
    return DependencyRef(
        id=row["dependency_id"],
        kind=kind,  # type: ignore[arg-type]
        item_id=row["item_id"] if visible else None,
        name=row["name"] if visible else hidden,
        project_id=row["project_id"] if visible else None,
        project_name=row["project_name"] if visible else None,
        status=status,
        is_done=status == "completed",
        schedule_conflict=bool(row["schedule_conflict"]),
        visible=visible,
    )


def _list(
    conn: psycopg.Connection[Any], actor: CurrentUser, kind: str, waiting: list[dict[str, Any]], blocking: list[dict[str, Any]]
) -> DependencyList:
    blocked_by = [_ref(conn, actor, kind, r) for r in waiting]
    return DependencyList(
        blocked_by=blocked_by,
        blocks=[_ref(conn, actor, kind, r) for r in blocking],
        is_blocked=any(
            not r.is_done and r.status != "cancelled" and not _archived_away(w) for r, w in zip(blocked_by, waiting, strict=True)
        ),
    )


def _archived_away(row: dict[str, Any]) -> bool:
    return row["archived_at"] is not None and row["status"] != "completed"


# --------------------------------------------------------------------------- milestones
def list_for_milestone(
    conn: psycopg.Connection[Any], actor: CurrentUser, project_id: uuid.UUID, milestone_id: uuid.UUID
) -> DependencyList:
    """What a milestone waits for and what waits for it."""
    projects.get_visible(conn, actor, project_id)
    milestones.load(conn, actor, project_id, milestone_id)
    return _list(
        conn,
        actor,
        "milestone",
        repo.milestone_links(conn, milestone_id, waiting=True),
        repo.milestone_links(conn, milestone_id, waiting=False),
    )


def add_to_milestone(
    conn: psycopg.Connection[Any],
    actor: CurrentUser,
    project_id: uuid.UUID,
    milestone_id: uuid.UUID,
    payload: MilestoneLinkCreate,
) -> DependencyRef:
    """Make a milestone wait for another one (in this project, or another project you manage)."""
    projects.get_manageable(conn, actor, project_id)
    milestones.load_live(conn, actor, project_id, milestone_id)
    earlier_id = payload.depends_on_milestone_id
    if earlier_id == milestone_id:
        raise ValidationError(
            "A milestone cannot wait for itself",
            details=[{"field": "depends_on_milestone_id", "message": "Choose a different milestone"}],
        )
    earlier = repo.milestone_info(conn, earlier_id)
    if (
        earlier is None
        or not (actor.is_admin or earlier["manager_id"] == actor.id)
        or (earlier["project_archived_at"] and not actor.is_admin)
    ):
        raise NotFoundError("Milestone not found")
    if _cancelled(earlier):
        raise ConflictError("That milestone was cancelled, so nothing can wait for it", code="cancelled")
    if repo.exists(conn, "milestone", earlier_id, milestone_id):
        raise ConflictError("This milestone already waits for that one", code="already_linked")
    if repo.would_loop(conn, "milestone", earlier_id, milestone_id):
        raise ConflictError(
            f"That would make a loop: {earlier['name']} already waits for this milestone, directly or through others",
            code="dependency_loop",
        )
    new_id = repo.insert(conn, "milestone", earlier_id, milestone_id, actor.id)
    row = next(r for r in repo.milestone_links(conn, milestone_id, waiting=True) if r["dependency_id"] == new_id)
    return _ref(conn, actor, "milestone", row)


def archive_for_milestone(
    conn: psycopg.Connection[Any], actor: CurrentUser, project_id: uuid.UUID, milestone_id: uuid.UUID, dependency_id: uuid.UUID
) -> DependencyRef:
    """Remove a link (archived, never deleted)."""
    projects.get_manageable(conn, actor, project_id)
    milestones.load_live(conn, actor, project_id, milestone_id)
    if repo.get_live(conn, "milestone", dependency_id, milestone_id) is None:
        raise NotFoundError("Dependency not found")
    row = next(r for r in repo.milestone_links(conn, milestone_id, waiting=True) if r["dependency_id"] == dependency_id)
    repo.archive(conn, "milestone", dependency_id)
    return _ref(conn, actor, "milestone", row)


# --------------------------------------------------------------------------- projects
def list_for_project(conn: psycopg.Connection[Any], actor: CurrentUser, project_id: uuid.UUID) -> DependencyList:
    """What a project waits for and what waits for it."""
    projects.get_visible(conn, actor, project_id)
    return _list(
        conn,
        actor,
        "project",
        repo.project_links(conn, project_id, waiting=True),
        repo.project_links(conn, project_id, waiting=False),
    )


def add_to_project(
    conn: psycopg.Connection[Any], actor: CurrentUser, project_id: uuid.UUID, payload: ProjectLinkCreate
) -> DependencyRef:
    """Make a project wait for another project you manage (an admin may link any two)."""
    projects.get_manageable(conn, actor, project_id)
    earlier_id = payload.depends_on_project_id
    if earlier_id == project_id:
        raise ValidationError(
            "A project cannot wait for itself",
            details=[{"field": "depends_on_project_id", "message": "Choose a different project"}],
        )
    earlier = repo.project_info(conn, earlier_id)
    if earlier is None or not (actor.is_admin or (earlier["manager_id"] == actor.id and earlier["archived_at"] is None)):
        raise NotFoundError("Project not found")
    if repo.exists(conn, "project", earlier_id, project_id):
        raise ConflictError("This project already waits for that one", code="already_linked")
    if repo.would_loop(conn, "project", earlier_id, project_id):
        raise ConflictError(f"That would make a loop: {earlier['name']} already waits for this project", code="dependency_loop")
    new_id = repo.insert(conn, "project", earlier_id, project_id, actor.id)
    row = next(r for r in repo.project_links(conn, project_id, waiting=True) if r["dependency_id"] == new_id)
    return _ref(conn, actor, "project", row)


def archive_for_project(
    conn: psycopg.Connection[Any], actor: CurrentUser, project_id: uuid.UUID, dependency_id: uuid.UUID
) -> DependencyRef:
    """Remove a project link (archived, never deleted)."""
    projects.get_manageable(conn, actor, project_id)
    if repo.get_live(conn, "project", dependency_id, project_id) is None:
        raise NotFoundError("Dependency not found")
    row = next(r for r in repo.project_links(conn, project_id, waiting=True) if r["dependency_id"] == dependency_id)
    repo.archive(conn, "project", dependency_id)
    return _ref(conn, actor, "project", row)
