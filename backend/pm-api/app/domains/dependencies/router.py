"""HTTP endpoints for dependencies between milestones and between projects."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, status

from app.core.deps import ActiveUser, DbConn, ManagerOrAdmin
from app.domains.dependencies import service
from app.domains.dependencies.schemas import DependencyList, DependencyRef, MilestoneLinkCreate, ProjectLinkCreate

milestone_router = APIRouter(prefix="/projects/{project_id}/milestones/{milestone_id}/dependencies", tags=["dependencies"])
project_router = APIRouter(prefix="/projects/{project_id}/dependencies", tags=["dependencies"])


@milestone_router.get("", response_model=DependencyList)
def list_milestone_dependencies(
    project_id: uuid.UUID, milestone_id: uuid.UUID, actor: ActiveUser, conn: DbConn
) -> DependencyList:
    """What this milestone waits for, and what waits for it. Things in projects you may not see are named generically."""
    return service.list_for_milestone(conn, actor, project_id, milestone_id)


@milestone_router.post("", response_model=DependencyRef, status_code=status.HTTP_201_CREATED)
def add_milestone_dependency(
    project_id: uuid.UUID, milestone_id: uuid.UUID, payload: MilestoneLinkCreate, actor: ManagerOrAdmin, conn: DbConn
) -> DependencyRef:
    """Make this milestone wait for another: it cannot be started or completed until that one is completed."""
    return service.add_to_milestone(conn, actor, project_id, milestone_id, payload)


@milestone_router.post("/{dependency_id}/archive", response_model=DependencyRef)
def archive_milestone_dependency(
    project_id: uuid.UUID, milestone_id: uuid.UUID, dependency_id: uuid.UUID, actor: ManagerOrAdmin, conn: DbConn
) -> DependencyRef:
    """Remove the link. It is archived, never deleted, and the history keeps it."""
    return service.archive_for_milestone(conn, actor, project_id, milestone_id, dependency_id)


@project_router.get("", response_model=DependencyList)
def list_project_dependencies(project_id: uuid.UUID, actor: ActiveUser, conn: DbConn) -> DependencyList:
    """What this project waits for, and what waits for it."""
    return service.list_for_project(conn, actor, project_id)


@project_router.post("", response_model=DependencyRef, status_code=status.HTTP_201_CREATED)
def add_project_dependency(
    project_id: uuid.UUID, payload: ProjectLinkCreate, actor: ManagerOrAdmin, conn: DbConn
) -> DependencyRef:
    """Make this project wait for another: it cannot be completed until that one is completed."""
    return service.add_to_project(conn, actor, project_id, payload)


@project_router.post("/{dependency_id}/archive", response_model=DependencyRef)
def archive_project_dependency(
    project_id: uuid.UUID, dependency_id: uuid.UUID, actor: ManagerOrAdmin, conn: DbConn
) -> DependencyRef:
    """Remove the link (archived, never deleted)."""
    return service.archive_for_project(conn, actor, project_id, dependency_id)
