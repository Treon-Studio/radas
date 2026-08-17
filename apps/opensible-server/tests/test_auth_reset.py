"""Tests for the forgot-password / reset-password flow (UC 492)."""
from __future__ import annotations

import os
import re
import sys

os.environ.setdefault("DATABASE_URL", "postgresql://localhost/radas_test")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-key-at-least-32-chars-long!!")
os.environ.setdefault("INTERNAL_CALL_SECRET", "test-internal-call-secret-at-least-32-chars")

import pytest

from storage import pg, pg_schema


@pytest.fixture(autouse=True)
def pg_db():
    pg.reset_connection_pool()
    pg_schema.reset_schema()
    yield
    pg.reset_connection_pool()


@pytest.fixture
def app_client(data_dir, monkeypatch):
    """Flask test client wired to real auth_routes blueprint + isolated data_dir."""
    import flask
    from api import auth_routes as ar

    from services.user_service import UserService

    user_service = UserService(data_dir)
    user_service.create_user("alice", "OldPassw0rd!x", email="alice@example.com")

    class _Stub:
        def get_role_by_id(self, role_id):
            return None

    def fake_services():
        return (user_service, _Stub(), _Stub(), data_dir)

    monkeypatch.setattr(ar, "_services", fake_services)
    monkeypatch.setattr(ar, "_login_attempts", {})
    monkeypatch.setattr(
        "services.notif_courier.deliver_reset_link",
        lambda *a, **kw: {"delivered": False, "channel": None, "webhooks_dispatched": 0},
    )

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(ar.bp)
    return app.test_client()


def _reset_token_from(body, client) -> str:
    """Complete a forgot-password round trip and return the reset token."""
    r = client.post(
        "/api/auth/forgot-password",
        json={"username": "alice"},
        headers={"Origin": "http://localhost:8080"},
    )
    assert r.status_code == 200, r.data
    data = r.get_json()
    assert data["success"] is True
    assert data["reset_url"], "expected inline reset_url when no courier channel"
    match = re.search(r"token=([^&\s]+)", data["reset_url"])
    assert match, f"no token in reset_url: {data['reset_url']}"
    return match.group(1)


def test_forgot_password_unknown_user_does_not_leak(app_client):
    r = app_client.post(
        "/api/auth/forgot-password",
        json={"username": "ghost"},
        headers={"Origin": "http://localhost:8080"},
    )
    assert r.status_code == 200, r.data
    data = r.get_json()
    assert data["success"] is True
    assert data["reset_url"] is None


def test_forgot_password_invalid_username_rejected(app_client):
    r = app_client.post(
        "/api/auth/forgot-password",
        json={"username": "bad user!"},
        headers={"Origin": "http://localhost:8080"},
    )
    assert r.status_code == 400, r.data


def test_forgot_password_returns_inline_reset_url(app_client):
    r = app_client.post(
        "/api/auth/forgot-password",
        json={"username": "alice"},
        headers={"Origin": "http://localhost:8080"},
    )
    assert r.status_code == 200, r.data
    data = r.get_json()
    assert data["success"] is True
    assert data["reset_url"].startswith("http://localhost:8080/reset-password?token=")


def test_reset_password_completes_flow(app_client):
    token = _reset_token_from(app_client, app_client)

    r = app_client.post("/api/auth/reset-password", json={
        "token": token,
        "password": "NewPassw0rd!y",
    })
    assert r.status_code == 200, r.data
    assert r.get_json()["success"] is True

    # Old password no longer works; new password does.
    from pathlib import Path

    from services.user_service import UserService

    us = UserService(Path(os.environ["DATA_DIR"]))
    assert us.authenticate("alice", "OldPassw0rd!x") is None
    assert us.authenticate("alice", "NewPassw0rd!y") is not None


def test_reset_password_token_is_single_use(app_client):
    token = _reset_token_from(app_client, app_client)

    payload = {"token": token, "password": "NewPassw0rd!y"}
    assert app_client.post("/api/auth/reset-password", json=payload).status_code == 200
    r2 = app_client.post("/api/auth/reset-password", json=payload)
    assert r2.status_code == 401, r2.data


def test_reset_password_rejects_unknown_token(app_client):
    r = app_client.post("/api/auth/reset-password", json={
        "token": "not-a-valid-token",
        "password": "NewPassw0rd!y",
    })
    assert r.status_code == 401, r.data


def test_reset_password_rejects_access_token(app_client):
    from pathlib import Path

    from auth.service import generate_token

    ddir = Path(os.environ["DATA_DIR"])
    access = generate_token("u-any", "alice", ["admin"], ddir, token_type="access")
    r = app_client.post("/api/auth/reset-password", json={
        "token": access,
        "password": "NewPassw0rd!y",
    })
    assert r.status_code == 401, r.data


def test_reset_password_rejects_weak_password(app_client):
    token = _reset_token_from(app_client, app_client)
    r = app_client.post("/api/auth/reset-password", json={
        "token": token,
        "password": "short",
    })
    assert r.status_code == 400, r.data


def test_reset_password_requires_token(app_client):
    r = app_client.post("/api/auth/reset-password", json={"password": "NewPassw0rd!y"})
    assert r.status_code == 400, r.data