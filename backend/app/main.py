"""ASTRA backend entry point (FastAPI application factory)."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import admin, auth, medical, mission, physical, physical_lab
from .config import APP_NAME, APP_VERSION, DATA_LABEL, get_settings
from .db import SessionLocal, init_db
from .seed import seed
from .services import registry
from .services.llm import llm_status
from .services.runtime import manager
from .services.voice import speech_status

log = logging.getLogger("astra")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    with SessionLocal() as db:
        if seed(db):
            log.info("database seeded with the demo catalogue")
    interrupted = manager.recover_after_restart()
    if interrupted:
        log.warning("%d session(s) were interrupted by the previous shutdown", interrupted)
    yield
    await manager.shutdown()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=f"{APP_NAME} API",
        version=APP_VERSION,
        description="Astronaut health monitoring and Mars mission simulation. All data is simulated.",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Viewer-Token"],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        return response

    for module in (auth, admin, physical, physical_lab, medical, mission):
        app.include_router(module.router, prefix="/api")

    @app.get("/api/health", tags=["system"])
    def health():
        return {"status": "ok", "app": APP_NAME, "version": APP_VERSION}

    @app.get("/api/system/info", tags=["system"])
    def system_info():
        """Public, non-sensitive runtime facts used by the login and viewer screens."""
        return {
            "app": APP_NAME,
            "version": APP_VERSION,
            "label": DATA_LABEL,
            "ai": llm_status(),
            "speech": speech_status(),
            "terrain_available": registry.load_heightfield() is not None,
            "speeds": list(registry.SPEEDS),
            "database": "postgresql" if settings.resolved_database_url.startswith("postgresql") else "sqlite",
            # True only while the documented demo accounts are in use, so the login
            # page can offer one-click demo sign-in for evaluators.
            "demo_login": settings.seed_demo_data and not settings.demo_password,
        }

    terrain_dir = Path(settings.terrain_dir)
    if terrain_dir.is_dir():
        app.mount("/terrain", StaticFiles(directory=terrain_dir), name="terrain")

    dist = Path(settings.frontend_dist).resolve()
    if (dist / "index.html").is_file():
        if (dist / "assets").is_dir():
            app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            """Serve the built frontend; unknown paths fall back to index.html (client routing)."""
            if path.startswith(("api/", "terrain/")):
                raise HTTPException(404, "Not found")
            candidate = (dist / path).resolve()
            if path and candidate.is_file() and dist in candidate.parents:
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")

    return app


app = create_app()
