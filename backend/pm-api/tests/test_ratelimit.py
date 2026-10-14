"""Rate limiting (per container) and the account lock after repeated failed sign-ins (in the database)."""

from __future__ import annotations

import datetime as dt

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import get_settings
from app.core import dates
from app.core.ratelimit import RateLimitMiddleware, SlidingWindowLimiter
from app.core.security import create_access_token
from tests.conftest import GOOD_PASSWORD


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


# ----------------------------------------------------------------------------------------------- the limiter itself

def test_a_caller_over_the_limit_waits_until_the_window_has_moved_on():
    clock = Clock()
    limiter = SlidingWindowLimiter(3, 60, clock)
    assert [limiter.hit("a") for _ in range(3)] == [0, 0, 0]
    clock.now += 10
    assert limiter.hit("a") == 50  # the oldest request leaves the window in 50 seconds
    assert limiter.hit("b") == 0  # someone else is unaffected
    clock.now += 50
    assert limiter.hit("a") == 0  # and the first caller may go again


def test_a_limit_of_zero_means_no_limit():
    limiter = SlidingWindowLimiter(0)
    assert all(limiter.hit("a") == 0 for _ in range(1000))


def test_memory_stays_bounded_when_many_callers_come_and_go(monkeypatch):
    from app.core import ratelimit

    monkeypatch.setattr(ratelimit, "_MAX_KEYS", 5)
    clock = Clock()
    limiter = SlidingWindowLimiter(2, 10, clock)
    for i in range(8):
        limiter.hit(f"k{i}")
    clock.now += 20  # all of them are now old
    limiter.hit("fresh")
    assert len(limiter._hits) <= 2


# ------------------------------------------------------------------------------------------------ the middleware

def small_app(per_person: int = 3, sign_in: int = 2) -> TestClient:
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware, per_person=SlidingWindowLimiter(per_person), sign_in=SlidingWindowLimiter(sign_in))

    @app.get("/thing")
    def thing() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/auth/login")
    def login() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/health")
    def health() -> dict[str, bool]:
        return {"ok": True}

    return TestClient(app)


def test_the_fourth_request_in_a_minute_is_refused_with_the_standard_shape_and_a_wait():
    client = small_app()
    assert [client.get("/thing").status_code for _ in range(3)] == [200, 200, 200]
    refused = client.get("/thing")
    assert refused.status_code == 429
    body = refused.json()["error"]
    assert body["code"] == "rate_limited" and "wait" in body["message"] and body["details"] == []
    assert 1 <= int(refused.headers["retry-after"]) <= 60


def test_the_health_check_and_preflight_requests_are_never_limited():
    client = small_app(per_person=1)
    assert [client.get("/health").status_code for _ in range(10)] == [200] * 10
    assert [client.options("/thing").status_code for _ in range(5)].count(429) == 0


def test_signing_in_has_its_own_tighter_limit_per_address():
    client = small_app(per_person=100, sign_in=2)
    assert [client.post("/auth/login").status_code for _ in range(3)] == [200, 200, 429]
    assert client.get("/thing").status_code == 200  # other traffic is not affected by sign-in attempts


def test_each_signed_in_person_has_their_own_allowance():
    client = small_app(per_person=2)
    token_a, _ = create_access_token(user_id="11111111-1111-1111-1111-111111111111", role="manager", token_version=0)
    token_b, _ = create_access_token(user_id="22222222-2222-2222-2222-222222222222", role="manager", token_version=0)
    a, b = {"Authorization": f"Bearer {token_a}"}, {"Authorization": f"Bearer {token_b}"}
    assert [client.get("/thing", headers=a).status_code for _ in range(3)] == [200, 200, 429]
    assert client.get("/thing", headers=b).status_code == 200


def test_a_forged_forwarded_address_cannot_dodge_the_limit():
    """Behind CloudFront the last X-Forwarded-For entry is the one CloudFront added; earlier ones are the caller's claim."""
    client = small_app(per_person=2)
    codes = [client.get("/thing", headers={"X-Forwarded-For": f"10.0.0.{i}, 203.0.113.9"}).status_code for i in range(4)]
    assert codes == [200, 200, 429, 429]


