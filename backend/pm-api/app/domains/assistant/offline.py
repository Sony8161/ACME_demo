"""The built-in assistant: no AI service, no key, nothing leaves the server. It recognises a handful of questions and answers
them from the same read-only lookups the AI version uses, so what it says is always limited to what the person may see."""

from __future__ import annotations

import re
from typing import Any

import psycopg

from app.core.deps import CurrentUser
from app.domains.assistant import tools

_ABOUT = re.compile(
    r"(?:about|project|summary of|summarise|summarize|status of|details of|details for)\s+(.+?)(?:\s+please)?[?.!]*$", re.I
)

HELP = (
    "I can answer questions about the projects you can see. Try:\n"
    "- What is late? (late milestones and tasks, and projects at risk)\n"
    "- What is blocked? (what is waiting on something else)\n"
    "- What am I working on? / Show my tasks\n"
    "- Who is free this week? (managers and admins)\n"
    "- Tell me about <a project's name>\n"
    "- List all projects"
)


def _bullets(lines: list[str]) -> str:
    return "\n".join(f"- {line}" for line in lines)


def _task(t: dict[str, Any]) -> str:
    owner = f", {t['owner']}" if t.get("owner") else ""
    due = f", due {t['due']}" if t.get("due") else ""
    where = f" ({t['project']}, {t['milestone']})" if t.get("project") else f" ({t['milestone']})"
    return f"{t['task']}{where}{owner}{due}, {t['status'].replace('_', ' ')}"


def _projects(data: dict[str, Any], who: CurrentUser) -> str:
    if not data["projects"]:
        return "You cannot see any open projects yet."
    lines = []
    for p in data["projects"]:
        line = f"{p['name']}: {p['health'].replace('_', ' ')}, {p['milestones_done']} of {p['milestones_total']} milestones done"
        if "budget_used_pct" in p and who.role != "employee":
            line += f", {p['budget_used_pct']}% of budget used"
        if p["waiting_for_projects"]:
            line += f", waiting for {p['waiting_for_projects']} project(s)"
        if p["why"]:
            line += f". {p['why'][0]}"
        lines.append(line)
    return f"You can see {len(lines)} open project(s):\n{_bullets(lines)}"


def _project(data: dict[str, Any]) -> str:
    if "error" in data:
        return str(data["error"])
    lines = [
        f"{data['name']} ({data['status']}, managed by {data['manager']}, {data['starts']} to {data['ends']}): "
        f"{data['health'].replace('_', ' ')}."
    ]
    if data["why"]:
        lines.append("Why: " + "; ".join(data["why"]) + ".")
    ms = [
        f"{m['milestone']}: {m['status'].replace('_', ' ')}, due {m['due']}, {m['tasks_done']} of {m['tasks_total']} tasks done"
        + (", late" if m["overdue"] else "")
        + (f", waiting for {m['waiting_for']}" if m["waiting_for"] else "")
        for m in data["milestone_list"]
    ]
    out = "\n".join(lines)
    if ms:
        out += "\nMilestones:\n" + _bullets(ms)
    c = data["task_counts"]
    out += f"\nTasks: {c['todo']} to do, {c['in_progress']} in progress, {c['done']} done."
    late = [t for t in data["tasks"] if t["overdue"]]
    if late:
        out += "\nLate tasks:\n" + _bullets([_task(t) for t in late])
    if data["waits_for_projects"]:
        out += "\nThis project waits for: " + ", ".join(data["waits_for_projects"]) + "."
    if data["waited_on_by_projects"]:
        out += "\nWaiting on this project: " + ", ".join(data["waited_on_by_projects"]) + "."
    return out


