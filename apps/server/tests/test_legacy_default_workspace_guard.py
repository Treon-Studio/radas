"""Tenant-escape guard: requests must not resolve the legacy default
workspace (DATA_DIR/cloud-provisioning/default).

The fallback remains available only for non-request callers (background
jobs), and every use is logged as a metric so the legacy path can be
retired.
"""
from __future__ import annotations

import os
import threading

import pytest
from flask import Flask

from services import cloud_provisioning as cp


@pytest.fixture(autouse=True)
def _temp_data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    with cp._metric_lock:
        cp._legacy_default_workspace_uses = 0
    yield
    with cp._metric_lock:
        cp._legacy_default_workspace_uses = 0


def _uses_metric() -> int:
    cp._metric_lock.acquire()
    value = cp._legacy_default_workspace_uses
    cp._metric_lock.release()
    return value


def test_project_id_resolves_per_project_root(tmp_path):
    root = cp._project_stacks_root("proj-1")
    assert root == tmp_path / "projects" / "proj-1" / "stacks"
    assert _uses_metric() == 0


def test_background_caller_falls_back_with_metric(tmp_path):
    root = cp._project_stacks_root(None)
    assert root == tmp_path / "cloud-provisioning" / "default"
    assert _uses_metric() == 1


def test_request_context_without_project_id_is_rejected(tmp_path):
    app = Flask(__name__)

    with app.test_request_context("/api/cloud/stacks", headers={}):
        with pytest.raises(cp.LegacyDefaultWorkspaceError) as excinfo:
            cp._project_stacks_root(None)

    assert excinfo.value.code == 403
    assert _uses_metric() == 0


def test_request_context_with_project_uses_project_root(tmp_path):
    app = Flask(__name__)

    with app.test_request_context(
        "/api/cloud/stacks", headers={"X-Project-Id": "proj-2"}
    ):
        root = cp._project_stacks_root(cp._get_project_id())
        assert root == tmp_path / "projects" / "proj-2" / "stacks"
        assert _uses_metric() == 0


def test_metric_is_thread_safe():
    def bump():
        for _ in range(100):
            cp._record_legacy_default_workspace_use()

    threads = [threading.Thread(target=bump) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert _uses_metric() == 400
