"""The larger sample company: two more managers, twenty more employees and eight more projects.

Everything here is plain data (the tables below) plus one builder, ``seed_extended``. All dates are offsets in days from
today, so the sample company never goes stale. Staffing never overlaps for one person (the server refuses that), and the
budget and hours of every project are set from its real staffing so each project lands in the health state it is meant
to show.
"""

from __future__ import annotations

import datetime as dt
import math
from dataclasses import dataclass
from typing import Any

from app.core import dates
from app.domains.projects import repository as projects_repo
from app.seed_kit import DEMO_DOMAIN, SeedKit

MARKER_EMAIL = "hannah.weiss" + DEMO_DOMAIN  # present once the larger company has been loaded

# A person is a first name (whole milestone) or (first name, first day, last day) for part of it.
Staff = str | tuple[str, int, int]


@dataclass(frozen=True)
class Task:
    name: str
    priority: str = "medium"
    owner: str | None = None
    due: int | None = None
    state: str = "todo"  # todo | doing | done


@dataclass(frozen=True)
class Stage:
    """A milestone."""

    name: str
    start: int
    end: int
    state: str  # done (signed off) | doing | todo
    staff: tuple[Staff, ...]
    tasks: tuple[Task, ...]


@dataclass(frozen=True)
class Project:
    name: str
    manager: str
    start: int
    end: int
    kind: str  # on_track | at_risk | overdue | planned | completed
    stages: tuple[Stage, ...]
    costs: tuple[tuple[str, str, float, int], ...] = ()  # category, description, amount, days from today


# name, job title, hourly cost, manager (first name)
MANAGERS = (("Hannah Weiss", "Product Manager", 72), ("Diego Alvarez", "Program Manager", 74))
EMPLOYEES = (
    ("Noor Rahman", "Frontend Developer", 62, "Maria"),
    ("Chloe Dubois", "Product Designer", 57, "Maria"),
    ("Isabella Conti", "Marketing Specialist", 45, "Maria"),
    ("Emma Johansson", "Technical Writer", 42, "Maria"),
    ("Mateo Silva", "Mobile Developer", 66, "Maria"),
    ("Aisha Khan", "Data Analyst", 58, "James"),
    ("Jonas Berg", "Support Engineer", 38, "James"),
    ("Grace Mwangi", "Customer Success Manager", 40, "James"),
    ("Lucas Martin", "Backend Developer", 60, "James"),
    ("Mei Chen", "Data Scientist", 78, "James"),
    ("Kenji Tanaka", "Backend Developer", 68, "Hannah"),
    ("Fatima Okafor", "QA Engineer", 48, "Hannah"),
    ("Ravi Patel", "Full-stack Developer", 64, "Hannah"),
    ("Sara Lindqvist", "UX Researcher", 55, "Hannah"),
    ("Zainab Ali", "Business Analyst", 52, "Hannah"),
    ("Liam Murphy", "DevOps Engineer", 72, "Diego"),
    ("Pavel Ivanov", "Systems Engineer", 70, "Diego"),
    ("Hiro Sato", "Cloud Architect", 85, "Diego"),
    ("Viktor Novak", "Security Engineer", 80, "Diego"),
    ("Ethan Brooks", "Scrum Master", 56, "Diego"),
)

