"""GH secrets/variables & runner endpoints (UC 230-235)."""
from __future__ import annotations

def test_list_secrets_maps(data_dir, monkeypatch):
    import json
    import services.github_actions as g
    from services.github_actions import list_secrets
    body = {"secrets": [{"name": "DEPLOY_KEY", "created_at": "2024-01-01",
                         "updated_at": "2024-02-01", "visibility": "all"}]}
    monkeypatch.setattr(g.shutil, "which", lambda _: "/usr/local/bin/gh")
    monkeypatch.setattr(g.subprocess, "run",
                        lambda cmd, capture_output=True, input=None, timeout=30: _Ok(json.dumps(body)))
    out = list_secrets("u", "r")
    assert out[0]["name"] == "DEPLOY_KEY" and out[0]["visibility"] == "all"


class _Ok:
    def __init__(self, text):
        self.stdout = text.encode()
        self.stderr = b""
        self.returncode = 0
