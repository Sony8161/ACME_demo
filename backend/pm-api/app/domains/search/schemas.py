"""What a search returns: just enough to draw a result row. Never money, never salary."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class FoundProject(BaseModel):
    id: uuid.UUID
    name: str
    manager_name: str
    status: str
    risk_level: str = Field(description="done, on_track, at_risk or overdue")


class FoundPerson(BaseModel):
    id: uuid.UUID
    name: str
    job_title: str
    role: str


class FoundTask(BaseModel):
    id: uuid.UUID
    name: str
    project_id: uuid.UUID
    project_name: str
    milestone_name: str
    status: str
    assignee_name: str | None


class SearchResults(BaseModel):
    query: str
    projects: list[FoundProject]
    people: list[FoundPerson]
    tasks: list[FoundTask]
