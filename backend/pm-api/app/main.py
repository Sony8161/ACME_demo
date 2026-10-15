"""FastAPI application factory for the ACME project-tracking API."""

from __future__ import annotations

from typing import Any

import psycopg
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app import __version__
from app.config import API_PREFIX, get_settings
from app.core.errors import register_error_handlers
from app.core.headers import SecurityHeadersMiddleware
from app.core.observability import RequestLogMiddleware, configure_logging
from app.core.ratelimit import RateLimitMiddleware, SlidingWindowLimiter
from app.db import SerializeRequestsMiddleware, TransactionMiddleware, get_connection, register_post_migrate_hook
from app.domains.admin.router import router as admin_router
from app.domains.assignments.router import router as team_router
from app.domains.assistant.router import router as assistant_router
from app.domains.audit.router import audit_router, project_history_router
from app.domains.auth.router import router as auth_router
from app.domains.costs.router import router as costs_router
from app.domains.deliverables.router import router as deliverables_router
from app.domains.dependencies.router import milestone_router as milestone_dependencies_router
from app.domains.dependencies.router import project_router as project_dependencies_router
from app.domains.milestones.router import router as milestones_router
from app.domains.projects.router import router as projects_router
from app.domains.reports.router import router as reports_router
from app.domains.search.router import router as search_router
from app.domains.tasks.router import my_tasks_router, project_tasks_router
from app.domains.users.router import router as users_router
from app.seed import ensure_bootstrap_admin


class RootPathMiddleware:
    """Treat ``/api/pm-api`` as the app's mount point when the request path carries it.

    CloudFront forwards ``/api/pm-api/...`` untouched while the local proxy and direct Lambda
    URLs strip it; with ``root_path`` set (and the path left alone) routing and the OpenAPI
    docs work in both cases.
    """

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] in {"http", "websocket"} and scope.get("path", "").startswith(API_PREFIX):
            scope["root_path"] = API_PREFIX
        await self.app(scope, receive, send)


def create_app() -> FastAPI:
    """Build the application: routers, error handlers, middleware, first-admin bootstrap."""
    configure_logging()
    settings = get_settings()
    app = FastAPI(
        # The interactive docs describe every route; they are for a laptop, not for the internet.
        docs_url="/docs" if settings.is_local else None,
        redoc_url="/redoc" if settings.is_local else None,
        openapi_url="/openapi.json" if settings.is_local else None,
        title="ACME Project Tracker API",
        version=__version__,
        description=(
            "Projects, milestones, deliverables, teams and budgets. Every Monday-Friday on a milestone is an 8-hour shift.\n\n"
            "Sign in with `POST /auth/login`, then send `Authorization: Bearer <token>`. "
            "Nothing is ever deleted: removing something archives it."
        ),
    )
    register_error_handlers(app)

    for router in (
        auth_router, users_router, projects_router, milestones_router, deliverables_router, team_router,
        costs_router, reports_router, admin_router, audit_router, project_history_router,
        project_tasks_router, my_tasks_router, milestone_dependencies_router, project_dependencies_router,
        assistant_router, search_router,
    ):
        app.include_router(router)

    @app.get("/", include_in_schema=False)
    @app.get("/health", tags=["health"])
    def health() -> JSONResponse:
        """Liveness plus a database check. Returns 503 when the database cannot be reached."""
        body: dict[str, Any] = {"service": "pm-api", "version": __version__, "env": get_settings().app_env}
        try:
            get_connection().execute("SELECT 1").fetchone()
            body.update(status="ok", database="ok")
            return JSONResponse(body)
        except psycopg.Error:
            body.update(status="degraded", database="error")
            return JSONResponse(body, status_code=503)

    # Middleware added last runs first: the root path is fixed before the transaction starts.
    app.add_middleware(TransactionMiddleware)
    if get_settings().serialize_requests:
        app.add_middleware(SerializeRequestsMiddleware)  # outside the transaction: one request in the database at a time
    app.add_middleware(RootPathMiddleware)
    app.add_middleware(  # outside the transaction: a refused request never touches the database
        RateLimitMiddleware,
        per_person=SlidingWindowLimiter(settings.rate_limit_per_minute),
        sign_in=SlidingWindowLimiter(settings.login_rate_limit_per_minute),
    )
    app.add_middleware(SecurityHeadersMiddleware, hsts=not settings.is_local)  # also on refusals and rate-limit answers
    app.add_middleware(RequestLogMiddleware)  # outermost: times everything, including the commit
    register_post_migrate_hook(ensure_bootstrap_admin)
    return app


app = create_app()
