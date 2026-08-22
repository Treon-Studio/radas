from __future__ import annotations

import json
import time

import flask
import pytest

from api import register_blueprints
from auth.service import generate_token
from storage import pg


def _setup_project(project_id="stack-policy-project"):
    now = time.time()
    pg.execute("INSERT INTO orgs (id, name, created_by, created_at) VALUES (%s, %s, %s, %s)", ("stack-policy-org", "stack-policy-org", "owner", now))
    pg.execute(
        "INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, created_at, updated_at) "
        "VALUES (%s, %s, %s, %s, %s, 0, %s, %s)",
        (project_id, "stack-policy-org", "owner", project_id, "", now, now),
    )
    pg.execute("INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s)", ("stack-policy-org", "owner", "owner", now))


def _client(data_dir):
    from auth import middleware
    middleware.set_data_dir(data_dir)
    app = flask.Flask("retry-policy-stack-tests")
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    register_blueprints(app)
    return app.test_client()


def _headers(data_dir, user_id="owner"):
    token = generate_token(user_id, user_id, [], data_dir, token_type="access")
    return {"Authorization": f"Bearer {token}"}


def test_stack_retry_policy_put_and_get(pg_db, data_dir):
    project_id = "stack-policy-project"
    stack_name = "network-prod"
    _setup_project(project_id)

    client = _client(data_dir)
    headers = _headers(data_dir)

    # PUT stack policy
    response = client.put(
        f"/api/retry-policy/{project_id}/stacks/{stack_name}",
        json={"max_retries": 3, "backoff_seconds": 60},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["success"] is True
    assert data["retry_policy"]["max_retries"] == 3
    assert data["retry_policy"]["backoff_seconds"] == 60

    # GET stack policy
    response = client.get(
        f"/api/retry-policy/{project_id}/stacks/{stack_name}",
        headers=headers,
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["retry_policy"]["max_retries"] == 3
    assert data["retry_policy"]["backoff_seconds"] == 60

    # PUT with invalid data
    response = client.put(
        f"/api/retry-policy/{project_id}/stacks/{stack_name}",
        json={"max_retries": "invalid"},
        headers=headers,
    )
    assert response.status_code == 400

    # GET after setting another stack should be default
    response = client.get(
        f"/api/retry-policy/{project_id}/stacks/another-stack",
        headers=headers,
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["retry_policy"]["max_retries"] == 0
    assert data["retry_policy"]["backoff_seconds"] == 300