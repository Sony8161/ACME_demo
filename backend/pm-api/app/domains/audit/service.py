"""Turns audit rows into sentences and readable changes. The rows themselves are written by database triggers."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

import psycopg

from app.core.deps import CurrentUser
from app.domains.audit import repository as repo
from app.domains.audit.schemas import AuditChange, AuditEntry, AuditList
from app.domains.projects import service as projects_service

# Fields holding a person's id: shown as the person's name.
_PERSON_FIELDS = frozenset({"manager_id", "assignee_id"})
_NOUN = {
    "person": "person", "project": "project", "milestone": "milestone", "deliverable": "deliverable", "cost": "cost",
    "dependency": "dependency",
}


def _field_label(field: str) -> str:
    return field.replace("_id", "").replace("_", " ").capitalize()


def summarise(row: dict[str, Any]) -> str:
    """One short sentence for an audit row, without the actor (shown separately): 'Signed off milestone Build'."""
    entity, action, label, changes = row["entity"], row["action"], row["label"], row["changes"]
    if entity == "assignment":
        if action == "create":
            return f"Assigned {label}"
        if action == "archive":
            return f"Removed {label}"
        return f"Changed the dates of {label}" if {"start_date", "end_date"} & set(changes) else f"Changed {label}"
    noun = f"{_NOUN[entity]} {label}"
    signed_off = entity == "milestone" and (changes.get("status") or {}).get("after") == "completed"
    if action == "create":
        role = (changes.get("role") or {}).get("after")
        if entity == "person" and role:
            return f"Added {noun} ({role})"
        return f"{'Created' if entity == 'project' else 'Added'} {noun}"
    if action == "archive":
        if entity == "dependency":
            return f"Removed {noun}"
        return f"Signed off {noun}" if signed_off else f"Archived {noun}"
    if action == "restore":
        return f"Restored {noun}"
    status = changes.get("status") or {}
    ticked = changes.get("done") or {}  # history written before tasks had a status only has the tick
    if entity == "deliverable" and not status and "after" in ticked:
        return f"{'Ticked' if ticked['after'] else 'Unticked'} {noun}"
    if entity == "deliverable" and status:
        if status.get("after") == "done":
            return f"Ticked {noun}"
        if status.get("before") == "done":
            return f"Unticked {noun}"
        return f"Moved {noun} to {str(status.get('after')).capitalize().replace('_', ' ')}"
    if signed_off:
        return f"Signed off {noun}"
    if set(changes) == {"password"}:
        return f"Changed the password of {label}"
    fields = ", ".join(_field_label(f).lower() for f in changes)
    return f"Edited {noun} ({fields})" if fields else f"Changed {noun}"


def _present(rows: list[dict[str, Any]], names: dict[str, str]) -> list[AuditEntry]:
    entries = []
    for row in rows:
        changes = []
        for field, value in row["changes"].items():
            before, after = value.get("before"), value.get("after")
            if field in _PERSON_FIELDS:
                before, after = names.get(str(before), before), names.get(str(after), after)
            changes.append(AuditChange(field=field, label=_field_label(field), before=before, after=after))
        entries.append(AuditEntry(**{k: row[k] for k in AuditEntry.model_fields if k in row and k not in {"summary", "changes"}},
                                  summary=summarise(row), changes=changes))
    return entries


def _people_in(rows: list[dict[str, Any]]) -> set[uuid.UUID]:
    ids: set[uuid.UUID] = set()
    for row in rows:
        for field in _PERSON_FIELDS & set(row["changes"]):
            for side in ("before", "after"):
                value = row["changes"][field].get(side)
                if value:
                    ids.add(uuid.UUID(str(value)))
    return ids


def search(
    conn: psycopg.Connection[Any], *, project_id: uuid.UUID | None, actor_id: uuid.UUID | None, entity: str | None,
    action: str | None, day_from: dt.date | None, day_to: dt.date | None, page: int, page_size: int,
) -> AuditList:
    """A page of history matching the filters (callers decide who may ask)."""
    rows, total = repo.search(
        conn, project_id=project_id, actor_id=actor_id, entity=entity, action=action, day_from=day_from, day_to=day_to,
        limit=page_size, offset=(page - 1) * page_size,
    )
    items = _present(rows, repo.user_names(conn, _people_in(rows)))
    return AuditList(items=items, total=total, page=page, page_size=page_size)


def project_history(
    conn: psycopg.Connection[Any], actor: CurrentUser, project_id: uuid.UUID, *, page: int, page_size: int
) -> AuditList:
    """History of one project, for an admin or the project's own manager (anyone else gets a 404)."""
    projects_service.get_visible(conn, actor, project_id)
    return search(conn, project_id=project_id, actor_id=None, entity=None, action=None, day_from=None, day_to=None,
                  page=page, page_size=page_size)
