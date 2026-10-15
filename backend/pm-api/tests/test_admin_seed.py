"""Demo data and the first-admin bootstrap (the larger company has its own tests in test_seed_company.py)."""

from __future__ import annotations

import pytest

from tests.conftest import GOOD_PASSWORD

pytestmark = pytest.mark.integration


def test_seed_demo_is_admin_only_and_idempotent(api, today):
    manager = api.user("manager")
    assert api.client.post("/admin/seed-demo", headers=manager.headers).status_code == 403

    first = api.client.post("/admin/seed-demo", headers=api.admin.headers)
    assert first.status_code == 200 and first.json()["created"] is True
    accounts = first.json()["accounts"]
    assert len(accounts) == 30 and {a["role"] for a in accounts} == {"manager", "employee"}

    second = api.client.post("/admin/seed-demo", headers=api.admin.headers).json()
    assert second["created"] is False and second["accounts"] == []


def test_demo_data_shows_every_health_state_and_available_people(api, today):
    api.client.post("/admin/seed-demo", headers=api.admin.headers)
    out = api.client.get("/reports/overview", headers=api.admin.headers).json()
    names = {p["name"]: p for p in out["projects"]}
    assert {"Website Redesign", "Mobile App Launch", "Data Platform Migration", "Customer Portal"} <= set(names)  # the original four
    assert len(names) == 12  # the larger company is checked in test_seed_company.py
    assert names["Website Redesign"]["summary"]["risk_level"] == "on_track"
    assert names["Mobile App Launch"]["summary"]["risk_level"] == "overdue"
    assert names["Data Platform Migration"]["summary"]["risk_level"] == "at_risk"
    assert names["Customer Portal"]["status"] == "planned"
    assert out["available_people"] >= 1 and out["totals"]["spent"] > 0


def test_demo_accounts_can_sign_in(api, today):
    accounts = api.client.post("/admin/seed-demo", headers=api.admin.headers).json()["accounts"]
    employee = next(a for a in accounts if a["role"] == "employee")
    login = api.client.post("/auth/login", json={"username": employee["username"], "password": employee["temporary_password"]})
    assert login.status_code == 200 and login.json()["user"]["must_change_password"] is True
    assert GOOD_PASSWORD  # accounts keep one-time passwords; they must change them at first login


def test_demo_data_has_dependencies_between_milestones_and_projects(api, today):
    assert api.client.post("/admin/seed-demo", headers=api.admin.headers).status_code == 200
    projects = {p["name"]: p for p in api.client.get("/projects", headers=api.admin.headers).json()["items"]}
    assert projects["Customer Portal"]["blocked_by_count"] == 1 and projects["Website Redesign"]["blocked_by_count"] == 0  # the portal waits
    website = projects["Website Redesign"]["id"]
    milestones = {m["name"]: m for m in api.client.get(f"/projects/{website}/milestones", headers=api.admin.headers).json()["items"]}
    assert (milestones["Launch"]["blocked_by_count"], milestones["Build"]["blocked_by_count"]) == (1, 0)
    mobile = api.client.get(f"/projects/{projects['Mobile App Launch']['id']}/milestones", headers=api.admin.headers).json()["items"]
    assert {m["name"]: m["blocked_by_count"] for m in mobile} == {"Beta release": 0, "Store submission": 1}
    data_platform = api.client.get(f"/projects/{projects['Data Platform Migration']['id']}/milestones", headers=api.admin.headers).json()["items"]
    assert all(m["blocked_by_count"] == 0 for m in data_platform)  # the inventory it waited for is signed off
