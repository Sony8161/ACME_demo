"""Settings that only matter once the API is on the internet: no public docs, and browser-safety headers on every answer."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.core.headers import SecurityHeadersMiddleware


async def _ok_app(scope, receive, send):
    await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"application/json")]})
    await send({"type": "http.response.body", "body": b"{}"})


def _get(is_local: bool):
    return TestClient(SecurityHeadersMiddleware(_ok_app, hsts=not is_local)).get("/")


def test_every_answer_carries_the_basic_browser_protections():
    headers = _get(is_local=True).headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert headers["referrer-policy"] == "no-referrer"
    assert headers["cache-control"] == "no-store"


def test_https_only_is_demanded_in_the_cloud_but_not_on_a_laptop():
    assert "strict-transport-security" not in _get(is_local=True).headers
    assert "max-age=" in _get(is_local=False).headers["strict-transport-security"]


def test_a_header_the_app_already_set_is_kept():
    async def app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": [(b"cache-control", b"max-age=60")]})
        await send({"type": "http.response.body", "body": b""})

    assert TestClient(SecurityHeadersMiddleware(app)).get("/").headers["cache-control"] == "max-age=60"


def test_the_real_app_sends_them_too(client: TestClient):
    assert client.get("/health").headers["x-content-type-options"] == "nosniff"


def test_docs_are_open_on_a_laptop_and_closed_in_the_cloud(monkeypatch: pytest.MonkeyPatch):
    from app.main import create_app

    assert create_app().openapi_url is not None
    monkeypatch.setenv("IS_LOCAL", "false")
    monkeypatch.setenv("JWT_SECRET", "x" * 40)
    get_settings.cache_clear()
    try:
        cloud = create_app()
        assert cloud.openapi_url is None and cloud.docs_url is None and cloud.redoc_url is None
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()
