from __future__ import annotations

import json


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


def test_record_audit_event_is_best_effort(monkeypatch, data_dir):
    from services.audit_events import record_audit_event

    monkeypatch.setattr("storage.auth_db.audit", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("offline")))
    record_audit_event("cloud.run.completed", target_type="execution", target_id="run-1")
