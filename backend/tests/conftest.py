"""Test fixtures: an isolated temporary database seeded with the demo catalogue."""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

_tmp = tempfile.mkdtemp(prefix="astra-test-")
# Default: a throwaway SQLite file. Set ASTRA_TEST_DATABASE_URL to run the same suite
# against another engine, e.g. an EMPTY PostgreSQL database:
#   ASTRA_TEST_DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/astra_test
os.environ["ASTRA_DATABASE_URL"] = (
    os.environ.get("ASTRA_TEST_DATABASE_URL") or f"sqlite:///{Path(_tmp, 'test.db').as_posix()}"
)
os.environ["ASTRA_SECRET_KEY"] = "test-secret-key-not-for-production-use-0123456789"
os.environ["ASTRA_LLM_PROVIDER"] = "local"
os.environ["ASTRA_SPEECH_PROVIDER"] = "browser"
os.environ["ASTRA_DEMO_PASSWORD"] = ""
os.environ["ASTRA_SEED_DEMO_DATA"] = "true"


@pytest.fixture(scope="session")
def seeded_db():
    from app.db import SessionLocal, init_db
    from app.seed import seed

    init_db()
    with SessionLocal() as db:
        seed(db)
    return SessionLocal


@pytest.fixture()
def db(seeded_db):
    with seeded_db() as session:
        yield session


@pytest.fixture(scope="session")
def default_snapshot(seeded_db):
    from app.services import registry

    with seeded_db() as session:
        return registry.build_snapshot(session, None)


@pytest.fixture(scope="session")
def default_plan(seeded_db):
    from app.seed_data import DEFAULT_PROMPT
    from app.services import planner

    with seeded_db() as session:
        result = planner.generate_plan(session, DEFAULT_PROMPT)
    assert result.valid, result.problems
    return result
