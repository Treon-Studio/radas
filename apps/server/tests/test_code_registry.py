"""Unit tests for the code registry (UC 382+): catalog, install, uninstall.

Uses REGISTRY_DIR env override (hermetic registry copy per test) + the
data_dir fixture for stack workspaces.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path


def _seed_registry(tmp_path: Path) -> Path:
    reg = tmp_path / "registry"
    vpc = reg / "tofu-block" / "vpc"
    vpc.mkdir(parents=True)
    (vpc / "radas.json").write_text(json.dumps(
        {"name": "vpc", "type": "tofu-block", "version": "1.0.0",
         "description": "VPC block", "tags": ["network"]}), encoding="utf-8")
    (vpc / "main.tf").write_text('resource "hcloud_network" "vpc_net" {}\n', encoding="utf-8")
    # ansible role
    role = reg / "ansible-role" / "nginx"
    (role / "tasks").mkdir(parents=True)
    (role / "radas.json").write_text(json.dumps(
        {"name": "nginx", "type": "ansible-role", "version": "2.1.0",
         "description": "nginx role", "tags": ["nginx"]}), encoding="utf-8")
    (role / "tasks" / "main.yml").write_text("- debug: msg=nginx\n", encoding="utf-8")
    return reg


def _seed_stack(tmp_path: Path, name: str = "demo") -> Path:
    envs = tmp_path / "cloud-provisioning" / "default" / "envs"
    envs.mkdir(parents=True, exist_ok=True)
    sd = envs / name
    sd.mkdir()
    (sd / "terraform.tfvars").write_text('project_name = "demo"\n', encoding="utf-8")
    return sd


def test_catalog_lists_seeded_items(tmp_path, monkeypatch):
    monkeypatch.setenv("REGISTRY_DIR", str(_seed_registry(tmp_path)))
    from services.code_registry import catalog
    items = catalog()
    names = {(i["name"], i["type"]) for i in items}
    assert ("vpc", "tofu-block") in names
    assert ("nginx", "ansible-role") in names


def test_get_item_metadata(tmp_path, monkeypatch):
    monkeypatch.setenv("REGISTRY_DIR", str(_seed_registry(tmp_path)))
    from services.code_registry import get_item
    it = get_item("vpc")
    assert it is not None
    assert it["version"] == "1.0.0"
    assert it["files"] == ["main.tf"]


def test_install_tofu_block_copies_prefixed(tmp_path, monkeypatch):
    monkeypatch.setenv("REGISTRY_DIR", str(_seed_registry(tmp_path)))
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    sd = _seed_stack(tmp_path)
    from services.code_registry import install, installed
    out = install(None, "demo", "vpc")
    assert out["files_copied"] == ["vpc-main.tf"]
    assert (sd / "vpc-main.tf").exists()
    assert (sd / "vpc-main.tf").read_text().startswith("resource")
    inst = installed(None, "demo")
    assert inst[0]["name"] == "vpc" and inst[0]["type"] == "tofu-block"


def test_install_ansible_role_copies_roles_tree(tmp_path, monkeypatch):
    monkeypatch.setenv("REGISTRY_DIR", str(_seed_registry(tmp_path)))
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    sd = _seed_stack(tmp_path)
    from services.code_registry import install
    out = install(None, "demo", "nginx")
    assert (sd / "roles" / "nginx" / "tasks" / "main.yml").exists()
    assert "roles/nginx/tasks/main.yml" in out["files_copied"]


def test_install_double_rejected(tmp_path, monkeypatch):
    monkeypatch.setenv("REGISTRY_DIR", str(_seed_registry(tmp_path)))
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    _seed_stack(tmp_path)
    from services.code_registry import install
    install(None, "demo", "vpc")
    try:
        install(None, "demo", "vpc")
        assert False, "should raise"
    except ValueError as e:
        assert "already installed" in str(e)


def test_uninstall_removes_files_and_manifest(tmp_path, monkeypatch):
    monkeypatch.setenv("REGISTRY_DIR", str(_seed_registry(tmp_path)))
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    sd = _seed_stack(tmp_path)
    from services.code_registry import install, installed, uninstall
    install(None, "demo", "vpc")
    out = uninstall(None, "demo", "vpc")
    assert not (sd / "vpc-main.tf").exists()
    assert installed(None, "demo") == []
    assert "vpc-main.tf" in out["removed"]


def test_install_unknown_item_rejected(tmp_path, monkeypatch):
    monkeypatch.setenv("REGISTRY_DIR", str(_seed_registry(tmp_path)))
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    _seed_stack(tmp_path)
    from services.code_registry import install
    try:
        install(None, "demo", "nope")
        assert False, "should raise"
    except ValueError as e:
        assert "not found" in str(e)