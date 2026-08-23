import json
import pytest
from pathlib import Path


def test_compliance_report_export_html(pg_db):
    from services.compliance_service import export_compliance_report

    # 1. Generate compliance report in HTML format
    html_output = export_compliance_report(project_id="proj-audit-1", format_type="html")
    assert "<!DOCTYPE html>" in html_output
    assert "Compliance & Security Audit Report" in html_output
    assert "Scorecard" in html_output
    assert "proj-audit-1" in html_output

    # 2. Generate compliance report in JSON format
    json_output = export_compliance_report(project_id="proj-audit-1", format_type="json")
    data = json.loads(json_output)
    assert "scorecard" in data
    assert data["scorecard"]["project_id"] == "proj-audit-1"


def test_stack_clone_and_rename_lifecycle(tmp_path, monkeypatch, pg_db):
    from services.stack_lifecycle import clone_stack, rename_stack
    from storage import pg

    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    envs = tmp_path / "projects" / "proj-1" / "stacks" / "envs"
    envs.mkdir(parents=True, exist_ok=True)
    src_dir = envs / "base-web"
    src_dir.mkdir(parents=True, exist_ok=True)
    (src_dir / "main.tf").write_text('resource "hcloud_server" "web" {}\n', encoding="utf-8")
    (src_dir / "terraform.tfvars").write_text('server_type = "cx11"\n', encoding="utf-8")

    # Insert metadata
    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s)",
        ("proj-1", "base-web", json.dumps({"provider": "hetzner", "env": "dev"})),
    )

    # 1. Clone stack 'base-web' to 'cloned-web'
    clone_res = clone_stack(project_id="proj-1", source_stack="base-web", target_stack="cloned-web")
    assert clone_res["success"] is True
    assert (envs / "cloned-web" / "main.tf").exists()
    assert (envs / "cloned-web" / "terraform.tfvars").exists()

    # Verify cloned stack exists in DB
    cloned_meta = pg.query_one("SELECT * FROM stack_meta WHERE project_id = %s AND stack = %s", ("proj-1", "cloned-web"))
    assert cloned_meta is not None

    # 2. Rename stack 'cloned-web' to 'renamed-web'
    rename_res = rename_stack(project_id="proj-1", old_name="cloned-web", new_name="renamed-web")
    assert rename_res["success"] is True
    assert not (envs / "cloned-web").exists()
    assert (envs / "renamed-web" / "main.tf").exists()

    # Verify DB metadata updated
    renamed_meta = pg.query_one("SELECT * FROM stack_meta WHERE project_id = %s AND stack = %s", ("proj-1", "renamed-web"))
    assert renamed_meta is not None
    assert pg.query_one("SELECT * FROM stack_meta WHERE project_id = %s AND stack = %s", ("proj-1", "cloned-web")) is None

