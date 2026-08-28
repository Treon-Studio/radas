"""Task 5.4 — Fail-closed auth/session revocation.

Behavior contract under test
----------------------------
The file-based session revocation cutoff (``auth/session_revocations.json``)
is the *authoritative* revocation store: ``auth.service.verify_token`` (used
by ``auth.middleware.require_auth``) checks token ``iat`` against it via
``are_user_sessions_revoked``. The PostgreSQL ``sessions.revoked_at`` update
performed by ``revoke_all_user_sessions`` is secondary enrichment only.

Failure semantics:

* If the authoritative FILE write fails, ``revoke_all_user_sessions`` must
  NOT claim success: it raises ``SessionRevocationError`` so the calling
  route (``/api/auth/revoke-all-sessions``) returns 500 with a generic
  message instead of reporting all sessions revoked.
* If only the PostgreSQL update fails (file write succeeded), the cutoff is
  still returned (the file is authoritative) and a structured security
  warning with the stable event prefix
  ``security.session_revocation.pg_update_failed`` is logged — including the
  user id and the number of file-based cutoffs written, never any token or
  password material.
* Middleware behavior during a storage outage is deterministic: a token with
  ``iat <= cutoff`` is rejected even when the PG sessions row is missing or
  PG is unreachable, because the check reads the file cutoff only.

Retry semantics: there is NO automatic retry of a failed revocation write.
The client retries logout-all manually; the file write is idempotent (it
overwrites the cutoff with a fresh timestamp), so a retry after failure is
safe and leaves no partially-written state (atomic ``os.replace``).
"""
from __future__ import annotations

import logging
import time

import pytest

from auth.service import (
    are_user_sessions_revoked,
    generate_token,
    load_user_session_revocations,
    revoke_all_user_sessions,
    verify_token,
)

EVENT_PG_FAILED = "security.session_revocation.pg_update_failed"


# ---------------------------------------------------------------------------
# 1. Authoritative (file) write failure -> explicit failure, not fake success
# ---------------------------------------------------------------------------


def test_file_save_failure_raises_session_revocation_error(data_dir, monkeypatch):
    """If save_user_session_revocations raises, revoke_all_user_sessions must
    propagate a typed SessionRevocationError (never return a cutoff)."""
    import auth.service as svc

    def boom(d, r):
        raise OSError("disk full")

    monkeypatch.setattr(svc, "save_user_session_revocations", boom)
    with pytest.raises(svc.SessionRevocationError):
        revoke_all_user_sessions("user-file-fail", data_dir)
    # Nothing was persisted, so no cutoff exists for the user (retry is clean).
    assert "user-file-fail" not in load_user_session_revocations(data_dir)


def test_file_write_failure_via_os_replace_raises(data_dir, monkeypatch):
    """End-to-end file failure: os.replace (atomic rename) failing must surface
    as SessionRevocationError — the save path may not swallow it."""
    import auth.service as svc

    def boom(src, dst):
        raise OSError("rename failed")

    monkeypatch.setattr(svc.os, "replace", boom)
    with pytest.raises(svc.SessionRevocationError) as excinfo:
        revoke_all_user_sessions("user-rename-fail", data_dir)
    assert excinfo.value.__cause__ is not None  # original error chained
    assert "user-rename-fail" not in load_user_session_revocations(data_dir)


def test_file_write_failure_does_not_log_token_material(data_dir, monkeypatch, caplog):
    """Security: the persist-failure security event never contains token or
    password material (there is none to log — only ids/counts)."""
    import auth.service as svc

    def boom(d, r):
        raise OSError("disk full")

    monkeypatch.setattr(svc, "save_user_session_revocations", boom)
    with caplog.at_level(logging.ERROR, logger="auth.service"):
        with pytest.raises(svc.SessionRevocationError):
            revoke_all_user_sessions("user-noise", data_dir)
    text = " ".join(rec.getMessage() for rec in caplog.records)
    assert "security.session_revocation" in text
    assert "eyJ" not in text  # no JWT material
    assert "password" not in text.lower()


# ---------------------------------------------------------------------------
# 2. PG update failure (file write OK) -> degrade loudly, still succeed
# ---------------------------------------------------------------------------


def test_pg_update_failure_still_returns_cutoff_and_logs_security_event(
    data_dir, monkeypatch, caplog
):
    """When only the PostgreSQL sessions update fails, the file cutoff is
    authoritative: return it, and log the structured degradation event."""
    from storage import pg

    def boom(sql, params=None):
        raise RuntimeError("pg unreachable")

    monkeypatch.setattr(pg, "execute", boom)
    with caplog.at_level(logging.WARNING, logger="auth.service"):
        cutoff = revoke_all_user_sessions("user-pg-down", data_dir)

    assert cutoff > 0
    # Authoritative file cutoff was persisted despite the PG outage.
    assert load_user_session_revocations(data_dir).get("user-pg-down") == cutoff

    pg_warnings = [
        r
        for r in caplog.records
        if r.levelno == logging.WARNING and EVENT_PG_FAILED in r.getMessage()
    ]
    assert pg_warnings, "expected structured pg_update_failed security event"
    msg = pg_warnings[0].getMessage()
    assert "user-pg-down" in msg
    assert "file_cutoffs=" in msg  # count of file-based cutoffs written
    assert "eyJ" not in msg  # no token material


