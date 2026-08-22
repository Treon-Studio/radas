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


def test_ingest_github_webhook_records_audit(data_dir, monkeypatch):
    """UC250: Ingesting a workflow_run GitHub webhook records an audit log event."""
    recorded_events = []
    def fake_record_audit_event(action, actor_user_id=None, target_type=None, target_id=None, meta=None):
        recorded_events.append({
            "action": action,
            "actor": actor_user_id,
            "target_type": target_type,
            "target_id": target_id,
            "meta": meta,
        })

    with patch("services.audit_events.record_audit_event", fake_record_audit_event):
        payload = {
            "action": "completed",
            "repository": {"full_name": "octocat/Hello-World", "name": "Hello-World"},
            "sender": {"login": "octocat"},
            "workflow_run": {
                "id": 888123,
                "run_number": 42,
                "status": "completed",
                "conclusion": "success",
                "head_branch": "main",
                "head_sha": "0123456789abcdef",
            },
        }

        res = github_actions.ingest_github_webhook(
            event="workflow_run",
            payload=payload,
            project_id="proj-123",
        )

        assert res["ok"] is True
        assert res["ingested"] is True
        assert res["action"] == "github.workflow_run.completed"
        assert res["target_id"] == "888123"
        assert len(recorded_events) == 1
        ev = recorded_events[0]
        assert ev["action"] == "github.workflow_run.completed"
        assert ev["actor"] == "octocat"
        assert ev["target_type"] == "workflow_run"
        assert ev["meta"]["run_id"] == 888123
        assert ev["meta"]["head_branch"] == "main"


