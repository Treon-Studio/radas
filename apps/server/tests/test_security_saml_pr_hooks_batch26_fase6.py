import pytest


def test_csp_instance_cost_estimator(pg_db):
    from services.csp_cost_estimator import estimate_csp_instance_cost
    from services.pricing_table_updater import update_provider_pricing_table

    # 1. Update provider rate
    update_provider_pricing_table("aws", {"t3.medium": 0.0416})

    # 2. Estimate 730 hours monthly
    est = estimate_csp_instance_cost("aws", "t3.medium", hours_per_month=730.0)
    assert est["provider"] == "aws"
    assert est["instance_type"] == "t3.medium"
    assert est["hourly_rate"] == 0.0416
    assert est["monthly_cost"] == 30.37


def test_at_rest_config_cipher():
    from utils.config_cipher import encrypt_config_value, decrypt_config_value

    secret_raw = "super-secret-database-password-12345"
    key = "master-cluster-encryption-key"

    # 1. Encrypt
    cipher = encrypt_config_value(secret_raw, secret_key=key)
    assert cipher.startswith("enc:v1:")
    assert secret_raw not in cipher

    # 2. Decrypt
    decrypted = decrypt_config_value(cipher, secret_key=key)
    assert decrypted == secret_raw


def test_session_jwt_rotation(pg_db, tmp_path):
    from services.session_rotator import rotate_session_token, hash_token
    from auth.service import generate_token
    from storage import pg

    # 1. Create user and initial refresh token and session row
    pg.execute(
        "INSERT INTO users (id, username, password_hash) VALUES (%s, %s, %s)",
        ("user-rot-01", "rot_user", "dummy_hash"),
    )
    old_refresh = generate_token(user_id="user-rot-01", username="rot_user", roles=["viewer"], data_dir=tmp_path, token_type="refresh")
    old_hash = hash_token(old_refresh)
    pg.execute(
        "INSERT INTO sessions (id, user_id, refresh_hash, ip, created_at) VALUES (%s, %s, %s, %s, %s)",
        ("sess-init-01", "user-rot-01", old_hash, "10.0.0.1", "2026-08-23T00:00:00Z"),
    )

    # 2. Rotate session token
    rot_res = rotate_session_token(current_refresh_token=old_refresh, user_id="user-rot-01", client_ip="10.0.0.1", data_dir=tmp_path)
    assert rot_res["success"] is True
    assert rot_res["access_token"] is not None
    assert rot_res["refresh_token"] != old_refresh

    # 3. Old session row is revoked
    old_row = pg.query_one("SELECT revoked_at FROM sessions WHERE id = %s", ("sess-init-01",))
    assert old_row["revoked_at"] is not None



def test_saml_assertion_processing():
    from services.saml_auth import process_saml_assertion

    saml_xml = """<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
        <saml:Issuer>https://idp.enterprise.example.com</saml:Issuer>
        <saml:Assertion>
            <saml:Subject>
                <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">alice@enterprise.example.com</saml:NameID>
            </saml:Subject>
            <saml:AttributeStatement>
                <saml:Attribute Name="username">
                    <saml:AttributeValue>alice_corp</saml:AttributeValue>
                </saml:Attribute>
                <saml:Attribute Name="role">
                    <saml:AttributeValue>admin</saml:AttributeValue>
                </saml:Attribute>
            </saml:AttributeStatement>
        </saml:Assertion>
    </samlp:Response>"""

    res = process_saml_assertion(saml_xml)
    assert res["success"] is True
    assert res["name_id"] == "alice@enterprise.example.com"
    assert res["email"] == "alice@enterprise.example.com"
    assert res["username"] == "alice_corp"
    assert res["issuer"] == "https://idp.enterprise.example.com"


def test_resource_audit_logging(pg_db):
    from services.resource_audit import audit_resource_action
    from storage import pg

    res = audit_resource_action(
        action="resource.import",
        resource_type="aws_s3_bucket",
        resource_id="corp-data-lake-v1",
        actor="dev-lead-bob",
        details={"region": "ap-southeast-1", "encrypted": True},
    )
    assert res["success"] is True
    assert res["action"] == "resource.import"

    # Verify written to audit_log table
    row = pg.query_one("SELECT * FROM audit_log WHERE target_id = %s", ("corp-data-lake-v1",))
    assert row is not None
    assert row["actor_user_id"] == "dev-lead-bob"


def test_dedicated_preview_quotas(pg_db):
    from services.preview_quota import set_preview_quota, evaluate_preview_quota

    set_preview_quota("p-preview-app", max_previews=3)

    # 1. 2 active + 1 requested <= 3 -> Allowed
    eval_ok = evaluate_preview_quota("p-preview-app", current_count=2, requested_previews=1)
    assert eval_ok["allowed"] is True
    assert eval_ok["remaining"] == 0

    # 2. 3 active + 1 requested > 3 -> Rejected
    eval_fail = evaluate_preview_quota("p-preview-app", current_count=3, requested_previews=1)
    assert eval_fail["allowed"] is False


def test_git_preapply_hook_validation(tmp_path):
    from services.git_preapply_hook import run_preapply_validation

    # 1. Clean valid directory
    (tmp_path / "main.tf").write_text('resource "aws_s3_bucket" "b" {}\n', encoding="utf-8")
    res_clean = run_preapply_validation(str(tmp_path))
    assert res_clean["passed"] is True
    assert len(res_clean["violations"]) == 0

    # 2. Add bad file with syntax violation
    (tmp_path / "bad.tf").write_text('resource "aws_s3_bucket" "b" { unclosed\n', encoding="utf-8")
    res_bad = run_preapply_validation(str(tmp_path))
    assert res_bad["passed"] is False
    assert len(res_bad["violations"]) >= 1


def test_atlantis_style_pr_plan_comment():
    from services.pr_plan_commenter import generate_pr_plan_comment

    plan_summary = {
        "add": 2,
        "change": 1,
        "destroy": 0,
        "raw_diff": "+ aws_instance.web\n+ aws_s3_bucket.assets\n~ aws_security_group.allow_tls",
    }
    comment = generate_pr_plan_comment(
        stack_name="prod-us-east-cluster",
        plan_summary=plan_summary,
        commit_sha="a1b2c3d4e5f6789",
    )
    assert "RADAS Plan Result for Stack: `prod-us-east-cluster`" in comment
    assert "**Plan:** 2 to add, 1 to change, 0 to destroy" in comment
    assert "Commit: `a1b2c3d`" in comment
    assert "<details><summary>Show Output</summary>" in comment



