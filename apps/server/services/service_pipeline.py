"""Deterministic, project-scoped service pipeline orchestration."""
from __future__ import annotations

import time
import uuid
from collections.abc import Mapping
from typing import Any

from psycopg.types.json import Jsonb

from services import service_source
from storage import pg

STAGES = ("validate", "plan_build", "approval", "deploy", "health_check", "promote")
RUN_STATES = {"queued", "running", "awaiting_approval", "succeeded", "failed", "canceled"}


class PipelineError(ValueError):
    pass


def _instance(project_id: str, instance_id: str, actor_id: str | None) -> dict[str, Any]:
    row = pg.query_one("SELECT * FROM service_instances WHERE id=%s AND project_id=%s", (instance_id, project_id))
    if not row:
        raise PipelineError("service instance not found")
    member = pg.query_one("SELECT 1 FROM org_members WHERE org_id=%s AND user_id=%s", (row["org_id"], actor_id)) if actor_id else None
    if not member:
        raise PipelineError("project access denied")
    return row


def _safe_stages(stages: Any) -> list[dict[str, Any]]:
    if not isinstance(stages, list) or not stages:
        raise PipelineError("stages must be a non-empty list")
    names = [str(item.get("name") if isinstance(item, Mapping) else "") for item in stages]
    if names != list(STAGES):
        raise PipelineError("stages must follow validate, plan_build, approval, deploy, health_check, promote")
    return [{"name": name, "status": "pending"} for name in names]


def _row(row: Mapping[str, Any]) -> dict[str, Any]:
    return dict(row)


def get(project_id: str, instance_id: str, actor_id: str | None) -> dict[str, Any] | None:
    instance = _instance(project_id, instance_id, actor_id)
    row = pg.query_one("SELECT * FROM service_pipelines WHERE project_id=%s AND instance_id=%s", (project_id, instance_id))
    return _row(row) if row else None


def upsert(project_id: str, instance_id: str, actor_id: str | None, data: Mapping[str, Any]) -> dict[str, Any]:
    instance = _instance(project_id, instance_id, actor_id)
    stages = _safe_stages(data.get("stages"))
    source_revision = str(data.get("source_revision") or "").strip() or None
    now = time.time()
    with pg.transaction() as conn:
        existing = conn.execute("SELECT id FROM service_pipelines WHERE instance_id=%s FOR UPDATE", (instance_id,)).fetchone()
        pipeline_id = existing["id"] if existing else str(uuid.uuid4())
        row = conn.execute(
            "INSERT INTO service_pipelines (id,org_id,project_id,instance_id,stages,source_revision,created_by,created_at,updated_at) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (instance_id) DO UPDATE SET stages=EXCLUDED.stages,source_revision=EXCLUDED.source_revision,updated_at=EXCLUDED.updated_at RETURNING *",
            (pipeline_id, instance["org_id"], project_id, instance_id, Jsonb(stages), source_revision, actor_id, now, now),
        ).fetchone()
    return _row(row)


def run(project_id: str, instance_id: str, actor_id: str | None, key: str, target_environment: str) -> dict[str, Any]:
    pipeline = get(project_id, instance_id, actor_id)
    if not pipeline:
        raise PipelineError("pipeline not configured")
    source = service_source.get(project_id, instance_id, actor_id)
    source_revision = str((source or {}).get("commit_sha") or pipeline.get("source_revision") or "").strip()
    if not source_revision:
        raise PipelineError("immutable source revision is required")
    if not key:
        raise PipelineError("Idempotency-Key is required")
    existing = pg.query_one("SELECT * FROM service_pipeline_runs WHERE project_id=%s AND instance_id=%s AND id=%s", (project_id, instance_id, key))
    if existing:
        return _row(existing)
    now = time.time()
    run_id = str(uuid.uuid4())
    stages = _safe_stages(pipeline.get("stages"))
    status = "awaiting_approval" if target_environment == "production" else "queued"
    row = pg.query_one(
        "INSERT INTO service_pipeline_runs (id,pipeline_id,org_id,project_id,instance_id,operation_id,source_revision,target_environment,status,stages,created_by,created_at,updated_at) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
        (key, pipeline["id"], pipeline["org_id"], project_id, instance_id, None, source_revision, target_environment, status, Jsonb(stages), actor_id, now, now),
    )
    return _row(row)


def approve(project_id: str, instance_id: str, actor_id: str, run_id: str) -> dict[str, Any]:
    _instance(project_id, instance_id, actor_id)
    row = pg.query_one("UPDATE service_pipeline_runs SET status='queued',approved_by=%s,updated_at=%s WHERE id=%s AND project_id=%s AND status='awaiting_approval' RETURNING *", (actor_id, time.time(), run_id, project_id))
    if not row:
        raise PipelineError("run is not awaiting approval")
    return _row(row)


def promote(project_id: str, instance_id: str, actor_id: str, run_id: str, target: str) -> dict[str, Any]:
    _instance(project_id, instance_id, actor_id)
    row = pg.query_one("SELECT * FROM service_pipeline_runs WHERE id=%s AND project_id=%s AND instance_id=%s", (run_id, project_id, instance_id))
    if not row:
        raise PipelineError("pipeline run not found")
    if row["status"] != "succeeded":
        raise PipelineError("only a successful pipeline can be promoted")
    if target == "production" and not row.get("approved_by"):
        raise PipelineError("production promotion requires approval")
    updated = pg.query_one("UPDATE service_pipeline_runs SET target_environment=%s,updated_at=%s WHERE id=%s RETURNING *", (target, time.time(), run_id))
    return _row(updated)
