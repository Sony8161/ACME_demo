"""HTTP endpoints for the assistant."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import ActiveUser, DbConn
from app.domains.assistant import service
from app.domains.assistant.schemas import AssistantStatus, ChatReply, ChatRequest

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.get("/status", response_model=AssistantStatus)
def assistant_status(actor: ActiveUser) -> AssistantStatus:
    """Whether an AI model or the built-in assistant answers."""
    return service.status()


@router.post("/chat", response_model=ChatReply)
def chat(payload: ChatRequest, actor: ActiveUser, conn: DbConn) -> ChatReply:
    """Ask a question. It is answered from read-only lookups made with your own permissions; nothing is changed."""
    return service.chat(conn, actor, payload)
