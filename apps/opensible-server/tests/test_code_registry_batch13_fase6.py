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

