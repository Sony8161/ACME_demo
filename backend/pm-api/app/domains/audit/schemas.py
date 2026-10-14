"""Pydantic models for the audit history."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field

AuditEntity = Literal["person", "project", "milestone", "deliverable", "assignment", "cost"]
AuditAction = Literal["create", "update", "archive", "restore"]


class AuditChange(BaseModel):
    """One field that changed. ``before`` is empty for a new record."""

    field: str
    label: str = Field(description="The field's name for people, e.g. 'Budget amount'")
    before: Any = None
    after: Any = None


class AuditEntry(BaseModel):
    """One thing that happened, who did it, and what it changed."""

    id: int
    occurred_at: dt.datetime
    actor_id: uuid.UUID | None = Field(description="Empty for work done by the system itself")
    actor_name: str
    entity: AuditEntity
    entity_id: uuid.UUID
    project_id: uuid.UUID | None
    project_name: str | None
    label: str = Field(description="The record's name when it changed, e.g. the milestone's name")
    action: AuditAction
    summary: str
    changes: list[AuditChange]


class AuditList(BaseModel):
    """A page of history, newest first."""

    items: list[AuditEntry]
    total: int
    page: int
    page_size: int
