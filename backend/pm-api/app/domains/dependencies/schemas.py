"""Pydantic models for dependencies."""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field


class MilestoneLinkCreate(BaseModel):
    """Make this milestone wait for another one."""

    depends_on_milestone_id: uuid.UUID


class ProjectLinkCreate(BaseModel):
    """Make this project wait for another one."""

    depends_on_project_id: uuid.UUID


class DependencyRef(BaseModel):
    """One link, seen from one end: what is on the other end, and whether it is finished."""

    id: uuid.UUID = Field(description="The link itself (use it to remove the link)")
    kind: Literal["milestone", "project"]
    item_id: uuid.UUID | None = Field(description="The milestone or project on the other end; empty when you may not see it")
    name: str
    project_id: uuid.UUID | None
    project_name: str | None
    status: str = Field(
        description="pending, in_progress, completed or cancelled (milestones); planned, active, completed (projects)"
    )
    is_done: bool
    schedule_conflict: bool = Field(description="The later one is planned to start before the earlier one is due (milestones)")
    visible: bool = Field(description="False when the other end is in a project you may not see: its name is hidden")


class DependencyList(BaseModel):
    """What this milestone or project waits for, and what waits for it."""

    blocked_by: list[DependencyRef]
    blocks: list[DependencyRef]
    is_blocked: bool = Field(description="Waiting for something that is not completed yet")
