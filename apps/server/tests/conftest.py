"""Shared fixtures for server unit tests.

Env vars that auth/secrets modules read at import time are set before any
application imports happen.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Pin secrets before auth.service / middleware import side effects.
os.environ.setdefault(
    "JWT_SECRET_KEY",
    "test-jwt-secret-key-at-least-32-chars-long!!",
)
os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault(
    "GLOBAL_SECRETS_ENCRYPTION_KEY",
    "test-global-secrets-encryption-key-32b",
)
os.environ.setdefault(
    "INTERNAL_CALL_SECRET",
    "test-internal-call-secret-at-least-32-chars",
)

# Ensure `import auth`, `import services`, etc. resolve from server/.
_SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(_SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVER_ROOT))

os.environ.setdefault(
    "DATABASE_URL", "postgresql://localhost/radas_test"
)
os.environ.setdefault(
    "TEST_DATABASE_URL", "postgresql://localhost/radas_test"
)

import pytest


@pytest.fixture
def pg_db(monkeypatch):
    """Isolated Postgres schema for tests: reset all tables per test."""
    from storage import pg, pg_schema

    pg.reset_connection_pool()
    pg_schema.reset_schema()
    yield
    pg.reset_connection_pool()


@pytest.fixture
def data_dir(tmp_path, monkeypatch, pg_db):
    """Isolated DATA_DIR (file-based stores) + fresh Postgres schema."""
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    (tmp_path / "auth").mkdir(parents=True, exist_ok=True)
    (tmp_path / "workers").mkdir(parents=True, exist_ok=True)
    (tmp_path / "projects").mkdir(parents=True, exist_ok=True)

    yield tmp_path


@pytest.fixture
def workers_env(data_dir, monkeypatch):
    """Point worker_registry at the isolated data dir and clear token cache."""
    import services.worker_registry as wr

    monkeypatch.setattr(wr, "DATA_DIR", data_dir)
    monkeypatch.setattr(wr, "WORKERS_DIR", data_dir / "workers")
    wr._TOKEN_CACHE.clear()
    wr._HEARTBEAT_WRITE_CACHE.clear()
    return wr
