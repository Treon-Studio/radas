from __future__ import annotations

import json
import time

import flask
import pytest

from api import register_blueprints
from auth.service import generate_token
from storage import pg
from services import retry_policy


def _setup_project_and_org():
    now = time.time()
    pg.execute("INSERT INTO orgs (id, name, created_by, created_at) VALUES (%s, %s, %s, %s)", ("retry-org", "retry-org", "owner", now))
    pg.execute("INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, 0, %s, %s)", ("retry-project", "retry-org", "owner", "retry-project", "", now, now))
    pg.execute("INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s)", ("retry-org", "owner", "owner", now))
    return "retry-project"


def _app(data_dir):
    from auth import middleware
    middleware.set_data_dir(data_dir)
    app = flask.Flask("retry-policy-route-tests")
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    register_blueprints(app)
    return app.test_client()


def _headers(data_dir):
    token = generate_token("owner", "owner", [], data_dir, token_type="access")
    return {"Authorization": f"Bearer {token}"}


def test_get_put_retry_policy_project_and_stack(data_dir, monkeypatch):
    project_id = _setup_project_and_org()
    client = _app(data_dir)
    headers = _headers(data_dir)

    # 1. Set project policy
    resp = client.put(
        f"/api/retry-policy/{project_id}",
        json={"max_retries": 3, "backoff_seconds": 60},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.get_json()["retry_policy"]["max_retries"] == 3

    # 2. Get project policy (no stack)
    resp = client.get(f"/api/retry-policy/{project_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.get_json()["retry_policy"]["max_retries"] == 3

    # 3. Set stack policy
    resp = client.put(
        f"/api/retry-policy/{project_id}",
        json={"max_retries": 5, "backoff_seconds": 120, "stack": "web"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.get_json()["retry_policy"]["max_retries"] == 5

    # 4. Get stack policy
    resp = client.get(f"/api/retry-policy/{project_id}?stack=web", headers=headers)
    assert resp.status_code == 200
    assert resp.get_json()["retry_policy"]["max_retries"] == 5

    # 5. Get project policy (should still be 3)
    resp = client.get(f"/api/retry-policy/{project_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.get_json()["retry_policy"]["max_retries"] == 3

    # 6. Get unknown stack (should fallback to project policy)
    resp = client.get(f"/api/retry-policy/{project_id}?stack=unknown", headers=headers)
    assert resp.status_code == 200
    assert resp.get_json()["retry_policy"]["max_retries"] == 3


def test_invalid_policy_returns_400(data_dir):
    project_id = _setup_project_and_org()
    client = _app(data_dir)
    headers = _headers(data_dir)

    resp = client.put(
        f"/api/retry-policy/{project_id}",
        json={"max_retries": "not-a-number", "backoff_seconds": 60},
        headers=headers,
    )
    assert resp.status_code == 400
    assert "invalid" in resp.get_json()["error"]

    resp = client.put(
        f"/api/retry-policy/{project_id}",
        json={"max_retries": 3, "backoff_seconds": "also-invalid"},
        headers=headers,
    )
    assert resp.status_code == 400
    assert "invalid" in resp.get_json()["error"]