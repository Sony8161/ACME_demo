"""Audit history: every change to people, projects, milestones, deliverables, teams and costs is recorded by the database."""

from __future__ import annotations

import psycopg
import pytest

from app.domains.audit import service as audit_service

pytestmark = pytest.mark.integration


def _history(api, headers=None, **params):
    resp = api.client.get("/audit", params=params, headers=headers or api.admin.headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.fixture
def story(api, today):
    """A manager runs a small project: milestone, checklist, a person on it, a tick, a sign-off."""
    manager = api.user("manager", "Maria Lopez")
    employee = api.user("employee", "Alex Kim", manager=manager, salary=40)
    project = api.project(manager, name="Apollo")
    pid = project["id"]
    ms = api.milestone(pid, manager, name="Build")
    mid = ms["id"]
    item = api.deliverable(pid, mid, "Spec", manager=manager)
    assert api.assign(pid, mid, employee, manager.headers).status_code == 201
    base = f"/projects/{pid}/milestones/{mid}"
    assert api.client.patch(f"{base}/deliverables/{item['id']}", json={"done": True}, headers=manager.headers).status_code == 200
    done = api.client.post(f"{base}/complete", json={"review_note": "Looks good"}, headers=manager.headers)
    assert done.status_code == 200, done.text
    return api, manager, employee, pid, mid


def test_a_project_story_reads_back_newest_first_with_who_and_what(story):
    api, manager, _, pid, _ = story
    items = _history(api, project_id=pid)["items"]
    summaries = [(i["actor_name"], i["summary"]) for i in items]
    assert summaries == [
        ("Maria Lopez", "Changed the dates of Alex Kim on Build"),  # signing off ends the team's work today
        ("Maria Lopez", "Signed off milestone Build"),
        ("Maria Lopez", "Ticked deliverable Spec"),
        ("Maria Lopez", "Assigned Alex Kim on Build"),
        ("Maria Lopez", "Added deliverable Spec"),
        ("Maria Lopez", "Added milestone Build"),
        (api.admin.name, "Created project Apollo"),
    ]
    assert items[1]["actor_id"] == manager.id
    assert items[1]["entity"] == "milestone" and items[1]["project_name"] == "Apollo"
    sign_off = {c["field"]: c for c in items[1]["changes"]}
    assert sign_off["status"]["before"] == "pending" and sign_off["status"]["after"] == "completed"
    assert sign_off["review_note"]["after"] == "Looks good"
    assert sign_off["status"]["label"] == "Status"


def test_people_are_recorded_without_any_secret(story, raw_db):
    api, _, _, _, _ = story
    people = _history(api, entity="person")["items"]
    assert any(i["summary"] == "Added person Alex Kim (employee)" for i in people)
    blob = str(people)
    assert "password_hash" not in blob and "$2" not in blob  # no bcrypt hash anywhere
    stored = raw_db.execute("SELECT changes::text AS c FROM audit_log WHERE entity = 'person'").fetchall()
    assert all("$2" not in row["c"] and "password_hash" not in row["c"] for row in stored)


def test_a_password_change_is_recorded_but_not_its_value(api):
    # The helper signs a new user in and changes their password; the admin's own change is already in the log.
    changes = [i for i in _history(api, entity="person")["items"] if i["summary"].startswith("Changed the password")]
    assert changes and changes[0]["actor_name"] == api.admin.name
    assert changes[0]["changes"] == [{"field": "password", "label": "Password", "before": None, "after": "changed"}]


def test_failed_sign_ins_do_not_fill_the_history(api):
    before = _history(api)["total"]
    for _ in range(3):
        api.client.post("/auth/login", json={"username": api.admin.username, "password": "wrong-password-1"})
    assert _history(api)["total"] == before


def test_manager_change_shows_names_not_ids(api, today):
    first, second = api.user("manager", "Maria Lopez"), api.user("manager", "James Carter")
    project = api.project(first, name="Apollo")
    moved = api.client.patch(f"/projects/{project['id']}", json={"manager_id": second.id}, headers=api.admin.headers)
    assert moved.status_code == 200, moved.text
    latest = _history(api, project_id=project["id"])["items"][0]
    assert latest["summary"] == "Edited project Apollo (manager)"
    assert latest["changes"] == [{"field": "manager_id", "label": "Manager", "before": "Maria Lopez", "after": "James Carter"}]


def test_archive_and_restore_are_their_own_actions(api, today):
    manager = api.user("manager")
    project = api.project(manager, name="Apollo")
    api.client.post(f"/projects/{project['id']}/archive", headers=api.admin.headers)
    api.client.post(f"/projects/{project['id']}/unarchive", headers=api.admin.headers)
    actions = [(i["action"], i["summary"]) for i in _history(api, project_id=project["id"], entity="project")["items"]]
    assert actions == [("restore", "Restored project Apollo"), ("archive", "Archived project Apollo"), ("create", "Created project Apollo")]


def test_a_refused_request_leaves_no_history(api, today):
    manager = api.user("manager")
    api.project(manager, name="Apollo")
    before = _history(api)["total"]
    duplicate = api.client.post(
        "/projects",
        json={"name": "apollo", "manager_id": manager.id, "start_date": "2026-03-02", "end_date": "2026-04-30",
              "allocated_hours": 1, "budget_amount": 1},
        headers=api.admin.headers,
    )
    assert duplicate.status_code == 409
    assert _history(api)["total"] == before


def test_work_done_outside_a_request_is_attributed_to_the_system(api):
    first = _history(api, entity="person")["items"][-1]  # the bootstrap admin, created at start-up
    assert first["actor_name"] == "System" and first["actor_id"] is None and first["summary"].startswith("Added person")


def test_filters_by_person_entity_action_and_date(story):
    api, manager, _, pid, _ = story
    by_manager = _history(api, actor_id=manager.id)
    assert by_manager["total"] == 7  # six changes to the project, and their own password change
    assert {i["actor_id"] for i in by_manager["items"]} == {manager.id}
    assert {i["entity"] for i in _history(api, project_id=pid, entity="deliverable")["items"]} == {"deliverable"}
    assert _history(api, project_id=pid, action="create")["total"] == 4
    assert _history(api, project_id=pid, action="archive")["total"] == 1  # signing off archives the milestone
    assert _history(api, project_id=pid, to="2000-01-01")["total"] == 0
    assert _history(api, project_id=pid, **{"from": "2000-01-01"})["total"] == 7
    assert api.client.get("/audit?entity=nonsense", headers=api.admin.headers).status_code == 400


def test_history_is_paged(story):
    api, _, _, pid, _ = story
    first = _history(api, project_id=pid, page=1, page_size=3)
    second = _history(api, project_id=pid, page=2, page_size=3)
    assert first["total"] == second["total"] == 7 and len(first["items"]) == 3 and len(second["items"]) == 3
    assert not {i["id"] for i in first["items"]} & {i["id"] for i in second["items"]}
    assert api.client.get("/audit?page_size=1000", headers=api.admin.headers).status_code == 400


def test_only_admins_read_the_whole_log(story):
    api, manager, employee, _, _ = story
    assert api.client.get("/audit", headers=manager.headers).status_code == 403
    assert api.client.get("/audit", headers=employee.headers).status_code == 403
    assert api.client.get("/audit").status_code == 401


def test_a_manager_reads_the_history_of_their_own_project_only(story):
    api, manager, employee, pid, _ = story
    own = api.client.get(f"/projects/{pid}/history", headers=manager.headers)
    assert own.status_code == 200 and own.json()["total"] == 7
    assert api.client.get(f"/projects/{pid}/history", headers=api.admin.headers).json()["total"] == 7
    other = api.user("manager", "Other Manager")
    assert api.client.get(f"/projects/{pid}/history", headers=other.headers).status_code == 404
    assert api.client.get(f"/projects/{pid}/history", headers=employee.headers).status_code == 403


def test_history_cannot_be_edited_or_removed(story, raw_db):
    with pytest.raises(psycopg.errors.RaiseException, match="append-only"):
        raw_db.execute("UPDATE audit_log SET actor_name = 'Someone else'")
    with pytest.raises(psycopg.errors.RaiseException, match="append-only"):
        raw_db.execute("DELETE FROM audit_log")


def test_the_history_survives_archiving_the_person_who_acted(api, today):
    temp = api.user("manager", "Temp Manager")
    project = api.project(temp, name="Zeus")
    api.milestone(project["id"], temp, name="Plan")
    assert api.client.post(f"/projects/{project['id']}/archive", headers=api.admin.headers).status_code == 200
    assert api.client.post(f"/users/{temp.id}/archive", headers=api.admin.headers).status_code == 200
    items = _history(api, project_id=project["id"])["items"]
    assert "Temp Manager" in {i["actor_name"] for i in items} and any(i["summary"] == "Added milestone Plan" for i in items)


@pytest.mark.parametrize(
    ("row", "expected"),
    [
        ({"entity": "cost", "action": "create", "label": "AWS", "changes": {}}, "Added cost AWS"),
        ({"entity": "cost", "action": "archive", "label": "AWS", "changes": {}}, "Archived cost AWS"),
        ({"entity": "assignment", "action": "archive", "label": "Alex on Build", "changes": {}}, "Removed Alex on Build"),
        ({"entity": "assignment", "action": "update", "label": "Alex on Build", "changes": {"end_date": {}}}, "Changed the dates of Alex on Build"),
        ({"entity": "deliverable", "action": "update", "label": "Spec", "changes": {"done": {"after": False}}}, "Unticked deliverable Spec"),
        ({"entity": "milestone", "action": "update", "label": "Build", "changes": {"due_date": {}, "name": {}}}, "Edited milestone Build (due date, name)"),
        ({"entity": "person", "action": "update", "label": "Alex", "changes": {"role": {}}}, "Edited person Alex (role)"),
        ({"entity": "project", "action": "complete", "label": "Apollo", "changes": {}}, "Changed project Apollo"),
    ],
)
def test_summaries_read_like_sentences(row, expected):
    assert audit_service.summarise(row) == expected
