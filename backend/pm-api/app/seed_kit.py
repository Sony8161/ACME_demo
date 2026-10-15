"""Helpers shared by the sample-data builders: people, projects, milestones, tasks, links and costs."""

from __future__ import annotations

import datetime as dt
from typing import Any

import psycopg

from app.core import security
from app.domains.assignments import repository as assignments_repo
from app.domains.deliverables import repository as deliverables_repo
from app.domains.dependencies import repository as dependencies_repo
from app.domains.milestones import repository as milestones_repo
from app.domains.projects import repository as projects_repo
from app.domains.users import repository as users_repo

DEMO_DOMAIN = "@demo.acme.example"


class SeedKit:
    """Writes sample data through the same repositories the API uses. ``accounts`` collects the one-time logins."""

    def __init__(self, conn: psycopg.Connection[Any], admin_id: Any, today: dt.date) -> None:
        self.conn = conn
        self.admin_id = admin_id
        self.today = today
        self.accounts: list[dict[str, str]] = []

    def make_user(self, name: str, role: str, title: str, salary: float, manager_id: Any = None) -> dict[str, Any]:
        password = security.generate_password()
        for _ in range(20):
            username = security.generate_username(name)
            if not users_repo.username_exists(self.conn, username):
                break
        email = name.lower().replace(" ", ".") + DEMO_DOMAIN
        row = users_repo.insert(
            self.conn, username=username, password_hash=security.hash_password(password), name=name, email=email,
            job_title=title, role=role, manager_id=manager_id, salary=salary,
        )
        self.accounts.append({"name": name, "role": role, "username": username, "temporary_password": password})
        return row

    def make_project(self, name: str, manager: dict[str, Any], start: dt.date, end: dt.date, hours: float, budget: float) -> Any:
        return projects_repo.insert(
            self.conn, name=name, description=f"Demo project: {name}", manager_id=manager["id"], start_date=start,
            end_date=end, allocated_hours=hours, budget_amount=budget, created_by=self.admin_id,
        )

    def make_milestone(
        self, project_id: Any, manager: dict[str, Any], name: str, start: dt.date, due: dt.date, hours: float, budget: float,
        people: list[Any], deliverables: list[tuple[Any, ...]], *, status: str = "pending", complete: bool = False,
    ) -> Any:
        """``people`` holds employees (assigned for the whole milestone) or ``(employee, start, end)`` for part of it."""
        conn, today = self.conn, self.today
        mid = milestones_repo.insert(
            conn, project_id=project_id, name=name, description="", start_date=start, due_date=due,
            allocated_hours=hours, budget_amount=budget,
        )
        if status != "pending":
            milestones_repo.update(conn, mid, {"status": status})
        for entry in people:
            person, first, last = entry if isinstance(entry, tuple) else (entry, start, due)
            assignments_repo.insert(
                conn, milestone_id=mid, user_id=person["id"], start_date=first, end_date=last, assigned_by=self.admin_id
            )
        for item, done, *rest in deliverables:
            # Optional third element: what makes it a task on the board (priority, days until due, owner, status).
            task: dict[str, Any] = rest[0] if rest else {}
            owner = task.get("owner")
            did = deliverables_repo.insert(
                conn, milestone_id=mid, name=item, description="", priority=task.get("priority", "medium"),
                due_date=today + dt.timedelta(days=task["due"]) if "due" in task else None,
                assignee_id=owner["id"] if owner else None,
            )
            if done:
                deliverables_repo.set_done(conn, did, done=True, user_id=manager["id"])
            elif task.get("status"):
                deliverables_repo.set_status(conn, did, status=task["status"], user_id=manager["id"])
        if complete:
            milestones_repo.complete(conn, mid, reviewer_id=manager["id"], note="Reviewed and signed off")
        return mid

    def link(self, kind: str, earlier: Any, later: Any) -> None:
        dependencies_repo.insert(self.conn, kind, earlier, later, self.admin_id)  # type: ignore[arg-type]

    def add_cost(self, project_id: Any, category: str, description: str, amount: float, when: dt.date) -> None:
        self.conn.execute(
            "INSERT INTO project_costs (project_id, category, description, amount, incurred_on, created_by) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (project_id, category, description, amount, when, self.admin_id),
        )
