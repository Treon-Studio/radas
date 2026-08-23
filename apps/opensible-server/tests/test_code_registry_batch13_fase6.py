import json
import pytest
from pathlib import Path

from services.code_registry import (
    catalog,
    get_item,
    install,
    installed,
    uninstall,
    export_item_bundle,
    import_item_bundle,
)


def _seed_base_registry(tmp_path: Path) -> Path:
    reg = tmp_path / "registry"
    vpc = reg / "tofu-block" / "vpc"
    vpc.mkdir(parents=True, exist_ok=True)
    (vpc / "radas.json").write_text(
        json.dumps({
            "name": "vpc",
            "type": "tofu-block",
            "version": "1.0.0",
            "description": "VPC block",
            "tags": ["network"],
            "changelog": [{"version": "1.0.0", "date": "2026-08-01", "changes": ["Initial release"]}],
        }),
        encoding="utf-8",
    )
    (vpc / "main.tf").write_text('resource "hcloud_network" "vpc_net" {}\n', encoding="utf-8")
    return reg


def _seed_test_stack(tmp_path: Path, name: str = "demo") -> Path:
    envs = tmp_path / "cloud-provisioning" / "default" / "envs"
    envs.mkdir(parents=True, exist_ok=True)
    sd = envs / name
    sd.mkdir(parents=True, exist_ok=True)
    (sd / "terraform.tfvars").write_text('project_name = "demo"\n', encoding="utf-8")
    return sd


def test_export_and_import_registry_item_bundle(tmp_path, monkeypatch):
    reg = _seed_base_registry(tmp_path)
    monkeypatch.setenv("REGISTRY_DIR", str(reg))

    # 1. Export vpc bundle
    bundle = export_item_bundle("vpc")
    assert bundle["name"] == "vpc"
    assert bundle["type"] == "tofu-block"
    assert bundle["version"] == "1.0.0"
    assert "main.tf" in bundle["files"]
    assert "hcloud_network" in bundle["files"]["main.tf"]

    # 2. Import under a new name 'custom-vpc'
    bundle["name"] = "custom-vpc"
    res = import_item_bundle(bundle)
    assert res["success"]
    assert res["name"] == "custom-vpc"

    # 3. Verify it is discoverable in catalog
    cat = catalog()
    names = [i["name"] for i in cat]
    assert "custom-vpc" in names


def test_version_pinning_and_changelog(tmp_path, monkeypatch):
    from services.code_registry import get_item_changelog, install, installed
    reg = _seed_base_registry(tmp_path)
    monkeypatch.setenv("REGISTRY_DIR", str(reg))
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    sd = _seed_test_stack(tmp_path, "demo")

    # 1. Fetch changelog
    cl = get_item_changelog("vpc")
    assert len(cl) >= 1
    assert cl[0]["version"] == "1.0.0"
    assert "Initial release" in cl[0]["changes"][0]

    # 2. Pin correct version install
    res = install(None, "demo", "vpc", version="1.0.0")
    assert res["version"] == "1.0.0"
    inst = installed(None, "demo")
    assert inst[0]["version"] == "1.0.0"

    # 3. Pin non-existent version raises ValueError
    _seed_test_stack(tmp_path, "demo2")
    with pytest.raises(ValueError, match="Version '2.0.0' not found"):
        install(None, "demo2", "vpc", version="2.0.0")


def test_dependency_resolution_and_chain_install(tmp_path, monkeypatch):
    from services.code_registry import resolve_dependencies, install, installed
    reg = _seed_base_registry(tmp_path)

    # Add 'subnet' which depends on 'vpc', and 'monitoring' which depends on 'subnet'
    subnet = reg / "tofu-block" / "subnet"
    subnet.mkdir(parents=True)
    (subnet / "radas.json").write_text(json.dumps({
        "name": "subnet",
        "type": "tofu-block",
        "version": "1.0.0",
        "dependencies": ["vpc"],
    }), encoding="utf-8")
    (subnet / "subnet.tf").write_text('resource "hcloud_network_subnet" "sub" {}\n', encoding="utf-8")

    mon = reg / "tofu-block" / "monitoring"
    mon.mkdir(parents=True)
    (mon / "radas.json").write_text(json.dumps({
        "name": "monitoring",
        "type": "tofu-block",
        "version": "1.0.0",
        "dependencies": ["subnet"],
    }), encoding="utf-8")
    (mon / "mon.tf").write_text('resource "hcloud_server" "prometheus" {}\n', encoding="utf-8")

    monkeypatch.setenv("REGISTRY_DIR", str(reg))
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    sd = _seed_test_stack(tmp_path, "mon-stack")

    # 1. Test resolve_dependencies returns ["vpc", "subnet"]
    deps = resolve_dependencies("monitoring")
    assert deps == ["vpc", "subnet"]

    # 2. Install monitoring on a fresh stack with resolve_deps=True
    res = install(None, "mon-stack", "monitoring", resolve_deps=True)
    assert res["name"] == "monitoring"
    assert "vpc" in res.get("dependencies_installed", [])
    assert "subnet" in res.get("dependencies_installed", [])

    # 3. Verify all 3 items (vpc, subnet, monitoring) are in installed manifest
    inst = installed(None, "mon-stack")
    names = [i["name"] for i in inst]
    assert "vpc" in names
    assert "subnet" in names
    assert "monitoring" in names
    assert (sd / "vpc-main.tf").exists()
    assert (sd / "subnet-subnet.tf").exists()
    assert (sd / "monitoring-mon.tf").exists()


def test_publish_from_stack_to_registry(tmp_path, monkeypatch):
    from services.code_registry import publish_from_stack, get_item, catalog
    reg = _seed_base_registry(tmp_path)
    monkeypatch.setenv("REGISTRY_DIR", str(reg))
    monkeypatch.setenv("DATA_DIR", str(tmp_path))

    # Seed a custom stack with reusable redis configuration
    sd = _seed_test_stack(tmp_path, "prod-app")
    (sd / "redis.tf").write_text('resource "hcloud_server" "redis" { name = "redis-cluster" }\n', encoding="utf-8")
    (sd / "redis_vars.tf").write_text('variable "redis_port" { default = 6379 }\n', encoding="utf-8")

    # 1. Publish redis block from stack to registry
    pub_res = publish_from_stack(
        project_id=None,
        stack="prod-app",
        name="redis-cache",
        item_type="tofu-block",
        file_patterns=["redis.tf", "redis_vars.tf"],
        version="1.2.0",
        description="High availability redis cluster block",
        tags=["database", "redis"],
    )
    assert pub_res["success"]
    assert pub_res["name"] == "redis-cache"
    assert pub_res["version"] == "1.2.0"
    assert len(pub_res["files_published"]) == 2

    # 2. Verify it is now discoverable in the registry
    item = get_item("redis-cache")
    assert item is not None
    assert item["version"] == "1.2.0"
    assert "redis.tf" in item["files"]
    assert "redis_vars.tf" in item["files"]



