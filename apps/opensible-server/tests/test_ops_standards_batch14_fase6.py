import json
import pytest
from pathlib import Path

from services.global_search import search as global_search


def test_full_text_search_stacks_and_runs_and_playbooks(pg_db, data_dir, monkeypatch):
    from storage import pg
    from services.unified_search import search_all

    # 1. Seed stacks in postgres stack_meta with tags and descriptions
    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s)",
        ("proj-1", "production-k8s-cluster", json.dumps({
            "provider": "hetzner",
            "env": "production",
            "description": "Main production cluster",
            "tags": ["prod", "kubernetes", "infra"],
        })),
    )
    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s)",
        ("proj-1", "staging-database", json.dumps({
            "provider": "aws",
            "env": "staging",
            "description": "Postgres database instance",
            "tags": ["db", "staging"],
        })),
    )

    # 2. Seed an execution run with logs
    exec_dir = data_dir / "projects" / "proj-1" / "executions"
    exec_dir.mkdir(parents=True, exist_ok=True)
    run_file = exec_dir / "run-9988-deploy.json"
    run_file.write_text(json.dumps({
        "id": "run-9988-deploy",
        "status": "completed",
        "triggeredBy": "alice@company.com",
        "runParams": {
            "stack_name": "production-k8s-cluster",
            "action": "apply",
        },
        "startedAt": "2026-08-23T10:00:00Z",
        "finishedAt": "2026-08-23T10:05:00Z",
    }), encoding="utf-8")

    # 3. Full-text search by tag keyword 'kubernetes'
    res_k8s = search_all(query="kubernetes", project_id="proj-1")
    assert len(res_k8s["stacks"]) == 1
    assert res_k8s["stacks"][0]["name"] == "production-k8s-cluster"

    # 4. Full-text search by run triggeredBy 'alice'
    res_alice = search_all(query="alice", project_id="proj-1")
    assert len(res_alice["runs"]) == 1
    assert res_alice["runs"][0]["id"] == "run-9988-deploy"

    # 5. Full-text search matching across stacks and runs for 'production'
    res_prod = search_all(query="production", project_id="proj-1")
    assert len(res_prod["stacks"]) == 1
    assert len(res_prod["runs"]) == 1
