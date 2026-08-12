"""Unit tests for the feature flag store & evaluation engine (UC 113-118)."""
from __future__ import annotations

def test_create_flag_roundtrip(data_dir):
    from services.feature_flags import create_flag, get_flag, list_flags
    f = create_flag({"key": "block_apply", "name": "Block apply", "rollout_percent": 100})
    assert f["key"] == "block_apply"
    assert get_flag("block_apply")["enabled"] is True
    assert len(list_flags()) == 1

def test_create_duplicate_key_rejected(data_dir):
    from services.feature_flags import create_flag
    create_flag({"key": "dup", "rollout_percent": 100})
    try:
        create_flag({"key": "dup", "rollout_percent": 100})
        assert False, "should raise"
    except ValueError as e:
        assert "already exists" in str(e)

def test_update_flag_patch(data_dir):
    from services.feature_flags import create_flag, update_flag
    create_flag({"key": "xx", "rollout_percent": 100})
    updated = update_flag("xx", {"enabled": False, "rollout_percent": 40})
    assert updated["enabled"] is False
    assert updated["rollout_percent"] == 40

def test_delete_flag(data_dir):
    from services.feature_flags import create_flag, delete_flag, get_flag
    create_flag({"key": "gone", "rollout_percent": 100})
    assert delete_flag("gone") is True
    assert delete_flag("gone") is False
    assert get_flag("gone") is None

def test_evaluate_full_rollout(data_dir):
    from services.feature_flags import create_flag, evaluate
    create_flag({"key": "full", "rollout_percent": 100})
    r = evaluate("full", env="prod", user="alice")
    assert r["enabled"] is True and r["reason"] == "full_rollout"

def test_evaluate_env_override_disables(data_dir):
    from services.feature_flags import create_flag, evaluate
    create_flag({"key": "envgate", "rollout_percent": 100,
                 "environments": {"prod": False, "dev": True}})
    assert evaluate("envgate", env="prod")["enabled"] is False
    assert evaluate("envgate", env="dev")["enabled"] is True

def test_evaluate_kill_switch_wins(data_dir):
    from services.feature_flags import create_flag, evaluate
    create_flag({"key": "kill", "rollout_percent": 100, "kill_switch": True})
    assert evaluate("kill", env="prod")["enabled"] is False
    assert evaluate("kill", env="prod")["reason"] == "kill_switch"

def test_evaluate_percentage_rollout_deterministic(data_dir):
    from services.feature_flags import create_flag, evaluate
    create_flag({"key": "roll", "rollout_percent": 0})
    assert evaluate("roll", env="prod", user="u1")["enabled"] is False
    create_flag({"key": "roll2", "rollout_percent": 100})
    assert evaluate("roll2", env="prod", user="u1")["enabled"] is True

def test_evaluate_whitelist_overrides_rollout(data_dir):
    from services.feature_flags import create_flag, evaluate
    create_flag({"key": "wl", "rollout_percent": 0, "users_whitelist": ["admin"]})
    assert evaluate("wl", env="prod", user="admin")["enabled"] is True
    assert evaluate("wl", env="prod", user="joe")["enabled"] is False

def test_evaluate_unknown_flag(data_dir):
    from services.feature_flags import evaluate
    assert evaluate("nope", env="prod")["enabled"] is False
    assert evaluate("nope", env="prod")["reason"] == "unknown_flag"

def test_blacklist_beats_whitelist(data_dir):
    from services.feature_flags import create_flag, evaluate
    create_flag({"key": "bl", "rollout_percent": 100,
                 "users_whitelist": ["boss"], "users_blacklist": ["boss"]})
    assert evaluate("bl", env="prod", user="boss")["enabled"] is False
    assert evaluate("bl", env="prod", user="boss")["reason"] == "blacklisted"


def test_rollout_percent_string_coerced(data_dir):
    from services.feature_flags import create_flag, evaluate
    create_flag({"key": "strroll", "rollout_percent": "50"})
    r = evaluate("strroll", env="prod")
    assert "enabled" in r  # must not raise TypeError