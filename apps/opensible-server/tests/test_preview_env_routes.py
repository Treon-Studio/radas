from __future__ import annotations

import hashlib
import hmac
import json

import pytest
from flask import Flask

from api import preview_env_routes


@pytest.fixture
def client():
    app = Flask("preview-webhook-tests")
    app.register_blueprint(preview_env_routes.bp)
    app.config["TESTING"] = True
    return app.test_client()


def _signature(secret: str, body: bytes) -> str:
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def test_public_preview_webhook_rejects_oversized_payload(monkeypatch, client):
    monkeypatch.setattr(preview_env_routes, "_PREVIEW_MAX_BODY_BYTES", 4)
    response = client.post("/api/webhooks/github/preview", data=b"12345", headers={"Content-Type": "application/json"})
    assert response.status_code == 413
    assert response.get_json() == {"error": "payload too large"}


def test_public_preview_webhook_rate_limits_client(monkeypatch, client):
    monkeypatch.setattr(preview_env_routes, "webhook_secret", lambda: "secret")
    monkeypatch.setattr(preview_env_routes, "_PREVIEW_RATE_LIMIT", 1)
    monkeypatch.setattr(preview_env_routes, "verify_github_signature", lambda *args: True)
    monkeypatch.setattr(preview_env_routes, "handle_github_event", lambda payload, stack=None: {"ok": True})
    headers = {"X-Forwarded-For": "198.51.100.7", "X-GitHub-Event": "push"}
    first = client.post("/api/webhooks/github/preview", data=b"{}", headers=headers)
    second = client.post("/api/webhooks/github/preview", data=b"{}", headers=headers)
    assert first.status_code == 200
    assert second.status_code == 429
    assert second.headers["Retry-After"]


def test_public_preview_webhook_returns_controlled_error_when_production_secret_missing(
    client, monkeypatch, caplog
):
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.delenv("PREVIEW_WEBHOOK_SECRET", raising=False)
    body = json.dumps({"action": "opened"}).encode("utf-8")

    response = client.post(
        "/api/webhooks/github/preview",
        data=body,
        headers={"X-Hub-Signature-256": "sha256=not-used"},
    )

    assert response.status_code == 503
    assert response.get_json() == {"error": "preview webhook is not configured"}
    assert "PREVIEW_WEBHOOK_SECRET" not in response.get_data(as_text=True)
    assert "radas-preview-dev-secret" not in caplog.text


def test_public_preview_webhook_accepts_valid_configured_secret(client, monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "production")
    secret = "preview-webhook-0123456789-abcdefghijklmnop"
    monkeypatch.setenv("PREVIEW_WEBHOOK_SECRET", secret)
    body = json.dumps(
        {"action": "opened", "pull_request": {"number": 7}}
    ).encode("utf-8")
    monkeypatch.setattr(
        preview_env_routes,
        "handle_github_event",
        lambda payload, stack=None: {"ok": True, "action": payload["action"]},
    )

    response = client.post(
        "/api/webhooks/github/preview?stack=base",
        data=body,
        headers={
            "X-Hub-Signature-256": _signature(secret, body),
            "X-GitHub-Event": "pull_request",
            "Content-Type": "application/json",
        },
    )

    assert response.status_code == 200
    assert response.get_json() == {"ok": True, "action": "opened"}


def test_public_preview_webhook_does_not_accept_known_fallback(client, monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("PREVIEW_WEBHOOK_SECRET", "radas-preview-dev-secret")
    body = b'{"action":"opened"}'

    response = client.post(
        "/api/webhooks/github/preview",
        data=body,
        headers={
            "X-Hub-Signature-256": _signature("radas-preview-dev-secret", body),
            "X-GitHub-Event": "pull_request",
        },
    )

    assert response.status_code == 503
    assert response.get_json() == {"error": "preview webhook is not configured"}
