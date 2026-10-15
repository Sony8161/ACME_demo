"""First-admin bootstrap and the optional demo dataset."""

from __future__ import annotations

import datetime as dt
import logging
from typing import Any

import psycopg

from app.config import get_settings
from app.core import dates, security
from app.db import MIGRATION_LOCK_ID
from app.domains.users import repository as users_repo
from app.seed_kit import DEMO_DOMAIN, SeedKit

logger = logging.getLogger(__name__)


def ensure_bootstrap_admin(conn: psycopg.Connection[Any]) -> None:
    """Create the first admin when the system has none. Safe to run on every cold start."""
    conn.execute("SELECT pg_advisory_xact_lock(%s)", (MIGRATION_LOCK_ID,))
    if users_repo.count_by_role(conn, "admin", include_archived=True) > 0:
        return
    settings = get_settings()
    if not settings.bootstrap_admin_password:
        raise RuntimeError("BOOTSTRAP_ADMIN_PASSWORD must be set to create the first admin account")
    security.validate_password_strength(settings.bootstrap_admin_password)
    users_repo.insert(
        conn,
        username=settings.bootstrap_admin_username,
        password_hash=security.hash_password(settings.bootstrap_admin_password),
        name="System Admin",
        email="admin@acme.example",
        job_title="Administrator",
        role="admin",
        manager_id=None,
        salary=0,
        must_change_password=True,
    )
    logger.info("Created bootstrap admin '%s' (password change required at first login)", settings.bootstrap_admin_username)


def seed_demo(conn: psycopg.Connection[Any], admin_id: Any) -> dict[str, Any]:
    """Create two managers, six employees and four projects in different health states.

    Idempotent: if the demo accounts already exist nothing is created. The accounts get
    random one-time passwords, returned once in the response.
    """
    existing = conn.execute("SELECT 1 FROM users WHERE email LIKE %s LIMIT 1", (f"%{DEMO_DOMAIN}",)).fetchone()
    if existing:
        return {"created": False, "message": "Demo data already exists", "accounts": []}

    kit = SeedKit(conn, admin_id, dates.today())
    today, d = kit.today, dt.timedelta
    make_user, make_project = kit.make_user, kit.make_project
    make_milestone, link, add_cost = kit.make_milestone, kit.link, kit.add_cost

    maria = make_user("Maria Lopez", "manager", "Engineering Manager", 70)
    james = make_user("James Carter", "manager", "Delivery Manager", 75)
    alex = make_user("Alex Kim", "employee", "Frontend Developer", 50, maria["id"])
    priya = make_user("Priya Shah", "employee", "UX Designer", 45, maria["id"])
    tom = make_user("Tom Becker", "employee", "Backend Developer", 52, james["id"])
    lena = make_user("Lena Fischer", "employee", "QA Engineer", 40, james["id"])
    omar = make_user("Omar Haddad", "employee", "Data Engineer", 60, james["id"])
    sofia = make_user("Sofia Rossi", "employee", "Business Analyst", 50, maria["id"])

    # On track: two thirds of the time has passed, a bit over a third of the budget is used.
    p1 = make_project("Website Redesign", maria, today - d(days=60), today + d(days=30), 1200, 60000)
    make_milestone(p1, maria, "Design sign-off", today - d(days=60), today - d(days=20), 200, 8000, [priya],
                   [("Wireframes", True), ("Style guide", True)], complete=True)
    build = make_milestone(p1, maria, "Build", today - d(days=19), today + d(days=10), 700, 30000, [alex],
                   [("Login page", True, {"priority": "high", "owner": alex, "due": -5}),
                    ("Dashboard", False, {"priority": "high", "owner": alex, "due": 3, "status": "in_progress"})],
                   status="in_progress")
    launch = make_milestone(p1, maria, "Launch", today + d(days=11), today + d(days=30), 200, 9000, [],
                   [("Press kit", False, {"priority": "medium", "due": 25}),
                    ("Launch announcement", False, {"priority": "high", "due": 28})])
    add_cost(p1, "license", "Design tool licences", 3000, today - d(days=40))
    add_cost(p1, "technology", "Hosting", 2000, today - d(days=10))

    # Overdue: the end date has passed and both milestones are late.
    p2 = make_project("Mobile App Launch", james, today - d(days=50), today - d(days=3), 400, 40000)
    beta = make_milestone(p2, james, "Beta release", today - d(days=50), today - d(days=20), 150, 15000, [tom],
                   [("Beta build", False, {"priority": "urgent", "owner": tom, "due": -25, "status": "in_progress"})])
    store = make_milestone(p2, james, "Store submission", today - d(days=19), today - d(days=3), 150, 15000, [lena],
                   [("Store listing", False, {"priority": "high", "owner": lena, "due": -5})])
    add_cost(p2, "vendor", "App store consultancy", 4000, today - d(days=15))

    # At risk: spending runs far ahead of the calendar and the planned staffing exceeds the budget.
    p3 = make_project("Data Platform Migration", james, today - d(days=30), today + d(days=60), 900, 30000)
    inventory = make_milestone(p3, james, "Inventory", today - d(days=30), today - d(days=10), 100, 4000, [omar],
                   [("System inventory", True)], complete=True)
    cutover = make_milestone(p3, james, "Cut-over", today - d(days=9), today + d(days=60), 600, 20000, [omar],
                   [("Data copied", False, {"priority": "high", "owner": omar, "due": 10, "status": "in_progress"}),
                    ("Cut-over plan", False, {"priority": "urgent", "owner": omar, "due": 5})], status="in_progress")
    add_cost(p3, "license", "Warehouse licences", 12000, today - d(days=20))

    # Planned: has not started yet.
    p4 = make_project("Customer Portal", maria, today + d(days=14), today + d(days=90), 800, 50000)
    make_milestone(
        p4, maria, "Discovery", today + d(days=14), today + d(days=40), 200, 10000, [sofia],
        [("Interview notes", False, {"priority": "medium", "owner": sofia, "due": 20})],
    )

    # Dependencies: Launch waits for Build; the store submission waits for the beta; the cut-over waited for the inventory (done);
    # the customer portal waits for the website redesign.
    link("milestone", build, launch)
    link("milestone", beta, store)
    link("milestone", inventory, cutover)
    link("project", p1, p4)

    return {"created": True, "message": "Demo data created", "accounts": kit.accounts}
