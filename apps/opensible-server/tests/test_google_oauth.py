"""
Unit tests for Google SSO (OAuth 2.0 / OIDC) authentication.
"""
from __future__ import annotations

import flask
import pytest
from pathlib import Path

from api.google_oauth_routes import bp as google_bp
from services import google_oauth
from services.user_service import UserService
from services.role_service import RoleService


@pytest.fixture
def app_client(tmp_path, pg_db):
    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.user_service = UserService(tmp_path)
    app.role_service = RoleService(tmp_path)
    app.access_control_service = None
    app.DATA_DIR = tmp_path

    app.register_blueprint(google_bp)
    with app.test_client() as c:
        yield c


def test_google_oauth_config(app_client):
    res = app_client.get("/api/auth/google/config")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "enabled" in data
    assert "client_id" in data


def test_google_oauth_url(app_client):
    res = app_client.get("/api/auth/google/url?state=custom-state-123")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "accounts.google.com" in data["url"]
    assert "custom-state-123" in data["url"]


def test_google_oauth_token_login(app_client):
    res = app_client.post("/api/auth/google/token", json={
        "id_token": "mock_token_engineer",
    })
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == "engineer@gmail.com"


def test_google_oauth_callback_login(app_client):
    res = app_client.post("/api/auth/google/callback", json={
        "code": "mock_google_devlead",
    })
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "token" in data
    assert data["user"]["email"] == "devlead@gmail.com"
