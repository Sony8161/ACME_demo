"""The timeline: projects and their milestones laid out by date, for admins and managers."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


@pytest.fixture
def setup(api, today):
    maria = api.user("manager", "Maria Lopez")
    james = api.user("manager", "James Carter")
    alex = api.user("employee", "Alex Kim", manager=maria)
    apollo, build = api.setup_work(maria, alex, project="Apollo", milestone="Build")
    zeus = api.project(james, name="Zeus")
    api.milestone(zeus["id"], james, name="Plan", start="2026-03-09", due="2026-03-13")
    return api, maria, james, alex, apollo["id"], build["id"], zeus["id"]


def _timeline(api, headers=None, **params):
    resp = api.client.get("/reports/timeline", params=params, headers=headers or api.admin.headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_an_admin_sees_every_open_project_with_its_milestones(setup):
    api, _, _, _, _, _, _ = setup
    data = _timeline(api)
    assert data["as_of"] == "2026-03-11"
    assert {p["name"] for p in data["projects"]} == {"Apollo", "Zeus"}
    apollo = next(p for p in data["projects"] if p["name"] == "Apollo")
    assert apollo["manager_name"] == "Maria Lopez" and apollo["risk_level"] in {"on_track", "at_risk", "overdue", "done"}
    assert (apollo["start_date"], apollo["end_date"]) == ("2026-03-02", "2026-04-30")
    build = apollo["milestones"][0]
    assert (build["name"], build["start_date"], build["due_date"], build["status"]) == ("Build", "2026-03-09", "2026-03-27", "pending")
    assert build["is_overdue"] is False


def test_a_manager_sees_only_their_own_projects(setup):
    api, maria, james, _, _, _, _ = setup
    assert [p["name"] for p in _timeline(api, maria.headers)["projects"]] == ["Apollo"]
    assert [p["name"] for p in _timeline(api, james.headers)["projects"]] == ["Zeus"]


def test_an_employee_cannot_read_it(setup):
    api, _, _, alex, _, _, _ = setup
    assert api.client.get("/reports/timeline", headers=alex.headers).status_code == 403
    assert api.client.get("/reports/timeline").status_code == 401


def test_a_milestone_counts_its_tasks_and_knows_when_it_is_late(setup):
    api, maria, _, _, pid, mid, _ = setup
    api.deliverable(pid, mid, "Spec", manager=maria, done=True)
    api.deliverable(pid, mid, "Design", manager=maria)
    late = api.milestone(pid, maria, name="Early", start="2026-03-02", due="2026-03-06")  # due last Friday, still open
    data = _timeline(api, maria.headers, project_id=pid)
    by_name = {m["name"]: m for m in data["projects"][0]["milestones"]}
    assert (by_name["Build"]["tasks_total"], by_name["Build"]["tasks_done"]) == (2, 1)
    assert by_name["Early"]["is_overdue"] is True and late["id"] == by_name["Early"]["id"]
    assert [m["name"] for m in data["projects"][0]["milestones"]] == ["Early", "Build"]  # by start date


def test_signed_off_milestones_stay_on_the_timeline_but_cancelled_ones_do_not(setup):
    api, maria, _, _, pid, mid, _ = setup
    api.deliverable(pid, mid, "Spec", manager=maria, done=True)
    done = api.client.post(f"/projects/{pid}/milestones/{mid}/complete", json={"review_note": "ok"}, headers=maria.headers)
    assert done.status_code == 200, done.text
    mistake = api.milestone(pid, maria, name="Mistake", start="2026-03-16", due="2026-03-20")
    assert api.client.post(f"/projects/{pid}/milestones/{mistake['id']}/archive", headers=maria.headers).status_code == 200
    milestones = _timeline(api, maria.headers, project_id=pid)["projects"][0]["milestones"]
    assert [(m["name"], m["status"], m["is_overdue"]) for m in milestones] == [("Build", "completed", False)]


def test_it_can_be_narrowed_to_one_project_and_leaves_out_archived_ones(setup):
    api, _, _, _, pid, _, zid = setup
    assert [p["name"] for p in _timeline(api, project_id=zid)["projects"]] == ["Zeus"]
    assert api.client.post(f"/projects/{pid}/archive", headers=api.admin.headers).status_code == 200
    assert [p["name"] for p in _timeline(api)["projects"]] == ["Zeus"]
    maria_view = api.client.get("/reports/timeline", params={"project_id": zid}, headers=api.user("manager", "Third").headers)
    assert maria_view.json()["projects"] == []  # someone else's project is simply not there
