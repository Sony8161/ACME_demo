"""The AI client: what it sends, and what it does when the service fails. No real network is used."""

from __future__ import annotations

import io
import json
import urllib.error
from typing import Any

import pytest

from app.domains.assistant import llm


class _Response(io.BytesIO):
    def __enter__(self) -> _Response:
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()


def test_it_sends_the_key_the_model_and_the_conversation_and_returns_the_answer(monkeypatch):
    seen: dict[str, Any] = {}

    def fake_urlopen(request, timeout):
        seen.update(url=request.full_url, headers={k.lower(): v for k, v in request.header_items()}, body=json.loads(request.data), timeout=timeout)
        return _Response(json.dumps({"stop_reason": "end_turn", "content": [{"type": "text", "text": "hi"}]}).encode())

    monkeypatch.setattr(llm.urllib.request, "urlopen", fake_urlopen)
    answer = llm.AnthropicClient("secret-key", "some-model").create(
        system="be brief", messages=[{"role": "user", "content": "hello"}], tools=[{"name": "t"}]
    )
    assert answer["content"][0]["text"] == "hi"
    assert seen["url"] == llm.API_URL and seen["headers"]["x-api-key"] == "secret-key" and seen["headers"]["anthropic-version"] == llm.API_VERSION
    assert seen["body"]["model"] == "some-model" and seen["body"]["system"] == "be brief" and seen["body"]["messages"] == [{"role": "user", "content": "hello"}]
    assert seen["body"]["max_tokens"] == llm.MAX_TOKENS and seen["timeout"] == llm.TIMEOUT_SECONDS


@pytest.mark.parametrize("failure", [urllib.error.URLError("no route"), TimeoutError("slow")])
def test_a_network_failure_becomes_assistant_unavailable_without_the_key_in_the_message(monkeypatch, failure):
    def broken(request, timeout):
        raise failure

    monkeypatch.setattr(llm.urllib.request, "urlopen", broken)
    with pytest.raises(llm.AssistantUnavailable) as caught:
        llm.AnthropicClient("secret-key", "m").create(system="s", messages=[], tools=[])
    assert "secret-key" not in str(caught.value)


def test_an_answer_that_is_not_json_is_unavailable_too(monkeypatch):
    monkeypatch.setattr(llm.urllib.request, "urlopen", lambda request, timeout: _Response(b"<html>oops</html>"))
    with pytest.raises(llm.AssistantUnavailable):
        llm.AnthropicClient("k", "m").create(system="s", messages=[], tools=[])