def test_an_invalid_token_is_limited_by_address_not_trusted():
    client = small_app(per_person=1)
    headers = {"Authorization": "Bearer not-a-token", "X-Forwarded-For": "198.51.100.7"}
    assert [client.get("/thing", headers=headers).status_code for _ in range(2)] == [200, 429]


# ------------------------------------------------------------------------------ the real app, with its limits switched on

@pytest.fixture
def limited_client(monkeypatch, api):
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "4")
    monkeypatch.setenv("LOGIN_RATE_LIMIT_PER_MINUTE", "2")
    get_settings.cache_clear()
    from app.main import create_app

    yield TestClient(create_app())
    monkeypatch.delenv("RATE_LIMIT_PER_MINUTE")
    monkeypatch.delenv("LOGIN_RATE_LIMIT_PER_MINUTE")
    get_settings.cache_clear()


def test_the_real_api_refuses_a_flood_but_keeps_answering_the_health_check(limited_client, api):
    headers = api.admin.headers
    assert [limited_client.get("/projects", headers=headers).status_code for _ in range(4)] == [200] * 4
    flood = limited_client.get("/projects", headers=headers)
    assert flood.status_code == 429 and flood.json()["error"]["code"] == "rate_limited"
    assert limited_client.get("/health").status_code == 200


def test_the_real_api_limits_sign_in_attempts_from_one_address(limited_client, api):
    body = {"username": api.admin.username, "password": "wrong-Password1"}
    assert [limited_client.post("/auth/login", json=body).status_code for _ in range(2)] == [401, 401]
    assert limited_client.post("/auth/login", json=body).status_code == 429


# ------------------------------------------------------------------------------------------------ the account lock

def sign_in(api, person, password):
    return api.client.post("/auth/login", json={"username": person.username, "password": password})


def test_five_wrong_passwords_lock_the_account_even_against_the_right_one(api):
    person = api.user("employee", manager=api.user("manager"))
    for _ in range(5):
        assert sign_in(api, person, "Wrong-Password1").status_code == 401
    locked = sign_in(api, person, GOOD_PASSWORD)
    assert locked.status_code == 429 and locked.json()["error"]["code"] == "account_locked"
    assert 1 <= int(locked.headers["retry-after"]) <= 15 * 60
    assert "minute" in locked.json()["error"]["message"]


def test_the_failure_count_survives_the_401_that_rolls_the_request_back(api, raw_db):
    person = api.user("employee", manager=api.user("manager"))
    sign_in(api, person, "Wrong-Password1")
    sign_in(api, person, "Wrong-Password1")
    assert raw_db.execute("SELECT failed_logins FROM users WHERE id = %s", (person.id,)).fetchone()["failed_logins"] == 2


def test_a_good_sign_in_starts_the_count_again(api, raw_db):
    person = api.user("employee", manager=api.user("manager"))
    for _ in range(4):
        sign_in(api, person, "Wrong-Password1")
    assert sign_in(api, person, GOOD_PASSWORD).status_code == 200
    assert raw_db.execute("SELECT failed_logins FROM users WHERE id = %s", (person.id,)).fetchone()["failed_logins"] == 0
    for _ in range(4):  # four more failures are still not enough to lock
        sign_in(api, person, "Wrong-Password1")
    assert sign_in(api, person, GOOD_PASSWORD).status_code == 200


def test_the_lock_ends_by_itself_and_an_admin_can_end_it_sooner(api, monkeypatch):
    person = api.user("employee", manager=api.user("manager"))
    for _ in range(5):
        sign_in(api, person, "Wrong-Password1")
    assert sign_in(api, person, GOOD_PASSWORD).status_code == 429
    later = dates.now() + dt.timedelta(minutes=16)
    monkeypatch.setattr(dates, "now", lambda: later)
    assert sign_in(api, person, GOOD_PASSWORD).status_code == 200  # 15 minutes have passed
    monkeypatch.undo()

    for _ in range(5):
        sign_in(api, person, "Wrong-Password1")
    temp = api.client.post(f"/users/{person.id}/reset-password", headers=api.admin.headers).json()["temporary_password"]
    assert sign_in(api, person, temp).status_code == 200  # a reset unlocks


def test_an_unknown_username_is_not_counted_or_revealed(api):
    refused = api.client.post("/auth/login", json={"username": "nobody", "password": "Wrong-Password1"})
    assert refused.status_code == 401 and refused.json()["error"]["code"] == "invalid_credentials"
