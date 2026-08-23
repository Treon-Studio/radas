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
