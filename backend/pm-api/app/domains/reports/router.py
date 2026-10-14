"""HTTP endpoints for reports."""

from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.core.deps import ActiveUser, DbConn, ManagerOrAdmin
from app.domains.reports import service
from app.domains.reports.schemas import MyDashboard, Overview, Timeline

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
