import pytest


def test_conventional_commit_linting():
    from utils.commit_lint import validate_conventional_commit

    # 1. Valid commits
    res1 = validate_conventional_commit("feat(auth): implement SSO discovery handler")
    assert res1["valid"] is True
    assert res1["type"] == "feat"
    assert res1["scope"] == "auth"
    assert res1["subject"] == "implement SSO discovery handler"

    res2 = validate_conventional_commit("fix: resolve null pointer in stack graph")
    assert res2["valid"] is True
    assert res2["type"] == "fix"
    assert res2["scope"] is None

    # 2. Invalid commits
    res_inv1 = validate_conventional_commit("fixed some bugs")
    assert res_inv1["valid"] is False

    res_inv2 = validate_conventional_commit("feat(): empty scope")
    assert res_inv2["valid"] is False


def test_idempotency_store_caching(pg_db):
    from services.idempotency_store import check_or_set_idempotency

    idem_key = "idem-key-batch21-uuid"

    # 1. First check: Not cached
    first_check = check_or_set_idempotency("flags_create", idem_key)
    assert first_check["cached"] is False

    # 2. Set result payload
    payload = {"flag_id": "flag-dark-mode", "enabled": True, "created": True}
    set_res = check_or_set_idempotency("flags_create", idem_key, response_payload=payload)
    assert set_res["cached"] is False
    assert set_res["saved"] is True

    # 3. Second check: Cached payload returned
    second_check = check_or_set_idempotency("flags_create", idem_key)
    assert second_check["cached"] is True
    assert second_check["response"]["flag_id"] == "flag-dark-mode"


def test_conflict_detection_409():
    from utils.conflict_detector import ensure_unique_key, KeyConflictError

    existing = ["beta-feature", "v2-migration", "dark-mode"]

    # 1. Unique key succeeds
    ensure_unique_key("feature_flag", "new-checkout-flow", existing)

    # 2. Duplicate key raises KeyConflictError (409)
    with pytest.raises(KeyConflictError) as exc_info:
        ensure_unique_key("feature_flag", "beta-feature", existing)
    assert exc_info.value.status_code == 409
    assert "Duplicate feature_flag key 'beta-feature'" in str(exc_info.value)


def test_data_snapshot_backup_and_restore(pg_db):
    import json
    from services.data_snapshot import create_data_snapshot, restore_data_snapshot
    from storage import pg

    # 1. Seed some stack metadata and test cases
    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s)",
        ("p-snap-src", "auth-api", json.dumps({"provider": "aws", "cost": 45.0})),
    )

    # 2. Create snapshot
    snapshot = create_data_snapshot(project_id="p-snap-src")
    assert snapshot["schema_version"] == "1.0"
    assert snapshot["project_id"] == "p-snap-src"
    assert len(snapshot["stacks"]) >= 1

    # 3. Restore to target project
    restore_res = restore_data_snapshot(project_id="p-snap-dest", snapshot_data=snapshot)
    assert restore_res["success"] is True
    assert restore_res["stacks_restored"] >= 1

    # 4. Verify in DB
    row = pg.query_one(
        "SELECT data FROM stack_meta WHERE project_id = %s AND stack = %s",
        ("p-snap-dest", "auth-api"),
    )
    assert row is not None


def test_preview_ttl_sweeper(pg_db):
    import json
    import time
    from services.preview_ttl_sweeper import sweep_expired_previews
    from storage import pg

    now = time.time()
    # 1. Seed active preview and expired preview
    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES "
        "(%s, %s, %s), (%s, %s, %s)",
        (
            "p-ttl-sweep", "preview-pr-101", json.dumps({"preview": True, "expires_at": now - 3600}), # Expired 1h ago
            "p-ttl-sweep", "preview-pr-102", json.dumps({"preview": True, "expires_at": now + 7200}), # Valid for 2h
        ),
    )

    swept = sweep_expired_previews("p-ttl-sweep", current_time=now)
    assert len(swept) == 1
    assert swept[0]["stack"] == "preview-pr-101"
    assert swept[0]["action"] == "scheduled_destroy"


def test_preview_promotion_workflow(pg_db):
    from services.preview_promotion import (
        request_preview_promotion,
        approve_preview_promotion,
        get_preview_promotion,
    )

    # 1. Request promotion
    req = request_preview_promotion(
        project_id="p-promo",
        preview_stack="preview-cart-pr50",
        prod_stack="cart-production",
        author="dev-emma",
    )
    promo_id = req["id"]
    assert req["status"] == "pending_approval"

    # 2. Approve promotion
    approved = approve_preview_promotion(promo_id, approver="lead-frank")
    assert approved["status"] == "approved"
    assert approved["approved_by"] == "lead-frank"
    assert approved["promoted_at"] is not None


def test_pr_status_badge_svg_generation():
    from services.pr_status_badge import generate_status_badge_svg

    # 1. Passed badge
    svg_pass = generate_status_badge_svg("radas", "passed")
    assert "<svg" in svg_pass
    assert "radas" in svg_pass
    assert "passed" in svg_pass
    assert "#4c1" in svg_pass or "green" in svg_pass or "#28a745" in svg_pass or "#10b981" in svg_pass

    # 2. Failed badge
    svg_fail = generate_status_badge_svg("tests", "failed")
    assert "tests" in svg_fail
    assert "failed" in svg_fail


def test_artifact_checksum_verification():
    import hashlib
    from services.checksum_verifier import verify_artifact_checksum

    payload = b'resource "aws_s3_bucket" "b" { bucket = "radas-test" }\n'
    sha256_expected = hashlib.sha256(payload).hexdigest()

    # 1. Valid SHA256 checksum
    assert verify_artifact_checksum(payload, sha256_expected, algorithm="sha256") is True

    # 2. Tampered content fails
    tampered = b'resource "aws_s3_bucket" "b" { bucket = "tampered" }\n'
    assert verify_artifact_checksum(tampered, sha256_expected, algorithm="sha256") is False



