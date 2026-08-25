from __future__ import annotations
from services import github_actions


def test_workflow_templates_include_ansible_run():
    templates = {item["id"]: item for item in github_actions.workflow_templates()}
    assert {"tofu-plan", "tofu-apply", "ansible-run"}.issubset(templates)
    assert "ansible-playbook" in templates["ansible-run"]["content"]
    assert templates["ansible-run"]["file"] == "ansible-run.yml"


def test_api_retries_rate_limit_with_bounded_backoff(monkeypatch):
    from types import SimpleNamespace
    responses = [SimpleNamespace(status_code=429, headers={"Retry-After": "0"}, text="rate limited"),
                 SimpleNamespace(status_code=200, headers={}, text='{"ok": true}')]
    class Requests:
        @staticmethod
        def request(*args, **kwargs):
            return responses.pop(0)
    monkeypatch.setenv("GH_TOKEN", "token")
    monkeypatch.setattr(github_actions.shutil, "which", lambda name: None)
    monkeypatch.setitem(__import__("sys").modules, "requests", Requests)
    monkeypatch.setattr(github_actions.time, "sleep", lambda seconds: None)
    assert github_actions._gh_api("GET", "/user")["ok"] is True


def test_status_never_exposes_github_token(monkeypatch):
    monkeypatch.setenv("GH_TOKEN", "secret-token")
    monkeypatch.setattr(github_actions.shutil, "which", lambda name: None)
    info = github_actions.is_available()
    assert info == {"available": True, "via": "env", "authenticated": True}
    assert "token" not in info

def test_dispatch_rejects_unsafe_workflow_and_ref():
    assert github_actions.dispatch("o", "r", "../workflow.yml")["ok"] is False
    assert github_actions.dispatch("o", "r", "workflow.yml", "../main")["ok"] is False


def test_branch_protection_required_checks_and_environment(monkeypatch):
    calls = []
    def fake(method, path, body=None, timeout=30):
        calls.append((method, path, body))
        if path.endswith("/protection") and method == "GET":
            return {"required_status_checks": {"strict": True, "contexts": ["ci/test"]},
                    "required_pull_request_reviews": {}, "enforce_admins": {"enabled": True}}
        if path.endswith("/check-runs"):
            return {"check_runs": [{"name": "ci/test", "status": "completed", "conclusion": "success"}]}
        if "/environments/" in path and method == "GET":
            return {"wait_timer": 10, "protection_rules": [{"reviewers": [{"type": "User", "id": 1}]}]}
        return {}
    monkeypatch.setattr(github_actions, "_gh_api", fake)
    protection = github_actions.branch_protection("o", "r", "main")
    assert protection["required_checks"] == ["ci/test"]
    result = github_actions.required_checks_status("o", "r", "main", "a" * 40)
    assert result["passed"] is True
    env = github_actions.environment_protection("o", "r", "production")
    assert env["wait_timer"] == 10
    with __import__("pytest").raises(ValueError):
        github_actions.set_branch_protection("o", "r", "main", [])


def test_workflow_statistics_reports_success_duration_and_flaky(monkeypatch):
    monkeypatch.setattr(github_actions, "datetime", __import__("datetime").datetime)
    monkeypatch.setattr(github_actions, "timedelta", __import__("datetime").timedelta)
    monkeypatch.setattr(github_actions, "_gh_api", lambda *args, **kwargs: {"workflow_runs": [
        {"id": 1, "head_sha": "abc", "status": "completed", "conclusion": "failure", "run_started_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:01:00Z"},
        {"id": 2, "head_sha": "abc", "status": "completed", "conclusion": "success", "run_started_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:02:00Z"},
        {"id": 3, "head_sha": "def", "status": "completed", "conclusion": "success", "run_started_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:03:00Z"},
    ]})
    stats = github_actions.workflow_statistics("o", "r", days=7)
    assert stats["total_runs"] == 3
    assert stats["success_rate"] == 0.6667
    assert stats["average_duration_seconds"] == 120
    assert stats["flaky_groups"] == 1


def test_pull_request_plan_comment_is_bounded_and_marked(monkeypatch):
    calls = []
    monkeypatch.setattr(github_actions, "_gh_api", lambda method, path, body=None, **kwargs: calls.append((method, path, body)) or {"id": 42})
    result = github_actions.comment_on_pull_request("o", "r", 12, "Plan: 3 resources")
    assert result["ok"] is True
    assert result["comment_id"] == 42
    assert "radas-plan" in calls[0][2]["body"]
    with __import__("pytest").raises(ValueError):
        github_actions.comment_on_pull_request("o", "r", 12, "")


