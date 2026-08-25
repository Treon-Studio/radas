from __future__ import annotations

import json
import time
from pathlib import Path

import flask
from psycopg.types.json import Jsonb

from api import register_blueprints
from auth.service import generate_token
from storage import pg
from services import project_dashboard

ORG = "dashboard-org"
PROJECT = "dashboard-project"
USER = "dashboard-user"


def seed_project(now: float) -> None:
    pg.execute(
        "INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)",
        (ORG, ORG, USER, now),
    )
    pg.execute(
        "INSERT INTO projects (id,org_id,owner_id,name,description,is_archived,created_at,updated_at) "
        "VALUES (%s,%s,%s,%s,%s,0,%s,%s)",
        (PROJECT, ORG, USER, "Dashboard project", "Operational view", now, now),
    )
    pg.execute(
        "INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)",
        (ORG, USER, "owner", now),
    )


def write_tofu_run(
    data_dir: Path,
    *,
    run_id: str,
    stack: str,
    status: str,
    created_at: int,
    return_code: int | None = None,
) -> None:
    directory = data_dir / "projects" / PROJECT / "history" / "executions"
    directory.mkdir(parents=True, exist_ok=True)
    payload = {
        "id": run_id,
        "status": status,
        "createdAt": created_at,
        "finishedAt": created_at + 5,
        "returnCode": return_code,
        "runParams": {
            "execution_type": "TOFU_RUN",
            "stack_name": stack,
            "tofu_action": "plan",
        },
    }
    (directory / f"{run_id}.json").write_text(json.dumps(payload), encoding="utf-8")


def seed_service(
    *,
    instance_id: str,
    name: str,
    status: str | None,
    observed_at: float | None,
) -> None:
    now = time.time()
    pg.execute(
        "INSERT INTO service_instances "
        "(id,org_id,project_id,name,definition_slug,definition_version,environment,"
        "runtime_id,status,provider_ref,endpoint_summary,archived,created_by,created_at,updated_at) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,FALSE,%s,%s,%s)",
        (
            instance_id,
            ORG,
            PROJECT,
            name,
            "custom-container",
            "1.0.0",
            "production",
            "mock",
            "running",
            Jsonb({"api_key": "secret-value"}),
            Jsonb({"url": "https://secret-value.example.test"}),
            USER,
            now,
            now,
        ),
    )
    if status is not None:
        pg.execute(
            "INSERT INTO service_health_observations "
            "(id,org_id,project_id,instance_id,check_name,status,details,endpoint,observed_at) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                f"health-{instance_id}",
                ORG,
                PROJECT,
                instance_id,
                "service",
                status,
                Jsonb({"token": "secret-value"}),
                Jsonb({"url": "https://secret-value.example.test"}),
                observed_at,
            ),
        )


def dashboard_client(data_dir):
    from auth import middleware

    middleware.set_data_dir(data_dir)
    app = flask.Flask("project-dashboard-tests")
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    register_blueprints(app)
    return app.test_client()


def auth_headers(data_dir, user_id=USER):
    return {
        "Authorization": f"Bearer {generate_token(user_id, user_id, [], data_dir, token_type='access')}"
    }


