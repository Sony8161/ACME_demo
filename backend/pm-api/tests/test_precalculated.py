"""Expected hours and cost are stored on each assignment (by a database trigger) and use the rate it was planned at."""

from __future__ import annotations

import datetime as dt
import shutil
from pathlib import Path

import psycopg
import pytest
from psycopg.rows import dict_row

from app import db
from tests.conftest import TEST_DB, _admin_conninfo

pytestmark = pytest.mark.integration


@pytest.fixture
def plan(api, today):
    """Two managers, two projects, each with one milestone covering today."""
    m1, m2 = api.user("manager", "Maria"), api.user("manager", "James")
    p1, p2 = api.project(m1, name="Apollo"), api.project(m2, name="Borealis")
    return api, (m1, p1, api.milestone(p1["id"], m1, name="Build")), (m2, p2, api.milestone(p2["id"], m2, name="Migrate"))


def url(project, milestone, *tail):
    return "/".join([f"/projects/{project['id']}/milestones/{milestone['id']}/team", *tail])


def member(api, p, ms, headers):
    return api.client.get(url(p, ms), headers=headers).json()["items"][0]


def test_an_assignment_stores_its_expected_hours_cost_and_rate(plan):
    api, (m1, p1, ms1), _ = plan
    person = api.user("employee", manager=m1, salary=50)
    api.assign(p1["id"], ms1["id"], person, m1.headers, start_date="2026-03-09", end_date="2026-03-20")  # Mon 9 to Fri 20
    boss = member(api, p1, ms1, m1.headers)
    assert boss["expected_hours"] == 80 and boss["hourly_rate"] == 50 and boss["expected_cost"] == 4000
    seen_by_employee = member(api, p1, ms1, person.headers)
    assert seen_by_employee["expected_hours"] == 80  # hours are not money
    assert seen_by_employee["expected_cost"] is None and seen_by_employee["hourly_rate"] is None


def test_changing_the_dates_recomputes_the_stored_totals(plan):
    api, (m1, p1, ms1), _ = plan
    person = api.user("employee", manager=m1, salary=40)
    api.assign(p1["id"], ms1["id"], person, m1.headers, start_date="2026-03-09", end_date="2026-03-20")
    api.client.patch(url(p1, ms1, person.id), json={"end_date": "2026-03-13"}, headers=m1.headers)  # Mon to Fri: 5 days
    changed = member(api, p1, ms1, m1.headers)
    assert changed["expected_hours"] == 40 and changed["expected_cost"] == 1600
    api.client.post(url(p1, ms1, person.id, "archive"), headers=m1.headers)  # ending today (Wed 11): 3 days
    ended = api.client.get(url(p1, ms1), headers=m1.headers).json()["items"][0]
    assert ended["expected_hours"] == 24 and ended["expected_cost"] == 960


def test_project_and_milestone_totals_add_up_the_stored_fields(plan):
    api, (m1, p1, ms1), _ = plan
    for salary, name in ((50, "A"), (30, "B")):
        api.assign(p1["id"], ms1["id"], api.user("employee", name, manager=m1, salary=salary), m1.headers,
                   start_date="2026-03-09", end_date="2026-03-13")
    milestone = api.client.get(f"/projects/{p1['id']}/milestones/{ms1['id']}", headers=m1.headers).json()
    assert milestone["expected_hours"] == 80 and milestone["expected_cost"] == 40 * 50 + 40 * 30
    project = api.client.get(f"/projects/{p1['id']}", headers=m1.headers).json()["summary"]
    assert project["expected_hours"] == 80 and project["forecast_cost"] == 3200


def test_a_raise_applies_to_work_that_has_not_started_and_never_reprices_the_past(plan):
    api, (m1, p1, ms1), _ = plan
    later = api.milestone(p1["id"], m1, name="Later", start="2026-04-06", due="2026-04-17")
    person = api.user("employee", manager=m1, salary=50)
    api.assign(p1["id"], ms1["id"], person, m1.headers, start_date="2026-03-09", end_date="2026-03-27")  # started
    api.assign(p1["id"], later["id"], person, m1.headers, start_date="2026-04-06", end_date="2026-04-10")  # not yet
    before = member(api, p1, ms1, m1.headers)

    raised = api.client.patch(f"/users/{person.id}", json={"salary": 60}, headers=api.admin.headers)
    assert raised.status_code == 200

    started = member(api, p1, ms1, m1.headers)
    assert started["hourly_rate"] == 50 and started["labor_cost"] == before["labor_cost"] == 3 * 8 * 50
    assert started["expected_cost"] == before["expected_cost"]
    upcoming = member(api, p1, later, m1.headers)
    assert upcoming["hourly_rate"] == 60 and upcoming["expected_cost"] == 40 * 60


# ---------------------------------------------------------------------------------------- migration 003 on existing data

def test_migration_003_gives_existing_assignments_their_rate_and_totals(tmp_path: Path):
    """Data written under migrations 001 and 002 is backfilled, not lost or zeroed."""
    name = "pm_migration_003"
    older = tmp_path / "older"
    older.mkdir()
    for f in sorted(db.MIGRATIONS_DIR.glob("00[12]_*.sql")):
        shutil.copy(f, older / f.name)
    try:
        with psycopg.connect(_admin_conninfo(), autocommit=True) as admin:
            admin.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
            admin.execute(f'CREATE DATABASE "{name}"')
    except psycopg.OperationalError as exc:
        pytest.skip(f"PostgreSQL is not reachable: {exc}")
    conninfo = _admin_conninfo(name)
    try:
        with psycopg.connect(conninfo, row_factory=dict_row) as conn:
            db.run_migrations(conn, older)
            conn.commit()
            boss = conn.execute(
                "INSERT INTO users (username, password_hash, name, email, role, salary) "
                "VALUES ('boss01', 'x', 'Boss', 'boss@x.test', 'manager', 70) RETURNING id"
            ).fetchone()["id"]
            worker = conn.execute(
                "INSERT INTO users (username, password_hash, name, email, role, manager_id, salary) "
                "VALUES ('work01', 'x', 'Worker', 'work@x.test', 'employee', %s, 45) RETURNING id", (boss,)
            ).fetchone()["id"]
            project = conn.execute(
                "INSERT INTO projects (name, manager_id, start_date, end_date) VALUES ('P', %s, %s, %s) RETURNING id",
                (boss, dt.date(2026, 3, 2), dt.date(2026, 4, 30)),
            ).fetchone()["id"]
            milestone = conn.execute(
                "INSERT INTO milestones (project_id, name, start_date, due_date) VALUES (%s, 'M', %s, %s) RETURNING id",
                (project, dt.date(2026, 3, 9), dt.date(2026, 3, 27)),
            ).fetchone()["id"]
            conn.execute(
                "INSERT INTO milestone_assignments (milestone_id, user_id, start_date, end_date) VALUES (%s, %s, %s, %s)",
                (milestone, worker, dt.date(2026, 3, 9), dt.date(2026, 3, 20)),
            )
            conn.commit()

            applied = db.run_migrations(conn, db.MIGRATIONS_DIR)
            assert applied == ["003_precalculated_cost_and_login_throttle"]
            row = conn.execute("SELECT hourly_rate, expected_hours, expected_cost FROM milestone_assignments").fetchone()
            assert (row["hourly_rate"], row["expected_hours"], row["expected_cost"]) == (45, 80, 3600)
    finally:
        with psycopg.connect(_admin_conninfo(), autocommit=True) as admin:
            admin.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
    assert TEST_DB != name  # the migration test never touches the shared test database
