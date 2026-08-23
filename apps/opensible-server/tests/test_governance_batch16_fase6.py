import json
import pytest
from pathlib import Path


def test_audited_admin_impersonation(pg_db, data_dir, monkeypatch):
    from services.impersonation import impersonate_user
    from services.user_service import UserService
    from storage import pg

    monkeypatch.setenv("DATA_DIR", str(data_dir))
    pg.execute("INSERT INTO roles (id, name) VALUES ('admin', 'admin'), ('viewer', 'viewer') ON CONFLICT DO NOTHING")
    user_svc = UserService(data_dir)

    # 1. Create admin user and normal user
    admin_user = user_svc.create_user("admin_gov", "SuperSecretPass123!", roles=["admin"])
    dev_user = user_svc.create_user("developer_bob", "SuperSecretPass123!", roles=["viewer"])

    # 2. Impersonate developer_bob as admin_gov
    res = impersonate_user(admin_user_id=admin_user.id, target_user_id=dev_user.id, data_dir=data_dir)
    assert res["success"] is True
    assert "token" in res
    assert res["impersonated_user"] == dev_user.id
    assert res["original_admin"] == admin_user.id

    # 3. Verify audit log entry
    audit_rows = pg.query_all(
        "SELECT * FROM audit_log WHERE action = %s AND actor_user_id = %s",
        ("user.impersonate", admin_user.id),
    )
    assert len(audit_rows) >= 1
    assert audit_rows[0]["target_id"] == dev_user.id


def test_openapi_spec_generation_and_schema_version():
    from flask import Flask
    from services.openapi_generator import generate_openapi_spec, get_api_schema_version

    # 1. Test schema versioning
    ver = get_api_schema_version()
    assert "version" in ver
    assert "supported_versions" in ver
    assert ver["status"] == "stable"

    # 2. Test OpenAPI spec generation on Flask app
    app = Flask("test_radas_app")
    @app.route("/api/stacks/list", methods=["GET"])
    def list_stacks():
        return {"stacks": []}

    @app.route("/api/stacks/<name>/deploy", methods=["POST"])
    def deploy_stack(name):
        return {"deployed": name}

    spec = generate_openapi_spec(app)
    assert spec["openapi"] == "3.1.0"
    assert "paths" in spec
    assert "/api/stacks/list" in spec["paths"]
    assert "get" in spec["paths"]["/api/stacks/list"]
    assert spec["paths"]["/api/stacks/list"]["get"]["operationId"] == "get_api_stacks_list"

    assert "/api/stacks/{name}/deploy" in spec["paths"]
    assert "post" in spec["paths"]["/api/stacks/{name}/deploy"]
    assert spec["paths"]["/api/stacks/{name}/deploy"]["post"]["operationId"] == "post_api_stacks_name_deploy"


def test_component_health_status_page(pg_db, tmp_path, monkeypatch):
    from services.component_status import get_component_health_status

    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    res = get_component_health_status()
    assert res["status"] in ("operational", "degraded")
    assert "components" in res
    assert len(res["components"]) >= 3

    comp_names = [c["name"] for c in res["components"]]
    assert "postgresql" in comp_names
    assert "data_storage" in comp_names
    assert "execution_engine" in comp_names


def test_product_usage_analytics(pg_db):
    from services.usage_analytics import get_product_usage_metrics
    from storage import pg

    # Seed stacks in DB
    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s), (%s, %s, %s)",
        ("p-analytics", "stack-01", json.dumps({"env": "prod"}), "p-analytics", "stack-02", json.dumps({"env": "dev"})),
    )

    metrics = get_product_usage_metrics(days=30)
    assert metrics["total_stacks"] >= 2
    assert "active_stacks_30d" in metrics
    assert "dau_stacks_24h" in metrics
    assert metrics["period_days"] == 30


def test_anonymized_telemetry_opt_in(pg_db):
    from services.telemetry import (
        set_telemetry_opt_in,
        is_telemetry_opted_in,
        get_telemetry_payload,
    )

    # 1. Default: opt-in is False
    assert is_telemetry_opted_in() is False

    # 2. Toggle opt-in to True
    set_telemetry_opt_in(True)
    assert is_telemetry_opted_in() is True

    # 3. Payload must be anonymized (no raw project names / secret keys)
    payload = get_telemetry_payload(anonymize=True)
    assert "os" in payload
    assert "python_version" in payload
    assert "stack_count_bucket" in payload
    assert "instance_hash" in payload



