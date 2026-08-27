"""CLI auth lifecycle contract test (Task 3.1 of the 2026-08-27 plan).

Exercises the exact HTTP contract the RADAS CLI (`radas auth ...`,
apps/cli/cmd/auth) depends on, against the real auth routes blueprint:

* POST /api/auth/login   {username, password} ->
    200 {success, access_token, refresh_token, orgs, active_org_id, user}
    401 {success: False, error}
* GET  /api/auth/me      Bearer access token -> 200 {success, user}
* POST /api/auth/refresh {refresh_token} -> 200 {success, access_token}
    401 {success: False, error: "Invalid refresh token"}
* POST /api/auth/logout  Bearer access token (require_auth) ->
    200 {success, message}; the presented token is blacklisted afterwards.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

USERNAME = "alice"
PASSWORD = "OldPassw0rd!x"


@pytest.fixture
def app_client(data_dir, monkeypatch):
    """Flask test client wired to the real auth_routes blueprint with an
    isolated data_dir (token generation, blacklist) and Postgres schema."""
    import flask

    from api import auth_routes as ar
    from auth.middleware import set_data_dir
    from services.user_service import UserService

    user_service = UserService(data_dir)
    user_service.create_user(USERNAME, PASSWORD, email="alice@example.com")

    class _Stub:
        def get_role_by_id(self, role_id):
            return None

        def get_user_permissions(self, user_id):
            return set()

    def fake_services():
        return (user_service, _Stub(), _Stub(), data_dir)

    monkeypatch.setattr(ar, "_services", fake_services)
    # require_auth resolves DATA_DIR through the middleware module global.
    set_data_dir(data_dir)
    # Reset the in-memory brute-force window so suite ordering cannot trip it.
    from services.login_security import _login_failures

    _login_failures.clear()

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(ar.bp)
    return app.test_client()


def _login(client, username=USERNAME, password=PASSWORD):
    return client.post("/api/auth/login", json={"username": username, "password": password})


# ---------------------------------------------------------------------------
# The full CLI lifecycle: login -> use token -> refresh -> logout
# ---------------------------------------------------------------------------


def test_cli_auth_lifecycle_login_use_refresh_logout(app_client):
    # 1. login: exact success shape
    r = _login(app_client)
    assert r.status_code == 200
    body = r.get_json()
    assert body["success"] is True
    assert set(body) >= {"success", "access_token", "refresh_token", "orgs", "active_org_id", "user"}
    assert isinstance(body["access_token"], str) and body["access_token"]
    assert isinstance(body["refresh_token"], str) and body["refresh_token"]
    assert body["user"]["username"] == USERNAME
    access, refresh = body["access_token"], body["refresh_token"]

    # 2. the returned access token authenticates a real route
    me = app_client.get("/api/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert me.status_code == 200
    assert me.get_json()["success"] is True
    assert me.get_json()["user"]["username"] == USERNAME

    # 3. refresh: exact shape — only success + access_token
    r = app_client.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 200
    refreshed = r.get_json()
    assert refreshed["success"] is True
    assert set(refreshed) == {"success", "access_token"}
    new_access = refreshed["access_token"]
    assert new_access
    # NOTE: not compared for inequality with the original — a refresh in the
    # same second mints a byte-identical JWT (deterministic HS256 claims); the
    # contract is that the returned token authenticates, verified below.

    # 4. the rotated access token authenticates too
    me = app_client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    assert me.status_code == 200

    # 5. logout: requires auth, returns {success, message}
    r = app_client.post("/api/auth/logout", headers={"Authorization": f"Bearer {new_access}"})
    assert r.status_code == 200
    assert r.get_json() == {"success": True, "message": "Logged out"}

    # 6. the revoked token is blacklisted — the CLI must never reuse it
    me = app_client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    assert me.status_code == 401
    assert me.get_json()["error"] == "Invalid token"

    # 7. logout itself requires a token
    r = app_client.post("/api/auth/logout")
    assert r.status_code == 401


def test_cli_login_rejects_wrong_password_with_exact_shape(app_client):
    r = _login(app_client, password="wrong-password")
    assert r.status_code == 401
    assert r.get_json() == {"success": False, "error": "Incorrect username or password"}

    # The failed attempt must not issue anything refreshable.
    r = app_client.post("/api/auth/refresh", json={"refresh_token": "garbage"})
    assert r.status_code == 401
    assert r.get_json() == {"success": False, "error": "Invalid refresh token"}


def test_cli_refresh_rejects_invalid_token_with_exact_shape(app_client):
    r = app_client.post("/api/auth/refresh", json={"refresh_token": "not-a-jwt"})
    assert r.status_code == 401
    assert r.get_json() == {"success": False, "error": "Invalid refresh token"}

    # A missing refresh token is a 400, distinct from an invalid one.
    r = app_client.post("/api/auth/refresh", json={})
    assert r.status_code == 400
    assert r.get_json() == {"success": False, "error": "Refresh token required"}


def test_cli_refresh_rejects_access_token_as_refresh(app_client):
    """The CLI must not be able to refresh with an access token."""
    access = _login(app_client).get_json()["access_token"]
    r = app_client.post("/api/auth/refresh", json={"refresh_token": access})
    assert r.status_code == 401
    assert r.get_json() == {"success": False, "error": "Invalid refresh token"}
