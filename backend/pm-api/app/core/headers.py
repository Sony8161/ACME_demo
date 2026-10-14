"""Browser-safety headers on every answer.

The API only ever returns JSON, so these are strict: nothing may be framed, sniffed or cached, and in the cloud the browser
is told to use HTTPS only. A header the application already set (for example a cache rule) is left alone.
"""

from __future__ import annotations

from typing import Any

_HSTS = b"max-age=31536000; includeSubDomains"


class SecurityHeadersMiddleware:
    """ASGI middleware that adds the protective headers to each HTTP response."""

    def __init__(self, app: Any, hsts: bool = False) -> None:
        self.app = app
        self._headers: list[tuple[bytes, bytes]] = [
            (b"x-content-type-options", b"nosniff"),
            (b"x-frame-options", b"DENY"),
            (b"referrer-policy", b"no-referrer"),
            (b"cache-control", b"no-store"),
        ]
        if hsts:
            self._headers.append((b"strict-transport-security", _HSTS))

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def add_headers(message: dict[str, Any]) -> None:
            if message["type"] == "http.response.start":
                present = {name.lower() for name, _ in message.get("headers", [])}
                message["headers"] = [*message.get("headers", []), *(h for h in self._headers if h[0] not in present)]
            await send(message)

        await self.app(scope, receive, add_headers)