def _late(data: dict[str, Any]) -> str:
    parts = []
    if data["overdue_milestones"]:
        parts.append(
            "Late milestones:\n"
            + _bullets([f"{m['milestone']} in {m['project']}, due {m['due']}" for m in data["overdue_milestones"]])
        )
    if data["overdue_tasks"]:
        parts.append("Late tasks:\n" + _bullets([_task(t) for t in data["overdue_tasks"]]))
    if data["projects_at_risk"]:
        parts.append(
            "Projects at risk:\n"
            + _bullets(
                [
                    f"{p['project']} ({p['health'].replace('_', ' ')})" + (f": {p['why'][0]}" if p["why"] else "")
                    for p in data["projects_at_risk"]
                ]
            )
        )
    return "\n\n".join(parts) or "Nothing is late, and no project is at risk."


def _blocked(data: dict[str, Any]) -> str:
    parts = []
    if data["waiting_milestones"]:
        parts.append(
            "Milestones waiting for something:\n"
            + _bullets(
                [f"{m['milestone']} in {m['project']} (waiting for {m['waiting_for']})" for m in data["waiting_milestones"]]
            )
        )
    if data["waiting_projects"]:
        parts.append(
            "Projects waiting for another project:\n"
            + _bullets([f"{p['project']} (waiting for {p['waiting_for']})" for p in data["waiting_projects"]])
        )
    return "\n\n".join(parts) or "Nothing is waiting on anything else."


def _free(data: dict[str, Any]) -> str:
    if "error" in data:
        return str(data["error"])
    free = [
        f"{p['name']} ({p['job']}), {p['hours_this_week']} h this week" + (f", next: {p['next']}" if p["next"] else "")
        for p in data["free"]
    ]
    busy = [f"{p['name']} on {p['on']}, {p['hours_this_week']} h this week" for p in data["busy"]]
    out = ("Free today:\n" + _bullets(free)) if free else "Nobody is free today."
    if busy:
        out += "\n\nBusy:\n" + _bullets(busy)
    return out


def _mine(work: dict[str, Any], mine: dict[str, Any]) -> str:
    today = work["today"] or "you are not on a milestone"
    out = f"Today: {today}. Hours this week: {work['hours_this_week']} of {work['week_capacity']}."
    if work["milestones"]:
        out += "\nYour milestones:\n" + _bullets(
            [
                f"{m['milestone']} in {m['project']}, due {m['due']}, {m['tasks_done']} of {m['tasks_total']} tasks done"
                for m in work["milestones"]
            ]
        )
    out += (
        ("\nYour tasks:\n" + _bullets([_task(t) for t in mine["tasks"]])) if mine["tasks"] else "\nNo tasks are assigned to you."
    )
    return out


def answer(conn: psycopg.Connection[Any], actor: CurrentUser, question: str) -> tuple[str, list[str]]:
    """Reply to ``question`` and say which lookups it came from."""
    q = question.lower()

    def run(name: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
        return tools.run_tool(conn, actor, name, args or {})

    if re.search(r"\bhelp\b|what can you do", q):
        return HELP, []
    named = [p for p in tools.visible_projects(conn, actor) if p.name.lower() in q]
    about = _ABOUT.search(question.strip())
    if named or about:
        name = named[0].name if named else about.group(1) if about else ""
        return _project(run("project_details", {"name": name})), ["project_details"]
    if re.search(r"\bfree\b|available|availability|capacity|who is", q):
        return _free(run("who_is_free")), ["who_is_free"]
    if re.search(r"blocked|waiting|depend", q):
        return _blocked(run("attention")), ["attention"]
    if re.search(r"\blate\b|overdue|behind|risk|attention|trouble|problem", q):
        return _late(run("attention")), ["attention"]
    if re.search(r"my task|tasks|assigned to me|to do|todo|working on|my work|my milestone|this week|today", q):
        return _mine(run("my_work"), run("my_tasks")), ["my_work", "my_tasks"]
    if re.search(r"project|status|how are", q):
        return _projects(run("list_projects"), actor), ["list_projects"]
    return "I did not understand that.\n\n" + HELP, []