def test_dashboard_route_returns_platform_data_envelope(data_dir):
    seed_project(time.time())

    response = dashboard_client(data_dir).get(
        f"/api/projects/{PROJECT}/dashboard",
        headers=auth_headers(data_dir),
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["data"]["project"]["id"] == PROJECT
    assert "request_id" in body


def test_dashboard_route_denies_non_member_without_leaking_project(data_dir):
    seed_project(time.time())

    response = dashboard_client(data_dir).get(
        f"/api/projects/{PROJECT}/dashboard",
        headers=auth_headers(data_dir, "outside-user"),
    )

    assert response.status_code == 403
    assert PROJECT not in str(response.get_json())


def test_dashboard_route_excludes_other_project_resources(data_dir):
    now = time.time()
    seed_project(now)
    pg.execute(
        "INSERT INTO projects (id,org_id,owner_id,name,description,is_archived,created_at,updated_at) "
        "VALUES (%s,%s,%s,%s,%s,0,%s,%s)",
        ("other-project", ORG, USER, "Other project", "Should not leak", now, now),
    )
    pg.execute(
        "INSERT INTO stack_meta (project_id,stack,data) VALUES (%s,%s,%s)",
        ("other-project", "other-project-stack", Jsonb({"drift_enabled": False})),
    )
    pg.execute(
        "INSERT INTO service_instances "
        "(id,org_id,project_id,name,definition_slug,definition_version,environment,"
        "runtime_id,status,archived,created_by,created_at,updated_at) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,FALSE,%s,%s,%s)",
        (
            "other-project-service",
            ORG,
            "other-project",
            "other-project-service",
            "custom-container",
            "1.0.0",
            "production",
            "mock",
            "running",
            USER,
            now,
            now,
        ),
    )

    response = dashboard_client(data_dir).get(
        f"/api/projects/{PROJECT}/dashboard",
        headers=auth_headers(data_dir),
    )

    assert response.status_code == 200
    assert "other-project-stack" not in str(response.get_json())
    assert "other-project-service" not in str(response.get_json())


def test_build_dashboard_returns_stable_empty_contract(data_dir):
    seed_project(time.time())

    result = project_dashboard.build_dashboard(PROJECT)

    assert result["project"] == {
        "id": PROJECT,
        "name": "Dashboard project",
        "description": "Operational view",
    }
    assert result["summary"] == {
        "stacks": {"total": 0, "drifted": 0},
        "runs": {"active": 0, "failed": 0},
        "services": {
            "total": 0,
            "healthy": 0,
            "degraded": 0,
            "unhealthy": 0,
            "unknown": 0,
        },
        "requires_attention": 0,
    }
    assert result["attention"] == []
    assert result["recent_runs"] == []
    assert result["service_health"] == []


def test_build_dashboard_reads_persisted_stack_metadata_without_creating_workspace(data_dir):
    seed_project(time.time())
    pg.execute(
        "INSERT INTO stack_meta (project_id,stack,data) VALUES (%s,%s,%s)",
        (PROJECT, "persisted-stack", Jsonb({"drift_enabled": False})),
    )

    result = project_dashboard.build_dashboard(PROJECT)

    assert result["summary"]["stacks"] == {"total": 1, "drifted": 0}
    assert not (data_dir / "projects" / PROJECT / "stacks").exists()


def test_dashboard_attention_is_capped_and_stably_sorted(data_dir, monkeypatch):
    seed_project(time.time())
    services = [
        {"instance_id": "service-a", "name": "a", "environment": "production", "status": "unhealthy", "observed_at": 500.0},
        {"instance_id": "service-z", "name": "z", "environment": "production", "status": "unhealthy", "observed_at": 500.0},
        {"instance_id": "service-b", "name": "b", "environment": "production", "status": "unhealthy", "observed_at": 400.0},
        {"instance_id": "service-c", "name": "c", "environment": "production", "status": "unhealthy", "observed_at": 300.0},
        {"instance_id": "service-d", "name": "d", "environment": "production", "status": "unhealthy", "observed_at": 200.0},
        {"instance_id": "service-e", "name": "e", "environment": "production", "status": "unhealthy", "observed_at": 100.0},
    ]
    monkeypatch.setattr(
        project_dashboard,
        "_service_health",
        lambda project_id: (
            {"healthy": 0, "degraded": 0, "unhealthy": len(services), "unknown": 0},
            services,
        ),
    )

    result = project_dashboard.build_dashboard(PROJECT)

    assert len(result["attention"]) == 5
    assert result["summary"]["requires_attention"] == 5
    assert [item["target"]["id"] for item in result["attention"]] == [
        "service-z",
        "service-a",
        "service-b",
        "service-c",
        "service-d",
    ]


def test_unknown_health_is_visible_but_not_attention(data_dir):
    seed_project(time.time())
    seed_service(instance_id="service-unknown", name="unknown", status=None, observed_at=None)

    result = project_dashboard.build_dashboard(PROJECT)

    assert result["summary"]["services"]["unknown"] == 1
    assert result["summary"]["requires_attention"] == 0
    assert result["attention"] == []
    assert result["service_health"] == [
        {
            "instance_id": "service-unknown",
            "name": "unknown",
            "environment": "production",
            "status": "unknown",
            "observed_at": None,
        }
    ]


def test_build_dashboard_counts_health_orders_attention_and_excludes_secrets(data_dir, monkeypatch):
    seed_project(time.time())
    pg.execute(
        "INSERT INTO stack_meta (project_id,stack,data) VALUES (%s,%s,%s),(%s,%s,%s)",
        (
            PROJECT,
            "stack-drift",
            Jsonb({"drift_enabled": True}),
            PROJECT,
            "stack-sync",
            Jsonb({"drift_enabled": False}),
        ),
    )
    monkeypatch.setattr(
        project_dashboard,
        "_drift_status",
        lambda project_id, stack: {
            "status": "drifted" if stack == "stack-drift" else "in_sync",
            "last_checked_at": 100 if stack == "stack-drift" else None,
        },
    )
    write_tofu_run(
        data_dir,
        run_id="run-failed",
        stack="stack-drift",
        status="FAILED",
        created_at=200,
        return_code=1,
    )
    write_tofu_run(
        data_dir,
        run_id="run-active",
        stack="stack-sync",
        status="RUNNING",
        created_at=300,
    )
    seed_service(instance_id="service-api", name="api", status="unhealthy", observed_at=400.0)
    seed_service(instance_id="service-worker", name="worker", status=None, observed_at=None)

    result = project_dashboard.build_dashboard(PROJECT)

    assert result["summary"]["stacks"] == {"total": 2, "drifted": 1}
    assert result["summary"]["runs"] == {"active": 1, "failed": 1}
    assert result["summary"]["services"] == {
        "total": 2,
        "healthy": 0,
        "degraded": 0,
        "unhealthy": 1,
        "unknown": 1,
    }
    assert [item["kind"] for item in result["attention"]] == ["service_health", "run", "drift"]
    assert result["attention"][0]["target"] == {"type": "service", "id": "service-api"}
    assert result["recent_runs"][0]["id"] == "run-active"
    assert result["service_health"] == [
        {
            "instance_id": "service-api",
            "name": "api",
            "environment": "production",
            "status": "unhealthy",
            "observed_at": 400.0,
        },
        {
            "instance_id": "service-worker",
            "name": "worker",
            "environment": "production",
            "status": "unknown",
            "observed_at": None,
        },
    ]
    assert "secret-value" not in str(result)
