"""The AI service behind the assistant: one call to the Anthropic Messages API, using only the standard library.

The key comes from the environment (``ANTHROPIC_API_KEY``); without one the built-in assistant answers and nothing is sent
anywhere.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"
MAX_TOKENS = 900
TIMEOUT_SECONDS = 40


class AssistantUnavailable(Exception):  # noqa: N818 - reads better than "...Error" at the call sites
    """The AI service could not be reached or refused the request."""


class AnthropicClient:
    """Sends one request to the Messages API and returns its JSON answer."""

    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model

    def create(self, *, system: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> dict[str, Any]:
        """Ask the model for its next turn (text, or a request to use a tool)."""
        body = json.dumps(
            {"model": self._model, "max_tokens": MAX_TOKENS, "system": system, "messages": messages, "tools": tools}
        ).encode()
        request = urllib.request.Request(  # noqa: S310 - a fixed https address
            API_URL,
            data=body,
            method="POST",
            headers={"content-type": "application/json", "x-api-key": self._api_key, "anthropic-version": API_VERSION},
        )
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310  # nosec B310 - fixed https address
                return json.loads(response.read())
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise AssistantUnavailable(str(exc)) from exc
