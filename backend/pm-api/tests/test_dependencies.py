"""Dependencies: a milestone or a project can wait for another one to be completed first."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


def _mdeps(pid, mid):
    return f"/projects/{pid}/milestones/{mid}/dependencies"


@pytest.fixture
def plan(api, today):
    """One project with Build then Launch (Launch not yet linked)."""
    maria = api.user("manager", "Maria Lopez")
    alex = api.user("employee", "Alex Kim", manager=maria)
    project = api.project(maria, name="Apollo")
    pid = project["id"]
    build = api.milestone(pid, maria, name="Build", start="2026-03-09", due="2026-03-20")
    launch = api.milestone(pid, maria, name="Launch", start="2026-03-23", due="2026-03-31", hours=100, budget=5000)
    return api, maria, alex, pid, build["id"], launch["id"]


def _link(api, who, pid, successor, predecessor):
    return api.client.post(_mdeps(pid, successor), json={"depends_on_milestone_id": predecessor}, headers=who.headers)


def test_a_milestone_can_wait_for_another_in_the_same_project(plan):
    api, maria, _, pid, build, launch = plan
    resp = _link(api, maria, pid, launch, build)
    assert resp.status_code == 201, resp.text
    ref = resp.json()
    assert (ref["kind"], ref["name"], ref["project_name"], ref["status"], ref["is_done"]) == ("milestone", "Build", "Apollo", "pending", False)
    assert ref["item_id"] == build and ref["visible"] is True

    waiting = api.client.get(_mdeps(pid, launch), headers=maria.headers).json()
    assert waiting["is_blocked"] is True and [r["name"] for r in waiting["blocked_by"]] == ["Build"] and waiting["blocks"] == []
    blocking = api.client.get(_mdeps(pid, build), headers=maria.headers).json()
    assert blocking["is_blocked"] is False and [r["name"] for r in blocking["blocks"]] == ["Launch"]


def test_the_milestones_say_how_many_things_they_wait_for(plan):
    api, maria, _, pid, build, launch = plan
    _link(api, maria, pid, launch, build)
    items = {m["name"]: m for m in api.client.get(f"/projects/{pid}/milestones", headers=maria.headers).json()["items"]}
    assert (items["Launch"]["blocked_by_count"], items["Build"]["blocked_by_count"]) == (1, 0)


def test_a_blocked_milestone_cannot_be_started_or_completed(plan):
    api, maria, _, pid, build, launch = plan
    _link(api, maria, pid, launch, build)
    start = api.client.patch(f"/projects/{pid}/milestones/{launch}", json={"status": "in_progress"}, headers=maria.headers)
    assert start.status_code == 409 and start.json()["error"]["code"] == "blocked"
    assert "Build" in start.json()["error"]["message"] and "Apollo" in start.json()["error"]["message"]
    done = api.client.post(f"/projects/{pid}/milestones/{launch}/complete", json={"review_note": "x"}, headers=maria.headers)
    assert done.status_code == 409 and done.json()["error"]["code"] == "blocked"
    # editing its plan is still fine
    assert api.client.patch(f"/projects/{pid}/milestones/{launch}", json={"description": "later"}, headers=maria.headers).status_code == 200


def test_finishing_the_first_milestone_frees_the_second(plan):
    api, maria, _, pid, build, launch = plan
    _link(api, maria, pid, launch, build)
    api.deliverable(pid, build, "Spec", manager=maria, done=True)
    assert api.client.post(f"/projects/{pid}/milestones/{build}/complete", json={"review_note": "ok"}, headers=maria.headers).status_code == 200
    after = api.client.get(_mdeps(pid, launch), headers=maria.headers).json()
    assert after["is_blocked"] is False and after["blocked_by"][0]["is_done"] is True and after["blocked_by"][0]["status"] == "completed"
    started = api.client.patch(f"/projects/{pid}/milestones/{launch}", json={"status": "in_progress"}, headers=maria.headers)
    assert started.status_code == 200, started.text


def test_a_cancelled_milestone_no_longer_blocks_but_cannot_be_chosen(plan):
    api, maria, _, pid, build, launch = plan
    _link(api, maria, pid, launch, build)
    assert api.client.post(f"/projects/{pid}/milestones/{build}/archive", headers=maria.headers).status_code == 200
    assert api.client.get(_mdeps(pid, launch), headers=maria.headers).json()["is_blocked"] is False
    other = api.milestone(pid, maria, name="Extra", start="2026-03-23", due="2026-03-27", hours=10, budget=100)
    refused = _link(api, maria, pid, other["id"], build)
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "cancelled"


def test_the_same_link_twice_a_self_link_and_a_loop_are_refused(plan):
    api, maria, _, pid, build, launch = plan
    assert _link(api, maria, pid, launch, build).status_code == 201
    twice = _link(api, maria, pid, launch, build)
    assert twice.status_code == 409 and twice.json()["error"]["code"] == "already_linked"
    own = _link(api, maria, pid, launch, launch)
    assert own.status_code == 400 and own.json()["error"]["details"][0]["field"] == "depends_on_milestone_id"
    back = _link(api, maria, pid, build, launch)
    assert back.status_code == 409 and back.json()["error"]["code"] == "dependency_loop"


def test_a_longer_loop_is_found_too(plan):
    api, maria, _, pid, build, launch = plan
    third = api.milestone(pid, maria, name="Review", start="2026-04-01", due="2026-04-10", hours=10, budget=100)["id"]
    assert _link(api, maria, pid, launch, build).status_code == 201  # Launch waits for Build
    assert _link(api, maria, pid, third, launch).status_code == 201  # Review waits for Launch
    loop = _link(api, maria, pid, build, third)  # Build waiting for Review would close the circle
    assert loop.status_code == 409 and loop.json()["error"]["code"] == "dependency_loop"


def test_a_link_can_be_removed_and_is_kept_in_the_history(plan):
    api, maria, _, pid, build, launch = plan
    dep = _link(api, maria, pid, launch, build).json()
    removed = api.client.post(f"{_mdeps(pid, launch)}/{dep['id']}/archive", headers=maria.headers)
    assert removed.status_code == 200
    assert api.client.get(_mdeps(pid, launch), headers=maria.headers).json()["is_blocked"] is False
    assert api.client.post(f"{_mdeps(pid, launch)}/{dep['id']}/archive", headers=maria.headers).status_code == 404
    history = [i["summary"] for i in api.client.get(f"/projects/{pid}/history", params={"page_size": 3}, headers=maria.headers).json()["items"]]
    assert history[:2] == ["Removed dependency Build before Launch", "Added dependency Build before Launch"]


def test_a_link_that_starts_before_its_predecessor_ends_is_flagged_but_allowed(plan):
    api, maria, _, pid, build, launch = plan
    overlap = api.milestone(pid, maria, name="Early", start="2026-03-16", due="2026-03-18", hours=10, budget=100)["id"]
    ok = _link(api, maria, pid, launch, build).json()
    clash = _link(api, maria, pid, overlap, build).json()  # starts 16 March, Build is due 20 March
    assert ok["schedule_conflict"] is False and clash["schedule_conflict"] is True


def test_who_may_create_links(plan):
    api, maria, alex, pid, build, launch = plan
    assert _link(api, alex, pid, launch, build).status_code == 403
    stranger = api.user("manager", "Other Manager")
    assert _link(api, stranger, pid, launch, build).status_code == 404
    assert _link(api, api.admin, pid, launch, build).status_code == 201
    assert api.client.post(_mdeps(pid, launch), json={"depends_on_milestone_id": build}).status_code == 401


def test_a_manager_may_only_link_to_projects_they_manage(plan):
    api, maria, _, pid, _, launch = plan
    james = api.user("manager", "James Carter")
    other = api.project(james, name="Zeus")
    theirs = api.milestone(other["id"], james, name="Plan", start="2026-03-09", due="2026-03-13", hours=10, budget=100)["id"]
    assert _link(api, maria, pid, launch, theirs).status_code == 404  # she cannot see James's project
    cross = _link(api, api.admin, pid, launch, theirs)
    assert cross.status_code == 201 and cross.json()["project_name"] == "Zeus"


def test_what_a_person_cannot_see_is_hidden_in_the_list(plan):
    api, maria, alex, pid, _, launch = plan
    james = api.user("manager", "James Carter")
    other = api.project(james, name="Zeus")
    theirs = api.milestone(other["id"], james, name="Secret plan", start="2026-03-09", due="2026-03-13", hours=10, budget=100)["id"]
    _link(api, api.admin, pid, launch, theirs)
    api.assign(pid, launch, alex, maria.headers)
    admin_view = api.client.get(_mdeps(pid, launch), headers=api.admin.headers).json()["blocked_by"][0]
    maria_view = api.client.get(_mdeps(pid, launch), headers=maria.headers).json()["blocked_by"][0]
    alex_view = api.client.get(_mdeps(pid, launch), headers=alex.headers)
    assert admin_view["name"] == "Secret plan" and admin_view["visible"] is True
    assert maria_view["name"] == "Another project's milestone" and maria_view["visible"] is False
    assert maria_view["item_id"] is None and maria_view["project_name"] is None
    assert alex_view.status_code == 200 and "Secret plan" not in alex_view.text


def test_a_project_can_wait_for_another_project(api, today):
    maria = api.user("manager", "Maria Lopez")
    first = api.project(maria, name="Phase one")["id"]
    second = api.project(maria, name="Phase two")["id"]
    resp = api.client.post(f"/projects/{second}/dependencies", json={"depends_on_project_id": first}, headers=maria.headers)
    assert resp.status_code == 201, resp.text
    assert (resp.json()["kind"], resp.json()["name"], resp.json()["project_name"]) == ("project", "Phase one", "Phase one")
    listing = api.client.get(f"/projects/{second}/dependencies", headers=maria.headers).json()
    assert listing["is_blocked"] is True and [r["name"] for r in listing["blocked_by"]] == ["Phase one"]
    assert [r["name"] for r in api.client.get(f"/projects/{first}/dependencies", headers=maria.headers).json()["blocks"]] == ["Phase two"]
    assert api.client.get(f"/projects/{second}", headers=maria.headers).json()["blocked_by_count"] == 1
    refused = api.client.post(f"/projects/{second}/complete", headers=maria.headers)
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "blocked" and "Phase one" in refused.json()["error"]["message"]
    assert api.client.post(f"/projects/{first}/complete", headers=maria.headers).status_code == 200
    assert api.client.get(f"/projects/{second}", headers=maria.headers).json()["blocked_by_count"] == 0
    assert api.client.post(f"/projects/{second}/complete", headers=maria.headers).status_code == 200


def test_project_links_refuse_loops_duplicates_and_other_peoples_projects(api, today):
    maria = api.user("manager", "Maria Lopez")
    james = api.user("manager", "James Carter")
    a = api.project(maria, name="A")["id"]
    b = api.project(maria, name="B")["id"]
    c = api.project(james, name="C")["id"]
    link = lambda who, succ, pred: api.client.post(  # noqa: E731
        f"/projects/{succ}/dependencies", json={"depends_on_project_id": pred}, headers=who.headers
    )
    assert link(maria, b, a).status_code == 201
    assert link(maria, b, a).json()["error"]["code"] == "already_linked"
    assert link(maria, a, b).json()["error"]["code"] == "dependency_loop"
    assert link(maria, a, a).status_code == 400
    assert link(maria, b, c).status_code == 404
    assert link(api.admin, b, c).status_code == 201
    dep = api.client.get(f"/projects/{b}/dependencies", headers=maria.headers).json()["blocked_by"]
    masked = next(r for r in dep if not r["visible"])
    assert masked["name"] == "Another project" and masked["item_id"] is None
    own = next(r for r in dep if r["visible"])
    removed = api.client.post(f"/projects/{b}/dependencies/{own['id']}/archive", headers=maria.headers)
    assert removed.status_code == 200
    assert [r["visible"] for r in api.client.get(f"/projects/{b}/dependencies", headers=maria.headers).json()["blocked_by"]] == [False]


def test_the_timeline_knows_what_is_blocked(plan):
    api, maria, _, pid, build, launch = plan
    _link(api, maria, pid, launch, build)
    other = api.project(maria, name="Later")["id"]
    api.client.post(f"/projects/{other}/dependencies", json={"depends_on_project_id": pid}, headers=maria.headers)
    data = api.client.get("/reports/timeline", headers=maria.headers).json()["projects"]
    apollo = next(p for p in data if p["name"] == "Apollo")
    later = next(p for p in data if p["name"] == "Later")
    assert {m["name"]: m["blocked_by_count"] for m in apollo["milestones"]} == {"Build": 0, "Launch": 1}
    assert (apollo["blocked_by_count"], later["blocked_by_count"]) == (0, 1)


def test_dependencies_are_never_deleted(plan, raw_db):
    api, maria, _, pid, build, launch = plan
    dep = _link(api, maria, pid, launch, build).json()
    api.client.post(f"{_mdeps(pid, launch)}/{dep['id']}/archive", headers=maria.headers)
    row = raw_db.execute("SELECT archived_at FROM milestone_dependencies WHERE id = %s", (dep["id"],)).fetchone()
    assert row is not None and row["archived_at"] is not None
