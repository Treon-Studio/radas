from __future__ import annotations

import time
import flask

from api import register_blueprints
from auth.service import generate_token
from services import service_catalog
from storage import pg

ORG_A, ORG_B = "source-org-a", "source-org-b"
PROJECT_A, PROJECT_B = "source-project-a", "source-project-b"
USER_A, USER_B = "source-user-a", "source-user-b"
INSTANCE_A = "source-instance-a"


def _seed(project_id, org_id, user_id):
    now = time.time()
    pg.execute("INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)", (org_id, org_id, user_id, now))
    pg.execute("INSERT INTO projects (id,org_id,owner_id,name,description,is_archived,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,0,%s,%s)", (project_id, org_id, user_id, project_id, "", now, now))
    pg.execute("INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)", (org_id, user_id, "owner", now))


def _instance():
    now = time.time()
    pg.execute(
        "INSERT INTO service_instances (id,org_id,project_id,name,definition_slug,definition_version,environment,runtime_id,status,desired_revision_id,archived,created_by,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'draft',NULL,FALSE,%s,%s,%s)",
        (INSTANCE_A, ORG_A, PROJECT_A, "source-demo", "custom-container", "1.0.0", "dev", "mock", USER_A, now, now),
    )


def _headers(user, data_dir):
    token = generate_token(user, user, [], data_dir, token_type="access")
    return {"Authorization": f"Bearer {token}"}


def client(data_dir):
    from auth import middleware
    middleware.set_data_dir(data_dir)
    _seed(PROJECT_A, ORG_A, USER_A)
    _seed(PROJECT_B, ORG_B, USER_B)
    _instance()
    app = flask.Flask("service-source-tests")
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    register_blueprints(app)
    return app.test_client()


def test_source_bind_resolve_and_deploy_operation(data_dir):
    c = client(data_dir)
    headers = _headers(USER_A, data_dir)
    bound = c.put(
        f"/api/projects/{PROJECT_A}/services/{INSTANCE_A}/source",
        headers=headers,
        json={"repo_url": "https://user:pat@example.com/org/repo.git", "branch": "main", "path": "services/app", "auth_secret_id": "git-secret"},
    )
    assert bound.status_code == 200
    source = bound.get_json()["data"]["source"]
    assert source["repo_url"] == "https://example.com/org/repo.git"
    assert "user:pat@" not in str(bound.get_json()).lower()

    resolved = c.post(
        f"/api/projects/{PROJECT_A}/services/{INSTANCE_A}/source/resolve",
        headers=headers,
        json={"commit_sha": "0123456789abcdef0123456789abcdef01234567"},
    )
    assert resolved.status_code == 200
    assert resolved.get_json()["data"]["source"]["commit_sha"].startswith("0123456")

    deploy = c.post(
        f"/api/projects/{PROJECT_A}/services/{INSTANCE_A}/source/deploy",
        headers={**headers, "Idempotency-Key": "source-deploy-1"},
    )
    assert deploy.status_code == 202
    assert deploy.get_json()["operation"]["kind"] == "service.deploy_from_commit"

    retry = c.post(
        f"/api/projects/{PROJECT_A}/services/{INSTANCE_A}/source/deploy",
        headers={**headers, "Idempotency-Key": "source-deploy-1"},
    )
    assert retry.status_code == 202
    assert retry.get_json()["operation"]["id"] == deploy.get_json()["operation"]["id"]


def test_source_isolation_and_immutable_commit(data_dir):
    c = client(data_dir)
    own = _headers(USER_A, data_dir)
    other = _headers(USER_B, data_dir)
    c.put(f"/api/projects/{PROJECT_A}/services/{INSTANCE_A}/source", headers=own, json={"repo_url": "https://github.com/org/repo", "ref": "main"})
    denied = c.get(f"/api/projects/{PROJECT_A}/services/{INSTANCE_A}/source", headers=other)
    assert denied.status_code == 403
    c.post(f"/api/projects/{PROJECT_A}/services/{INSTANCE_A}/source/resolve", headers=own, json={"commit_sha": "abcdef0123456789abcdef0123456789abcdef01"})
    changed = c.post(f"/api/projects/{PROJECT_A}/services/{INSTANCE_A}/source/resolve", headers=own, json={"commit_sha": "1234567890abcdef1234567890abcdef12345678"})
    assert changed.status_code == 422