def test_pg_update_failure_logs_no_exception_text_leak(data_dir, monkeypatch, caplog):
    """The structured event logs the exception type, not raw internals, and
    never token material."""
    from storage import pg

    monkeypatch.setattr(
        pg, "execute", lambda sql, params=None: (_ for _ in ()).throw(RuntimeError("conn refused"))
    )
    with caplog.at_level(logging.WARNING, logger="auth.service"):
        revoke_all_user_sessions("user-pg-down-2", data_dir)
    msg = next(
        r.getMessage() for r in caplog.records if EVENT_PG_FAILED in r.getMessage()
    )
    assert "RuntimeError" in msg  # exception type only
    assert "conn refused" not in msg  # no raw internal error detail
    assert "eyJ" not in msg


# ---------------------------------------------------------------------------
# 3. Middleware determinism / store disagreement (no middleware change needed)
# ---------------------------------------------------------------------------


def test_token_rejected_by_file_cutoff_even_when_pg_has_no_rows(
    data_dir, monkeypatch
):
    """Disagreement scenario: file cutoff says revoked, PG has no session rows
    (and PG is unreachable). The middleware-side check (verify_token) reads
    only the file cutoff, so the old token is still rejected — fail closed."""
    from storage import pg

    token = generate_token(
        user_id="user-disagree",
        username="disagree",
        roles=["viewer"],
        data_dir=data_dir,
    )
    assert verify_token(token, data_dir) is not None

    def boom(sql, params=None):
        raise RuntimeError("pg unreachable")

    monkeypatch.setattr(pg, "execute", boom)
    time.sleep(1.05)
    cutoff = revoke_all_user_sessions("user-disagree", data_dir)
    assert cutoff > 0  # degraded but successful; logout-all not failed

    # iat <= cutoff -> rejected, regardless of PG state.
    assert verify_token(token, data_dir) is None
    assert are_user_sessions_revoked("user-disagree", cutoff - 1, data_dir) is True
    assert are_user_sessions_revoked("user-disagree", cutoff, data_dir) is True


def test_session_row_updated_when_pg_available(data_dir):
    """Happy path enrichment: with PG reachable, sessions.revoked_at is set."""
    from storage import pg

    pg.execute(
        "INSERT INTO users (id, username, password_hash, is_active) VALUES (%s, %s, %s, 1)",
        ("user-pgrow", "pgrow", "x"),
    )
    pg.execute(
        "INSERT INTO sessions (id, user_id, refresh_hash, created_at, expires_at) "
        "VALUES (%s, %s, %s, %s, %s)",
        ("sess-1", "user-pgrow", "hash-1", "2026-01-01", "2027-01-01"),
    )

    time.sleep(1.05)
    cutoff = revoke_all_user_sessions("user-pgrow", data_dir)
    row = pg.query_one("SELECT revoked_at FROM sessions WHERE id = %s", ("sess-1",))
    assert row is not None and row["revoked_at"] is not None
    assert load_user_session_revocations(data_dir).get("user-pgrow") == cutoff


# ---------------------------------------------------------------------------
# 4. Repeated logout is idempotent; retry after failure is safe
# ---------------------------------------------------------------------------


def test_repeated_revoke_is_idempotent(data_dir):
    """Calling logout-all twice succeeds; the cutoff advances and old tokens
    stay rejected. Retry after a failed attempt is equally safe (atomic
    overwrite, no partial state)."""
    token = generate_token(
        user_id="user-repeat",
        username="repeat",
        roles=["viewer"],
        data_dir=data_dir,
    )
    cutoff1 = revoke_all_user_sessions("user-repeat", data_dir)
    time.sleep(1.05)
    cutoff2 = revoke_all_user_sessions("user-repeat", data_dir)
    assert cutoff2 >= cutoff1
    assert verify_token(token, data_dir) is None
    assert load_user_session_revocations(data_dir).get("user-repeat") == cutoff2


# ---------------------------------------------------------------------------
# 5. Calling route surfaces the failure as 500 with a generic message
# ---------------------------------------------------------------------------


class _Stub:
    pass


@pytest.fixture
def app_client(data_dir, monkeypatch):
    """Flask test client wired to the real auth_routes blueprint."""
    import flask
    from api import auth_routes as ar

    monkeypatch.setattr(ar, "_services", lambda: (_Stub(), _Stub(), _Stub(), data_dir))
    app = flask.Flask(__name__)
    app.register_blueprint(ar.bp)
    return app.test_client()


def _internal_headers():
    from auth.middleware import get_internal_call_secret

    return {"X-Internal-Call": get_internal_call_secret()}


def test_route_returns_500_generic_when_revocation_write_fails(
    data_dir, app_client, monkeypatch
):
    """/api/auth/revoke-all-sessions must not claim success when the
    authoritative write fails: 500 + generic body, no internal details."""
    import auth.service as svc

    def boom(user_id, data_dir_path):
        raise svc.SessionRevocationError(
            f"Failed to persist session revocation cutoff for user {user_id}"
        )

    monkeypatch.setattr(svc, "revoke_all_user_sessions", boom)

    resp = app_client.post("/api/auth/revoke-all-sessions", headers=_internal_headers())
    assert resp.status_code == 500
    body = resp.get_json()
    assert body["success"] is False
    assert body["error"] == "Revoke sessions error"  # generic; no str(exc) leak
    assert "SessionRevocationError" not in (body.get("error") or "")


def test_route_success_when_pg_fails(data_dir, app_client, monkeypatch):
    """/api/auth/revoke-all-sessions still succeeds (with cutoff) when only
    the PG enrichment fails — the file cutoff is authoritative."""
    from storage import pg

    monkeypatch.setattr(pg, "execute", lambda sql, params=None: (_ for _ in ()).throw(RuntimeError("pg down")))
    resp = app_client.post("/api/auth/revoke-all-sessions", headers=_internal_headers())
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["success"] is True
    assert body["revoked_at"] > 0
