"""The read-only lookups the assistant can use. Each one runs as the person asking, through the same services as the screens,
so the assistant can never see more than that person can: no money for employees, nothing from other managers' projects.

Nothing here changes any data."""

from __future__ import annotations

import json
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import psycopg

from app.core import dates
from app.core.deps import CurrentUser
from app.domains.dependencies import service as dependencies_service
from app.domains.milestones import service as milestones_service
from app.domains.projects import service as projects_service
from app.domains.projects.schemas import ProjectOut
from app.domains.reports import service as reports_service
from app.domains.tasks import service as tasks_service
from app.domains.tasks.schemas import TaskOut

MAX_ITEMS = 40
_MONEYISH = ("$", "budget", "spend", "spent", "cost", "salary", "pay")


@dataclass(frozen=True)
class Tool:
    """A lookup, with the description and input shape the model is shown."""

    name: str
    description: str
    schema: dict[str, Any]
    run: Callable[[psycopg.Connection[Any], CurrentUser, dict[str, Any]], dict[str, Any]]


def _reasons(actor: CurrentUser, reasons: list[str]) -> list[str]:
    """Why a project is at risk. Employees never see money, so any reason that talks about it is left out for them."""
    if actor.role != "employee":
        return list(reasons)
    return [r for r in reasons if not any(w in r.lower() for w in _MONEYISH)]


def visible_projects(conn: psycopg.Connection[Any], actor: CurrentUser) -> list[ProjectOut]:
    """Open projects the person may see."""
    listing = projects_service.list_projects(
        conn, actor, q=None, status=None, manager_id=None, include_archived=False, page=1, page_size=100
    )
    return listing.items


def _project_line(actor: CurrentUser, p: ProjectOut) -> dict[str, Any]:
    s = p.summary
    line: dict[str, Any] = {
        "name": p.name,
        "status": p.status,
        "manager": p.manager.name,
        "starts": p.start_date,
        "ends": p.end_date,
        "health": s.risk_level,
        "why": _reasons(actor, s.risk_reasons),
        "milestones_done": s.milestones_done,
        "milestones_total": s.milestones_total,
        "waiting_for_projects": p.blocked_by_count,
    }
    if actor.role != "employee" and s.total_cost is not None:
        line.update(budget_used_pct=s.budget_pct, spent=s.total_cost)
    return line


def _task_line(t: TaskOut, *, with_project: bool = False) -> dict[str, Any]:
    line: dict[str, Any] = {
        "task": t.name,
        "milestone": t.milestone_name,
        "owner": t.assignee_name,
        "status": t.status,
        "priority": t.priority,
        "due": t.due_date,
        "overdue": t.is_overdue,
    }
    if with_project:
        line["project"] = t.project_name
    return line


def list_projects(conn: psycopg.Connection[Any], actor: CurrentUser, _: dict[str, Any]) -> dict[str, Any]:
    """Every open project the person may see, with its health."""
    return {"as_of": dates.today(), "projects": [_project_line(actor, p) for p in visible_projects(conn, actor)][:MAX_ITEMS]}


def _find_project(conn: psycopg.Connection[Any], actor: CurrentUser, name: str) -> ProjectOut | None:
    wanted = name.strip().lower()
    projects = visible_projects(conn, actor)
    exact = [p for p in projects if p.name.lower() == wanted]
    if exact:
        return exact[0]
    partial = [p for p in projects if wanted and (wanted in p.name.lower() or p.name.lower() in wanted)]
    return partial[0] if len(partial) == 1 else None


def project_details(conn: psycopg.Connection[Any], actor: CurrentUser, args: dict[str, Any]) -> dict[str, Any]:
    """One project in detail: milestones, tasks and what it waits for."""
    name = str(args.get("name", ""))
    project = _find_project(conn, actor, name)
    if project is None:
        return {"error": f'I could not find a project called "{name}" among the projects you can see.'}
    milestones = milestones_service.list_milestones(conn, actor, project.id, include_archived=False).items
    tasks = tasks_service.project_tasks(conn, actor, project.id, status=None, assignee_id=None, milestone_id=None).items
    links = dependencies_service.list_for_project(conn, actor, project.id)
    counts = {s: sum(t.status == s for t in tasks) for s in ("todo", "in_progress", "done")}
    return {
        **_project_line(actor, project),
        "milestone_list": [
            {
                "milestone": m.name,
                "starts": m.start_date,
                "due": m.due_date,
                "status": m.status,
                "overdue": m.is_overdue,
                "tasks_done": m.deliverables_done,
                "tasks_total": m.deliverables_total,
                "waiting_for": m.blocked_by_count,
            }
            for m in milestones
        ][:MAX_ITEMS],
        "task_counts": counts,
        "tasks": [_task_line(t) for t in tasks][:MAX_ITEMS],
        "waits_for_projects": [r.name for r in links.blocked_by],
        "waited_on_by_projects": [r.name for r in links.blocks],
    }


def my_tasks(conn: psycopg.Connection[Any], actor: CurrentUser, _: dict[str, Any]) -> dict[str, Any]:
    """Tasks assigned to the person, soonest due first."""
    items = tasks_service.my_tasks(conn, actor).items
    return {"tasks": [_task_line(t, with_project=True) for t in items][:MAX_ITEMS]}


