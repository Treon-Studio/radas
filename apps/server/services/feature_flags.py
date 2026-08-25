"""Feature flags (Fase 6 — UC 113+).

Flag store + evaluation engine: global on/off, per-environment overrides,
percentage rollout (deterministic hash), user whitelist/blacklist, optional
kill-switch. Flags are enforced at stack actions (e.g. `block_apply`) and can
be evaluated via API for console previews / progressive delivery.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

DEFAULT_ENVS = ("dev", "staging", "prod", "preview")


def _store_path() -> Path:
    env_dir = os.environ.get("DATA_DIR")
    if env_dir:
        return Path(env_dir) / "feature_flags.json"
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "feature_flags.json"
    except Exception:
        return Path("data") / "feature_flags.json"


def _audit_store_path() -> Path:
    env_dir = os.environ.get("DATA_DIR")
    if env_dir:
        return Path(env_dir) / "flag_audit.json"
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "flag_audit.json"
    except Exception:
        return Path("data") / "flag_audit.json"


def _migrate_legacy_audit_file() -> int:
    """One-shot import of the old file-based audit into KV, then remove the file."""
    path = _audit_store_path()
    if not path.exists():
        return 0
    try:
        items = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return 0
    from services.feature_flag_registry import _append_history
    if isinstance(items, list):
        for entry in items:
            _append_history({"operation": "legacy", "key": entry.get("key", ""),
                             "actor": entry.get("actor", "system"), "at": entry.get("at", _now()),
                             "changes": entry.get("changes", {})}, "global", None)
    try:
        path.unlink(missing_ok=True)
    except Exception:
        pass
    return len(items) if isinstance(items, list) else 0


def log_flag_change(key: str, actor: str = "", changes: Optional[Dict[str, Any]] = None, actor_name: str = "") -> Dict[str, Any]:
    """Record a flag change in the KV audit trail (global scope)."""
    _migrate_legacy_audit_file()
    from services.feature_flag_registry import _append_history
    operation = "change"
    if isinstance(changes, dict):
        operation = changes.get("operation") or operation
    entry = {"operation": operation, "key": key, "actor": actor or "system",
             "actor_name": actor_name or "", "at": _now(), "changes": changes or {},
             "scope_type": "global", "scope_id": None}
    _append_history(entry, "global", None)
    return entry


def flag_audit(limit: int = 100, flag_key: Optional[str] = None) -> List[Dict[str, Any]]:
    from services.feature_flag_registry import audit as registry_audit
    return registry_audit("global", None, flag_key, limit)


def expire_due_flags(now: Optional[int] = None) -> int:
    """Disable flags whose scheduled_expire_at (or created+ttl) passed. Returns count."""
    now = now or _now()
    items = _load()
    changed = 0
    for f in items:
        if not f.get("enabled"):
            continue
        expire_at = f.get("scheduled_expire_at")
        if expire_at is None and f.get("ttl_seconds"):
            expire_at = f.get("created_at", 0) + int(f["ttl_seconds"])
        if expire_at and now >= expire_at:
            f["enabled"] = False
            f["expired_at"] = now
            changed += 1
    if changed:
        _save(items)
    return changed


def _load() -> List[Dict[str, Any]]:
    from storage import kv
    v = kv.kv_load("flags")
    return v if isinstance(v, list) else []


def _save(items: List[Dict[str, Any]]) -> None:
    from storage import kv
    kv.kv_save("flags", items)



def _now() -> int:
    return int(time.time())


def _bucket(key: str, entity: str) -> int:
    """Deterministic 0..999 bucket for percentage rollout."""
    digest = hashlib.sha256(f"{key}:{entity}".encode("utf-8")).hexdigest()
    return int(digest[:6], 16) % 1000


DEFAULT_FLAGS = ("block_apply", "block_destroy", "preview", "auto_scale")

def seed_default_flags() -> int:
    created = 0
    for key in DEFAULT_FLAGS:
        if not get_flag(key):
            create_flag({"key": key, "name": key.replace("_", " ").title(), "rollout_percent": 100, "enabled": False})
            created += 1
    return created

def list_flags() -> List[Dict[str, Any]]:
    return _load()

def rollback_flag(key: str, audit_entry: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    after = audit_entry.get("before") if isinstance(audit_entry, dict) else None
    if not isinstance(after, dict): return None
    return update_flag(key, after)

def export_flags() -> List[Dict[str, Any]]:
    return _load()

def import_flags(items: List[Dict[str, Any]]) -> int:
    if not isinstance(items, list): raise ValueError("flags must be a list")
    for item in items:
        if not isinstance(item, dict) or not item.get("key"): raise ValueError("each flag must have a key")
        if get_flag(str(item["key"])): update_flag(str(item["key"]), item)
        else: create_flag(item)
    return len(items)


def get_flag(key: str) -> Optional[Dict[str, Any]]:
    key = (key or "").strip()
    return next((f for f in _load() if f["key"] == key), None)


def create_flag(data: Dict[str, Any]) -> Dict[str, Any]:
    key = (data.get("key") or "").strip().lower().replace(" ", "-")
    if not key or len(key) < 2:
        raise ValueError("Flag key must be at least 2 chars")
    if get_flag(key):
        raise ValueError(f"Flag '{key}' already exists")
    _raw_rollout = data.get("rollout_percent", 100)
    try:
        _rollout = int(_raw_rollout)
    except (TypeError, ValueError):
        _rollout = 100
    flag = {
        "id": str(uuid.uuid4()),
        "key": key,
        "name": (data.get("name") or key).strip(),
        "description": (data.get("description") or "").strip(),
        "enabled": bool(data.get("enabled", True)),
        "environments": {e: bool(data.get("environments", {}).get(e, True))
                         for e in DEFAULT_ENVS},
        "rollout_percent": max(0, min(100, _rollout)),
        "users_whitelist": [str(u) for u in (data.get("users_whitelist") or [])],
        "users_blacklist": [str(u) for u in (data.get("users_blacklist") or [])],
        "tags": [str(t) for t in (data.get("tags") or [])],
        "kill_switch": bool(data.get("kill_switch")),
        "created_at": _now(),
        "updated_at": _now(),
    }
    for _field in ("ttl_seconds", "scheduled_expire_at"):
        if data.get(_field) is not None:
            try:
                flag[_field] = int(data[_field])
            except (TypeError, ValueError):
                pass
    items = _load()
    items.append(flag)
    _save(items)
    log_flag_change(key, changes={"enabled": flag["enabled"]})
    return flag


def update_flag(key: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    items = _load()
    flag = next((f for f in items if f["key"] == key), None)
    if not flag:
        return None
    for field in ("name", "description", "tags"):
        if field in patch:
            flag[field] = patch[field]
    for field in ("enabled", "kill_switch"):
        if field in patch:
            flag[field] = bool(patch[field])
    if "rollout_percent" in patch:
        flag["rollout_percent"] = max(0, min(100, int(patch["rollout_percent"])))
    if "environments" in patch and isinstance(patch["environments"], dict):
        for e, v in patch["environments"].items():
            if e in DEFAULT_ENVS:
                flag["environments"][e] = bool(v)
    if "users_whitelist" in patch:
        flag["users_whitelist"] = [str(u) for u in patch["users_whitelist"]]
    if "users_blacklist" in patch:
        flag["users_blacklist"] = [str(u) for u in patch["users_blacklist"]]
    flag["updated_at"] = _now()
    changes = {k: patch[k] for k in patch if k in ("enabled", "kill_switch", "rollout_percent", "environments")}
    _save(items)
    log_flag_change(key, changes=changes)
    return flag


def delete_flag(key: str) -> bool:
    items = _load()
    nxt = [f for f in items if f["key"] != key]
    if len(nxt) == len(items):
        return False
    _save(nxt)
    return True


def evaluate(key: str, env: str = "prod", user: str = "") -> Dict[str, Any]:
    """Evaluate a flag for (env, user). Returns {key, enabled, reason}."""
    flag = get_flag(key)
    if not flag:
        return {"key": key, "enabled": False, "reason": "unknown_flag"}
    if flag.get("kill_switch"):
        return {"key": key, "enabled": False, "reason": "kill_switch"}
    if not flag.get("enabled", False):
        return {"key": key, "enabled": False, "reason": "globally_disabled"}
    # Environment override.
    env_map = flag.get("environments") or {}
    if env in env_map and not env_map[env]:
        return {"key": key, "enabled": False, "reason": f"disabled_in_{env}"}
    # Per-user rules should be checked before rollout percentage.
    if user:
        if user in (flag.get("users_blacklist") or []):
            return {"key": key, "enabled": False, "reason": "blacklisted"}
        if user in (flag.get("users_whitelist") or []):
            return {"key": key, "enabled": True, "reason": "whitelisted"}
    # Percentage rollout.
    try:
        percent = int(flag.get("rollout_percent", 100))
    except (TypeError, ValueError):
        percent = 100
    percent = max(0, min(100, percent))
    if percent >= 100:
        return {"key": key, "enabled": True, "reason": "full_rollout"}
    if percent <= 0:
        return {"key": key, "enabled": False, "reason": "zero_rollout"}
    entity = user or env
    if _bucket(key, entity) < percent * 10:
        return {"key": key, "enabled": True, "reason": "rollout"}
    return {"key": key, "enabled": False, "reason": "rollout"}


def enforcement(flag_key: str, env: str, user: str = "") -> Optional[str]:
    """Return an error message if the flag blocks an operation, else None."""
    res = evaluate(flag_key, env=env, user=user)
    if not res.get("enabled"):
        return None
    return f"Operation blocked by feature flag '{flag_key}' ({res.get('reason')})."
