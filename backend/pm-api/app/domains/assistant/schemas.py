"""Pydantic models for the assistant."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

Content = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class ChatMessage(BaseModel):
    """One turn of the conversation. The browser keeps the conversation and sends it with each question."""

    role: Literal["user", "assistant"]
    content: Content


class ChatRequest(BaseModel):
    """The conversation so far; the last message is the question and must come from the user."""

    messages: list[ChatMessage] = Field(min_length=1, max_length=60)


class ChatReply(BaseModel):
    """The assistant's answer."""

    reply: str
    mode: Literal["ai", "offline"] = Field(description="'ai' when a model wrote the answer, 'offline' for the built-in assistant")
    tools_used: list[str] = Field(description="Which read-only lookups the answer was built from")
    notice: str | None = Field(description="Set when something went wrong and the built-in assistant answered instead")


class AssistantStatus(BaseModel):
    """Which assistant is behind the chat box."""

    mode: Literal["ai", "offline"]
    model: str | None
