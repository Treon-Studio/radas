"""Tests for GitHub Actions Management Advanced Fase 6.

UC249: Auto-retry Policy for Failed Workflow Runs.
"""
from __future__ import annotations

import json
from unittest.mock import patch
import pytest

from services import github_actions


def test_evaluate_run_auto_retry_eligible_failure(monkeypatch):
    """UC249: Failed run with attempt <= max_retries triggers re-run."""
    fake_run = {
        "id": 12345,
        "status": "completed",
        "conclusion": "failure",
        "run_attempt": 1,
    }

    monkeypatch.setattr(github_actions, "run_detail", lambda owner, repo, run_id: fake_run)
    
    rerun_called = []
    def fake_rerun(owner, repo, run_id):
        rerun_called.append((owner, repo, run_id))
        return {"ok": True, "message": "rerun requested"}

    monkeypatch.setattr(github_actions, "rerun", fake_rerun)

    res = github_actions.evaluate_run_auto_retry(
        owner="my-org",
        repo="my-repo",
        run_id=12345,
        max_retries=2,
    )

    assert res["retried"] is True
    assert res["run_id"] == 12345
    assert res["action"] == "re_run_triggered"
    assert len(rerun_called) == 1
    assert rerun_called[0] == ("my-org", "my-repo", 12345)


def test_evaluate_run_auto_retry_max_retries_exceeded(monkeypatch):
    """UC249: Run attempt > max_retries rejects retry."""
    fake_run = {
        "id": 12345,
        "status": "completed",
        "conclusion": "failure",
        "run_attempt": 3,
    }

    monkeypatch.setattr(github_actions, "run_detail", lambda owner, repo, run_id: fake_run)

    res = github_actions.evaluate_run_auto_retry(
        owner="my-org",
        repo="my-repo",
        run_id=12345,
        max_retries=2,
    )

    assert res["retried"] is False
    assert "max retries exceeded" in res["reason"]


def test_evaluate_run_auto_retry_non_retryable_conclusion(monkeypatch):
    """UC249: Success conclusion is not retried."""
    fake_run = {
        "id": 12345,
        "status": "completed",
        "conclusion": "success",
        "run_attempt": 1,
    }

    monkeypatch.setattr(github_actions, "run_detail", lambda owner, repo, run_id: fake_run)

    res = github_actions.evaluate_run_auto_retry(
        owner="my-org",
        repo="my-repo",
        run_id=12345,
        max_retries=2,
    )

    assert res["retried"] is False
    assert "not in retryable list" in res["reason"]


def test_api_auto_retry_endpoint(data_dir, monkeypatch):
    """UC249: POST /api/github/runs/<run_id>/auto-retry endpoint."""
    from pathlib import Path
    import flask
    from auth.service import generate_token
    from api.github_actions_routes import bp

    token = generate_token("u1", "alice", ["admin"], Path("/tmp"), token_type="access")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    fake_run = {
        "id": 9999,
        "status": "completed",
        "conclusion": "timed_out",
        "run_attempt": 1,
    }
    monkeypatch.setattr(github_actions, "run_detail", lambda owner, repo, run_id: fake_run)
    monkeypatch.setattr(github_actions, "rerun", lambda owner, repo, run_id: {"ok": True})

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp)
    client = app.test_client()

    resp = client.post(
        "/api/github/runs/9999/auto-retry",
        json={"owner": "test-owner", "repo": "test-repo", "max_retries": 2},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["retried"] is True
    assert data["run_id"] == 9999
