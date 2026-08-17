from __future__ import annotations

import time
import flask
from psycopg.types.json import Jsonb

from api import register_blueprints
from auth.service import generate_token
from storage import pg

ORG, PROJECT, USER, INSTANCE = "usage-org", "usage-project", "usage-user", "usage-instance"

def _seed(data_dir):
    now = time.time()
    pg.execute("INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)", (ORG, ORG, USER, now))
    pg.execute("INSERT INTO projects (id,org_id,owner_id,name,description,is_archived,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,0,%s,%s)", (PROJECT, ORG, USER, PROJECT, "", now, now))
    pg.execute("INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)", (ORG, USER, "owner", now))
    pg.execute("INSERT INTO service_instances (id,org_id,project_id,name,definition_slug,definition_version,environment,runtime_id,status,archived,created_by,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'running',FALSE,%s,%s,%s)", (INSTANCE, ORG, PROJECT, "usage-service", "custom-container", "1.0.0", "dev", "mock", USER, now, now))

def _client(data_dir):
    from auth import middleware
    middleware.set_data_dir(data_dir); _seed(data_dir)
    app = flask.Flask("usage-tests"); app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False); register_blueprints(app); return app.test_client()

def _headers(data_dir): return {"Authorization": f"Bearer {generate_token(USER, USER, [], data_dir, token_type='access')}"}

def test_usage_snapshot_export_and_rollup_redaction(data_dir):
    c = _client(data_dir); h = _headers(data_dir)
    created = c.post(f"/api/projects/{PROJECT}/services/{INSTANCE}/usage", headers=h, json={"cpu_millicores": 100, "memory_mb": 256, "storage_gb": 2, "running_seconds": 30, "provider_cost": {"api_token": "hidden"}})
    assert created.status_code == 201
    usage = c.get(f"/api/projects/{PROJECT}/usage", headers=h)
    assert usage.status_code == 200 and usage.get_json()["data"]["totals"]["memory_mb"] == 256
    assert "hidden" not in str(usage.get_json())
    export = c.get(f"/api/projects/{PROJECT}/usage/export", headers=h)
    assert export.status_code == 200 and len(export.get_json()["data"]["rows"]) == 1

def test_service_quota_fails_closed_without_policy(data_dir):
    c = _client(data_dir); h = _headers(data_dir)
    blocked = c.post(f"/api/projects/{PROJECT}/services/{INSTANCE}/quota/check", headers=h, json={"resources": {"memory_mb": 256}})
    assert blocked.status_code == 409
    assert blocked.get_json()["error"]["code"] == "SERVICE_QUOTA_NOT_CONFIGURED"
