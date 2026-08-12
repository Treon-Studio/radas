"""Stack lock/taint/output ops (UC 347/356/374/375)."""
from __future__ import annotations


def test_lock_and_unlock(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    envs = tmp_path / "cloud-provisioning" / "default" / "envs"
    envs.mkdir(parents=True, exist_ok=True)
    (envs / "s1").mkdir()
    (envs / "s1" / "terraform.tfvars").write_text("env = \"prod\"\n")
    from services.cloud_provisioning import _stack_data_dir
    from services.stack_ops import lock_stack, unlock_stack, is_locked
    lock_stack(None, "s1", reason="maintenance", actor="admin")
    assert is_locked(None, "s1") is True
    unlock_stack(None, "s1")
    assert is_locked(None, "s1") is False


def test_taint_queues_execution(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    envs = tmp_path / "cloud-provisioning" / "default" / "envs"
    envs.mkdir(parents=True, exist_ok=True)
    (envs / "s2").mkdir()
    (envs / "s2" / "terraform.tfvars").write_text("app_vm_count = 1\n")
    from services.cloud_provisioning import _create_execution, _stack_dir, _load_secrets
    # seed secrets file so _create_execution does not crash on missing store
    import json
    sd = _stack_dir(None, "s2")
    (sd / "terraform.tfstate").write_text("{}")
    from services.stack_ops import taint_resource
    out = taint_resource(None, "s2", "hcloud_server.web")
    assert out["queued"] is True
