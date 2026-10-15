"""Search across projects, people and tasks, inside what the person may already see.

Nothing here decides visibility by itself: projects and people go through the same queries their own screens use, and
tasks through one query with the same rule as the board (admin: all, manager: own projects, employee: own tasks).
"""

from __future__ import annotations

from typing import Any

import psycopg

from app.core import dates
from app.core.deps import CurrentUser
from app.domains.projects import repository as projects_repo
from app.domains.projects import service as projects_service
from app.domains.search.schemas import FoundPerson, FoundProject, FoundTask, SearchResults
from app.domains.tasks import repository as tasks_repo
from app.domains.users import repository as users_repo


def search(conn: psycopg.Connection[Any], actor: CurrentUser, q: str, limit: int) -> SearchResults:
    today = dates.today()
    project_rows, _ = projects_repo.search(
        conn, today=today, viewer_id=actor.id, viewer_role=actor.role, q=q, include_archived=False, limit=limit, offset=0
    )
    projects = [
        FoundProject(
            id=r["id"], name=r["name"], manager_name=r["manager_name"], status=r["status"],
            risk_level=projects_service.present(r, actor).summary.risk_level,
        )
        for r in project_rows
    ]
    # An employee cannot list people anywhere else, so a search must not become the way to do it.
    people_rows: list[dict[str, Any]] = []
    if actor.is_admin or actor.is_manager:
        people_rows = users_repo.list_users(conn, q=q, exclude_roles=() if actor.is_admin else ("admin",))[:limit]
    people = [FoundPerson(id=r["id"], name=r["name"], job_title=r["job_title"], role=r["role"]) for r in people_rows]
    task_rows = tasks_repo.search(conn, today=today, viewer_id=actor.id, viewer_role=actor.role, q=q, limit=limit)
    tasks = [
        FoundTask(
            id=r["id"], name=r["name"], project_id=r["project_id"], project_name=r["project_name"],
            milestone_name=r["milestone_name"], status=r["status"], assignee_name=r["assignee_name"],
        )
        for r in task_rows
    ]
    return SearchResults(query=q, projects=projects, people=people, tasks=tasks)
