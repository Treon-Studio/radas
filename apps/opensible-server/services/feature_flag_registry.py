"""Namespaced and scoped feature-flag registry for the RADAS control plane."""
from __future__ import annotations

import time
import uuid
from typing import Any, Dict, List, Optional

from services import feature_flags as legacy


def _history_key(scope_type: str, scope_id: Optional[str]) -> str:
    return f"flag_audit:{scope_type}:{scope_id or 'default'}"


def _append_history(entry: Dict[str, Any], scope_type: str, scope_id: Optional[str]) -> None:
    from storage import kv
    rows = kv.kv_get(_history_key(scope_type, scope_id), "entries") or []
    rows = (rows if isinstance(rows, list) else [])[-999:] + [entry]
    kv.kv_set(_history_key(scope_type, scope_id), "entries", rows)


def audit(scope_type: str = "global", scope_id: Optional[str] = None, key: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    from storage import kv
    rows = kv.kv_get(_history_key(scope_type, scope_id), "entries") or []
    rows = rows if isinstance(rows, list) else []
    if key:
        rows = [row for row in rows if row.get("key") == key]
    return rows[-limit:][::-1]


def cleanup_audit(retention: int = 500) -> int:
    """Trim audit history for every scope to the newest ``retention`` entries.

    Returns the number of scopes pruned. Keeps a bounded, manageable history
    instead of an ever-growing log.
    """
    from storage import kv
    pruned = 0
    for scope in kv.kv_list_scopes(prefix="flag_audit:"):
        rows = kv.kv_get(scope, "entries") or []
        if not isinstance(rows, list) or len(rows) <= retention:
            continue
        kv.kv_set(scope, "entries", rows[-retention:])
        pruned += 1
    return pruned


def _scope(scope_type: str, scope_id: Optional[str]) -> str:
    return f"flags:{(scope_type or 'global').lower()}:{scope_id or 'default'}"


def _load(scope_type: str = "global", scope_id: Optional[str] = None) -> List[Dict[str, Any]]:
    from storage import kv
    value = kv.kv_load(_scope(scope_type, scope_id))
    if isinstance(value, list):
        return value
    # Preserve flags created by the pre-registry global implementation.
    if scope_type == "global" and not scope_id:
        return [dict(flag) for flag in legacy.list_flags()]
    return []


def _save(flags: List[Dict[str, Any]], scope_type: str, scope_id: Optional[str]) -> None:
    from storage import kv
    kv.kv_save(_scope(scope_type, scope_id), flags)


def _decorate(flag: Dict[str, Any], scope_type: str, scope_id: Optional[str]) -> Dict[str, Any]:
    key = str(flag.get("key", ""))
    parts = key.split(".")
    return {
        **flag,
        "namespace": parts[0] if parts else "default",
        "domain": parts[1] if len(parts) >= 3 else "default",
        "resource": parts[-2] if len(parts) >= 3 else key,
        "action": parts[-1] if len(parts) >= 2 else "toggle",
        "type": flag.get("type") or ("safety" if key.startswith("safety.") else "release"),
        "scope_type": scope_type,
        "scope_id": scope_id,
        "parent_key": flag.get("parent_key"),
        "prerequisites": list(flag.get("prerequisites") or []),
        "reason": flag.get("reason", ""),
    }


def list_flags(scope_type: str = "global", scope_id: Optional[str] = None, effective: bool = False) -> List[Dict[str, Any]]:
    own = {f["key"]: _decorate(f, scope_type, scope_id) for f in _load(scope_type, scope_id)}
    if effective and scope_type != "global":
        merged = {f["key"]: _decorate(f, "global", None) for f in _load("global")}
        merged.update(own)
        return list(merged.values())
    return list(own.values())


def get_flag(key: str, scope_type: str = "global", scope_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    key = (key or "").strip()
    return next((flag for flag in list_flags(scope_type, scope_id) if flag["key"] == key), None)


def create_flag(data: Dict[str, Any], scope_type: str = "global", scope_id: Optional[str] = None, actor: str = "") -> Dict[str, Any]:
    key = (data.get("key") or "").strip().lower().replace(" ", "-")
    if len(key) < 2:
        raise ValueError("Flag key must be at least 2 chars")
    if get_flag(key, scope_type, scope_id):
        raise ValueError(f"Flag '{key}' already exists")
    now = int(time.time())
    raw_rollout = data.get("rollout_percent", 100)
    try:
        rollout = max(0, min(100, int(raw_rollout)))
    except (TypeError, ValueError):
        rollout = 100
    flag = {
        "id": str(uuid.uuid4()),
        "key": key,
        "name": (data.get("name") or key).strip(),
        "description": (data.get("description") or "").strip(),
        "enabled": bool(data.get("enabled", True)),
        "environments": {env: bool((data.get("environments") or {}).get(env, True)) for env in legacy.DEFAULT_ENVS},
        "rollout_percent": rollout,
        "users_whitelist": [str(v) for v in (data.get("users_whitelist") or [])],
        "users_blacklist": [str(v) for v in (data.get("users_blacklist") or [])],
        "tags": [str(v) for v in (data.get("tags") or [])],
        "kill_switch": bool(data.get("kill_switch")),
        "namespace": key.split(".", 1)[0] if "." in key else "default",
        "domain": key.split(".")[1] if len(key.split(".")) >= 3 else "default",
        "resource": key.split(".")[-2] if len(key.split(".")) >= 3 else key,
        "action": key.split(".")[-1] if "." in key else "toggle",
        "type": data.get("type") or ("safety" if key.startswith("safety.") else "release"),
        "scope_type": scope_type,
        "scope_id": scope_id,
        "parent_key": data.get("parent_key"),
        "prerequisites": [str(v) for v in (data.get("prerequisites") or [])],
        "reason": (data.get("reason") or "").strip(),
        "owner_id": data.get("owner_id") or actor or None,
        "created_at": now,
        "updated_at": now,
    }
    for field in ("ttl_seconds", "scheduled_expire_at"):
        if data.get(field) is not None:
            try:
                flag[field] = int(data[field])
            except (TypeError, ValueError):
                pass
    flags = _load(scope_type, scope_id)
    flags.append(flag)
    _save(flags, scope_type, scope_id)
    _append_history({"operation": "create", "key": key, "actor": actor or "system", "at": now, "after": flag}, scope_type, scope_id)
    return _decorate(flag, scope_type, scope_id)


def update_flag(key: str, patch: Dict[str, Any], scope_type: str = "global", scope_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    flags = _load(scope_type, scope_id)
    flag = next((item for item in flags if item.get("key") == key), None)
    before = dict(flag) if flag else None
    if not flag:
        return None
    for field in ("name", "description", "tags", "parent_key", "prerequisites", "reason", "type"):
        if field in patch:
            flag[field] = patch[field]
    for field in ("enabled", "kill_switch"):
        if field in patch:
            flag[field] = bool(patch[field])
    if "rollout_percent" in patch:
        flag["rollout_percent"] = max(0, min(100, int(patch["rollout_percent"])))
    if isinstance(patch.get("environments"), dict):
        for env, value in patch["environments"].items():
            if env in legacy.DEFAULT_ENVS:
                flag.setdefault("environments", {})[env] = bool(value)
    for field in ("users_whitelist", "users_blacklist"):
        if field in patch:
            flag[field] = [str(v) for v in patch[field]]
    flag["updated_at"] = int(time.time())
    _save(flags, scope_type, scope_id)
    _append_history({"operation": "update", "key": key, "actor": "system", "at": int(time.time()), "before": before, "after": flag}, scope_type, scope_id)
    return _decorate(flag, scope_type, scope_id)


def delete_flag(key: str, scope_type: str = "global", scope_id: Optional[str] = None) -> bool:
    flags = _load(scope_type, scope_id)
    remaining = [item for item in flags if item.get("key") != key]
    if len(remaining) == len(flags):
        return False
    _save(remaining, scope_type, scope_id)
    _append_history({"operation": "delete", "key": key, "actor": "system", "at": int(time.time()), "before": next((item for item in flags if item.get("key") == key), None)}, scope_type, scope_id)
    return True


def evaluate(key: str, env: str = "prod", user: str = "", project_id: Optional[str] = None, org_id: Optional[str] = None) -> Dict[str, Any]:
    matched: Optional[Dict[str, Any]] = None
    matched_scope = "global:default"
    for scope_type, scope_id in (("project", project_id), ("organization", org_id), ("global", None)):
        if scope_type != "global" and not scope_id:
            continue
        matched = get_flag(key, scope_type, scope_id)
        if matched:
            matched_scope = _scope(scope_type, scope_id)
            break
    if not matched:
        return {**legacy.evaluate(key, env=env, user=user), "source": "legacy-global", "matched_scope": matched_scope}

    base = {"key": key, "source": matched["scope_type"], "matched_scope": matched_scope}
    if matched.get("parent_key") and not evaluate(matched["parent_key"], env, user, project_id, org_id).get("enabled"):
        return {**base, "enabled": False, "reason": "parent_disabled"}
    for prerequisite in matched.get("prerequisites") or []:
        if not evaluate(prerequisite, env, user, project_id, org_id).get("enabled"):
            return {**base, "enabled": False, "reason": "missing_prerequisite", "requires": prerequisite}
    if matched.get("kill_switch"):
        return {**base, "enabled": False, "reason": "kill_switch"}
    if not matched.get("enabled", False):
        return {**base, "enabled": False, "reason": "globally_disabled"}
    if (matched.get("environments") or {}).get(env) is False:
        return {**base, "enabled": False, "reason": f"disabled_in_{env}"}
    if user and user in (matched.get("users_blacklist") or []):
        return {**base, "enabled": False, "reason": "blacklisted"}
    if user and user in (matched.get("users_whitelist") or []):
        return {**base, "enabled": True, "reason": "whitelisted"}
    percent = max(0, min(100, int(matched.get("rollout_percent", 100))))
    if percent >= 100:
        return {**base, "enabled": True, "reason": "full_rollout"}
    if percent <= 0:
        return {**base, "enabled": False, "reason": "zero_rollout"}
    enabled = legacy._bucket(key, user or env) < percent * 10
    return {**base, "enabled": enabled, "reason": "rollout"}