def test_api_webhook_ingest_endpoint(data_dir, monkeypatch):
    """UC250: POST /api/github/webhooks/ingest REST endpoint."""
    import flask
    from api.github_actions_routes import bp

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp)
    client = app.test_client()

    payload = {
        "action": "in_progress",
        "repository": {"full_name": "owner/repo"},
        "sender": {"login": "ci-bot"},
        "workflow_job": {"id": 555, "status": "in_progress"},
    }

    with patch("services.audit_events.record_audit_event"):
        resp = client.post(
            "/api/github/webhooks/ingest",
            headers={"X-GitHub-Event": "workflow_job", "X-Project-Id": "proj-wh"},
            json=payload,
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert data["action"] == "github.workflow_job.in_progress"


def test_get_repo_metadata(monkeypatch):
    """UC255: Extract repository metadata (default branch, visibility, language, topics)."""
    fake_repo_resp = {
        "id": 102030,
        "name": "iac-platform",
        "full_name": "acme/iac-platform",
        "owner": {"login": "acme"},
        "default_branch": "main",
        "private": True,
        "visibility": "private",
        "language": "HCL",
        "description": "Infrastructure code",
        "topics": ["opentofu", "cloud", "aws"],
        "size": 4096,
        "open_issues_count": 5,
        "stargazers_count": 12,
        "forks_count": 2,
        "html_url": "https://github.com/acme/iac-platform",
    }

    monkeypatch.setattr(github_actions, "_gh_api", lambda method, path, **kwargs: fake_repo_resp)

    meta = github_actions.get_repo_metadata(owner="acme", repo="iac-platform")
    assert meta["id"] == 102030
    assert meta["name"] == "iac-platform"
    assert meta["full_name"] == "acme/iac-platform"
    assert meta["default_branch"] == "main"
    assert meta["private"] is True
    assert meta["visibility"] == "private"
    assert meta["language"] == "HCL"
    assert meta["topics"] == ["opentofu", "cloud", "aws"]
    assert meta["size_kb"] == 4096


def test_api_repo_metadata_endpoint(data_dir, monkeypatch):
    """UC255: GET /api/github/repos/<owner>/<repo>/metadata endpoint."""
    from pathlib import Path
    import flask
    from auth.service import generate_token
    from api.github_actions_routes import bp

    token = generate_token("u1", "alice", ["admin"], Path("/tmp"), token_type="access")
    headers = {"Authorization": f"Bearer {token}"}

    fake_meta = {
        "id": 102030,
        "name": "iac-platform",
        "full_name": "acme/iac-platform",
        "default_branch": "main",
        "visibility": "public",
        "private": False,
        "language": "Python",
        "topics": ["automation"],
    }
    monkeypatch.setattr(github_actions, "get_repo_metadata", lambda owner, repo, project_id=None: fake_meta)

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp)
    client = app.test_client()

    resp = client.get("/api/github/repos/acme/iac-platform/metadata", headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["name"] == "iac-platform"
    assert data["language"] == "Python"


def test_scan_workflow_secrets_exposure():
    """UC256: Detect plaintext tokens and unsafe secret expression echoes."""
    safe_yaml = """
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "Build starting"
"""
    res_safe = github_actions.scan_workflow_secrets_exposure(safe_yaml)
    assert res_safe["safe"] is True
    assert res_safe["total_findings"] == 0

    dirty_yaml = """
name: Deploy
on: [push]
jobs:
  leak:
    runs-on: ubuntu-latest
    steps:
      - run: echo "Token is ${{ secrets.GITHUB_TOKEN }}"
      - run: ghp_1234567890abcdefghijklmnopqrstuvwxyz12
      - run: printenv
"""
    res_dirty = github_actions.scan_workflow_secrets_exposure(dirty_yaml)
    assert res_dirty["safe"] is False
    assert res_dirty["total_findings"] >= 3
    rules = [f["rule"] for f in res_dirty["findings"]]
    assert "echo_secret_expression" in rules
    assert "plaintext_token" in rules
    assert "dump_env" in rules


def test_api_scan_workflow_secrets_endpoint(data_dir):
    """UC256: POST /api/github/workflows/scan-secrets REST endpoint."""
    from pathlib import Path
    import flask
    from auth.service import generate_token
    from api.github_actions_routes import bp

    token = generate_token("u1", "alice", ["admin"], Path("/tmp"), token_type="access")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp)
    client = app.test_client()

    resp = client.post(
        "/api/github/workflows/scan-secrets",
        json={"content": "steps:\n  - run: echo ${{ secrets.API_KEY }}\n"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["safe"] is False
    assert data["total_findings"] == 1


def test_validate_workflow_sha_pinning():
    """UC257: Validate that third-party actions are pinned to 40-char commit SHAs."""
    pinned_yaml = """
name: Secure CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@b4ffde56f73888c63b88b013b066d8624ec66870
      - uses: actions/setup-python@65d7f2d534ac1bc67fcd62888c5f4f3d2cb2b236
      - uses: ./.github/actions/local-step
"""
    res_pinned = github_actions.validate_workflow_sha_pinning(pinned_yaml)
    assert res_pinned["compliant"] is True
    assert len(res_pinned["unpinned_actions"]) == 0
    assert len(res_pinned["pinned_actions"]) == 2

    unpinned_yaml = """
name: Mutable CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@main
"""
    res_unpinned = github_actions.validate_workflow_sha_pinning(unpinned_yaml)
    assert res_unpinned["compliant"] is False
    assert len(res_unpinned["unpinned_actions"]) == 2
    actions = [u["action"] for u in res_unpinned["unpinned_actions"]]
    assert "actions/checkout" in actions
    assert "actions/setup-node" in actions


def test_api_validate_workflow_pinning_endpoint(data_dir):
    """UC257: POST /api/github/workflows/validate-pinning REST endpoint."""
    from pathlib import Path
    import flask
    from auth.service import generate_token
    from api.github_actions_routes import bp

    token = generate_token("u1", "alice", ["admin"], Path("/tmp"), token_type="access")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp)
    client = app.test_client()

    resp = client.post(
        "/api/github/workflows/validate-pinning",
        json={"content": "steps:\n  - uses: actions/checkout@v3\n"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["compliant"] is False
    assert len(data["unpinned_actions"]) == 1


def test_check_github_connection_health(monkeypatch):
    """UC263: Connection health check queries user and rate limit."""
    monkeypatch.setattr(github_actions, "is_available", lambda: {"available": True, "via": "token", "authenticated": True})

    def fake_gh_api(method, path, **kwargs):
        if path == "/user":
            return {"login": "octocat", "id": 1, "type": "User"}
        if path == "/rate_limit":
            return {"resources": {"core": {"limit": 5000, "remaining": 4950, "reset": 1700000000}}}
        return {}

    monkeypatch.setattr(github_actions, "_gh_api", fake_gh_api)

    health = github_actions.check_github_connection_health()
    assert health["healthy"] is True
    assert health["status"] == "connected"
    assert health["user"]["login"] == "octocat"
    assert health["rate_limit"]["remaining"] == 4950
    assert health["rate_limit"]["used"] == 50


def test_rotate_github_token(monkeypatch):
    """UC263: Rotate token updates GH_TOKEN and tests connection."""
    monkeypatch.setattr(github_actions, "is_available", lambda: {"available": True, "via": "token", "authenticated": True})
    monkeypatch.setattr(github_actions, "_gh_api", lambda method, path, **kwargs: {
        "login": "new-user",
        "resources": {"core": {"limit": 5000, "remaining": 5000}},
    })

    res = github_actions.rotate_github_token("ghp_new_valid_token_1234567890")
    assert res["ok"] is True
    assert res["user"] == "new-user"
    assert github_actions.os.environ.get("GH_TOKEN") == "ghp_new_valid_token_1234567890"

    with pytest.raises(ValueError, match="Valid GitHub personal access token required"):
        github_actions.rotate_github_token("short")


def test_api_connection_health_and_rotate_token(data_dir, monkeypatch):
    """UC263: REST endpoints for health check and token rotation."""
    from pathlib import Path
    import flask
    from auth.service import generate_token
    from api.github_actions_routes import bp

    token = generate_token("u1", "alice", ["admin"], Path("/tmp"), token_type="access")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    monkeypatch.setattr(github_actions, "check_github_connection_health", lambda project_id=None: {
        "healthy": True,
        "status": "connected",
        "user": {"login": "alice-bot"},
    })
    monkeypatch.setattr(github_actions, "rotate_github_token", lambda new_token, project_id=None: {
        "ok": True,
        "message": "Token rotated",
        "user": "alice-bot",
    })

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp)
    client = app.test_client()

    # GET /api/github/connection/health
    resp_health = client.get("/api/github/connection/health", headers=headers)
    assert resp_health.status_code == 200
    assert resp_health.get_json()["healthy"] is True

    # POST /api/github/connection/rotate-token
    resp_rotate = client.post(
        "/api/github/connection/rotate-token",
        json={"token": "ghp_new_valid_token_1234567890"},
        headers=headers,
    )
    assert resp_rotate.status_code == 200
    assert resp_rotate.get_json()["ok"] is True
