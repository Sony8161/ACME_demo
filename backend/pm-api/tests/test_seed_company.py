"""The larger sample company: 12 projects, 30 people, 100+ tasks, every health state."""

from __future__ import annotations

import threading
import time
from typing import Any

import psycopg
import psycopg.rows
import pytest

from app import seed
from app.config import get_settings
from tests.conftest import TEST_DB, _admin_conninfo

pytestmark = pytest.mark.integration

HEALTH = {
    "Website Redesign": ("active", "on_track"),
    "Payments Gateway Upgrade": ("active", "on_track"),
    "Warehouse Automation": ("active", "on_track"),
    "Analytics Dashboard": ("active", "on_track"),
    "Data Platform Migration": ("active", "at_risk"),
    "Customer Support Chatbot": ("active", "at_risk"),
    "Mobile App Launch": ("active", "overdue"),
    "Security Compliance Audit": ("active", "overdue"),
    "Customer Portal": ("planned", "on_track"),
    "HR Self-Service Portal": ("planned", "on_track"),
    "Partner Onboarding Kit": ("planned", "on_track"),
    "Brand Refresh": ("completed", "done"),
}
URGENCY = {"overdue": 0, "at_risk": 1, "on_track": 2, "done": 3}
MARKER = "hannah.weiss@demo.acme.example"


def _seed(api):
    resp = api.client.post("/admin/seed-demo", headers=api.admin.headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_fresh_seed_has_30_accounts_12_projects_100_tasks(api, raw_db, today):
    out = _seed(api)
    roles = [a["role"] for a in out["accounts"]]
    assert (len(roles), roles.count("manager"), roles.count("employee")) == (30, 4, 26)
    assert len({a["username"] for a in out["accounts"]}) == 30
    projects = api.client.get("/projects", headers=api.admin.headers, params={"page_size": 100}).json()["items"]
    assert len(projects) == 12
    assert raw_db.execute("SELECT count(*) AS n FROM deliverables").fetchone()["n"] >= 100


def test_every_project_has_the_planned_health_and_the_overview_lists_urgent_first(api, today):
    _seed(api)
    items = api.client.get("/reports/overview", headers=api.admin.headers).json()["projects"]
    assert {p["name"]: (p["status"], p["summary"]["risk_level"]) for p in items} == HEALTH
    order = [URGENCY[p["summary"]["risk_level"]] for p in items]
    assert order == sorted(order)


def test_tasks_are_a_realistic_mix(api, raw_db, today):
    _seed(api)
    by_status = {r["status"]: r["n"] for r in raw_db.execute("SELECT status, count(*) AS n FROM deliverables GROUP BY status")}
    assert all(by_status.get(s, 0) >= 15 for s in ("todo", "in_progress", "done")), by_status
    row = raw_db.execute(
        "SELECT count(*) FILTER (WHERE assignee_id IS NULL) AS unassigned, count(*) FILTER (WHERE due_date IS NULL) AS undated,"
        " count(*) FILTER (WHERE due_date < %s AND status <> 'done') AS late FROM deliverables",
        (today,),
    ).fetchone()
    assert row["unassigned"] >= 5 and row["undated"] >= 5 and row["late"] >= 5, row


def test_nobody_is_booked_twice_and_five_are_free(api, raw_db, today):
    _seed(api)
    clash = raw_db.execute(
        "SELECT a.user_id FROM milestone_assignments a JOIN milestone_assignments b ON a.user_id = b.user_id AND a.id < b.id"
        " AND a.archived_at IS NULL AND b.archived_at IS NULL AND a.start_date <= b.end_date AND b.start_date <= a.end_date"
    ).fetchall()
    assert clash == []
    overview = api.client.get("/reports/overview", headers=api.admin.headers).json()
    assert overview["available_people"] >= 5
    assert len(overview["allocation"]) == 26


def test_top_up_adds_only_the_missing_layer(api, raw_db, today):
    seed.seed_core(raw_db, api.admin.id)  # the state the AWS site is in today: the original company only
    before = {r["name"]: r["id"] for r in raw_db.execute("SELECT id, name FROM users WHERE email LIKE '%@demo.acme.example'")}
    assert len(before) == 8

    out = _seed(api)
    assert out["created"] is True and len(out["accounts"]) == 22
    after = {r["name"]: r["id"] for r in raw_db.execute("SELECT id, name FROM users WHERE email LIKE '%@demo.acme.example'")}
    assert len(after) == 30 and all(after[name] == uid for name, uid in before.items())

    again = _seed(api)
    assert again["created"] is False and again["accounts"] == []


def test_an_archived_marker_person_does_not_make_it_run_again(api, raw_db, today):
    _seed(api)
    raw_db.execute("UPDATE users SET archived_at = now() WHERE email = %s", (MARKER,))
    again = _seed(api)
    assert again["created"] is False and again["accounts"] == []
    assert raw_db.execute("SELECT count(*) AS n FROM users WHERE email = %s", (MARKER,)).fetchone()["n"] == 1


def test_two_admins_pressing_at_once_create_one_company(api, today):
    """Two Lambda instances (separate database connections) race: the second waits, then finds the company there."""
    outcome: dict[str, Any] = {}

    def second_admin() -> None:
        with psycopg.connect(_admin_conninfo(TEST_DB), row_factory=psycopg.rows.dict_row) as conn:
            outcome["second"] = seed.seed_demo(conn, api.admin.id)

    with psycopg.connect(_admin_conninfo(TEST_DB), row_factory=psycopg.rows.dict_row) as first:
        outcome["first"] = seed.seed_demo(first, api.admin.id)  # holds the lock until it commits
        racer = threading.Thread(target=second_admin)
        racer.start()
        racer.join(timeout=1.0)
        assert racer.is_alive(), "the second admin should be waiting for the lock"
    racer.join(timeout=30)  # the first connection committed on leaving the block

    assert outcome["first"]["created"] is True and len(outcome["first"]["accounts"]) == 30
    assert outcome["second"]["created"] is False and outcome["second"]["accounts"] == []
    with psycopg.connect(_admin_conninfo(TEST_DB)) as check:
        assert check.execute("SELECT count(*) FROM users WHERE email LIKE '%@demo.acme.example'").fetchone()[0] == 30


def test_seeding_finishes_in_20_seconds_with_production_password_hashing(api, today, monkeypatch):
    monkeypatch.setenv("BCRYPT_ROUNDS", "12")
    get_settings.cache_clear()
    try:
        started = time.monotonic()
        _seed(api)
        assert time.monotonic() - started < 20
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()