def my_work(conn: psycopg.Connection[Any], actor: CurrentUser, _: dict[str, Any]) -> dict[str, Any]:
    """What the person is working on today and this week."""
    d = reports_service.my_dashboard(conn, actor)
    return {
        "as_of": d.as_of,
        "today": (
            f"{d.current_work.milestone_name} in {d.current_work.project_name}, until {d.current_work.end_date}"
            if d.current_work
            else None
        ),
        "hours_this_week": d.hours_this_week,
        "week_capacity": d.week_capacity,
        "milestones": [
            {
                "milestone": m.milestone_name,
                "project": m.project_name,
                "status": m.status,
                "due": m.due_date,
                "tasks_done": m.deliverables_done,
                "tasks_total": m.deliverables_total,
            }
            for m in d.my_milestones
        ][:MAX_ITEMS],
    }


def attention(conn: psycopg.Connection[Any], actor: CurrentUser, _: dict[str, Any]) -> dict[str, Any]:
    """What needs attention: late milestones and tasks, projects at risk, and what is waiting on something else."""
    today = dates.today()
    projects = visible_projects(conn, actor)
    out: dict[str, Any] = {
        "as_of": today,
        "projects_at_risk": [
            {"project": p.name, "health": p.summary.risk_level, "why": _reasons(actor, p.summary.risk_reasons)}
            for p in projects
            if p.summary.risk_level in ("at_risk", "overdue")
        ],
        "overdue_tasks": [],
        "overdue_milestones": [],
        "waiting_milestones": [],
        "waiting_projects": [{"project": p.name, "waiting_for": p.blocked_by_count} for p in projects if p.blocked_by_count],
    }
    for p in projects:
        for t in tasks_service.project_tasks(conn, actor, p.id, status=None, assignee_id=None, milestone_id=None).items:
            if t.is_overdue and (actor.role != "employee" or t.assignee_id == actor.id):
                out["overdue_tasks"].append(_task_line(t, with_project=True))
        for m in milestones_service.list_milestones(conn, actor, p.id, include_archived=False).items:
            if m.is_overdue:
                out["overdue_milestones"].append({"milestone": m.name, "project": p.name, "due": m.due_date})
            if m.blocked_by_count:
                out["waiting_milestones"].append({"milestone": m.name, "project": p.name, "waiting_for": m.blocked_by_count})
    return {k: (v[:MAX_ITEMS] if isinstance(v, list) else v) for k, v in out.items()}


def who_is_free(conn: psycopg.Connection[Any], actor: CurrentUser, _: dict[str, Any]) -> dict[str, Any]:
    """Who has no milestone today and who is busy with what. Managers and admins only."""
    if actor.role == "employee":
        return {"error": "Only managers and admins can see everyone's availability."}
    people = reports_service.overview(conn, actor).allocation
    return {
        "free": [
            {
                "name": a.name,
                "job": a.job_title,
                "hours_this_week": a.hours_this_week,
                "next": a.next_work.milestone_name if a.next_work else None,
            }
            for a in people
            if a.state == "available"
        ][:MAX_ITEMS],
        "busy": [
            {
                "name": a.name,
                "on": f"{a.current_work.milestone_name} ({a.current_work.project_name})" if a.current_work else None,
                "hours_this_week": a.hours_this_week,
            }
            for a in people
            if a.state == "allocated"
        ][:MAX_ITEMS],
    }


_NO_INPUT = {"type": "object", "properties": {}}
TOOLS: dict[str, Tool] = {
    t.name: t
    for t in (
        Tool(
            "list_projects",
            "List the open projects the person can see, with health, reasons and milestone progress.",
            _NO_INPUT,
            list_projects,
        ),
        Tool(
            "project_details",
            "Details of one project by name: milestones, tasks, dependencies.",
            {
                "type": "object",
                "properties": {"name": {"type": "string", "description": "The project's name, or part of it"}},
                "required": ["name"],
            },
            project_details,
        ),
        Tool("my_tasks", "The tasks assigned to the person asking, soonest due first.", _NO_INPUT, my_tasks),
        Tool("my_work", "What the person asking is working on today and this week.", _NO_INPUT, my_work),
        Tool(
            "attention",
            "What needs attention: late milestones and tasks, projects at risk, what is waiting on something else.",
            _NO_INPUT,
            attention,
        ),
        Tool("who_is_free", "Who is free and who is busy right now (managers and admins only).", _NO_INPUT, who_is_free),
    )
}


def run_tool(conn: psycopg.Connection[Any], actor: CurrentUser, name: str, args: dict[str, Any]) -> dict[str, Any]:
    """Run one lookup as the person; an unknown name is an error the model can read, not a crash."""
    tool = TOOLS.get(name)
    if tool is None:
        return {"error": f"Unknown tool {name}. Available: {', '.join(TOOLS)}."}
    return tool.run(conn, actor, args if isinstance(args, dict) else {})


def as_json(result: dict[str, Any]) -> str:
    """A tool result as the text the model reads (dates become ISO strings)."""
    return json.dumps(
        result, default=lambda o: str(o) if isinstance(o, (uuid.UUID,)) else o.isoformat() if hasattr(o, "isoformat") else str(o)
    )
