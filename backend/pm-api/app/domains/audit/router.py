"""HTTP endpoints for the audit history (read only: the log is written by the database)."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import AdminUser, DbConn, ManagerOrAdmin
from app.domains.audit import service
from app.domains.audit.schemas import AuditAction, AuditEntity, AuditList

audit_router = APIRouter(prefix="/audit", tags=["audit"])
project_history_router = APIRouter(prefix="/projects", tags=["audit"])


@audit_router.get("", response_model=AuditList)
def search_history(
    actor: AdminUser,
    conn: DbConn,
    project_id: uuid.UUID | None = None,
    actor_id: uuid.UUID | None = None,
    entity: AuditEntity | None = None,
    action: AuditAction | None = None,
    from_date: Annotated[dt.date | None, Query(alias="from")] = None,
    to_date: Annotated[dt.date | None, Query(alias="to")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> AuditList:
    """Everything that changed, newest first. Admins only. Filter by project, person, kind of record, action or dates."""
    return service.search(
        conn, project_id=project_id, actor_id=actor_id, entity=entity, action=action,
        day_from=from_date, day_to=to_date, page=page, page_size=page_size,
    )


@project_history_router.get("/{project_id}/history", response_model=AuditList)
def project_history(
    project_id: uuid.UUID,
    actor: ManagerOrAdmin,
    conn: DbConn,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> AuditList:
    """Everything that changed on one project, newest first. For an admin or the project's own manager."""
    return service.project_history(conn, actor, project_id, page=page, page_size=page_size)
