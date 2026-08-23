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


def test_org_password_complexity_policy(pg_db):
    from services.password_policy import (
        get_org_password_policy,
        set_org_password_policy,
        validate_password_for_org,
    )

    # 1. Default policy check (len >= 8)
    ok, err = validate_password_for_org("simplePass1", org_id="org-default")
    assert ok is True
    assert err is None

    short_ok, short_err = validate_password_for_org("short1", org_id="org-default")
    assert short_ok is False
    assert "at least 8" in short_err

    # 2. Strict policy per org (min 12 chars, special char required)
    set_org_password_policy(
        org_id="org-strict-corp",
        min_length=12,
        require_uppercase=True,
        require_numbers=True,
        require_special=True,
    )

    policy = get_org_password_policy("org-strict-corp")
    assert policy["min_length"] == 12
    assert policy["require_special"] is True

    # 3. Test passwords against strict org
    fail_no_special, err_spec = validate_password_for_org("VeryLongPassword123", org_id="org-strict-corp")
    assert fail_no_special is False
    assert "special character" in err_spec

    pass_all, err_none = validate_password_for_org("VeryLongPassword123!", org_id="org-strict-corp")
    assert pass_all is True
    assert err_none is None


def test_hashicorp_vault_read_integration(monkeypatch):
    import io
    import urllib.request
    from services.vault_integration import read_vault_secret

    # Mock urllib response for Vault KV v2 engine
    class FakeVaultResponse:
        def __init__(self, payload):
            self.payload = payload
        def read(self):
            return json.dumps(self.payload).encode("utf-8")
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass

    def fake_urlopen(req, *args, **kwargs):
        assert req.get_header("X-vault-token") == "s.mock-token-xyz"
        return FakeVaultResponse({
            "data": {
                "data": {
                    "DB_PASSWORD": "super-secret-vault-pwd",
                    "API_KEY": "ak-9999",
                }
            }
        })

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    secrets = read_vault_secret(
        vault_addr="http://vault.internal:8200",
        token="s.mock-token-xyz",
        secret_path="secret/data/production/db",
    )
    assert secrets["DB_PASSWORD"] == "super-secret-vault-pwd"
    assert secrets["API_KEY"] == "ak-9999"


def test_kms_key_rotation(pg_db):
    from services.kms_rotation import rotate_kms_master_key, get_active_kms_key

    # 1. Initial key rotation to v1
    res_v1 = rotate_kms_master_key(new_key_alias="kms-key-2026-v1")
    assert res_v1["success"] is True
    assert res_v1["version"] == 1
    assert res_v1["active_key_alias"] == "kms-key-2026-v1"

    curr_v1 = get_active_kms_key()
    assert curr_v1["version"] == 1
    assert curr_v1["alias"] == "kms-key-2026-v1"

    # 2. Rotate to v2
    res_v2 = rotate_kms_master_key(new_key_alias="kms-key-2026-v2")
    assert res_v2["success"] is True
    assert res_v2["version"] == 2
    assert res_v2["active_key_alias"] == "kms-key-2026-v2"

    curr_v2 = get_active_kms_key()
    assert curr_v2["version"] == 2
    assert curr_v2["alias"] == "kms-key-2026-v2"
    assert len(curr_v2.get("previous_versions", [])) >= 1


def test_seed_dev_data_and_demo_generator(tmp_path, pg_db):
    from services.seed_service import seed_development_data
    from storage import pg

    res = seed_development_data(data_dir=tmp_path)
    assert res["success"] is True
    assert "demo-infra" in res["seeded_projects"]
    assert len(res["seeded_stacks"]) >= 1

    # Verify directory created
    assert (tmp_path / "projects" / "demo-infra").exists()

    # Verify DB metadata
    rows = pg.query_all("SELECT * FROM stack_meta WHERE project_id = %s", ("demo-infra",))
    assert len(rows) >= 1


def test_system_dependency_checks(pg_db):
    from services.dependency_check import check_system_dependencies

    res = check_system_dependencies()
    assert res["status"] in ("healthy", "degraded")
    assert "postgres" in res["dependencies"]
    assert res["dependencies"]["postgres"]["status"] == "ok"
    assert "filesystem" in res["dependencies"]
    assert res["dependencies"]["filesystem"]["status"] == "ok"


def test_system_config_migrations(pg_db):
    from storage.system_migrations import run_system_migrations
    from storage import pg

    # 1. Run migrations initially
    res1 = run_system_migrations()
    assert res1["success"] is True
    assert res1["applied_count"] >= 1
    assert res1["latest_version"] >= 1

    # 2. Re-running should be idempotent (0 newly applied)
    res2 = run_system_migrations()
    assert res2["success"] is True
    assert res2["applied_count"] == 0
    assert res2["latest_version"] == res1["latest_version"]




