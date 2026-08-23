import json
import pytest
from pathlib import Path


def test_template_share_export_and_import(tmp_path, monkeypatch):
    from services.template_share import export_template_bundle, import_template_bundle

    tpl_dir = tmp_path / "custom-templates"
    my_tpl = tpl_dir / "microservice-starter"
    my_tpl.mkdir(parents=True, exist_ok=True)
    (my_tpl / "main.tf").write_text('resource "docker_container" "app" {}\n', encoding="utf-8")
    (my_tpl / "variables.tf").write_text('variable "app_port" { default = 8080 }\n', encoding="utf-8")

    # 1. Export template bundle
    bundle = export_template_bundle("microservice-starter", base_dir=tpl_dir)
    assert bundle["name"] == "microservice-starter"
    assert "main.tf" in bundle["files"]
    assert "variables.tf" in bundle["files"]

    # 2. Import into a new destination
    dest_dir = tmp_path / "imported-templates"
    res = import_template_bundle(bundle, base_dir=dest_dir)
    assert res["success"] is True
    assert (dest_dir / "microservice-starter" / "main.tf").exists()
    assert "docker_container" in (dest_dir / "microservice-starter" / "main.tf").read_text()


def test_retry_engine_with_jitter():
    from services.retry_engine import retry_with_jitter

    attempts = 0

    def flaky_operation():
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise ConnectionResetError("Temporary network glitch")
        return "success-result"

    result = retry_with_jitter(
        flaky_operation,
        max_retries=4,
        base_delay=0.01,
        max_delay=0.1,
        exceptions=(ConnectionResetError,),
    )
    assert result == "success-result"
    assert attempts == 3
