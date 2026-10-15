"""HTTP endpoints for reports."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import AwareDatetime

from app.core.deps import ActiveUser, DbConn, ManagerOrAdmin
from app.domains.reports import service
from app.domains.reports.schemas import Changes, MyDashboard, Overview, Timeline, Workload

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/overview", response_model=Overview)
def overview(actor: ManagerOrAdmin, conn: DbConn) -> Overview:
    """Project health, budget and hours totals, and who is allocated where (admin: all, manager: own)."""
    return service.overview(conn, actor)


@router.get("/my-dashboard", response_model=MyDashboard)
def my_dashboard(actor: ActiveUser, conn: DbConn) -> MyDashboard:
    """Your own projects, today's hours and recent time entries."""
    return service.my_dashboard(conn, actor)


@router.get("/timeline", response_model=Timeline)
def timeline(actor: ManagerOrAdmin, conn: DbConn, project_id: uuid.UUID | None = None) -> Timeline:
    """Open projects with their milestones by date (admin: all, manager: own). Narrow it with `project_id`."""
    return service.timeline(conn, actor, project_id=project_id)


@router.get("/changes", response_model=Changes)
def changes(
    actor: ManagerOrAdmin,
    conn: DbConn,
    since: Annotated[
        AwareDatetime | None, Query(description="ISO 8601 with a time zone (UTC). Default: a week ago; never older than 30 days")
    ] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> Changes:
    """What other people changed since you last looked: admin sees everything, a manager their own projects."""
    return service.changes(conn, actor, since, limit)


@router.get("/workload", response_model=Workload)
def workload(actor: ManagerOrAdmin, conn: DbConn, weeks: Annotated[int, Query(ge=1, le=12)] = 8) -> Workload:
    """Hours booked per person per week from this week (admin: everyone; manager: their people and those on their projects)."""
    return service.workload(conn, actor, weeks)
