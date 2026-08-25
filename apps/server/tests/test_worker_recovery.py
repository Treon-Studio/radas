from __future__ import annotations

import json
from pathlib import Path


def _running_file(root: Path, project: str, execution: str, *, worker: str, status: str = "RUNNING") -> Path:
    path = root / project / "history" / "executions" / f"{execution}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"id": execution, "status": status, "workerId": worker, "startedAt": 100.0}), encoding="utf-8")
    return path


def test_additional_claim_does_not_prune_live_same_worker_rows(monkeypatch, tmp_path):
    from storage import index_db

    rows = [("run-a", "project", 100.0), ("run-b", "project", 101.0)]
    monkeypatch.setattr(index_db, "list_running_for_worker", lambda worker_id: rows)
    _running_file(tmp_path, "project", "run-a", worker="worker-a")
    _running_file(tmp_path, "project", "run-b", worker="worker-a")
    removed = []
    monkeypatch.setattr(index_db, "remove_running_execution", lambda execution_id: removed.append(execution_id))

    pruned = index_db.prune_stale_running_for_worker("worker-a", tmp_path, current_execution_id=None, mark_orphaned_failed=False)

    assert pruned == 0
    assert removed == []


def test_explicit_recovery_marks_orphan_failed_and_removes_index(monkeypatch, tmp_path):
    from storage import index_db

    _running_file(tmp_path, "project", "run-orphan", worker="worker-a")
    monkeypatch.setattr(index_db, "list_running_for_worker", lambda worker_id: [("run-orphan", "project", 100.0)])
    removed = []
    monkeypatch.setattr(index_db, "remove_running_execution", lambda execution_id: removed.append(execution_id))

    pruned = index_db.prune_stale_running_for_worker("worker-a", tmp_path, current_execution_id=None, mark_orphaned_failed=True)

    assert pruned == 1
    assert removed == ["run-orphan"]
    data = json.loads((tmp_path / "project" / "history" / "executions" / "run-orphan.json").read_text(encoding="utf-8"))
    assert data["status"] == "FAILED"
    assert data["error"] == "Worker restarted before reporting completion"
    assert "finishedAt" in data and "statusUpdatedAt" in data and "duration" in data


def test_stale_non_running_index_is_cleaned_without_recovery(monkeypatch, tmp_path):
    from storage import index_db

    _running_file(tmp_path, "project", "run-done", worker="worker-a", status="SUCCESS")
    monkeypatch.setattr(index_db, "list_running_for_worker", lambda worker_id: [("run-done", "project", 100.0)])
    removed = []
    monkeypatch.setattr(index_db, "remove_running_execution", lambda execution_id: removed.append(execution_id))

    assert index_db.prune_stale_running_for_worker("worker-a", tmp_path, mark_orphaned_failed=False) == 1
    assert removed == ["run-done"]
    assert json.loads((tmp_path / "project" / "history" / "executions" / "run-done.json").read_text())["status"] == "SUCCESS"
