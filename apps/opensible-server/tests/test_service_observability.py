from __future__ import annotations

import time
import flask
from psycopg.types.json import Jsonb

from api import register_blueprints
from auth.service import generate_token
from storage import pg

ORG, PROJECT, USER, INSTANCE = "obs-org", "obs-project", "obs-user", "obs-instance"


def _seed(data_dir):
    now = time.time()
    pg.execute("INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)", (ORG, ORG, USER, now))
    pg.execute("INSERT INTO projects (id,org_id,owner_id,name,description,is_archived,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,0,%s,%s)", (PROJECT, ORG, USER, PROJECT, "", now, now))
    pg.execute("INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)", (ORG, USER, "owner", now))
    pg.execute("INSERT INTO service_instances (id,org_id,project_id,name,definition_slug,definition_version,environment,runtime_id,status,provider_ref,endpoint_summary,archived,created_by,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'running',%s,%s,FALSE,%s,%s,%s)", (INSTANCE, ORG, PROJECT, "obs-service", "custom-container", "1.0.0", "dev", "mock", Jsonb({"token": "secret-value"}), Jsonb({"url": "https://example.test"}), USER, now, now))
    pg.execute("INSERT INTO service_operations (id,org_id,project_id,instance_id,kind,idempotency_key,payload_fingerprint,payload,status,created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", ("obs-op", ORG, PROJECT, INSTANCE, "service.deploy", "obs-key", "fingerprint", Jsonb({"secret": "hidden"}), "succeeded", now))
    pg.execute("INSERT INTO service_operation_events (operation_id,event,message,details,created_at) VALUES (%s,%s,%s,%s,%s)", ("obs-op", "succeeded", "deploy complete", Jsonb({"access_token": "hidden"}), now))


def _client(data_dir):
    from auth import middleware
    middleware.set_data_dir(data_dir)
    _seed(data_dir)
    app = flask.Flask("service-observability-tests")
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    register_blueprints(app)
    return app.test_client()


def _headers(data_dir):
    return {"Authorization": f"Bearer {generate_token(USER, USER, [], data_dir, token_type='access')}"}


def test_health_timeline_logs_are_scoped_and_redacted(data_dir):
    c = _client(data_dir)
    headers = _headers(data_dir)
    health = c.get(f"/api/projects/{PROJECT}/services/{INSTANCE}/health", headers=headers)
    assert health.status_code == 200
    body = health.get_json()["data"]
    assert body["current"]["status"] == "unknown"
    assert "secret-value" not in str(body)
    timeline = c.get(f"/api/projects/{PROJECT}/services/{INSTANCE}/observability", headers=headers)
    assert timeline.status_code == 200
    assert timeline.get_json()["data"]["timeline"][0]["kind"] == "service.deploy"
    logs = c.get(f"/api/projects/{PROJECT}/services/{INSTANCE}/logs?limit=1", headers=headers)
    assert logs.status_code == 200
    assert "hidden" not in str(logs.get_json())


def test_health_observation_and_auth(data_dir):
    c = _client(data_dir)
    headers = _headers(data_dir)
    from services import service_observability
    observed = service_observability.observe_health(PROJECT, INSTANCE, USER, "degraded", {"api_key": "secret"})
    assert observed["status"] == "degraded"
    current = c.get(f"/api/projects/{PROJECT}/services/{INSTANCE}/health", headers=headers)
    assert current.get_json()["data"]["current"]["status"] == "degraded"
    unauth = c.get(f"/api/projects/{PROJECT}/services/{INSTANCE}/logs")
    assert unauth.status_code == 401
