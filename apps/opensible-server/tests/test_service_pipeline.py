from __future__ import annotations

import time
import flask

from api import register_blueprints
from auth.service import generate_token
from storage import pg

ORG_A, PROJECT_A, USER_A = "pipeline-org-a", "pipeline-project-a", "pipeline-user-a"
INSTANCE_A = "pipeline-instance-a"


def _seed(data_dir):
    now = time.time()
    pg.execute("INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)", (ORG_A, ORG_A, USER_A, now))
    pg.execute("INSERT INTO projects (id,org_id,owner_id,name,description,is_archived,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,0,%s,%s)", (PROJECT_A, ORG_A, USER_A, PROJECT_A, "", now, now))
    pg.execute("INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)", (ORG_A, USER_A, "owner", now))
    pg.execute("INSERT INTO service_instances (id,org_id,project_id,name,definition_slug,definition_version,environment,runtime_id,status,archived,created_by,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'draft',FALSE,%s,%s,%s)", (INSTANCE_A, ORG_A, PROJECT_A, "pipeline-service", "custom-container", "1.0.0", "dev", "mock", USER_A, now, now))
    pg.execute("INSERT INTO service_sources (id,org_id,project_id,instance_id,repo_url,ref,path,commit_sha,source_revision,auth_secret_id,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", ("pipeline-source", ORG_A, PROJECT_A, INSTANCE_A, "https://github.com/org/repo", "main", "", "abcdef0123456789abcdef0123456789abcdef01", "abcdef0123456789abcdef0123456789abcdef01", None, now, now))


def _client(data_dir):
    from auth import middleware
    middleware.set_data_dir(data_dir)
    _seed(data_dir)
    app = flask.Flask("service-pipeline-tests")
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    register_blueprints(app)
    return app.test_client()


def _headers(data_dir):
    return {"Authorization": f"Bearer {generate_token(USER_A, USER_A, [], data_dir, token_type='access')}"}


def test_pipeline_stages_approval_and_promotion(data_dir):
    c = _client(data_dir)
    headers = _headers(data_dir)
    stages = [{"name": name} for name in ("validate", "plan_build", "approval", "deploy", "health_check", "promote")]
    configured = c.put(f"/api/projects/{PROJECT_A}/services/{INSTANCE_A}/pipeline", headers=headers, json={"stages": stages})
    assert configured.status_code == 200
    run = c.post(f"/api/projects/{PROJECT_A}/services/{INSTANCE_A}/pipeline/run", headers={**headers, "Idempotency-Key": "pipeline-run-1"}, json={"target_environment": "production"})
    assert run.status_code == 202
    assert run.get_json()["data"]["run"]["status"] == "awaiting_approval"
    run_id = run.get_json()["data"]["run"]["id"]
    rejected = c.post(f"/api/projects/{PROJECT_A}/services/{INSTANCE_A}/pipeline/{run_id}/promote", headers=headers, json={"target_environment": "production"})
    assert rejected.status_code == 422
    approved = c.post(f"/api/projects/{PROJECT_A}/services/{INSTANCE_A}/pipeline/{run_id}/approve", headers=headers)
    assert approved.status_code == 200
    promoted = c.post(f"/api/projects/{PROJECT_A}/services/{INSTANCE_A}/pipeline/{run_id}/promote", headers=headers, json={"target_environment": "production"})
    assert promoted.status_code == 422


def test_pipeline_requires_immutable_source_and_valid_stage_order(data_dir):
    c = _client(data_dir)
    headers = _headers(data_dir)
    bad = c.put(f"/api/projects/{PROJECT_A}/services/{INSTANCE_A}/pipeline", headers=headers, json={"stages": [{"name": "deploy"}]})
    assert bad.status_code == 422
    good = c.put(f"/api/projects/{PROJECT_A}/services/{INSTANCE_A}/pipeline", headers=headers, json={"stages": [{"name": name} for name in ("validate", "plan_build", "approval", "deploy", "health_check", "promote")]})
    assert good.status_code == 200
    pg.execute("UPDATE service_sources SET commit_sha=NULL, source_revision=NULL WHERE instance_id=%s", (INSTANCE_A,))
    missing = c.post(f"/api/projects/{PROJECT_A}/services/{INSTANCE_A}/pipeline/run", headers={**headers, "Idempotency-Key": "pipeline-run-missing"}, json={"target_environment": "staging"})
    assert missing.status_code == 422
