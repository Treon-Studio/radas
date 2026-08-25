"""Authentication behavior for OIDC configuration endpoints."""
from __future__ import annotations

import flask

from api.oidc_routes import bp


def test_oidc_config_status_is_public_and_redacted(monkeypatch):
    monkeypatch.setattr(
        "api.oidc_routes.get_config",
        lambda: {"issuer": "https://issuer.example", "client_secret": "hidden"},
    )
    monkeypatch.setattr("api.oidc_routes.is_configured", lambda: True)
    app = flask.Flask(__name__)
    app.register_blueprint(bp)

    response = app.test_client().get("/api/oidc/config")

    assert response.status_code == 200
    assert response.get_json() == {
        "configured": True,
        "config": {"issuer": "https://issuer.example"},
    }


def test_oidc_config_update_remains_protected():
    app = flask.Flask(__name__)
    app.register_blueprint(bp)

    response = app.test_client().put(
        "/api/oidc/config",
        json={"issuer": "https://issuer.example", "client_id": "client"},
    )

    assert response.status_code == 401
