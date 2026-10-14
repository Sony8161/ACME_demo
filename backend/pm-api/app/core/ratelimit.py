"""Rate limiting: a ceiling on requests per minute for each person, and a tighter one on sign-in attempts per address.

This is the application's own, best-effort limiter. Each Lambda container keeps its own counts, so the real ceiling is the
limit times the number of containers running; it stops a runaway script or a password-guessing loop cheaply, without a
database write per request. Account-level protection (lock after repeated failures) lives in the database, where every
container sees it (``auth/service.py``). The production control that counts across containers is a rate rule on the edge
(AWS WAF in front of CloudFront); see the scalability plan.

A limit of 0 turns that limiter off.
"""

from __future__ import annotations

import json
import math
import time
from collections import deque
from typing import Any

from app.core.security import decode_access_token

# Paths that must always answer (load balancers and people checking the service are not "traffic").
EXEMPT_PATHS = {"/", "/health"}
_MAX_KEYS = 10_000


class SlidingWindowLimiter:
    """Allow at most ``limit`` hits per key in any ``window`` seconds."""

    def __init__(self, limit: int, window: float = 60.0, clock: Any = time.monotonic) -> None:
        self.limit = limit
        self.window = window
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}

    def hit(self, key: str) -> int:
        """Record a request. Returns 0 when allowed, otherwise the seconds to wait before the next one would be."""
        if self.limit <= 0:
            return 0
        now = self._clock()
        if len(self._hits) > _MAX_KEYS:  # bound memory: forget keys with nothing recent
            self._hits = {k: q for k, q in self._hits.items() if q and now - q[-1] < self.window}
        queue = self._hits.setdefault(key, deque())
        while queue and now - queue[0] >= self.window:
            queue.popleft()
        if len(queue) >= self.limit:
            return max(1, math.ceil(self.window - (now - queue[0])))
        queue.append(now)
        return 0


def client_address(scope: dict[str, Any]) -> str:
    """The caller's address. Behind CloudFront the last X-Forwarded-For entry is the one CloudFront added (not spoofable)."""
    headers = dict(scope.get("headers", []))
    forwarded = headers.get(b"x-forwarded-for", b"").decode("ascii", "ignore")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    client = scope.get("client")
    return client[0] if client else "unknown"


def _person(scope: dict[str, Any]) -> str | None:
    """The signed-in person's id from a valid token, or None. (Authentication itself happens later, in the route.)"""
    auth = dict(scope.get("headers", [])).get(b"authorization", b"").decode("ascii", "ignore")
    if not auth.lower().startswith("bearer "):
        return None
    try:
        return str(decode_access_token(auth[7:].strip()).get("sub") or "") or None
    except Exception:  # noqa: BLE001 - any bad token simply means "not a known person"; the route will answer 401
        return None


class RateLimitMiddleware:
    """Answers 429 (with Retry-After and the standard error shape) when a caller is over their limit."""

    def __init__(self, app: Any, *, per_person: SlidingWindowLimiter, sign_in: SlidingWindowLimiter) -> None:
        self.app = app
        self.per_person = per_person
        self.sign_in = sign_in

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http" or scope["path"] in EXEMPT_PATHS or scope["method"] == "OPTIONS":
            await self.app(scope, receive, send)
            return

        address = client_address(scope)
        wait = 0
        if scope["path"].endswith("/auth/login") and scope["method"] == "POST":
            wait = self.sign_in.hit(f"login:{address}")
        if not wait:
            wait = self.per_person.hit(f"user:{_person(scope) or 'ip:' + address}")
        if wait:
            await _too_many(send, wait)
            return
        await self.app(scope, receive, send)


async def _too_many(send: Any, wait: int) -> None:
    body = json.dumps({"error": {
        "code": "rate_limited",
        "message": f"Too many requests. Please wait {wait} second{'s' if wait != 1 else ''} and try again.",
        "details": [],
    }}).encode()
    await send({"type": "http.response.start", "status": 429, "headers": [
        (b"content-type", b"application/json"),
        (b"content-length", str(len(body)).encode()),
        (b"retry-after", str(wait).encode()),
    ]})
    await send({"type": "http.response.body", "body": body})

