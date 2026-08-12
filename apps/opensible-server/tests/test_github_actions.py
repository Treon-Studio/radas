"""GitHub Actions service tests with subprocess mocked (UC 216-248)."""
from __future__ import annotations

import json


class FakeGh:
    def __init__(self, responses=None):
        self.responses = responses or {}
        self.calls = []

    def run(self, cmd, capture_output=True, input=None, timeout=30, text=False, **kwargs):
        self.calls.append(cmd)
        key = " ".join(str(c) for c in cmd)
        # Longest needle first so "/users/u/repos" wins over "/user".
        for needle, (out, err, code) in sorted(
            self.responses.items(), key=lambda kv: len(kv[0]), reverse=True
        ):
            if needle in key:
                if text:
                    out = out.decode("utf-8", "replace") if isinstance(out, bytes) else out
                    err = err.decode("utf-8", "replace") if isinstance(err, bytes) else err
                self.last = (out, err, code)
                return self._r(out, err, code)
        raise AssertionError(f"unexpected gh call: {key}")

    def _r(self, out, err, code):
        import subprocess
        class R:
            def __init__(self, out, err, code):
                self.stdout = out
                self.stderr = err
                self.returncode = code
        return R(out, err, code)


def test_status_uses_gh(monkeypatch):
    import services.github_actions as g
    fake = FakeGh({"--show-token": (b"Logged in\nToken: gho_abc123\n", b"", 0),
                   "/user": (json.dumps({"login": "u"}).encode(), b"", 0)})
    monkeypatch.setattr(g.shutil, "which", lambda _: "/usr/local/bin/gh")
    monkeypatch.setattr(g.subprocess, "run", fake.run)
    st = g.status()
    assert st["configured"] is True
    assert st["via"] == "gh"


def test_list_repos_parses(monkeypatch):
    import services.github_actions as g
    repos = [{"name": "a", "full_name": "u/a", "default_branch": "main",
              "visibility": "public", "description": None, "archived": False},
             {"name": "b", "full_name": "u/b", "default_branch": "main",
              "visibility": "private", "description": "x", "archived": True}]
    fake = FakeGh({"--show-token": (b"Logged in\nToken: gho_abc123\n", b"", 0),
                   "/user": (json.dumps({"login": "u"}).encode(), b"", 0),
                   "/users/u/repos": (json.dumps(repos).encode(), b"", 0)})
    monkeypatch.setattr(g.shutil, "which", lambda _: "/usr/local/bin/gh")
    monkeypatch.setattr(g.subprocess, "run", fake.run)
    out = g.list_repos("u")
    assert len(out) == 1 and out[0]["name"] == "a"  # archived filtered


def test_workflow_templates_contains_three(monkeypatch):
    from services.github_actions import workflow_templates
    ids = {t["id"] for t in workflow_templates()}
    assert ids == {"tofu-plan", "tofu-apply", "ansible-lint"}


def test_dispatch_error_propagates(monkeypatch):
    import services.github_actions as g
    fake = FakeGh({"--show-token": (b"Logged in\nToken: gho_abc123\n", b"", 0),
                   "/user": (json.dumps({"login": "u"}).encode(), b"", 0),
                   "/repos/u/r/actions/workflows/w.yml/dispatches":
                   (b"", b"gh: Not Found (HTTP 404)", 1)})
    monkeypatch.setattr(g.shutil, "which", lambda _: "/usr/local/bin/gh")
    monkeypatch.setattr(g.subprocess, "run", fake.run)
    out = g.dispatch("u", "r", "w.yml")
    assert out["ok"] is False and "404" in out["error"]
