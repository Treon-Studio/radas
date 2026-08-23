import json
import pytest
from pathlib import Path


def test_stack_composite_health_score(pg_db):
    from services.stack_health import calculate_stack_health_score
    from services.audit_events import record_audit_event
    from storage import pg

    # Seed healthy stack
    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s)",
        ("p-health", "healthy-stack", json.dumps({"drift_status": "clean", "last_run_status": "success"})),
    )
    h_res = calculate_stack_health_score(project_id="p-health", stack="healthy-stack")
    assert h_res["health_score"] == 100
    assert h_res["status"] == "healthy"

    # Seed degraded stack with drift and failure
    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s)",
        ("p-health", "degraded-stack", json.dumps({"drift_status": "drifted", "last_run_status": "failed"})),
    )
    d_res = calculate_stack_health_score(project_id="p-health", stack="degraded-stack")
    assert d_res["health_score"] <= 50
    assert d_res["status"] in ("warning", "critical")
    assert len(d_res["deductions"]) >= 2


def test_cross_project_stack_clone(pg_db, tmp_path, monkeypatch):
    from services.cross_project_clone import clone_stack_across_projects
    from storage import pg

    monkeypatch.setenv("DATA_DIR", str(tmp_path))

    # 1. Create source stack workspace
    src_dir = tmp_path / "projects" / "proj-alpha" / "stacks" / "envs" / "api-service"
    src_dir.mkdir(parents=True, exist_ok=True)
    (src_dir / "main.tf").write_text('resource "null_resource" "a" {}\n', encoding="utf-8")
    (src_dir / "backend.tf").write_text('key = "proj-alpha/api-service/terraform.tfstate"\n', encoding="utf-8")

    # 2. Seed source stack_meta in DB
    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s)",
        ("proj-alpha", "api-service", json.dumps({"provider": "aws", "monthly_cost": 50.0})),
    )

    # 3. Clone to target project
    res = clone_stack_across_projects(
        source_project_id="proj-alpha",
        source_stack="api-service",
        target_project_id="proj-beta",
        target_stack="api-service-clone",
        data_dir=tmp_path,
    )
    assert res["success"] is True

    # 4. Verify target directory and state key rewritten
    target_dir = tmp_path / "projects" / "proj-beta" / "stacks" / "envs" / "api-service-clone"
    assert (target_dir / "main.tf").exists()
    backend_content = (target_dir / "backend.tf").read_text(encoding="utf-8")
    assert "proj-beta/api-service-clone" in backend_content

    # 5. Verify target stack_meta in DB
    meta_row = pg.query_one(
        "SELECT data FROM stack_meta WHERE project_id = %s AND stack = %s",
        ("proj-beta", "api-service-clone"),
    )
    assert meta_row is not None


def test_cost_anomaly_detection(pg_db):
    from services.cost_anomaly import detect_cost_anomalies
    from storage import pg

    # Seed regular stacks ($20, $25, $30) and 1 extreme outlier ($900)
    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES "
        "(%s, %s, %s), (%s, %s, %s), (%s, %s, %s), (%s, %s, %s)",
        (
            "p-anomaly", "svc-1", json.dumps({"monthly_cost": 20.0}),
            "p-anomaly", "svc-2", json.dumps({"monthly_cost": 25.0}),
            "p-anomaly", "svc-3", json.dumps({"monthly_cost": 30.0}),
            "p-anomaly", "svc-huge-spike", json.dumps({"monthly_cost": 900.0}),
        ),
    )

    anomalies = detect_cost_anomalies("p-anomaly")
    assert len(anomalies) >= 1
    assert anomalies[0]["stack"] == "svc-huge-spike"
    assert anomalies[0]["severity"] in ("high", "critical")


def test_cost_breakdown_by_env(pg_db):
    from services.cost_breakdown import get_cost_breakdown_by_env
    from storage import pg

    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES "
        "(%s, %s, %s), (%s, %s, %s), (%s, %s, %s)",
        (
            "p-breakdown", "prod-cluster", json.dumps({"monthly_cost": 500.0, "env": "production"}),
            "p-breakdown", "staging-db", json.dumps({"monthly_cost": 150.0, "env": "staging"}),
            "p-breakdown", "dev-sandbox", json.dumps({"monthly_cost": 50.0, "env": "development"}),
        ),
    )

    bd = get_cost_breakdown_by_env("p-breakdown")
    assert bd["total_monthly_cost"] == 700.0
    envs = bd["environments"]
    assert "production" in envs
    assert envs["production"]["cost"] == 500.0
    assert envs["production"]["percentage"] > 70.0

    assert "staging" in envs
    assert envs["staging"]["cost"] == 150.0

    assert "development" in envs
    assert envs["development"]["cost"] == 50.0

