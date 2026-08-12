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