def test_workflow_runs_support_filters(monkeypatch):
    seen = []
    def fake(method, path, body=None, timeout=30):
        seen.append(path)
        return {"workflow_runs": [{"id": 1, "status": "completed", "head_sha": "abcdef1234567890"}]}
    monkeypatch.setattr(github_actions, "_gh_api", fake)
    runs = github_actions.workflow_runs("o", "r", status="completed", event="push", branch="main",
                                       since="2026-01-01T00:00:00Z", head_sha="abcdef1234567890", page=3)
    assert runs[0]["id"] == 1
    assert "status=completed" in seen[0]
    assert "head_sha=abcdef1234567890" in seen[0]
    assert "page=3" in seen[0]


def test_runner_registration_never_exposes_token(monkeypatch):
    monkeypatch.setattr(github_actions, "_gh_api", lambda *args, **kwargs: {"token": "secret", "expires_at": "later"})
    result = github_actions.runner_registration_instructions("o", "r", ["linux", "linux"])
    assert result["token_available"] is True
    assert result["token_exposed"] is False
    assert "token" not in result
    assert result["labels"] == ["linux"]


def test_runner_removal_requires_offline_and_label_replacement(monkeypatch):
    calls = []
    def fake(method, path, body=None, timeout=30):
        calls.append((method, path, body))
        if method == "GET":
            return {"runners": [{"id": 4, "status": "offline", "busy": False, "labels": []}]}
        return {"labels": body.get("labels", [])} if method == "PUT" else {}
    monkeypatch.setattr(github_actions, "_gh_api", fake)
    assert github_actions.remove_runner("o", 4, "r")['removed'] is True
    assert github_actions.replace_runner_labels("o", 4, [" self-hosted", "linux", "linux"], "r")["labels"] == ["linux", "self-hosted"]
    assert any(method == "DELETE" and path.endswith("/actions/runners/4") for method, path, _ in calls)
    monkeypatch.setattr(github_actions, "list_runners", lambda *args: [{"id": 5, "status": "online", "busy": False}])
    with __import__("pytest").raises(ValueError, match="offline"):
        github_actions.remove_runner("o", 5, "r")


def test_pending_deployment_decision(monkeypatch):
    calls = []
    def fake(method, path, body=None, timeout=30):
        calls.append((method, path, body))
        return [{"environment": {"name": "production"}, "environment_id": 7}] if method == "GET" else {}
    monkeypatch.setattr(github_actions, "_gh_api", fake)
    assert github_actions.pending_deployments("o", "r", 9)[0]["environment_id"] == 7
    out = github_actions.decide_deployment("o", "r", 9, [7], "approved", "ship")
    assert out["state"] == "approved"
    assert calls[-1][2] == {"environment_ids": [7], "state": "approved", "comment": "ship"}
    with __import__("pytest").raises(ValueError):
        github_actions.decide_deployment("o", "r", 9, [7], "maybe")


def test_watch_run_polls_until_terminal(monkeypatch):
    responses = iter([{"status": "in_progress"}, {"status": "completed", "conclusion": "success"}])
    sleeps = []
    monkeypatch.setattr(github_actions, "run_detail", lambda *args: next(responses))
    result = github_actions.watch_run("o", "r", 7, timeout_seconds=10, interval_seconds=1, sleep_fn=sleeps.append)
    assert result["completed"] is True
    assert result["conclusion"] == "success"
    assert result["polls"] == 2
    assert sleeps == [1]


def test_watch_run_returns_bounded_timeout(monkeypatch):
    monkeypatch.setattr(github_actions, "run_detail", lambda *args: {"status": "in_progress"})
    clock = iter([0, 0, 2])
    monkeypatch.setattr(github_actions.time, "monotonic", lambda: next(clock))
    result = github_actions.watch_run("o", "r", 7, timeout_seconds=1, interval_seconds=1, sleep_fn=lambda _: None)
    assert result["timed_out"] is True
    assert result["completed"] is False


def test_workflow_run_jobs_logs_and_runners(monkeypatch):
    calls=[]
    def fake(method,path,body=None,timeout=30):
        calls.append((method,path,body))
        if path.endswith('/jobs?per_page=100'): return {'jobs':[{'id':1,'name':'build'}]}
        if path.endswith('/runners'): return {'runners':[{'id':2,'name':'runner','status':'online','busy':False,'labels':[{'name':'self-hosted'}]}]}
        return {'id':9,'state':'active'}
    monkeypatch.setattr(github_actions, '_gh_api', fake)
    assert github_actions.workflow_detail('o','r',3)['state']=='active'
    github_actions.set_workflow_state('o','r',3,'active')
    assert github_actions.run_detail('o','r',9)['id']==9
    assert github_actions.run_jobs('o','r',9)[0]['id']==1
    assert github_actions.list_runners('o','r')[0]['labels']==['self-hosted']
    assert any('/actions/workflows/3/active' in p for _,p,_ in calls)
