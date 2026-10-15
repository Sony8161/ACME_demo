"""HTTP endpoint for the search box."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import ActiveUser, DbConn
from app.core.errors import ValidationError
from app.domains.search import service
from app.domains.search.schemas import SearchResults

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchResults)
def search(
    actor: ActiveUser,
    conn: DbConn,
    q: Annotated[str, Query(max_length=100, description="Text to find, at least two characters (spaces around do not count)")],
    limit: Annotated[int, Query(ge=1, le=10, description="At most this many results per group")] = 5,
) -> SearchResults:
    """Find projects, people and tasks by name. You only ever find what you may already see."""
    q = q.strip()
    if len(q) < 2:
        raise ValidationError("Type at least two characters to search.")
    return service.search(conn, actor, q, limit)
