"""Audit trail + TTL expiry for feature flags (UC 122, 130)."""
from __future__ import annotations

import time

def test_log_and_read_audit(data_dir):
    from services.feature_flags import create_flag, log_flag_change, flag_audit
    create_flag({"key": "aud", "rollout_percent": 100})
    log_flag_change("aud", actor="admin", changes={"enabled": True})
    log_flag_change("aud", actor="devops", changes={"enabled": False})
    entries = flag_audit()
    # 3 entries: create_flag auto-logs its creation, then the 2 manual changes.
    assert len(entries) == 3
    assert entries[0]["actor"] == "devops"
    assert entries[0]["changes"] == {"enabled": False}

def test_audit_scoped_to_flag(data_dir):
    from services.feature_flags import create_flag, log_flag_change, flag_audit
    create_flag({"key": "aa", "rollout_percent": 100})
    create_flag({"key": "bb", "rollout_percent": 100})
    log_flag_change("aa", "u1", {"enabled": True})
    scoped = flag_audit(flag_key="aa")
    assert all(e["key"] == "aa" for e in scoped)
    assert len(scoped) == 2  # create auto-log + manual log
    assert len(flag_audit(flag_key="bb")) == 1  # only its create auto-log

def test_ttl_expiry_disables_flag(data_dir):
    from services.feature_flags import create_flag, evaluate, expire_due_flags
    create_flag({"key": "short", "rollout_percent": 100, "ttl_seconds": 5})
    assert evaluate("short", env="prod")["enabled"] is True
    assert expire_due_flags(now=int(time.time()) + 10) == 1
    assert evaluate("short", env="prod")["enabled"] is False


def test_registry_audit_diff_and_pagination(data_dir):
    from services.feature_flag_registry import audit, create_flag, update_flag
    create_flag({"key": "d.flag", "rollout_percent": 100}, "global", None, actor="u1", actor_name="admin")
    update_flag("d.flag", {"enabled": False, "rollout_percent": 30}, "global", None, actor="u2", actor_name="devops")
    entries = audit("global", None, "d.flag", limit=10)
    assert entries[0]["operation"] == "update"
    assert entries[0]["actor_name"] == "devops"
    # Field-level diff: only the changed fields, with before/after.
    assert entries[0]["changes"]["enabled"] == {"before": True, "after": False}
    assert entries[0]["changes"]["rollout_percent"] == {"before": 100, "after": 30}
    assert "name" not in entries[0]["changes"]
    assert entries[0]["scope_type"] == "global"
    # create entry carries actor_name + scope too.
    assert entries[1]["operation"] == "create"
    assert entries[1]["actor_name"] == "admin"
    # Pagination: offset 1 skips the newest entry.
    page2 = audit("global", None, "d.flag", limit=10, offset=1)
    assert page2[0]["operation"] == "create"
    assert len(page2) == 1


def test_registry_env_diff_aware(data_dir):
    from services.feature_flag_registry import audit, create_flag, update_flag
    create_flag({"key": "e.flag", "rollout_percent": 100}, "global", None, actor="u1")
    update_flag("e.flag", {"environments": {"prod": False}}, "global", None, actor="u2")
    entry = audit("global", None, "e.flag", limit=1)[0]
    assert entry["changes"]["environments"] == {"prod": {"before": True, "after": False}}
