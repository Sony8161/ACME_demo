"""'Since you last visited': what other people changed, newest first, inside what the person may see."""

from __future__ import annotations

import datetime as dt

import pytest

pytestmark = pytest.mark.integration


def ago(**delta: float) -> str:
    return (dt.datetime.now(dt.UTC) - dt.timedelta(**delta)).isoformat()


@pytest.fixture
def world(api, today):
    maria = api.user("manager", "Maria Lopez")
    max_ = api.user("manager", "Max Weber")
    alex = api.user("employee", "Alex Kim", manager=maria)
    eve = api.user("employee", "Eve Stone", manager=max_)
    apollo, apollo_ms = api.setup_work(maria, alex, project="Apollo")
    zephyr, _ = api.setup_work(max_, eve, project="Zephyr")
    api.deliverable(apollo["id"], apollo_ms["id"], "Wireframes", manager=maria)  # Maria's own change
    return {"api": api, "maria": maria, "max": max_, "alex": alex, "apollo": apollo, "zephyr": zephyr}


def get(world, who, **params):
    api = world["api"]
    headers = api.admin.headers if who == "admin" else world[who].headers
    return api.client.get("/reports/changes", params=params, headers=headers)


def test_the_admin_sees_what_others_did_newest_first_with_totals(world):
    body = get(world, "admin", since=ago(hours=1)).json()
    assert body["total"] >= 5 and body["projects"] == 2
    assert 0 < len(body["items"]) <= 20
    times = [i["occurred_at"] for i in body["items"]]
    assert times == sorted(times, reverse=True)
    assert body["items"][0].keys() >= {"id", "occurred_at", "actor_name", "summary", "project_id", "project_name", "entity", "action", "changes"}
    assert any(i["project_id"] is None for i in get(world, "admin", since=ago(hours=1), limit=50).json()["items"])  # people and accounts too


def test_nothing_that_happened_before_since_is_included(world):
    body = get(world, "admin", since=ago(hours=-1)).json()  # an hour from now: everything so far happened before it
    assert (body["items"], body["total"], body["projects"]) == ([], 0, 0)


def test_your_own_changes_are_left_out(world):
    api, maria = world["api"], world["maria"]
    mine = get(world, "maria", since=ago(hours=1), limit=50).json()
    assert mine["items"] and all(i["actor_id"] != maria.id for i in mine["items"])
    from_admin_view = get(world, "admin", since=ago(hours=1), limit=50).json()
    assert any(i["actor_id"] == maria.id for i in from_admin_view["items"])  # still there for the admin
    assert api.admin.id not in [i["actor_id"] for i in get(world, "admin", since=ago(hours=1), limit=50).json()["items"]]  # the admin did the set-up, and it is theirs


def test_a_manager_sees_only_their_own_projects_and_no_account_changes(world):
    body = get(world, "maria", since=ago(hours=1), limit=50).json()
    assert body["projects"] == 1
    assert {i["project_id"] for i in body["items"]} == {world["apollo"]["id"]}
    assert all(i["project_name"] == "Apollo" for i in body["items"])
    assert all(i["entity"] != "person" for i in body["items"])


def test_an_employee_is_refused(world):
    assert get(world, "alex", since=ago(hours=1)).status_code == 403


def test_a_time_far_in_the_past_is_cut_to_thirty_days_and_never_fails(world):
    assert get(world, "admin", since="2000-01-01T00:00:00+00:00").status_code == 200


def test_a_time_in_the_future_gives_an_empty_answer(world):
    body = get(world, "admin", since=(dt.datetime.now(dt.UTC) + dt.timedelta(days=400)).isoformat()).json()
    assert body["items"] == [] and body["total"] == 0


def test_since_defaults_to_the_last_seven_days(world):
    assert get(world, "admin").json()["total"] >= 5


def test_a_time_without_a_zone_or_nonsense_is_refused(world):
    assert get(world, "admin", since="2026-10-01T00:00:00").status_code == 400
    assert get(world, "admin", since="yesterday").status_code == 400


def test_the_limit_caps_the_list_but_not_the_total(world):
    body = get(world, "admin", since=ago(hours=1), limit=2).json()
    assert len(body["items"]) == 2 and body["total"] > 2
    assert get(world, "admin", since=ago(hours=1), limit=0).status_code == 400
    assert get(world, "admin", since=ago(hours=1), limit=51).status_code == 400


def test_it_needs_a_signed_in_person(world):
    assert world["api"].client.get("/reports/changes").status_code == 401