PROJECTS = (
    Project("Payments Gateway Upgrade", "Hannah", -45, 75, "on_track", (
        Stage("API design", -45, -20, "done", ("Kenji", "Chloe"), (
            Task("Write the API contract", "high", "Kenji", -40, "done"),
            Task("Security review of the contract", "high", "Kenji", -35, "done"),
            Task("Checkout screens", "medium", "Chloe", -30, "done"),
            Task("Sandbox keys from the bank", "low", "Kenji", -42, "done"),
        )),
        Stage("Core integration", -19, 25, "doing", ("Kenji", "Ravi", "Fatima", ("Liam", -4, 25)), (
            Task("Card payments", "urgent", "Kenji", -2, "done"),
            Task("Test plan", "medium", "Fatima", -3, "done"),
            Task("Refund flow", "high", "Ravi", 6, "doing"),
            Task("3-D Secure", "high", "Kenji", 12, "doing"),
            Task("Webhook retries", "medium", "Ravi", 15, "doing"),
            Task("Regression suite", "medium", "Fatima", 18),
            Task("Load test environment", "low", "Liam"),
            Task("Decide on the fraud provider", "high", None, 8),
        )),
        Stage("Pilot and rollout", 26, 75, "todo", ("Kenji", "Fatima"), (
            Task("Pilot with 5% of traffic", "high", "Kenji", 40),
            Task("Monitoring dashboards", "medium", "Fatima", 45),
            Task("Full rollout plan"),
            Task("Retire the old gateway", "low"),
        )),
    ), (("license", "Payment provider sandbox", 2500, -30), ("technology", "Test devices", 1800, -12))),

    Project("Customer Support Chatbot", "Hannah", -40, 50, "at_risk", (
        Stage("Intent catalogue", -40, -15, "done", ("Sara", "Zainab"), (
            Task("Interview support agents", "medium", "Sara", -35, "done"),
            Task("Top 50 questions", "high", "Zainab", -30, "done"),
            Task("Tone of voice guide", "low", "Sara", -25, "done"),
            Task("Escalation rules", "high", "Zainab", -20, "done"),
        )),
        Stage("Model training", -14, 30, "doing", ("Mei", "Lucas", ("Zainab", -14, 19), "Jonas"), (
            Task("Training data clean-up", "high", "Mei", -6, "done"),
            Task("First model", "urgent", "Mei", 4, "doing"),
            Task("Answer quality review", "high", "Zainab", 9, "doing"),
            Task("Hand-off to a human", "high", "Lucas", 14, "doing"),
            Task("Connect to the ticket system", "medium", "Lucas", 22),
            Task("Weekly accuracy report", "low", "Jonas", -2),
            Task("Fallback answers"),
        )),
        Stage("Pilot with the support team", 31, 50, "todo", ("Jonas", "Grace"), (
            Task("Train the agents", "medium", "Grace", 36),
            Task("Collect feedback", "medium", "Jonas", 45),
            Task("Go / no-go meeting", "high", None, 50),
        )),
    ), (("technology", "GPU hours", 9000, -12), ("vendor", "Annotation vendor", 6500, -25))),

    Project("Warehouse Automation", "Diego", -30, 90, "on_track", (
        Stage("Sensor survey", -30, -5, "done", ("Pavel", "Liam"), (
            Task("Walk the floor", "medium", "Pavel", -26, "done"),
            Task("Sensor list", "medium", "Liam", -20, "done"),
            Task("Network coverage map", "high", "Liam", -14, "done"),
            Task("Survey report", "high", "Pavel", -6, "done"),
        )),
        Stage("Controller software", -4, 40, "doing", ("Pavel", "Hiro", ("Viktor", -4, 40)), (
            Task("Controller firmware", "urgent", "Hiro", 10, "doing"),
            Task("Safety interlocks", "urgent", "Viktor", 14, "doing"),
            Task("Simulator", "medium", "Pavel", 8, "doing"),
            Task("Penetration test of the controller", "high", "Viktor", 30),
            Task("Operator panel", "medium", "Pavel", 25),
            Task("Release notes", "low"),
        )),
        Stage("Site installation", 41, 90, "todo", ("Liam", "Pavel"), (
            Task("Install conveyor sensors", "high", "Liam", 60),
            Task("Commissioning checklist", "medium", "Pavel", 75),
            Task("Operator training", "medium", None, 85),
            Task("Handover", "high", None, 90),
        )),
    ), (("technology", "Sensors and cabling", 18000, -20), ("vendor", "Installer deposit", 8000, -7))),

    Project("Security Compliance Audit", "Diego", -70, -5, "overdue", (
        Stage("Evidence collection", -70, -35, "done", ("Viktor", "Emma"), (
            Task("Access review", "high", "Viktor", -60, "done"),
            Task("Policy inventory", "medium", "Emma", -55, "done"),
            Task("Backup test evidence", "medium", "Viktor", -45, "done"),
            Task("Vendor questionnaires", "low", "Emma", -40, "done"),
        )),
        Stage("Remediation", -34, -10, "doing", ("Viktor", "Emma"), (
            Task("Close the critical findings", "urgent", "Viktor", -14, "doing"),
            Task("Rotate shared secrets", "high", "Viktor", -9, "doing"),
            Task("Update the security policy", "medium", "Emma", -12, "doing"),
            Task("Staff awareness training", "medium", "Emma", -8),
            Task("Encrypt old backups", "high", None, -6),
        )),
        Stage("Final report", -9, -5, "todo", (), (
            Task("Auditor walkthrough", "high", None, -5),
            Task("Management sign-off", "high", None, -4),
        )),
    ), (("vendor", "External auditor", 14000, -50), ("license", "Compliance tool", 3600, -30))),

    Project("Analytics Dashboard", "Diego", -25, 65, "on_track", (
        Stage("Data model", -25, -6, "done", ("Aisha", "Ethan"), (
            Task("Metric definitions", "high", "Aisha", -20, "done"),
            Task("Warehouse tables", "high", "Aisha", -14, "done"),
            Task("Access rules", "medium", "Ethan", -10, "done"),
        )),
        Stage("Dashboards", -5, 30, "doing", ("Aisha", "Ethan", "Noor", "Chloe"), (
            Task("Colour palette", "low", "Chloe", 3, "done"),
            Task("Sales overview", "high", "Noor", 5, "doing"),
            Task("Data refresh schedule", "medium", "Aisha", 8, "doing"),
            Task("Stakeholder preview", "high", "Ethan", 10, "doing"),
            Task("Regional drill-down", "medium", "Noor", 12),
            Task("Export to PDF", "medium", None, 20),
            Task("Saved filters", "low", "Noor"),
        )),
        Stage("Training and handover", 31, 65, "todo", ("Ethan", "Emma"), (
            Task("User guide", "medium", "Emma", 45),
            Task("Training sessions", "medium", "Ethan", 55),
            Task("Handover meeting", "high", "Ethan", 65),
        )),
    ), (("license", "BI tool seats", 4800, -15),)),

    Project("HR Self-Service Portal", "James", 20, 120, "planned", (
        Stage("Requirements", 20, 45, "todo", ("Zainab",), (
            Task("Interview HR staff", "medium", "Zainab", 28),
            Task("Leave and expense flows", "high", "Zainab", 36),
            Task("Privacy review", "high", None, 44),
        )),
        Stage("Prototype", 46, 80, "todo", ("Chloe",), (
            Task("Clickable prototype", "high", "Chloe", 60),
            Task("Usability test", "medium", "Chloe", 72),
            Task("Design sign-off", "medium", None, 80),
        )),
    )),

    Project("Partner Onboarding Kit", "Hannah", 30, 110, "planned", (
        Stage("Content", 30, 60, "todo", ("Isabella",), (
            Task("Welcome guide", "medium", "Isabella", 45),
            Task("Pricing sheet", "medium", "Isabella", 52),
            Task("Legal terms", "high", None, 58),
        )),
        Stage("Partner portal", 61, 110, "todo", ("Noor", "Ravi", "Mateo"), (
            Task("Sign-up page", "high", "Noor", 80),
            Task("Document library", "medium", "Ravi", 95),
            Task("Partner dashboard", "medium", "Mateo", 105),
            Task("Go-live checklist", "high", None, 110),
        )),
    )),

    Project("Brand Refresh", "Maria", -100, -15, "completed", (
        Stage("Research", -100, -70, "done", ("Isabella", "Chloe"), (
            Task("Competitor review", "low", "Isabella", -95, "done"),
            Task("Customer survey", "medium", "Isabella", -85, "done"),
            Task("Brand audit", "medium", "Chloe", -75, "done"),
        )),
        Stage("Identity", -69, -40, "done", ("Isabella",), (
            Task("Logo options", "high", "Isabella", -60, "done"),
            Task("Colour and type", "medium", "Isabella", -50, "done"),
            Task("Brand guidelines", "high", "Isabella", -42, "done"),
        )),
        Stage("Rollout", -39, -15, "done", ("Isabella", "Jonas"), (
            Task("Update the website header", "medium", "Jonas", -30, "done"),
            Task("New templates", "medium", "Isabella", -25, "done"),
            Task("Launch email", "low", "Isabella", -18, "done"),
        )),
    ), (("vendor", "Design agency", 12000, -80), ("other", "Printing", 1500, -20))),
)

