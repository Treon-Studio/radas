from __future__ import annotations

import json
import time

import flask

from api import register_blueprints
from auth.service import generate_token
from storage import pg


def _seed_project(data_dir: object, *, project_id: str, org_id: str, user_id: str, role: str = "owner") -> None:
    pg.execute("INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)", (user_id, user_id, "x"))
    pg.execute("INSERT INTO orgs (id, name, created_by, created_at) VALUES (%s,%s,%s,%s)", (org_id, org_id, user_id, time.time()))
    pg.execute("INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s,%s,%s,%s)", (org_id, user_id, role, time.time()))
    pg.execute(
        "INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, updated_at) VALUES (%s,%s,%s,%s,%s,0,%s)",
        (project_id, org_id, user_id, project_id, "", time.time()),
    )


def _audit_client(data_dir):
    from auth import middleware
    from app_context import set_data_dir

    middleware.set_data_dir(data_dir)
    set_data_dir(data_dir)
    app = flask.Flask("audit-events-tests")
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    register_blueprints(app)
    return app.test_client()


def _audit_headers(data_dir, user_id: str, project_id: str):
    token = generate_token(user_id, user_id, [], data_dir, token_type="access")
    return {"Authorization": f"Bearer {token}", "X-Project-Id": project_id}


def test_record_audit_event_persists_redacted_metadata(pg_db, data_dir):
    from services.audit_events import record_audit_event
    from storage import pg

    record_audit_event(
        "cloud.run.queued",
        actor_user_id="user-1",
        target_type="execution",
        target_id="run-1",
        meta={
            "project_id": "project-1",
            "stack_name": "web",
            "secrets": {"api_key": "raw-api-key"},
            "message": "Bearer raw-bearer-token",
        },
    )

    row = pg.query_one(
        "SELECT actor_user_id, action, target_type, target_id, meta_json FROM audit_log "
        "WHERE target_id = %s",
        ("run-1",),
    )
    assert row["actor_user_id"] == "user-1"
    assert row["action"] == "cloud.run.queued"
    assert row["target_type"] == "execution"
    meta = json.loads(row["meta_json"])
    assert meta["project_id"] == "project-1"
    assert meta["secrets"]["api_key"] == "[REDACTED]"
    assert "raw-api-key" not in json.dumps(meta)
    assert "raw-bearer-token" not in meta["message"]


def test_audit_events_keep_action_actor_resource_and_tenant_metadata(pg_db, data_dir):
    from services.audit_events import record_audit_event

    _seed_project(data_dir, project_id="audit-project-a", org_id="audit-org-a", user_id="audit-user-a")
    record_audit_event(
        "service.deploy.completed",
        actor_user_id="audit-user-a",
        target_type="service",
        target_id="service-a",
        meta={"project_id": "audit-project-a", "org_id": "audit-org-a", "environment": "production"},
    )

    row = pg.query_one(
        "SELECT action, actor_user_id, target_type, target_id, meta_json FROM audit_log WHERE action = %s",
        ("service.deploy.completed",),
    )
    assert row == {
        "action": "service.deploy.completed",
        "actor_user_id": "audit-user-a",
        "target_type": "service",
        "target_id": "service-a",
        "meta_json": '{"project_id": "audit-project-a", "org_id": "audit-org-a", "environment": "production"}',
    }


def test_audit_query_is_tenant_scoped_and_supports_filters_and_export(pg_db, data_dir):
    from services.audit_events import record_audit_event

    _seed_project(data_dir, project_id="audit-project-a", org_id="audit-org-a", user_id="audit-user-a")
    _seed_project(data_dir, project_id="audit-project-b", org_id="audit-org-b", user_id="audit-user-b")
    record_audit_event("stack.plan", actor_user_id="audit-user-a", target_type="stack", target_id="stack-a", meta={"project_id": "audit-project-a", "org_id": "audit-org-a"})
    record_audit_event("stack.apply", actor_user_id="audit-user-b", target_type="stack", target_id="stack-b", meta={"project_id": "audit-project-b", "org_id": "audit-org-b"})

    client = _audit_client(data_dir)
    own = client.get("/api/audit-log?target_type=stack&format=json", headers=_audit_headers(data_dir, "audit-user-a", "audit-project-a"))
    assert own.status_code == 200
    entries = own.get_json()["entries"]
    assert [entry["target_id"] for entry in entries] == ["stack-a"]
    assert "stack-b" not in str(own.get_json())

    export = client.get("/api/audit-log?format=csv", headers=_audit_headers(data_dir, "audit-user-a", "audit-project-a"))
    assert export.status_code == 200
    assert export.mimetype == "text/csv"
    assert "stack-a" in export.get_data(as_text=True)
    assert "stack-b" not in export.get_data(as_text=True)


def test_audit_query_denies_non_admin_member_without_leaking_events(pg_db, data_dir):
    from services.audit_events import record_audit_event

    _seed_project(data_dir, project_id="audit-project-a", org_id="audit-org-a", user_id="audit-owner")
    pg.execute("INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)", ("audit-member", "audit-member", "x"))
    pg.execute("INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s,%s,%s,%s)", ("audit-org-a", "audit-member", "member", time.time()))
    record_audit_event("stack.plan", actor_user_id="audit-owner", target_type="stack", target_id="private-stack", meta={"project_id": "audit-project-a", "org_id": "audit-org-a"})

    response = _audit_client(data_dir).get("/api/audit-log", headers=_audit_headers(data_dir, "audit-member", "audit-project-a"))
    assert response.status_code == 403
    assert "private-stack" not in str(response.get_json())


def test_record_audit_event_is_best_effort(monkeypatch, data_dir):
    from services.audit_events import record_audit_event

    monkeypatch.setattr("storage.auth_db.audit", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("offline")))
    record_audit_event("cloud.run.completed", target_type="execution", target_id="run-1")
