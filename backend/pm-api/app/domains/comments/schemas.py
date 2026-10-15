"""Pydantic models for task comments."""

from __future__ import annotations

import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, Field


class CommentCreate(BaseModel):
    """What someone writes. Plain text: it is shown exactly as typed."""

    model_config = ConfigDict(str_strip_whitespace=True)

    body: str = Field(min_length=1, max_length=2000)


class CommentOut(BaseModel):
    """One comment, and whether the person asking may remove it."""

    id: uuid.UUID
    author_id: uuid.UUID
    author_name: str
    body: str
    created_at: dt.datetime
    can_remove: bool = Field(description="True for its author, the project's manager and admins")


class CommentList(BaseModel):
    """A task's live comments, oldest first."""

    items: list[CommentOut]
    total: int
