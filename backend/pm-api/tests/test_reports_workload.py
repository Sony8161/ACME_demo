"""The workload heatmap: hours booked per person per week (Monday to Friday, 8 hours a day)."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration

# 'today' is Wednesday 2026-03-11, so the first week starts on Monday 2026-03-09. A booking cannot start in the past:
# Alex's default booking runs from today (Wed 11) to Fri 27 March, so week one is Wed-Fri (24 h) and the next two are full.


@pytest.fixture
def world(api, today):
    maria = api.user("manager", "Maria Lopez")
    max_ = api.user("manager", "Max Weber")
    alex = api.user("employee", "Alex Kim", manager=maria)
    priya = api.user("employee", "Priya Shah", manager=maria)
    eve = api.user("employee", "Eve Stone", manager=max_)
    apollo, apollo_ms = api.setup_work(maria, alex, project="Apollo")
    zephyr, _ = api.setup_work(max_, eve, project="Zephyr")
    return {"api": api, "maria": maria, "max": max_, "alex": alex, "priya": priya, "eve": eve, "apollo": apollo, "apollo_ms": apollo_ms, "zephyr": zephyr}


def workload(world, who="admin", **params):
    api = world["api"]
    headers = api.admin.headers if who == "admin" else world[who].headers
    return api.client.get("/reports/workload", params=params, headers=headers)


def row(body, name):
    return next(p for p in body["people"] if p["name"] == name)


def test_weeks_start_on_this_weeks_monday_and_a_full_week_is_forty_hours_a_part_week_less(world):
    body = workload(world).json()
    assert body["capacity_per_week"] == 40
    assert body["weeks"] == ["2026-03-09", "2026-03-16", "2026-03-23", "2026-03-30", "2026-04-06", "2026-04-13", "2026-04-20", "2026-04-27"]
    alex = row(body, "Alex Kim")
    assert alex["hours"] == [24, 40, 40, 0, 0, 0, 0, 0]
    assert alex["work"][0] == [{"project_name": "Apollo", "milestone_name": "Build"}] and alex["work"][3] == []


def test_a_booking_that_starts_and_ends_mid_week_counts_only_its_working_days(world):
    api, maria = world["api"], world["maria"]
    resp = api.assign(world["apollo"]["id"], world["apollo_ms"]["id"], world["priya"], maria.headers, start_date="2026-03-11", end_date="2026-03-18")
    assert resp.status_code == 201, resp.text
    assert row(workload(world).json(), "Priya Shah")["hours"][:3] == [24, 24, 0]  # Wed-Fri, then Mon-Wed


def test_two_milestones_in_one_week_add_up_and_both_are_named(world):
    api, maria = world["api"], world["maria"]
    other = api.milestone(world["apollo"]["id"], maria, name="Test", start="2026-03-30", due="2026-04-03")
    api.assign(world["apollo"]["id"], other["id"], world["priya"], maria.headers, start_date="2026-03-30", end_date="2026-04-01")
    again = api.milestone(world["apollo"]["id"], maria, name="Ship", start="2026-04-02", due="2026-04-10")
    api.assign(world["apollo"]["id"], again["id"], world["priya"], maria.headers, start_date="2026-04-02", end_date="2026-04-03")
    priya = row(workload(world).json(), "Priya Shah")
    assert priya["hours"][3] == 40  # Mon-Wed on Test, Thu-Fri on Ship
    assert sorted(w["milestone_name"] for w in priya["work"][3]) == ["Ship", "Test"]


def test_work_outside_the_window_is_not_counted(world):
    body = workload(world, weeks=2).json()
    assert len(body["weeks"]) == 2 and row(body, "Alex Kim")["hours"] == [24, 40]
    assert row(body, "Priya Shah")["hours"] == [0, 0]  # nothing booked: listed, with zeros


def test_a_manager_sees_their_own_reports_and_people_on_their_projects_only(world):
    body = workload(world, "maria").json()
    names = [p["name"] for p in body["people"]]
    assert "Alex Kim" in names and "Priya Shah" in names and "Eve Stone" not in names
    assert [p["name"] for p in workload(world, "max").json()["people"]] == ["Eve Stone"]


def test_the_admin_sees_every_active_employee_by_name(world):
    names = [p["name"] for p in workload(world).json()["people"]]
    assert names == sorted(names, key=str.lower) and set(names) == {"Alex Kim", "Eve Stone", "Priya Shah"}


def test_nothing_about_money_or_pay_is_in_it(world):
    person = workload(world).json()["people"][0]
    assert person.keys() == {"user_id", "name", "job_title", "manager_name", "hours", "work"}


def test_the_number_of_weeks_is_checked(world):
    assert workload(world, weeks=0).status_code == 400
    assert workload(world, weeks=13).status_code == 400
    assert len(workload(world, weeks=12).json()["weeks"]) == 12


def test_an_employee_is_refused_and_a_stranger_is_not_let_in(world):
    assert workload(world, "alex").status_code == 403
    assert world["api"].client.get("/reports/workload").status_code == 401