# (project, milestone) -> (project, milestone): the second waits for the first. A None milestone means the whole project.
LINKS = (
    (("Payments Gateway Upgrade", "Core integration"), ("Payments Gateway Upgrade", "Pilot and rollout")),
    (("Security Compliance Audit", None), ("HR Self-Service Portal", None)),
    (("Payments Gateway Upgrade", None), ("Partner Onboarding Kit", None)),
)

# Budget and hours are set to this share of what the project's staffing needs, by health. Below 1 means "short of money".
_BUDGET_SHARE = {"at_risk": 0.85}


def _by_email(kit: SeedKit, first_name: str) -> dict[str, Any]:
    row = kit.conn.execute(
        "SELECT * FROM users WHERE email LIKE %s ORDER BY created_at LIMIT 1", (f"{first_name.lower()}.%{DEMO_DOMAIN}",)
    ).fetchone()
    if row is None:
        raise RuntimeError(f"The sample manager {first_name} is missing; cannot add the larger company")
    return row


def _workdays(kit: SeedKit, first: dt.date, last: dt.date) -> int:
    row = kit.conn.execute("SELECT working_days(%s, %s) AS n", (first, last)).fetchone()
    return int(row["n"]) if row else 0


def _tune(kit: SeedKit, project_id: Any, kind: str) -> None:
    """Set the project's hours and budget from its real staffing so that it shows the intended health."""
    row = projects_repo.get(kit.conn, project_id, kit.today)
    if row is None:
        raise RuntimeError("The project that was just created cannot be read")
    need_money = float(row["forecast_cost"]) + float(row["other_cost"])
    need_hours = float(row["expected_hours"])
    spent = float(row["labor_cost"]) + float(row["other_cost"])
    worked = float(row["hours_worked"])
    total_days = (row["end_date"] - row["start_date"]).days + 1
    elapsed = min(max((kit.today - row["start_date"]).days + 1, 0), total_days)
    schedule = 100.0 * elapsed / total_days

    budget, hours = need_money * 1.1, need_hours * 1.1
    if kind == "at_risk":
        budget = need_money * _BUDGET_SHARE["at_risk"]  # staffing will cost more than the budget
    elif schedule >= 5:
        # Stay clearly behind the calendar so spend and hours never look ahead of it.
        budget = max(budget, spent / (0.8 * schedule / 100))
        hours = max(hours, worked / (0.8 * schedule / 100))
    projects_repo.update(
        kit.conn, project_id,
        {"budget_amount": math.ceil(budget / 500) * 500, "allocated_hours": math.ceil(hours / 10) * 10},
    )


