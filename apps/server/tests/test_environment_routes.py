from __future__ import annotations

import time

import flask

from api import register_blueprints
from auth.service import generate_token
from storage import pg

ORG_A = "environment-org-a"
ORG_B = "environment-org-b"
PROJECT_A = "environment-project-a"
PROJECT_B = "environment-project-b"
USER_A = "environment-user-a"
USER_B = "environment-user-b"


def _seed(project_id: str, org_id: str, user_id: str) -> None:
    now = time.time()
    pg.execute("INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)", (org_id, org_id, user_id, now))
    pg.execute(
        "INSERT INTO projects (id,org_id,owner_id,name,description,is_archived,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,0,%s,%s)",
        (project_id, org_id, user_id, project_id, "", now, now),
    )
    pg.execute(
        "INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)",
        (org_id, user_id, "owner", now),
    )


def _headers(user_id: str, data_dir) -> dict[str, str]:
    token = generate_token(user_id, user_id, [], data_dir, token_type="access")
    return {"Authorization": f"Bearer {token}"}


def test_environment_defaults_are_project_scoped_and_production_protected(data_dir):
    from auth import middleware

    middleware.set_data_dir(data_dir)
    _seed(PROJECT_A, ORG_A, USER_A)
    _seed(PROJECT_B, ORG_B, USER_B)
    app = flask.Flask("environment-routes")
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    register_blueprints(app)
    client = app.test_client()

    response = client.get(f"/api/projects/{PROJECT_A}/environments", headers=_headers(USER_A, data_dir))
    assert response.status_code == 200
    environments = response.get_json()["data"]["environments"]
    assert {item["name"] for item in environments} == {"dev", "staging", "prod", "preview"}
    assert next(item for item in environments if item["name"] == "prod")["protected"] is True
    assert all(item["project_id"] == PROJECT_A for item in environments)

    denied = client.get(f"/api/projects/{PROJECT_A}/environments", headers=_headers(USER_B, data_dir))
    assert denied.status_code == 403


def test_environment_overlay_redacts_sensitive_values(data_dir):
    from auth import middleware

    middleware.set_data_dir(data_dir)
    _seed(PROJECT_A, ORG_A, USER_A)
    app = flask.Flask("environment-overlay-routes")
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    register_blueprints(app)
    client = app.test_client()
    headers = _headers(USER_A, data_dir)

    response = client.patch(
        f"/api/projects/{PROJECT_A}/environments/dev",
        headers=headers,
        json={"variables": {"PUBLIC_URL": "https://example.test", "DATABASE_PASSWORD": "do-not-return"}},
    )
    assert response.status_code == 200
    environment = response.get_json()["data"]["environment"]
    assert environment["variables"] == {"DATABASE_PASSWORD": "[REDACTED]", "PUBLIC_URL": "https://example.test"}
    assert response.get_json()["data"]["variable_diff"]["DATABASE_PASSWORD"] == "[REDACTED]"

    detail = client.get(f"/api/projects/{PROJECT_A}/environments/dev", headers=headers)
    assert detail.status_code == 200
    assert detail.get_json()["data"]["environment"]["variables"]["DATABASE_PASSWORD"] == "[REDACTED]"


def test_environment_requires_project_authentication(data_dir):
    from auth import middleware

    middleware.set_data_dir(data_dir)
    _seed(PROJECT_A, ORG_A, USER_A)
    app = flask.Flask("environment-auth-routes")
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    register_blueprints(app)
    response = app.test_client().get(f"/api/projects/{PROJECT_A}/environments")
    assert response.status_code == 401
    assert response.get_json()["error"] == "Authentication required"
