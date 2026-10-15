"""Pydantic models for the task board."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from app.domains.deliverables.schemas import DeliverableOut, TaskPriority, TaskStatus


class TaskOut(DeliverableOut):
    """A task as the board shows it: a deliverable plus where it lives and who owns it."""

    project_id: uuid.UUID
    project_name: str
    milestone_name: str
    assignee_name: str | None
    is_overdue: bool = Field(description="Past its due date and not done")
    comment_count: int = Field(default=0, description="Live comments on the task")


class TaskList(BaseModel):
    """Tasks for a board or a list, most urgent first."""

    items: list[TaskOut]
    total: int


__all__ = ["TaskList", "TaskOut", "TaskPriority", "TaskStatus"]