def seed_extended(kit: SeedKit) -> None:
    """Add the larger company on top of the original one (which must already exist)."""
    d = dt.timedelta
    managers = {"Maria": _by_email(kit, "maria"), "James": _by_email(kit, "james")}
    for name, title, rate in MANAGERS:
        managers[name.split()[0]] = kit.make_user(name, "manager", title, rate)
    people = {
        name.split()[0]: kit.make_user(name, "employee", title, rate, managers[boss]["id"])
        for name, title, rate, boss in EMPLOYEES
    }

    milestones: dict[tuple[str, str], Any] = {}
    projects: dict[str, Any] = {}
    for spec in PROJECTS:
        boss = managers[spec.manager]
        pid = projects[spec.name] = kit.make_project(
            spec.name, boss, kit.today + d(days=spec.start), kit.today + d(days=spec.end), 1000, 100000
        )
        for stage in spec.stages:
            first, last = kit.today + d(days=stage.start), kit.today + d(days=stage.end)
            crew = [
                (people[s[0]], kit.today + d(days=s[1]), kit.today + d(days=s[2])) if isinstance(s, tuple) else people[s]
                for s in stage.staff
            ]
            rates = [float((c[0] if isinstance(c, tuple) else c)["salary"] or 0) for c in crew]
            hours = math.ceil(_workdays(kit, first, last) * 8 * max(1, len(crew)) * 1.1 / 10) * 10
            budget = math.ceil(hours * (sum(rates) / len(rates) if rates else 55) * 1.2 / 100) * 100
            tasks: list[tuple[Any, ...]] = []
            for t in stage.tasks:
                extra: dict[str, Any] = {"priority": t.priority}
                if t.owner:
                    extra["owner"] = people[t.owner]
                if t.due is not None:
                    extra["due"] = t.due
                if t.state == "doing":
                    extra["status"] = "in_progress"
                tasks.append((t.name, t.state == "done", extra))
            milestones[(spec.name, stage.name)] = kit.make_milestone(
                pid, boss, stage.name, first, last, hours, budget, crew, tasks,
                status="in_progress" if stage.state == "doing" else "pending", complete=stage.state == "done",
            )
        for category, text, amount, when in spec.costs:
            kit.add_cost(pid, category, text, amount, kit.today + d(days=when))
        if spec.kind == "completed":
            projects_repo.set_status(kit.conn, pid, "completed", completed_at=dates.now())
        _tune(kit, pid, spec.kind)

    for (first_project, first_stage), (then_project, then_stage) in LINKS:
        if first_stage is None or then_stage is None:
            kit.link("project", projects[first_project], projects[then_project])
        else:
            kit.link("milestone", milestones[(first_project, first_stage)], milestones[(then_project, then_stage)])
