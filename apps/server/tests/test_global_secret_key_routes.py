from __future__ import annotations

import os

import flask

from api.global_secrets_routes import bp


def _internal_call_header() -> dict[str, str]:
    # The header must carry the secret the runtime actually validated with,
    # not a hardcoded default: CI and local full-suite runs override
    # INTERNAL_CALL_SECRET (conftest only sets a fallback).
    return {"X-Internal-Call": os.environ.get("INTERNAL_CALL_SECRET", "test-internal-call-secret-at-least-32-chars")}


def _app(monkeypatch, tmp_path):
    import api.global_secrets_routes as routes

    app_module = type(
        "AppModule",
        (),
        {
            "app": flask.Flask("test-global-secret-key"),
            "DATA_DIR": tmp_path,
            "can_write_global_secrets": staticmethod(lambda: True),
            "can_read_global_secrets": staticmethod(lambda: True),
            "global_secrets_manager": None,
            "safe_log_error": staticmethod(lambda message, error, data=None: message),
        },
    )
    monkeypatch.setattr(routes, "_app_module", lambda: app_module)
    app = flask.Flask("test-global-secret-key-routes")
    app.config["TESTING"] = True
    app.register_blueprint(bp)
    return app


def test_production_key_update_and_create_are_configuration_only(monkeypatch, tmp_path):
    monkeypatch.setenv("FLASK_ENV", "production")
    app = _app(monkeypatch, tmp_path)
    client = app.test_client()
    headers = _internal_call_header()

    for path, payload in (
        ("/api/global/secrets/encryption-key", {"key": "a" * 48}),
        ("/api/global/secrets/encryption-key/create", None),
    ):
        response = client.post(path, json=payload, headers=headers)
        assert response.status_code == 409
        assert response.get_json()["errorCode"] == "CONFIGURATION_REQUIRED"

    assert not list(tmp_path.rglob(".encryption_key"))


def test_nonproduction_key_create_remains_explicit(monkeypatch, tmp_path):
    monkeypatch.setenv("FLASK_ENV", "testing")
    monkeypatch.delenv("GLOBAL_SECRETS_ENCRYPTION_KEY", raising=False)
    app = _app(monkeypatch, tmp_path)
    client = app.test_client()
    headers = _internal_call_header()

    response = client.post("/api/global/secrets/encryption-key/create", headers=headers)
    assert response.status_code == 200
    assert list(tmp_path.rglob(".encryption_key"))
