"""Database engine and session factory (SQLite by default, PostgreSQL-ready)."""
from __future__ import annotations

from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


def _make_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 15})

        @event.listens_for(engine, "connect")
        def _pragmas(dbapi_conn, _record):  # pragma: no cover - driver hook
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA synchronous=NORMAL")
            cur.close()

        return engine
    return create_engine(url, pool_pre_ping=True)


engine: Engine = _make_engine(get_settings().resolved_database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def reconfigure(url: str) -> None:
    """Point the module-level engine at another database (used by tests)."""
    global engine
    engine.dispose()
    engine = _make_engine(url)
    SessionLocal.configure(bind=engine)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _migrate_tables(eng: Engine) -> None:
    """Safely add additive columns to existing tables without requiring a fresh database."""
    from sqlalchemy import inspect, text

    insp = inspect(eng)
    if not insp.has_table("sensors"):
        return
    existing = {c["name"] for c in insp.get_columns("sensors")}
    new_cols = [
        ("sensor_family", "VARCHAR(60) DEFAULT 'generic'"),
        ("manufacturer", "VARCHAR(120) DEFAULT ''"),
        ("model_number", "VARCHAR(80) DEFAULT ''"),
        ("technical_specs", "JSON DEFAULT '{}'"),
        ("tags", "JSON DEFAULT '[]'"),
    ]
    with eng.begin() as conn:
        for col_name, col_type in new_cols:
            if col_name not in existing:
                conn.execute(text(f"ALTER TABLE sensors ADD COLUMN {col_name} {col_type}"))


def init_db() -> None:
    from . import models  # noqa: F401  (register tables)

    Base.metadata.create_all(engine)
    _migrate_tables(engine)
