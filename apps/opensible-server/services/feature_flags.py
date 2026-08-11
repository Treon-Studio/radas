"""Feature flags (Fase 6 — UC 113+).

Flag store + evaluation engine: global on/off, per-environment overrides,
percentage rollout (deterministic hash), user whitelist/blacklist, optional
kill-switch. Flags are enforced at stack actions (e.g. `block_apply`) and can
be evaluated via API for console previews / progressive delivery.
"""
from __future__ import annotations

import hashlib
import json
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

DEFAULT_ENVS = ("dev", "staging", "prod", "preview")


def _store_path() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "feature_flags.json"
    except Exception:
        return Path("data") / "feature_flags.json"


def _load() -> List[Dict[str, Any]]:
    try:
        p = _store_path()
        if p.exists():
            d = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(d, list):
                return d
    except Exception:
        pass
    return []


def _save(items: List[Dict[str, Any]]) -> None:
    p = _store_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(items, indent=2), encoding="utf-8")


def _now() -> int:
    return int(time.time())


def _bucket(key: str, entity: str) -> int:
    """Deterministic 0..999 bucket for percentage rollout."""
    digest = hashlib.sha256(f"{key}:{entity}".encode("utf-8")).hexdigest()
    return int(digest[:6], 16) % 1000


def list_flags() -> List[Dict[str, Any]]:
    return _load()


def get_flag(key: str) -> Optional[Dict[str, Any]]:
    key = (key or "").strip()
    return next((f for f in _load() if f["key"] == key), None)


def create_flag(data: Dict[str, Any]) -> Dict[str, Any]:
    key = (data.get("key") or "").strip().lower().replace(" ", "-")
    if not key or len(key) < 2:
        raise ValueError("Flag key must be at least 2 chars")
    if get_flag(key):
        raise ValueError(f"Flag '{key}' already exists")
    flag = {
        "id": str(uuid.uuid4()),
        "key": key,
        "name": (data.get("name") or key).strip(),
        "description": (data.get("description") or "").strip(),
        "enabled": bool(data.get("enabled", True)),
        "environments": {e: bool(data.get("environments", {}).get(e, True))
                         for e in DEFAULT_ENVS},
        "rollout_percent": max(0, min(100, int(data.get("rollout_percent") or 100))),
        "users_whitelist": [str(u) for u in (data.get("users_whitelist") or [])],
        "users_blacklist": [str(u) for u in (data.get("users_blacklist") or [])],
        "tags": [str(t) for t in (data.get("tags") or [])],
        "kill_switch": bool(data.get("kill_switch")),
        "created_at": _now(),
        "updated_at": _now(),
    }
    items = _load()
    items.append(flag)
    _save(items)
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
    _save(items)
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
    # Per-user rules.
    if user:
        if user in (flag.get("users_blacklist") or []):
            return {"key": key, "enabled": False, "reason": "blacklisted"}
        if user in (flag.get("users_whitelist") or []):
            return {"key": key, "enabled": True, "reason": "whitelisted"}
    # Percentage rollout.
    percent = int(flag.get("rollout_percent") or 100)
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
