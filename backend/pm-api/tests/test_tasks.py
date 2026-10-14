"""Tasks: a deliverable with a status, an owner, a due date and a priority, shown on a board and in a list."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


@pytest.fixture
def setup(api, today):
    manager = api.user("manager", "Maria Lopez")
    employee = api.user("employee", "Alex Kim", manager=manager)
    other = api.user("employee", "Priya Shah", manager=manager)
    project, ms = api.setup_work(manager, employee)
    return api, manager, employee, other, project["id"], ms["id"]


def _base(pid, mid):
    return f"/projects/{pid}/milestones/{mid}/deliverables"


def test_a_new_task_starts_in_to_do_with_a_medium_priority(setup):
    api, manager, _, _, pid, mid = setup
    task = api.deliverable(pid, mid, "Wireframes", manager=manager)
    assert task["status"] == "todo" and task["priority"] == "medium"
    assert task["due_date"] is None and task["assignee_id"] is None and task["done"] is False


def test_a_task_can_be_created_with_an_owner_a_due_date_and_a_priority(setup):
    api, manager, employee, _, pid, mid = setup
    resp = api.client.post(
        _base(pid, mid),
        json={"name": "Wireframes", "priority": "high", "due_date": "2026-03-20", "assignee_id": employee.id},
        headers=manager.headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert (body["priority"], body["due_date"], body["assignee_id"]) == ("high", "2026-03-20", employee.id)


def test_only_someone_on_the_milestone_can_own_a_task(setup):
    api, manager, _, other, pid, mid = setup
    resp = api.client.post(_base(pid, mid), json={"name": "Wireframes", "assignee_id": other.id}, headers=manager.headers)
    assert resp.status_code == 400
    assert resp.json()["error"]["details"][0]["field"] == "assignee_id"
    task = api.deliverable(pid, mid, "Wireframes", manager=manager)
    again = api.client.patch(f"{_base(pid, mid)}/{task['id']}", json={"assignee_id": other.id}, headers=manager.headers)
    assert again.status_code == 400
    assert api.client.post(_base(pid, mid), json={"name": "X", "priority": "whenever"}, headers=manager.headers).status_code == 400


def test_the_status_and_the_tick_stay_in_step(setup):
    api, manager, _, _, pid, mid = setup
    task = api.deliverable(pid, mid, "Wireframes", manager=manager)
    url = f"{_base(pid, mid)}/{task['id']}"
    moved = api.client.patch(url, json={"status": "in_progress"}, headers=manager.headers).json()
    assert moved["status"] == "in_progress" and moved["done"] is False and moved["done_by"] is None
    finished = api.client.patch(url, json={"status": "done"}, headers=manager.headers).json()
    assert finished["done"] is True and finished["done_by"] == manager.id and finished["done_at"]
    reopened = api.client.patch(url, json={"done": False}, headers=manager.headers).json()  # the old checklist tick still works
    assert reopened["status"] == "todo" and reopened["done"] is False and reopened["done_by"] is None
    ticked = api.client.patch(url, json={"done": True}, headers=manager.headers).json()
    assert ticked["status"] == "done"
    backwards = api.client.patch(url, json={"status": "in_progress"}, headers=manager.headers).json()
    assert backwards["done"] is False and backwards["done_at"] is None


def test_the_database_keeps_the_two_in_step_even_for_a_direct_update(setup, raw_db):
    api, manager, _, _, pid, mid = setup
    task = api.deliverable(pid, mid, "Wireframes", manager=manager)
    raw_db.execute("UPDATE deliverables SET done = true WHERE id = %s", (task["id"],))
    assert raw_db.execute("SELECT status FROM deliverables WHERE id = %s", (task["id"],)).fetchone()["status"] == "done"
    raw_db.execute("UPDATE deliverables SET status = 'todo' WHERE id = %s", (task["id"],))
    assert raw_db.execute("SELECT done FROM deliverables WHERE id = %s", (task["id"],)).fetchone()["done"] is False


def test_an_owner_can_start_their_own_task_but_not_finish_it_or_change_it(setup):
    api, manager, employee, other, pid, mid = setup
    mine = api.client.post(
        _base(pid, mid), json={"name": "Wireframes", "assignee_id": employee.id}, headers=manager.headers
    ).json()
    theirs = api.deliverable(pid, mid, "Spec", manager=manager)
    url = f"{_base(pid, mid)}/{mine['id']}"
    started = api.client.patch(url, json={"status": "in_progress"}, headers=employee.headers)
    assert started.status_code == 200 and started.json()["status"] == "in_progress"
    assert api.client.patch(url, json={"status": "todo"}, headers=employee.headers).status_code == 200
    assert api.client.patch(url, json={"status": "done"}, headers=employee.headers).status_code == 403  # the manager reviews
    assert api.client.patch(url, json={"done": True}, headers=employee.headers).status_code == 403
    assert api.client.patch(url, json={"priority": "urgent"}, headers=employee.headers).status_code == 403
    assert api.client.patch(url, json={"name": "Renamed"}, headers=employee.headers).status_code == 403
    assert api.client.patch(f"{_base(pid, mid)}/{theirs['id']}", json={"status": "in_progress"}, headers=employee.headers).status_code == 403
    assert api.client.patch(url, json={"status": "in_progress"}, headers=other.headers).status_code == 404  # not on the project


def test_a_board_lists_every_task_of_the_project_with_its_milestone_and_owner(setup):
    api, manager, employee, _, pid, mid = setup
    api.client.post(
        _base(pid, mid), json={"name": "Wireframes", "assignee_id": employee.id, "due_date": "2026-03-09", "priority": "urgent"},
        headers=manager.headers,
    )
    api.deliverable(pid, mid, "Spec", manager=manager)
    second = api.milestone(pid, manager, name="Launch", start="2026-03-23", due="2026-03-31")
    api.deliverable(pid, second["id"], "Press kit", manager=manager)
    tasks = api.client.get(f"/projects/{pid}/tasks", headers=manager.headers).json()
    assert tasks["total"] == 3
    by_name = {t["name"]: t for t in tasks["items"]}
    assert by_name["Wireframes"]["milestone_name"] == "Build" and by_name["Wireframes"]["assignee_name"] == "Alex Kim"
    assert by_name["Wireframes"]["is_overdue"] is True  # due Monday 9 March, today is Wednesday 11 March
    assert by_name["Spec"]["is_overdue"] is False and by_name["Press kit"]["milestone_name"] == "Launch"
    # urgent work first, then by due date
    assert [t["name"] for t in tasks["items"]][0] == "Wireframes"


def test_a_finished_task_is_never_overdue(setup):
    api, manager, _, _, pid, mid = setup
    task = api.client.post(_base(pid, mid), json={"name": "Spec", "due_date": "2026-03-02"}, headers=manager.headers).json()
    api.client.patch(f"{_base(pid, mid)}/{task['id']}", json={"status": "done"}, headers=manager.headers)
    assert api.client.get(f"/projects/{pid}/tasks", headers=manager.headers).json()["items"][0]["is_overdue"] is False


def test_the_board_can_be_filtered(setup):
    api, manager, employee, _, pid, mid = setup
    a = api.client.post(_base(pid, mid), json={"name": "A", "assignee_id": employee.id}, headers=manager.headers).json()
    api.deliverable(pid, mid, "B", manager=manager)
    api.client.patch(f"{_base(pid, mid)}/{a['id']}", json={"status": "in_progress"}, headers=manager.headers)
    get = lambda q: api.client.get(f"/projects/{pid}/tasks{q}", headers=manager.headers).json()  # noqa: E731
    assert [t["name"] for t in get("?status=in_progress")["items"]] == ["A"]
    assert [t["name"] for t in get(f"?assignee_id={employee.id}")["items"]] == ["A"]
    assert get(f"?milestone_id={mid}")["total"] == 2
    assert api.client.get(f"/projects/{pid}/tasks?status=nonsense", headers=manager.headers).status_code == 400


def test_who_may_read_a_projects_tasks(setup):
    api, manager, employee, other, pid, mid = setup
    api.deliverable(pid, mid, "Spec", manager=manager)
    assert api.client.get(f"/projects/{pid}/tasks", headers=employee.headers).json()["total"] == 1
    assert api.client.get(f"/projects/{pid}/tasks", headers=other.headers).status_code == 404
    stranger = api.user("manager", "Other Manager")
    assert api.client.get(f"/projects/{pid}/tasks", headers=stranger.headers).status_code == 404
    assert api.client.get(f"/projects/{pid}/tasks", headers=api.admin.headers).json()["total"] == 1
    assert api.client.get(f"/projects/{pid}/tasks").status_code == 401


def test_archived_tasks_and_tasks_of_finished_milestones_leave_the_board(setup):
    api, manager, _, _, pid, mid = setup
    task = api.deliverable(pid, mid, "Spec", manager=manager, done=True)
    api.deliverable(pid, mid, "Extra", manager=manager)
    api.client.post(f"{_base(pid, mid)}/{task['id']}/archive", headers=manager.headers)
    assert [t["name"] for t in api.client.get(f"/projects/{pid}/tasks", headers=manager.headers).json()["items"]] == ["Extra"]


def test_my_tasks_gathers_what_is_mine_across_projects(setup):
    api, manager, employee, _, pid, mid = setup
    api.client.post(_base(pid, mid), json={"name": "Wireframes", "assignee_id": employee.id, "due_date": "2026-03-20"}, headers=manager.headers)
    api.client.post(_base(pid, mid), json={"name": "Spec", "assignee_id": employee.id, "due_date": "2026-03-13"}, headers=manager.headers)
    api.deliverable(pid, mid, "Not mine", manager=manager)
    mine = api.client.get("/tasks/mine", headers=employee.headers).json()
    assert [t["name"] for t in mine["items"]] == ["Spec", "Wireframes"]  # soonest due first
    assert mine["items"][0]["project_name"] == "Apollo" and mine["items"][0]["milestone_name"] == "Build"
    assert api.client.get("/tasks/mine", headers=manager.headers).json()["total"] == 0
    assert api.client.get("/tasks/mine").status_code == 401


def test_my_tasks_stops_at_the_end_of_my_work(setup, raw_db):
    api, manager, employee, _, pid, mid = setup
    api.client.post(_base(pid, mid), json={"name": "Spec", "assignee_id": employee.id}, headers=manager.headers)
    assert api.client.get("/tasks/mine", headers=employee.headers).json()["total"] == 1
    raw_db.execute("UPDATE milestone_assignments SET start_date = '2026-03-09', end_date = '2026-03-10' WHERE user_id = %s", (employee.id,))  # ended yesterday
    assert api.client.get("/tasks/mine", headers=employee.headers).json()["total"] == 0  # no past access
    assert api.client.get(f"/projects/{pid}/tasks", headers=employee.headers).status_code == 404


def test_moving_a_task_is_written_to_the_history(setup):
    api, manager, employee, _, pid, mid = setup
    task = api.client.post(_base(pid, mid), json={"name": "Wireframes", "assignee_id": employee.id}, headers=manager.headers).json()
    api.client.patch(f"{_base(pid, mid)}/{task['id']}", json={"status": "in_progress"}, headers=employee.headers)
    api.client.patch(f"{_base(pid, mid)}/{task['id']}", json={"status": "done"}, headers=manager.headers)
    api.client.patch(f"{_base(pid, mid)}/{task['id']}", json={"priority": "high"}, headers=manager.headers)
    items = api.client.get(f"/projects/{pid}/history", params={"page_size": 3}, headers=manager.headers).json()["items"]
    assert [(i["actor_name"], i["summary"]) for i in items] == [
        ("Maria Lopez", "Edited deliverable Wireframes (priority)"),
        ("Maria Lopez", "Ticked deliverable Wireframes"),
        ("Alex Kim", "Moved deliverable Wireframes to In progress"),
    ]
    created = api.client.get(f"/projects/{pid}/history", params={"page_size": 30}, headers=manager.headers).json()["items"]
    made = next(i for i in created if i["summary"] == "Added deliverable Wireframes")
    owner = next(c for c in made["changes"] if c["field"] == "assignee_id")
    assert owner["after"] == "Alex Kim"  # a name, not an id


def test_completing_a_milestone_still_needs_every_task_done(setup):
    api, manager, _, _, pid, mid = setup
    task = api.deliverable(pid, mid, "Spec", manager=manager)
    refused = api.client.post(f"/projects/{pid}/milestones/{mid}/complete", json={"review_note": "ok"}, headers=manager.headers)
    assert refused.status_code == 409
    api.client.patch(f"{_base(pid, mid)}/{task['id']}", json={"status": "done"}, headers=manager.headers)
    done = api.client.post(f"/projects/{pid}/milestones/{mid}/complete", json={"review_note": "ok"}, headers=manager.headers)
    assert done.status_code == 200, done.text
