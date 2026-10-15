"""Comments: a short thread on every task, for everyone who can see the project."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


@pytest.fixture
def world(api, today):
    maria = api.user("manager", "Maria Lopez")
    max_ = api.user("manager", "Max Weber")
    alex = api.user("employee", "Alex Kim", manager=maria)
    eve = api.user("employee", "Eve Stone", manager=maria)
    outsider = api.user("employee", "Olga Outside", manager=maria)
    project, ms = api.setup_work(maria, alex, project="Apollo")
    assert api.assign(project["id"], ms["id"], eve, maria.headers).status_code == 201
    task = api.deliverable(project["id"], ms["id"], "Wireframes", manager=maria)
    base = f"/projects/{project['id']}/milestones/{ms['id']}/deliverables/{task['id']}/comments"
    return {"api": api, "maria": maria, "max": max_, "alex": alex, "eve": eve, "outsider": outsider, "project": project, "ms": ms, "task": task, "base": base}


def who(world, name):
    api = world["api"]
    return api.admin if name == "admin" else world[name]


def post(world, name, body, url=None):
    return world["api"].client.post(url or world["base"], json={"body": body}, headers=who(world, name).headers)


def listing(world, name, url=None):
    return world["api"].client.get(url or world["base"], headers=who(world, name).headers)


def test_a_comment_is_added_and_read_back_in_the_order_written(world):
    first = post(world, "maria", "Waiting on the logo")
    assert first.status_code == 201, first.text
    second = post(world, "alex", "Logo arrived, starting now")
    assert second.status_code == 201
    body = listing(world, "maria").json()
    assert [c["body"] for c in body["items"]] == ["Waiting on the logo", "Logo arrived, starting now"]
    assert [c["author_name"] for c in body["items"]] == ["Maria Lopez", "Alex Kim"]
    assert body["items"][0].keys() == {"id", "author_id", "author_name", "body", "created_at", "can_remove"}
    assert body["total"] == 2


def test_an_empty_thread_is_an_empty_list(world):
    assert listing(world, "alex").json() == {"items": [], "total": 0}


def test_the_text_is_trimmed_and_must_have_something_in_it(world):
    assert post(world, "maria", "  hello  ").json()["body"] == "hello"
    assert post(world, "maria", "   ").status_code == 400
    assert post(world, "maria", "").status_code == 400
    assert world["api"].client.post(world["base"], json={}, headers=world["maria"].headers).status_code == 400


def test_two_thousand_characters_fit_and_one_more_does_not(world):
    assert post(world, "maria", "x" * 2000).status_code == 201
    assert post(world, "maria", "x" * 2001).status_code == 400


def test_text_that_looks_like_markup_is_kept_exactly_as_typed(world):
    typed = "<script>alert(1)</script> & <b>bold</b> '; DROP TABLE users; --"
    assert post(world, "alex", typed).json()["body"] == typed
    assert listing(world, "alex").json()["items"][0]["body"] == typed


def test_everyone_who_works_on_the_project_can_read_and_write(world):
    assert post(world, "eve", "From Eve").status_code == 201
    assert post(world, "admin", "From the admin").status_code == 201
    assert listing(world, "alex").json()["total"] == 2


def test_someone_who_cannot_see_the_project_gets_a_404_and_learns_nothing(world):
    for name in ("max", "outsider"):
        assert listing(world, name).status_code == 404
        assert post(world, name, "hello").status_code == 404
    assert world["api"].client.get(world["base"]).status_code == 401


def test_a_task_that_is_not_in_that_milestone_or_project_is_not_found(world, new_id):
    wrong_task = world["base"].rsplit("/", 2)[0] + f"/{new_id()}/comments"
    assert listing(world, "maria", wrong_task).status_code == 404
    other = world["api"].project(world["max"], name="Zephyr")
    wrong_project = f"/projects/{other['id']}/milestones/{world['ms']['id']}/deliverables/{world['task']['id']}/comments"
    assert listing(world, "admin", wrong_project).status_code == 404


def test_can_remove_is_true_for_your_own_comments_and_for_all_when_you_manage_the_project(world):
    post(world, "alex", "Alex's note")
    post(world, "maria", "Maria's note")
    by_alex = {c["body"]: c["can_remove"] for c in listing(world, "alex").json()["items"]}
    assert by_alex == {"Alex's note": True, "Maria's note": False}
    by_maria = {c["body"]: c["can_remove"] for c in listing(world, "maria").json()["items"]}
    assert by_maria == {"Alex's note": True, "Maria's note": True}
    assert all(c["can_remove"] for c in listing(world, "admin").json()["items"])


def test_the_author_the_manager_and_an_admin_can_remove_a_comment_and_nobody_else(world):
    mine = post(world, "alex", "Alex's note").json()["id"]
    url = f"{world['base']}/{mine}/archive"
    api = world["api"]
    assert api.client.post(url, headers=world["eve"].headers).status_code == 403  # a colleague on the project
    assert api.client.post(url, headers=world["max"].headers).status_code == 404  # another manager cannot even see it
    assert api.client.post(url, headers=world["alex"].headers).status_code == 200
    assert listing(world, "alex").json()["total"] == 0
    assert api.client.post(url, headers=world["alex"].headers).status_code == 404  # already gone
    again = post(world, "alex", "Second").json()["id"]
    assert api.client.post(f"{world['base']}/{again}/archive", headers=world["maria"].headers).status_code == 200  # the manager
    third = post(world, "alex", "Third").json()["id"]
    assert api.client.post(f"{world['base']}/{third}/archive", headers=api.admin.headers).status_code == 200  # an admin


def test_task_lists_carry_a_comment_count_that_ignores_removed_comments(world):
    api = world["api"]
    post(world, "maria", "one")
    gone = post(world, "maria", "two").json()["id"]
    post(world, "alex", "three")
    api.client.post(f"{world['base']}/{gone}/archive", headers=world["maria"].headers)
    items = api.client.get(f"/projects/{world['project']['id']}/tasks", headers=world["maria"].headers).json()["items"]
    assert items[0]["comment_count"] == 2
    task_url = world["base"].rsplit("/comments", 1)[0]
    assert api.client.patch(task_url, json={"assignee_id": world["alex"].id}, headers=world["maria"].headers).status_code == 200
    assert api.client.get("/tasks/mine", headers=world["alex"].headers).json()["items"][0]["comment_count"] == 2


def test_a_task_taken_off_the_list_has_no_thread_any_more(world):
    task_url = world["base"].rsplit("/comments", 1)[0]
    post(world, "maria", "before")
    assert world["api"].client.post(f"{task_url}/archive", headers=world["maria"].headers).status_code == 200
    assert listing(world, "maria").status_code == 404
    assert post(world, "maria", "after").status_code == 404
