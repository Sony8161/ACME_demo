"""Search: one box finds projects, people and tasks, and each role finds only what it may already see."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


@pytest.fixture
def world(api, today):
    """Two managers with a project each; Alex works on Maria's project, Eve on Max's. Alex owns 'Login page'."""
    maria = api.user("manager", "Maria Lopez")
    max_ = api.user("manager", "Max Weber")
    alex = api.user("employee", "Alex Kim", manager=maria)
    eve = api.user("employee", "Eve Stone", manager=max_)
    apollo, apollo_ms = api.setup_work(maria, alex, project="Apollo")
    zephyr, zephyr_ms = api.setup_work(max_, eve, project="Zephyr")
    url = lambda p, m: f"/projects/{p['id']}/milestones/{m['id']}/deliverables"  # noqa: E731
    mine = api.client.post(url(apollo, apollo_ms), json={"name": "Login page", "assignee_id": alex.id}, headers=maria.headers).json()
    unowned = api.client.post(url(apollo, apollo_ms), json={"name": "Login redesign"}, headers=maria.headers).json()
    theirs = api.client.post(url(zephyr, zephyr_ms), json={"name": "Login flow", "assignee_id": eve.id}, headers=max_.headers).json()
    return {"api": api, "maria": maria, "max": max_, "alex": alex, "eve": eve, "apollo": apollo, "zephyr": zephyr, "mine": mine, "unowned": unowned, "theirs": theirs, "apollo_ms": apollo_ms}


def find(world, who, q, **params):
    api = world["api"]
    headers = api.admin.headers if who == "admin" else world[who].headers
    return api.client.get("/search", params={"q": q, **params}, headers=headers)


def names(items):
    return sorted(i["name"] for i in items)


def test_the_admin_finds_projects_people_and_tasks_in_one_answer(world):
    body = find(world, "admin", "login").json()
    assert body["query"] == "login"
    assert names(body["tasks"]) == ["Login flow", "Login page", "Login redesign"]
    assert body["projects"] == [] and body["people"] == []
    again = find(world, "admin", "maria").json()
    assert names(again["people"]) == ["Maria Lopez"]
    assert names(again["projects"]) == ["Apollo"]  # a project is also found by its manager's name
    assert find(world, "admin", "zeph").json()["projects"][0]["name"] == "Zephyr"


def test_a_result_carries_just_what_a_row_needs(world):
    body = find(world, "admin", "login page").json()
    assert body["tasks"][0].keys() == {"id", "name", "project_id", "project_name", "milestone_name", "status", "assignee_name"}
    assert (body["tasks"][0]["project_name"], body["tasks"][0]["assignee_name"]) == ("Apollo", "Alex Kim")
    person = find(world, "admin", "alex").json()["people"][0]
    assert person.keys() == {"id", "name", "job_title", "role"}  # no salary, no email
    project = find(world, "admin", "apollo").json()["projects"][0]
    assert project.keys() == {"id", "name", "manager_name", "status", "risk_level"}


def test_people_are_also_found_by_email_username_and_job_title(world):
    api = world["api"]
    alex = world["alex"]
    assert [p["id"] for p in find(world, "admin", alex.username).json()["people"]] == [alex.id]
    assert any(p["name"] == "Alex Kim" for p in find(world, "admin", "tester").json()["people"])  # the job title the helper gives everyone
    assert api.client.get("/search", params={"q": "alex.kim"}, headers=api.admin.headers).json()["people"][0]["name"] == "Alex Kim"


def test_a_manager_finds_only_their_own_projects_and_tasks(world):
    body = find(world, "maria", "login").json()
    assert names(body["tasks"]) == ["Login page", "Login redesign"]  # not Max's "Login flow"
    assert find(world, "maria", "zephyr").json()["projects"] == []
    assert names(find(world, "maria", "apollo").json()["projects"]) == ["Apollo"]


def test_a_manager_finds_other_non_admin_people_but_never_an_admin(world):
    assert names(find(world, "maria", "max").json()["people"]) == ["Max Weber"]
    assert find(world, "maria", "eve").json()["people"][0]["name"] == "Eve Stone"
    assert find(world, "maria", "system admin").json()["people"] == []


def test_an_employee_finds_only_their_own_tasks_and_projects_and_no_people(world):
    body = find(world, "alex", "login").json()
    assert names(body["tasks"]) == ["Login page"]  # not the unowned one, not Eve's
    assert body["people"] == []
    assert find(world, "alex", "maria").json()["people"] == []
    assert names(find(world, "alex", "apollo").json()["projects"]) == ["Apollo"]
    assert find(world, "alex", "zephyr").json()["projects"] == []
    assert find(world, "alex", "alex").json()["people"] == []


def test_an_archived_person_is_not_found(world):
    api = world["api"]
    assert api.client.post(f"/users/{world['eve'].id}/archive", headers=api.admin.headers).status_code == 200
    assert find(world, "admin", "eve").json()["people"] == []


def test_each_group_is_capped_by_limit(world):
    api, maria = world["api"], world["maria"]
    for i in range(7):
        api.deliverable(world["apollo"]["id"], world["apollo_ms"]["id"], f"Spec part {i}", manager=maria)
    assert len(find(world, "admin", "spec part").json()["tasks"]) == 5  # the default
    assert len(find(world, "admin", "spec part", limit=3).json()["tasks"]) == 3
    assert len(find(world, "admin", "spec part", limit=10).json()["tasks"]) == 7


def test_the_query_and_the_limit_are_checked(world):
    api = world["api"]
    assert find(world, "admin", "a").status_code == 400  # one letter is too short
    assert find(world, "admin", "ab", limit=0).status_code == 400
    assert find(world, "admin", "ab", limit=11).status_code == 400
    assert find(world, "admin", "x" * 101).status_code == 400
    assert api.client.get("/search", headers=api.admin.headers).status_code == 400
    assert find(world, "admin", "  ab  ").status_code == 200  # spaces around are ignored


def test_percent_and_underscore_in_a_task_search_match_themselves(world):
    api, maria = world["api"], world["maria"]
    for name in ["Fix 100% bug", "Fix 100x bug", "plan_a", "planxa"]:
        api.deliverable(world["apollo"]["id"], world["apollo_ms"]["id"], name, manager=maria)
    assert names(find(world, "admin", "0% b").json()["tasks"]) == ["Fix 100% bug"]
    assert names(find(world, "admin", "n_a").json()["tasks"]) == ["plan_a"]
    assert find(world, "admin", "'; drop table users; --").status_code == 200  # text is data, never SQL


def test_search_needs_a_signed_in_person(world):
    api = world["api"]
    assert api.client.get("/search", params={"q": "login"}).status_code == 401
