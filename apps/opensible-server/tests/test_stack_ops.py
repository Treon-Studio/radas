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


def test_locked_stack_blocks_action(tmp_path, monkeypatch):
    """A manually locked stack is reported locked; the actions gate refuses
    mutating actions on it (stacks_action returns 423-style). Unit test of the
    service contract — is_locked must reflect lock_stack, and meta.json must
    carry the lock reason the gate surfaces in its error message."""
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    envs = tmp_path / "cloud-provisioning" / "default" / "envs"
    envs.mkdir(parents=True, exist_ok=True)
    (envs / "s3").mkdir()
    (envs / "s3" / "terraform.tfvars").write_text("env = \"prod\"\n")
    import json
    from services.cloud_provisioning import _stack_data_dir
    from services.stack_ops import is_locked, lock_stack, unlock_stack
    lock_stack(None, "s3", reason="maintenance", actor="admin")
    assert is_locked(None, "s3") is True
    meta = json.loads((_stack_data_dir(None, "s3") / "meta.json").read_text(encoding="utf-8"))
    assert (meta.get("locked") or {}).get("reason") == "maintenance"
    assert (meta.get("locked") or {}).get("by") == "admin"
    # Unlocking clears the lock so mutating actions are allowed again.
    unlock_stack(None, "s3")
    assert is_locked(None, "s3") is False
