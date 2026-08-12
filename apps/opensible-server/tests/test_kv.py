"""Unit tests for the generic kv_store helper (Fase 7 — C1)."""
from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "postgresql://localhost/radas_test")

import pytest

from storage import kv, pg, pg_schema


@pytest.fixture(autouse=True)
def pg_db():
    pg.reset_connection_pool()
    pg_schema.reset_schema()
    yield
    pg.reset_connection_pool()


def test_kv_set_get_roundtrip(pg_db):
    kv.kv_set("flags", "a", {"enabled": True})
    assert kv.kv_get("flags", "a") == {"enabled": True}


def test_kv_get_missing(pg_db):
    assert kv.kv_get("nope", "x") is None


def test_kv_upsert(pg_db):
    kv.kv_set("flags", "a", {"enabled": True})
    kv.kv_set("flags", "a", {"enabled": False})
    assert kv.kv_get("flags", "a") == {"enabled": False}
    assert len(kv.kv_list("flags")) == 1


def test_kv_delete(pg_db):
    kv.kv_set("flags", "a", 1)
    kv.kv_delete("flags", "a")
    assert kv.kv_get("flags", "a") is None


def test_kv_list_and_keys(pg_db):
    kv.kv_set("quotas", "p1", {"max_stacks": 3})
    kv.kv_set("quotas", "p2", {"max_stacks": 5})
    assert kv.kv_keys("quotas") == ["p1", "p2"]
    assert len(kv.kv_list("quotas")) == 2


def test_kv_save_load_list(pg_db):
    kv.kv_save("test_cases", [{"id": "a"}, {"id": "b"}])
    assert kv.kv_load("test_cases") == [{"id": "a"}, {"id": "b"}]


def test_kv_save_load_dict(pg_db):
    kv.kv_save("quotas", {"p1": {"max_stacks": 3}})
    assert kv.kv_load("quotas") == {"p1": {"max_stacks": 3}}


def test_kv_save_dict_removes_stale_keys(pg_db):
    kv.kv_save("quotas", {"p1": 1, "p2": 2})
    kv.kv_save("quotas", {"p1": 9})
    assert kv.kv_load("quotas") == {"p1": 9}
