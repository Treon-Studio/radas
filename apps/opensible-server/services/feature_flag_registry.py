"""Namespaced and scoped feature-flag registry for the RADAS control plane."""
from __future__ import annotations

import copy
import re
import time
import uuid
from typing import Any, Dict, Iterable, List, Optional, Tuple

from services import feature_flags as legacy


_KEY_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
_EVALUATION_CACHE: Dict[Tuple[str, str, str, Optional[str], Optional[str]], Tuple[float, Dict[str, Any]]] = {}


def _dispatch_flag_notification(
    event_type: str,
    key: Any,
    operation: str,
    actor: str = "",
    actor_name: str = "",
    scope_type: str = "global",
    scope_id: Optional[str] = None,
    changes: Optional[Dict[str, Any]] = None,
    flag: Optional[Dict[str, Any]] = None,
    **extra: Any,
) -> None:
    """Safely attempt to record notification to notification system for team awareness."""
    try:
        from services import notification_service
        # Non-blocking notification dispatch
        payload = {
            "event": event_type,
            "key": key,
            "operation": operation,
            "actor": actor or "system",
            "actor_name": actor_name or "",
            "scope_type": scope_type,
            "scope_id": scope_id,
            "changes": changes,
            "flag": flag,
            "timestamp": int(time.time()),
            **extra,
        }
        if hasattr(notification_service, "dispatch_event"):
            notification_service.dispatch_event(event_type, payload)
    except Exception:
        # Non-blocking: never raise exceptions or fail flag operations
        pass


def _dispatch_flag_webhook(
    event_type: str,
    key: Any,
    operation: str,
    scope_type: str = "global",
    scope_id: Optional[str] = None,
    actor: str = "",
    actor_name: str = "",
    changes: Optional[Dict[str, Any]] = None,
    flag: Optional[Dict[str, Any]] = None,
    **extra: Any,
) -> None:
    """Safely dispatch outbound webhooks and team notifications on feature flag mutations."""
    # First trigger team notification
    _dispatch_flag_notification(
        event_type=event_type,
        key=key,
        operation=operation,
        actor=actor,
        actor_name=actor_name,
        scope_type=scope_type,
        scope_id=scope_id,
        changes=changes,
        flag=flag,
        **extra,
    )
    try:
        from services import webhook_dispatcher
        payload = {
            "event": event_type,
            "key": key,
            "operation": operation,
            "scope_type": scope_type,
            "scope_id": scope_id,
            "actor": actor or "system",
            "actor_name": actor_name or "",
            "timestamp": int(time.time()),
            "changes": changes,
            "flag": flag,
            **extra,
        }
        # Dispatch specific event (e.g. flag.created, flag.updated, flag.deleted, flag.rollback, flag.copied, flag.imported)
        webhook_dispatcher.dispatch_event(event_type, payload)
        # Dispatch generic event (flag.changed)
        if event_type != "flag.changed":
            changed_payload = dict(payload)
            changed_payload["event"] = "flag.changed"
            webhook_dispatcher.dispatch_event("flag.changed", changed_payload)
    except Exception:
        # Non-blocking: never raise exceptions or fail flag operations
        pass



def _history_key(scope_type: str, scope_id: Optional[str]) -> str:
    return f"flag_audit:{scope_type}:{scope_id or 'default'}"


def _append_history(entry: Dict[str, Any], scope_type: str, scope_id: Optional[str]) -> None:
    from storage import kv
    entry.setdefault("id", str(uuid.uuid4()))
    rows = kv.kv_get(_history_key(scope_type, scope_id), "entries") or []
    rows = (rows if isinstance(rows, list) else [])[-999:] + [entry]
    kv.kv_set(_history_key(scope_type, scope_id), "entries", rows)


def _append_history_tx(conn: Any, entry: Dict[str, Any], scope_type: str, scope_id: Optional[str]) -> None:
    """Append audit history on the caller's transaction connection."""
    from storage import kv
    entry.setdefault("id", str(uuid.uuid4()))
    scope = _history_key(scope_type, scope_id)
    row = conn.execute("SELECT value FROM kv_store WHERE scope = %s AND key = %s", (scope, "entries")).fetchone()
    current = row["value"] if isinstance(row, dict) else (row[0] if row else None)
    rows = (current if isinstance(current, list) else [])[-999:] + [entry]
    kv.kv_save_tx(conn, scope, {"entries": rows})


def _diff(before: Optional[Dict[str, Any]], after: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Field-level before/after diff between two flag states (nested envs aware)."""
    before = before or {}
    after = after or {}
    changes: Dict[str, Any] = {}
    for field in sorted(set(before) | set(after)):
        b, a = before.get(field), after.get(field)
        if field == "environments" and isinstance(b, dict) and isinstance(a, dict):
            env_changes = {
                env: {"before": b.get(env), "after": a.get(env)}
                for env in set(b) | set(a) if b.get(env) != a.get(env)
            }
            if env_changes:
                changes[field] = env_changes
        elif b != a:
            changes[field] = {"before": b, "after": a}
    return changes


def audit(scope_type: str = "global", scope_id: Optional[str] = None, key: Optional[str] = None,
          limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    from storage import kv
    rows = kv.kv_get(_history_key(scope_type, scope_id), "entries") or []
    rows = rows if isinstance(rows, list) else []
    if key:
        rows = [row for row in rows if row.get("key") == key]
    end = max(0, len(rows) - offset)
    return rows[max(0, end - limit):end][::-1]


def cleanup_audit(retention: int = 500) -> int:
    """Trim every audit scope to its newest ``retention`` entries."""
    from storage import kv
    pruned = 0
    for scope in kv.kv_list_scopes(prefix="flag_audit:"):
        rows = kv.kv_get(scope, "entries") or []
        if isinstance(rows, list) and len(rows) > retention:
            kv.kv_set(scope, "entries", rows[-retention:])
            pruned += 1
    return pruned


def _scope(scope_type: str, scope_id: Optional[str]) -> str:
    return f"flags:{(scope_type or 'global').lower()}:{scope_id or 'default'}"


def _normalize_key(value: Any, label: str = "Flag key") -> str:
    if not isinstance(value, str):
        raise ValueError(f"{label} must be a non-empty string")
    key = value.strip().lower()
    key = re.sub(r"\s+", "-", key)
    if len(key) < 2:
        raise ValueError(f"{label} must be at least 2 chars")
    if len(key) > 128:
        raise ValueError(f"{label} must be at most 128 chars")
    if not _KEY_RE.fullmatch(key):
        raise ValueError(f"{label} is malformed")
    return key


def _load_registry(scope_type: str = "global", scope_id: Optional[str] = None) -> List[Dict[str, Any]]:
    from storage import kv
    value = kv.kv_load(_scope(scope_type, scope_id))
    return value if isinstance(value, list) else []


def _load(scope_type: str = "global", scope_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Load a visible scope, retaining legacy global entries after registry writes.

    Registry entries take precedence over legacy entries with the same logical key.
    Legacy storage is never mutated; registry tombstones hide legacy records deleted
    through this API.
    """
    registry = _load_registry(scope_type, scope_id)
    if scope_type != "global" or scope_id:
        return registry
    merged = {str(flag.get("key", "")): dict(flag) for flag in legacy.list_flags() if isinstance(flag, dict)}
    for flag in registry:
        if not isinstance(flag, dict):
            continue
        key = str(flag.get("key", ""))
        if flag.get("_deleted"):
            merged.pop(key, None)
        else:
            merged[key] = dict(flag)
    return list(merged.values())


def _save(flags: List[Dict[str, Any]], scope_type: str, scope_id: Optional[str]) -> None:
    from storage import kv
    kv.kv_save(_scope(scope_type, scope_id), flags)


def _save_tx(conn: Any, flags: List[Dict[str, Any]], scope_type: str, scope_id: Optional[str]) -> None:
    from storage import kv
    kv.kv_save_tx(conn, _scope(scope_type, scope_id), flags)


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


def _scope_chain(scope_type: str, scope_id: Optional[str], org_id: Optional[str] = None) -> List[Tuple[str, Optional[str]]]:
    scope_type = (scope_type or "global").lower()
    if scope_type == "project":
        result: List[Tuple[str, Optional[str]]] = [("project", scope_id)] if scope_id else []
        if org_id:
            result.append(("organization", org_id))
        return result + [("global", None)]
    if scope_type == "organization":
        return ([("organization", scope_id)] if scope_id else []) + [("global", None)]
    return [("global", None)]


def _effective_records(scope_type: str, scope_id: Optional[str], org_id: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
    merged: Dict[str, Dict[str, Any]] = {}
    for current_type, current_id in reversed(_scope_chain(scope_type, scope_id, org_id)):
        for flag in _load(current_type, current_id):
            if isinstance(flag, dict) and flag.get("key"):
                merged[str(flag["key"])] = _decorate(flag, current_type, current_id)
    return merged


def list_flags(scope_type: str = "global", scope_id: Optional[str] = None, effective: bool = False,
               org_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return a scope's flags; effective project listings may include its org.

    ``org_id`` is optional for backward compatibility with callers that only know a
    project id. When supplied, the returned precedence exactly matches evaluate().
    """
    if effective:
        return list(_effective_records(scope_type, scope_id, org_id).values())
    return list({
        str(flag.get("key", "")): _decorate(flag, scope_type, scope_id)
        for flag in _load(scope_type, scope_id) if isinstance(flag, dict) and flag.get("key")
    }.values())


def get_flag(key: str, scope_type: str = "global", scope_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    try:
        key = _normalize_key(key)
    except ValueError:
        return None
    return next((flag for flag in list_flags(scope_type, scope_id) if flag["key"] == key), None)


def _normalize_relationships(data: Dict[str, Any], key: str, existing: Optional[Dict[str, Any]] = None) -> Tuple[Optional[str], List[str]]:
    parent_raw = data["parent_key"] if "parent_key" in data else (existing or {}).get("parent_key")
    if parent_raw is None:
        parent = None
    else:
        parent = _normalize_key(parent_raw, "Parent key")
    prerequisites_raw = data["prerequisites"] if "prerequisites" in data else (existing or {}).get("prerequisites", [])
    if prerequisites_raw is None:
        prerequisites_raw = []
    if not isinstance(prerequisites_raw, (list, tuple)):
        raise ValueError("Prerequisites must be a list of flag keys")
    prerequisites = [_normalize_key(value, "Prerequisite key") for value in prerequisites_raw]
    if parent == key or key in prerequisites:
        raise ValueError(f"Flag '{key}' cannot reference itself")
    if len(set(prerequisites)) != len(prerequisites):
        raise ValueError("Duplicate prerequisite flag keys are not allowed")
    if parent and parent in prerequisites:
        raise ValueError("A parent flag cannot also be a prerequisite")
    return parent, prerequisites


def _resolve_effective(key: str, scope_type: str, scope_id: Optional[str], org_id: Optional[str],
                       candidate: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    records = _effective_records(scope_type, scope_id, org_id)
    if candidate and candidate.get("key"):
        records[str(candidate["key"])] = _decorate(candidate, scope_type, scope_id)
    return records.get(key)


def _validate_dependency_graph(candidate: Dict[str, Any], scope_type: str, scope_id: Optional[str],
                               org_id: Optional[str]) -> None:
    """Validate all candidate-reachable dependency gates before persistent mutation."""
    visited: set[str] = set()
    visiting: List[str] = []

    def walk(key: str) -> None:
        if key in visiting:
            start = visiting.index(key)
            raise ValueError(f"Dependency cycle detected: {' -> '.join(visiting[start:] + [key])}")
        if key in visited:
            return
        flag = _resolve_effective(key, scope_type, scope_id, org_id, candidate)
        if not flag:
            # The root can only be missing due to a caller bug; relationship errors
            # are reported by the parent below with their specific relationship.
            raise ValueError(f"Unknown dependency flag '{key}'")
        visiting.append(key)
        for relationship, dependency in (("parent", flag.get("parent_key")),):
            if dependency:
                target = _resolve_effective(dependency, scope_type, scope_id, org_id, candidate)
                if not target:
                    raise ValueError(f"Unknown parent flag '{dependency}'")
                walk(dependency)
        for dependency in flag.get("prerequisites") or []:
            target = _resolve_effective(dependency, scope_type, scope_id, org_id, candidate)
            if not target:
                raise ValueError(f"Unknown prerequisite flag '{dependency}'")
            walk(dependency)
        visiting.pop()
        visited.add(key)

    walk(str(candidate["key"]))


def _new_flag(data: Dict[str, Any], scope_type: str, scope_id: Optional[str], actor: str = "") -> Dict[str, Any]:
    """Normalize a new registry record without persisting it."""
    key = _normalize_key(data.get("key"))
    parent, prerequisites = _normalize_relationships(data, key)
    now = int(time.time())
    try:
        rollout = max(0, min(100, int(data.get("rollout_percent", 100))))
    except (TypeError, ValueError):
        rollout = 100
    flag = {
        "id": str(uuid.uuid4()), "key": key, "name": (data.get("name") or key).strip()[:128],
        "description": (data.get("description") or "").strip(), "enabled": bool(data.get("enabled", True)),
        "environments": {env: bool((data.get("environments") or {}).get(env, True)) for env in legacy.DEFAULT_ENVS},
        "rollout_percent": rollout, "users_whitelist": [str(v) for v in (data.get("users_whitelist") or [])],
        "users_blacklist": [str(v) for v in (data.get("users_blacklist") or [])], "tags": [str(v) for v in (data.get("tags") or [])],
        "kill_switch": bool(data.get("kill_switch")), "namespace": key.split(".", 1)[0] if "." in key else "default",
        "domain": key.split(".")[1] if len(key.split(".")) >= 3 else "default", "resource": key.split(".")[-2] if len(key.split(".")) >= 3 else key,
        "action": key.split(".")[-1] if "." in key else "toggle", "type": data.get("type") or ("safety" if key.startswith("safety.") else "release"),
        "scope_type": scope_type, "scope_id": scope_id, "parent_key": parent, "prerequisites": prerequisites,
        "reason": (data.get("reason") or "").strip(), "owner_id": data.get("owner_id") or actor or None,
        "created_at": now, "updated_at": now,
    }
    variants = data.get("variants")
    if variants is not None:
        if not isinstance(variants, list) or not variants or len(variants) > 20:
            raise ValueError("variants must contain 1-20 entries")
        normalized_variants = []
        total_weight = 0
        for variant in variants:
            if not isinstance(variant, dict) or not str(variant.get("key", "")).strip():
                raise ValueError("each variant requires a key")
            weight = int(variant.get("weight", 0))
            if weight < 0:
                raise ValueError("variant weight must be non-negative")
            normalized_variants.append({"key": str(variant["key"]).strip(), "weight": weight})
            total_weight += weight
        if total_weight != 100:
            raise ValueError("variant weights must total 100")
        flag["variants"] = normalized_variants
    if data.get("evaluation_cache_ttl_seconds") is not None:
        try:
            flag["evaluation_cache_ttl_seconds"] = max(0, min(300, int(data["evaluation_cache_ttl_seconds"])))
        except (TypeError, ValueError):
            raise ValueError("evaluation_cache_ttl_seconds must be an integer")
    for field in ("ttl_seconds", "scheduled_expire_at"):
        if data.get(field) is not None:
            try:
                flag[field] = int(data[field])
            except (TypeError, ValueError):
                pass
    return flag


def create_flag(data: Dict[str, Any], scope_type: str = "global", scope_id: Optional[str] = None,
                actor: str = "", actor_name: str = "", org_id: Optional[str] = None) -> Dict[str, Any]:
    flag = _new_flag(data, scope_type, scope_id, actor)
    key = flag["key"]
    # A legacy global entry does not block its namespaced registry successor.
    if any(item.get("key") == key for item in _load_registry(scope_type, scope_id)):
        raise ValueError(f"Flag '{key}' already exists")
    _validate_dependency_graph(flag, scope_type, scope_id, org_id)
    flags = _load_registry(scope_type, scope_id)
    flags.append(flag)
    _save(flags, scope_type, scope_id)
    _EVALUATION_CACHE.clear()
    _append_history({"operation": "create", "key": key, "actor": actor or "system", "actor_name": actor_name or "", "at": flag["created_at"], "after": flag, "scope_type": scope_type, "scope_id": scope_id}, scope_type, scope_id)
    decorated = _decorate(flag, scope_type, scope_id)
    _dispatch_flag_webhook("flag.created", key, "create", scope_type=scope_type, scope_id=scope_id, actor=actor, actor_name=actor_name, flag=decorated)
    return decorated


def _registry_index(flags: List[Dict[str, Any]], key: str) -> Optional[int]:
    return next((i for i, item in enumerate(flags)
                 if item.get("key") == key and not item.get("_deleted")), None)


def _materialize_legacy_global(key: str) -> bool:
    """Copy a visible legacy global flag into the registry without changing legacy storage."""
    flags = _load_registry("global", None)
    if _registry_index(flags, key) is not None:
        return True
    if any(item.get("key") == key and item.get("_deleted") for item in flags):
        return False
    legacy_flag = next((item for item in legacy.list_flags() if item.get("key") == key), None)
    if not legacy_flag:
        return False
    materialized = copy.deepcopy(legacy_flag)
    materialized["_legacy_materialized"] = True
    flags.append(materialized)
    _save(flags, "global", None)
    return True


def update_flag(key: str, patch: Dict[str, Any], scope_type: str = "global", scope_id: Optional[str] = None,
                actor: str = "", actor_name: str = "", operation: str = "update", org_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    try:
        key = _normalize_key(key)
    except ValueError:
        return None
    flags = _load_registry(scope_type, scope_id)
    index = _registry_index(flags, key)
    if index is None:
        if scope_type != "global" or scope_id:
            return None
        if any(item.get("key") == key and item.get("_deleted") for item in flags):
            return None
        legacy_flag = next((item for item in legacy.list_flags() if item.get("key") == key), None)
        if not legacy_flag:
            return None
        materialized = copy.deepcopy(legacy_flag)
        materialized["_legacy_materialized"] = True
        flags.append(materialized)
        index = len(flags) - 1
    before = copy.deepcopy(flags[index])
    if before.get("archived") and patch.get("enabled") is True:
        raise ValueError("archived flags cannot be enabled; restore first")
    candidate = copy.deepcopy(before)
    for field in ("name", "description", "tags", "reason", "type"):
        if field in patch:
            candidate[field] = patch[field]
    if "rollout_schedule" in patch:
        schedule = patch["rollout_schedule"]
        if not isinstance(schedule, list) or len(schedule) > 10:
            raise ValueError("rollout_schedule must contain 1-10 entries")
        candidate["rollout_schedule"] = [{"rollout_percent": max(0, min(100, int(item["rollout_percent"]))), "at": max(0, int(item["at"]))} for item in schedule]
        if any(left["rollout_percent"] > right["rollout_percent"] or left["at"] > right["at"] for left, right in zip(candidate["rollout_schedule"], candidate["rollout_schedule"][1:])):
            raise ValueError("rollout_schedule must be ordered")
    if "working_hours" in patch:
        hours = patch["working_hours"]
        if not isinstance(hours, dict) or not {"start", "end"}.issubset(hours):
            raise ValueError("working_hours requires start and end")
        candidate["working_hours"] = {"start": max(0, min(23, int(hours["start"]))), "end": max(0, min(23, int(hours["end"]))) }
    for field in ("ttl_seconds", "scheduled_expire_at"):
        if field in patch:
            if patch[field] is None:
                candidate.pop(field, None)
            else:
                candidate[field] = int(patch[field])
    if "archived" in patch:
        candidate["archived"] = bool(patch["archived"])
    parent, prerequisites = _normalize_relationships(patch, key, candidate)
    candidate["parent_key"] = parent
    candidate["prerequisites"] = prerequisites
    for field in ("enabled", "kill_switch"):
        if field in patch:
            candidate[field] = bool(patch[field])
    if "rollout_percent" in patch:
        candidate["rollout_percent"] = max(0, min(100, int(patch["rollout_percent"])))
    if isinstance(patch.get("environments"), dict):
        for env, value in patch["environments"].items():
            if env in legacy.DEFAULT_ENVS:
                candidate.setdefault("environments", {})[env] = bool(value)
    for field in ("users_whitelist", "users_blacklist"):
        if field in patch:
            candidate[field] = [str(v) for v in patch[field]]
    candidate["updated_at"] = int(time.time())
    _validate_dependency_graph(candidate, scope_type, scope_id, org_id)
    flags[index] = candidate
    _save(flags, scope_type, scope_id)
    _EVALUATION_CACHE.clear()
    _append_history({"operation": operation, "key": key, "actor": actor or "system", "actor_name": actor_name or "", "at": int(time.time()), "before": before, "after": candidate, "changes": _diff(before, candidate), "scope_type": scope_type, "scope_id": scope_id}, scope_type, scope_id)
    decorated = _decorate(candidate, scope_type, scope_id)
    changes = _diff(before, candidate)
    op_events = {
        "rollback": "flag.rollback",
        "archive": "flag.archived",
        "restore": "flag.restored",
    }
    event_type = op_events.get(operation, "flag.updated")
    _dispatch_flag_webhook(event_type, key, operation, scope_type=scope_type, scope_id=scope_id, actor=actor, actor_name=actor_name, changes=changes, flag=decorated)
    return decorated



def delete_flag(key: str, scope_type: str = "global", scope_id: Optional[str] = None, actor: str = "",
                actor_name: str = "", org_id: Optional[str] = None) -> bool:
    try:
        key = _normalize_key(key)
    except ValueError:
        return False
    visible = get_flag(key, scope_type, scope_id)
    if not visible:
        return False
    if not visible.get("archived"):
        raise ValueError("Flag must be archived before permanent deletion")
    if find_dependents(key, scope_type, scope_id, org_id):
        raise ValueError("Flag has dependents and cannot be deleted")
    if scope_type == "global" and not scope_id and not _materialize_legacy_global(key):
        return False
    flags = _load_registry(scope_type, scope_id)
    index = _registry_index(flags, key)
    if index is None:
        return False
    removed = copy.deepcopy(flags[index])
    if removed.get("_legacy_materialized"):
        # Keep a registry tombstone so the unchanged legacy source stays hidden.
        flags[index] = {"key": key, "_deleted": True}
    else:
        flags.pop(index)
    _save(flags, scope_type, scope_id)
    _append_history({"operation": "delete", "key": key, "actor": actor or "system", "actor_name": actor_name or "", "at": int(time.time()), "before": removed, "scope_type": scope_type, "scope_id": scope_id}, scope_type, scope_id)
    _dispatch_flag_webhook("flag.deleted", key, "delete", scope_type=scope_type, scope_id=scope_id, actor=actor, actor_name=actor_name, flag=visible)
    return True



def _validate_batch_dependency_graph(flags: List[Dict[str, Any]], scope_type: str, scope_id: Optional[str],
                                     org_id: Optional[str]) -> None:
    """Validate prospective records as one visible graph, allowing forward references."""
    candidates = {str(flag["key"]): flag for flag in flags}
    if len(candidates) != len(flags):
        raise ValueError("Duplicate flag keys in import batch")
    existing = _effective_records(scope_type, scope_id, org_id)
    existing.update({key: _decorate(flag, scope_type, scope_id) for key, flag in candidates.items()})
    visiting: List[str] = []
    visited: set[str] = set()

    def walk(key: str) -> None:
        if key in visiting:
            start = visiting.index(key)
            raise ValueError(f"Dependency cycle detected: {' -> '.join(visiting[start:] + [key])}")
        if key in visited:
            return
        flag = existing.get(key)
        if not flag:
            raise ValueError(f"Unknown dependency flag '{key}'")
        visiting.append(key)
        parent = flag.get("parent_key")
        if parent:
            if parent not in existing:
                raise ValueError(f"Unknown parent flag '{parent}'")
            walk(parent)
        for prerequisite in flag.get("prerequisites") or []:
            if prerequisite not in existing:
                raise ValueError(f"Unknown prerequisite flag '{prerequisite}'")
            walk(prerequisite)
        visiting.pop()
        visited.add(key)

    for key in candidates:
        walk(key)


def export_flags(scope_type: str = "global", scope_id: Optional[str] = None,
                 org_id: Optional[str] = None) -> Dict[str, Any]:
    """Export decorated feature flags for a given scope."""
    flags = list_flags(scope_type, scope_id, org_id=org_id)
    return {
        "flags": flags,
        "scope_type": scope_type,
        "scope_id": scope_id,
        "exported_at": int(time.time()),
        "version": "1.0",
    }


def export_flags_env(scope_type: str = "global", scope_id: Optional[str] = None,
                     prefix: str = "FF_", env: str = "prod", user_id: str = "",
                     org_id: Optional[str] = None) -> str:
    """Export evaluated feature flags as .env key-value pairs."""
    flags = list_flags(scope_type, scope_id, effective=True, org_id=org_id)
    pref = prefix if prefix is not None else "FF_"
    lines: List[str] = []
    sorted_flags = sorted(flags, key=lambda f: str(f.get("key", "")).lower())
    for flag in sorted_flags:
        if not isinstance(flag, dict) or not flag.get("key"):
            continue
        key = str(flag["key"])
        evaluation = evaluate(
            key,
            env=env or "prod",
            user=user_id or "",
            project_id=scope_id if scope_type == "project" else None,
            org_id=org_id,
        )
        is_enabled = bool(evaluation.get("enabled", False))
        val_str = "true" if is_enabled else "false"
        formatted_key = f"{pref}{key.replace('.', '_').replace('-', '_').upper()}"
        lines.append(f"{formatted_key}={val_str}")
    return "\n".join(lines)


def import_flags(data: Any, scope_type: str = "global", scope_id: Optional[str] = None,
                 actor: str = "", actor_name: str = "", org_id: Optional[str] = None,
                 overwrite: bool = False) -> Dict[str, Any]:
    """Atomically persist a validated import batch; nothing is written on failure."""
    if isinstance(data, dict) and "flags" in data:
        items = data["flags"]
    elif isinstance(data, list):
        items = data
    else:
        raise ValueError("flags must be a list or object containing a flags array")

    if not isinstance(items, list):
        raise ValueError("flags must be a list")
    if not all(isinstance(item, dict) for item in items):
        raise ValueError("Every imported flag must be an object")

    raw_candidates = [_new_flag(item, scope_type, scope_id, actor) for item in items]
    import_keys = [flag["key"] for flag in raw_candidates]
    if len(import_keys) != len(set(import_keys)):
        raise ValueError("Duplicate flag keys in import batch")

    current = _load_registry(scope_type, scope_id)
    current_keys = {str(item.get("key")) for item in current if isinstance(item, dict) and not item.get("_deleted")}
    batch_id = str(uuid.uuid4())
    now = int(time.time())

    if not overwrite:
        if any(flag["key"] in current_keys for flag in raw_candidates):
            raise ValueError("An imported flag already exists")
        _validate_batch_dependency_graph(raw_candidates, scope_type, scope_id, org_id)
        if not raw_candidates:
            return {"batch_id": batch_id, "flags": [], "imported_count": 0, "overwritten_count": 0}
        from storage import pg
        with pg.transaction() as conn:
            _save_tx(conn, current + raw_candidates, scope_type, scope_id)
            for flag in raw_candidates:
                _append_history_tx(
                    conn,
                    {"operation": "import", "batch_id": batch_id, "key": flag["key"], "actor": actor or "system",
                     "actor_name": actor_name or "", "at": now, "after": flag,
                     "scope_type": scope_type, "scope_id": scope_id},
                    scope_type,
                    scope_id,
                )
        _EVALUATION_CACHE.clear()
        decorated_flags = [_decorate(flag, scope_type, scope_id) for flag in raw_candidates]
        _dispatch_flag_webhook("flag.imported", import_keys, "import", scope_type=scope_type, scope_id=scope_id, actor=actor, actor_name=actor_name, flags=decorated_flags, count=len(raw_candidates))
        return {
            "batch_id": batch_id,
            "flags": decorated_flags,
            "imported_count": len(raw_candidates),
            "overwritten_count": 0,
        }

    # overwrite=True handling
    new_flags = []
    updated_entries = []
    updated_current = copy.deepcopy(current)

    for item, candidate in zip(items, raw_candidates):
        key = candidate["key"]
        idx = _registry_index(updated_current, key)
        if idx is not None:
            before = copy.deepcopy(updated_current[idx])
            after = copy.deepcopy(candidate)
            after["id"] = before.get("id", after["id"])
            after["created_at"] = before.get("created_at", after["created_at"])
            after["updated_at"] = now
            updated_current[idx] = after
            updated_entries.append((before, after))
        else:
            new_flags.append(candidate)
            updated_current.append(candidate)

    all_processed = [entry[1] for entry in updated_entries] + new_flags
    _validate_batch_dependency_graph(all_processed, scope_type, scope_id, org_id)

    from storage import pg
    with pg.transaction() as conn:
        _save_tx(conn, updated_current, scope_type, scope_id)
        for before, after in updated_entries:
            _append_history_tx(
                conn,
                {
                    "operation": "import_overwrite",
                    "batch_id": batch_id,
                    "key": after["key"],
                    "actor": actor or "system",
                    "actor_name": actor_name or "",
                    "at": now,
                    "before": before,
                    "after": after,
                    "changes": _diff(before, after),
                    "scope_type": scope_type,
                    "scope_id": scope_id,
                },
                scope_type,
                scope_id,
            )
        for flag in new_flags:
            _append_history_tx(
                conn,
                {
                    "operation": "import",
                    "batch_id": batch_id,
                    "key": flag["key"],
                    "actor": actor or "system",
                    "actor_name": actor_name or "",
                    "at": now,
                    "after": flag,
                    "scope_type": scope_type,
                    "scope_id": scope_id,
                },
                scope_type,
                scope_id,
            )

    _EVALUATION_CACHE.clear()
    decorated_all = [_decorate(f, scope_type, scope_id) for f in all_processed]
    _dispatch_flag_webhook("flag.imported", import_keys, "import", scope_type=scope_type, scope_id=scope_id, actor=actor, actor_name=actor_name, flags=decorated_all, count=len(all_processed))
    return {
        "batch_id": batch_id,
        "flags": decorated_all,
        "imported_count": len(new_flags),
        "overwritten_count": len(updated_entries),
    }


def _expire_at(flag: Dict[str, Any]) -> Optional[int]:
    value = flag.get("scheduled_expire_at")
    if value is None and flag.get("ttl_seconds") is not None:
        try:
            value = int(flag.get("created_at", 0)) + int(flag["ttl_seconds"])
        except (TypeError, ValueError):
            value = None
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def expire_due_flags(now: Optional[int] = None) -> int:
    """Disable every due visible flag once, preserving legacy and registry precedence."""
    now = int(now if now is not None else time.time())
    changed = 0
    registry_global_keys = {
        str(flag.get("key")) for flag in _load_registry("global", None)
        if isinstance(flag, dict) and flag.get("key")
    }
    # Legacy records are still globally visible only when no registry record or
    # tombstone shadows them. Update only those records so a registry successor
    # cannot also expire its hidden legacy predecessor.
    legacy_flags = legacy._load()
    legacy_dirty = False
    for flag in legacy_flags:
        if (not isinstance(flag, dict) or str(flag.get("key")) in registry_global_keys
                or not flag.get("enabled")):
            continue
        if (expire_at := _expire_at(flag)) is not None and now >= expire_at:
            before = copy.deepcopy(flag)
            flag["enabled"] = False
            flag["expired_at"] = now
            flag["updated_at"] = now
            _append_history({"operation": "expire", "key": flag.get("key"), "actor": "system", "actor_name": "",
                             "at": now, "before": before, "after": copy.deepcopy(flag), "changes": _diff(before, flag),
                             "scope_type": "global", "scope_id": None}, "global", None)
            legacy_dirty = True
            changed += 1
    if legacy_dirty:
        legacy._save(legacy_flags)
    for scope_type, scope_id in _stored_scopes():
        flags = _load_registry(scope_type, scope_id)
        dirty = False
        for flag in flags:
            if not isinstance(flag, dict) or flag.get("_deleted") or not flag.get("enabled"):
                continue
            expire_at = _expire_at(flag)
            if expire_at is not None and now >= expire_at:
                before = copy.deepcopy(flag)
                flag["enabled"] = False
                flag["expired_at"] = now
                flag["updated_at"] = now
                _append_history({"operation": "expire", "key": flag.get("key"), "actor": "system", "actor_name": "",
                                 "at": now, "before": before, "after": copy.deepcopy(flag), "changes": _diff(before, flag),
                                 "scope_type": scope_type, "scope_id": scope_id}, scope_type, scope_id)
                dirty = True
                changed += 1
        if dirty:
            _save(flags, scope_type, scope_id)
    return changed


def impact(key: str, scope_type: str = "global", scope_id: Optional[str] = None,
           org_id: Optional[str] = None, authorized_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    flag = get_flag(key, scope_type, scope_id)
    if not flag:
        raise ValueError("Flag not found")
    parent = _resolve_effective(flag["parent_key"], scope_type, scope_id, org_id) if flag.get("parent_key") else None
    prerequisites = [_resolve_effective(item, scope_type, scope_id, org_id) for item in flag.get("prerequisites") or []]
    blockers = find_dependents(flag["key"], scope_type, scope_id, org_id, authorized_context=authorized_context)
    return {"flag": flag, "effective_parent": parent, "prerequisites": [item for item in prerequisites if item],
            "dependents": blockers, "blockers": blockers,
            "lifecycle": {"archived": bool(flag.get("archived")), "expired_at": flag.get("expired_at")}}


def archive_flag(key: str, scope_type: str = "global", scope_id: Optional[str] = None, actor: str = "",
                 actor_name: str = "", reason: str = "", org_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    try:
        key = _normalize_key(key)
    except ValueError:
        return None
    visible = get_flag(key, scope_type, scope_id)
    if not visible:
        return None
    if find_dependents(key, scope_type, scope_id, org_id):
        raise ValueError("Flag has dependents and cannot be archived")
    if scope_type == "global" and not scope_id and not _materialize_legacy_global(key):
        return None
    return update_flag(key, {"enabled": False, "archived": True, "reason": reason}, scope_type, scope_id,
                       actor=actor, actor_name=actor_name, operation="archive", org_id=org_id)


def restore_flag(key: str, scope_type: str = "global", scope_id: Optional[str] = None, actor: str = "",
                 actor_name: str = "", org_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    return update_flag(key, {"enabled": False, "archived": False}, scope_type, scope_id,
                       actor=actor, actor_name=actor_name, operation="restore", org_id=org_id)


def rollback_flag(key: str, snapshot_id: Optional[str] = None, steps: int = 1,
                  scope_type: str = "global", scope_id: Optional[str] = None,
                  actor: str = "", actor_name: str = "", org_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Roll back a feature flag to a prior snapshot or N steps back in audit history."""
    try:
        key = _normalize_key(key)
    except ValueError:
        raise ValueError(f"Invalid flag key '{key}'")

    current = get_flag(key, scope_type, scope_id)
    if not current:
        raise ValueError(f"Flag '{key}' not found")

    rows = audit(scope_type, scope_id, key=key, limit=500)

    if snapshot_id is not None:
        matching = None
        for row in rows:
            if (row.get("id") == snapshot_id
                    or row.get("snapshot_id") == snapshot_id
                    or str(row.get("at")) == snapshot_id
                    or row.get("batch_id") == snapshot_id
                    or (isinstance(row.get("after"), dict) and row["after"].get("id") == snapshot_id)
                    or (isinstance(row.get("before"), dict) and row["before"].get("id") == snapshot_id)):
                matching = row
                break
        if not matching:
            raise ValueError(f"Snapshot '{snapshot_id}' not found for flag '{key}'")
        target_state = matching.get("after") if matching.get("operation") != "delete" else matching.get("before")
        if not target_state:
            target_state = matching.get("before")
        if not target_state:
            raise ValueError(f"Snapshot '{snapshot_id}' contains no valid state")
    else:
        try:
            steps_int = int(steps)
        except (TypeError, ValueError):
            raise ValueError("steps must be an integer")
        if steps_int < 1:
            raise ValueError("steps must be at least 1")
        prior_states = [row["before"] for row in rows if row.get("before")]
        if not prior_states:
            raise ValueError(f"No previous version found to rollback for flag '{key}'")
        if steps_int > len(prior_states):
            raise ValueError(f"Cannot rollback {steps_int} steps: only {len(prior_states)} prior versions available")
        target_state = prior_states[steps_int - 1]

    return update_flag(key, target_state, scope_type, scope_id, actor=actor, actor_name=actor_name, operation="rollback", org_id=org_id)


def copy_flag(source_key: str, target_key: str, scope_type: str = "global", scope_id: Optional[str] = None,
              target_scope_type: Optional[str] = None, target_scope_id: Optional[str] = None,
              actor: str = "", actor_name: str = "", org_id: Optional[str] = None) -> Dict[str, Any]:
    """Copy / clone an existing feature flag as a template into the same or different scope."""
    try:
        source_key = _normalize_key(source_key, "Source flag key")
    except ValueError as exc:
        raise ValueError(str(exc))

    try:
        target_key = _normalize_key(target_key, "Target flag key")
    except ValueError as exc:
        raise ValueError(str(exc))

    source = get_flag(source_key, scope_type, scope_id)
    if not source:
        raise ValueError(f"Source flag '{source_key}' not found")

    t_scope_type = (target_scope_type or scope_type).lower()
    if t_scope_type == "global":
        t_scope_id = None
    else:
        t_scope_id = target_scope_id if target_scope_type is not None else scope_id
        if not t_scope_id:
            raise ValueError(f"Target scope '{t_scope_type}' requires a scope identifier")

    if any(item.get("key") == target_key for item in _load_registry(t_scope_type, t_scope_id)):
        raise ValueError(f"Flag '{target_key}' already exists in target scope")

    target_data: Dict[str, Any] = {
        "key": target_key,
        "name": source.get("name") or target_key,
        "description": source.get("description", ""),
        "enabled": bool(source.get("enabled", True)),
        "environments": copy.deepcopy(source.get("environments") or {}),
        "rollout_percent": source.get("rollout_percent", 100),
        "users_whitelist": list(source.get("users_whitelist") or []),
        "users_blacklist": list(source.get("users_blacklist") or []),
        "tags": list(source.get("tags") or []),
        "kill_switch": bool(source.get("kill_switch")),
        "type": source.get("type"),
        "reason": source.get("reason", ""),
        "parent_key": source.get("parent_key"),
        "prerequisites": list(source.get("prerequisites") or []),
    }
    if source.get("variants") is not None:
        target_data["variants"] = copy.deepcopy(source.get("variants"))
    if source.get("evaluation_cache_ttl_seconds") is not None:
        target_data["evaluation_cache_ttl_seconds"] = source.get("evaluation_cache_ttl_seconds")
    if source.get("ttl_seconds") is not None:
        target_data["ttl_seconds"] = source.get("ttl_seconds")
    if source.get("scheduled_expire_at") is not None:
        target_data["scheduled_expire_at"] = source.get("scheduled_expire_at")

    flag = _new_flag(target_data, t_scope_type, t_scope_id, actor)

    if source.get("rollout_schedule") is not None:
        flag["rollout_schedule"] = copy.deepcopy(source.get("rollout_schedule"))
    if source.get("working_hours") is not None:
        flag["working_hours"] = copy.deepcopy(source.get("working_hours"))

    if t_scope_type == "organization":
        effective_org_id = t_scope_id
    elif t_scope_type == "project":
        effective_org_id = _scope_org_id(t_scope_type, t_scope_id) or org_id
    else:
        effective_org_id = None

    _validate_dependency_graph(flag, t_scope_type, t_scope_id, effective_org_id)
    flags = _load_registry(t_scope_type, t_scope_id)
    flags.append(flag)
    _save(flags, t_scope_type, t_scope_id)
    _EVALUATION_CACHE.clear()
    _append_history({
        "operation": "copy",
        "key": target_key,
        "source_key": source_key,
        "source_scope_type": scope_type,
        "source_scope_id": scope_id,
        "actor": actor or "system",
        "actor_name": actor_name or "",
        "at": flag["created_at"],
        "after": flag,
        "scope_type": t_scope_type,
        "scope_id": t_scope_id,
    }, t_scope_type, t_scope_id)
    decorated = _decorate(flag, t_scope_type, t_scope_id)
    _dispatch_flag_webhook("flag.copied", target_key, "copy", scope_type=t_scope_type, scope_id=t_scope_id, actor=actor, actor_name=actor_name, flag=decorated, source_key=source_key, source_scope_type=scope_type, source_scope_id=scope_id)
    return decorated




def _is_registry_global_key(key: str) -> bool:
    return any(flag.get("key") == key for flag in _load_registry("global", None))


def _result(base: Dict[str, Any], enabled: bool, reason: str, trace: List[Dict[str, Any]],
            dependency_path: List[str], **extra: Any) -> Dict[str, Any]:
    return {**base, "enabled": enabled, "reason": reason, "trace": trace, "dependency_path": dependency_path, **extra}


def schedule_rollout(key: str, stages: List[Dict[str, Any]], scope_type: str = "global",
                    scope_id: Optional[str] = None, actor: str = "", actor_name: str = "",
                    org_id: Optional[str] = None) -> Dict[str, Any]:
    """Persist a bounded progressive rollout schedule; application is time-based and deterministic."""
    if not isinstance(stages, list) or not stages or len(stages) > 10:
        raise ValueError("stages must contain 1-10 entries")
    normalized = []
    previous = -1
    for stage in stages:
        if not isinstance(stage, dict):
            raise ValueError("each rollout stage must be an object")
        percent = max(0, min(100, int(stage.get("rollout_percent"))))
        at = int(stage.get("at"))
        if percent < previous or at < 0:
            raise ValueError("rollout stages must be ordered and non-negative")
        previous = percent
        normalized.append({"rollout_percent": percent, "at": at})
    current = get_flag(key, scope_type, scope_id)
    if not current:
        raise ValueError("flag not found")
    return update_flag(key, {"rollout_schedule": normalized}, scope_type, scope_id,
                       actor=actor, actor_name=actor_name, operation="schedule_rollout", org_id=org_id)


def apply_scheduled_rollout(key: str, now: Optional[int] = None, scope_type: str = "global",
                            scope_id: Optional[str] = None, actor: str = "", actor_name: str = "",
                            org_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    flag = get_flag(key, scope_type, scope_id)
    if not flag:
        return None
    stages = flag.get("rollout_schedule") or []
    eligible = [stage for stage in stages if int(stage.get("at", 0)) <= int(now or time.time())]
    if not eligible:
        return flag
    target = eligible[-1]["rollout_percent"]
    if int(flag.get("rollout_percent", 100)) == target:
        return flag
    return update_flag(key, {"rollout_percent": target}, scope_type, scope_id,
                       actor=actor, actor_name=actor_name, operation="apply_rollout", org_id=org_id)


def safety_valve(key: str, error_count: int, total_count: int, threshold: float = 0.2,
                 min_samples: int = 10, scope_type: str = "global", scope_id: Optional[str] = None,
                 actor: str = "", actor_name: str = "", org_id: Optional[str] = None) -> Dict[str, Any]:
    """Disable a flag when an observed error rate exceeds a bounded policy."""
    total = int(total_count)
    errors = int(error_count)
    minimum = max(1, min(100_000, int(min_samples)))
    limit = min(1.0, max(0.0, float(threshold)))
    if total < 0 or errors < 0 or errors > total:
        raise ValueError("error_count and total_count must be non-negative and consistent")
    flag = get_flag(key, scope_type, scope_id)
    if not flag:
        raise ValueError("flag not found")
    rate = errors / total if total else 0.0
    triggered = total >= minimum and rate >= limit
    updated = flag
    if triggered and flag.get("enabled"):
        updated = update_flag(key, {"enabled": False, "kill_switch": True,
                                    "reason": f"safety valve: error rate {rate:.3f}"}, scope_type, scope_id,
                              actor=actor, actor_name=actor_name, operation="safety_valve", org_id=org_id)
    return {"key": key, "error_count": errors, "total_count": total, "error_rate": round(rate, 6),
            "threshold": limit, "min_samples": minimum, "triggered": triggered, "flag": updated}


def apply_working_hours(key: str, now_hour: int, start_hour: int = 9, end_hour: int = 17,
                       scope_type: str = "global", scope_id: Optional[str] = None,
                       actor: str = "", actor_name: str = "", org_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    start, end = max(0, min(23, int(start_hour))), max(0, min(23, int(end_hour)))
    hour = int(now_hour) % 24
    active = start <= hour < end if start < end else hour >= start or hour < end
    return update_flag(key, {"enabled": active, "working_hours": {"start": start, "end": end}},
                       scope_type, scope_id, actor=actor, actor_name=actor_name,
                       operation="working_hours", org_id=org_id)


def safe_evaluate(key: str, env: str = "prod", user: str = "", project_id: Optional[str] = None,
                  org_id: Optional[str] = None) -> Dict[str, Any]:
    """Fail closed to a disabled flag when evaluation encounters an error."""
    try:
        return evaluate(key, env=env, user=user, project_id=project_id, org_id=org_id)
    except Exception as exc:
        return {"key": str(key or ""), "enabled": False, "reason": "evaluation_error",
                "source": "safe-default", "matched_scope": "", "trace": [],
                "dependency_path": [str(key or "")], "error": str(exc)[:200]}


def filter_flags(flags: List[Dict[str, Any]], tag: str = "", env: str = "", enabled: Optional[bool] = None) -> List[Dict[str, Any]]:
    tag = str(tag or "").strip().lower()
    env = str(env or "").strip().lower()
    result = []
    for flag in flags:
        tags = {str(item).strip().lower() for item in (flag.get("tags") or [])}
        if tag and tag not in tags:
            continue
        if env and (flag.get("environments") or {}).get(env) is not True:
            continue
        if enabled is not None and bool(flag.get("enabled")) is not enabled:
            continue
        result.append(flag)
    return result


def evaluation_history(scope_type: str = "global", scope_id: Optional[str] = None,
                       key: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    return [row for row in audit(scope_type, scope_id, key, limit * 2) if row.get("operation") == "evaluation"][:limit]


def evaluate(key: str, env: str = "prod", user: str = "", project_id: Optional[str] = None,
             org_id: Optional[str] = None) -> Dict[str, Any]:
    """Evaluate a flag with scoped dependency gates and defensive graph handling."""
    if project_id and not org_id:
        org_id = _scope_org_id("project", project_id)
    cache_key = (str(key), str(env), str(user), project_id, org_id)
    now = time.time()
    cached_entry = _EVALUATION_CACHE.get(cache_key)
    if cached_entry:
        expires_at, cached_result = cached_entry
        if expires_at > now:
            return copy.deepcopy({**cached_result, "cached": True})
        _EVALUATION_CACHE.pop(cache_key, None)
    try:
        requested_key = _normalize_key(key)
    except ValueError:
        requested_key = str(key or "")
    cache: Dict[str, Dict[str, Any]] = {}
    visiting: List[str] = []

    def resolve(flag_key: str) -> Optional[Dict[str, Any]]:
        return _resolve_effective(flag_key, "project" if project_id else ("organization" if org_id else "global"), project_id or org_id, org_id)

    def assess(flag_key: str, relationship: str = "target") -> Dict[str, Any]:
        if flag_key in visiting:
            path = visiting[visiting.index(flag_key):] + [flag_key]
            return _result({"key": flag_key, "source": "dependency", "matched_scope": ""}, False, "invalid_dependency_cycle",
                           [{"key": flag_key, "relationship": relationship, "gate": "dependency", "scope": "cycle"}], path)
        if flag_key in cache:
            cached = copy.deepcopy(cache[flag_key])
            if cached.get("trace"):
                cached["trace"][0]["relationship"] = relationship
            return cached
        matched = resolve(flag_key)
        if not matched:
            # Legacy's unknown result remains the public behaviour for top-level lookup,
            # unless a registry tombstone intentionally hides a legacy global record.
            if relationship == "target" and not _is_registry_global_key(flag_key):
                legacy_result = legacy.evaluate(flag_key, env=env, user=user)
                return {**legacy_result, "source": "legacy-global", "matched_scope": "global:default",
                        "trace": [{"key": flag_key, "relationship": relationship, "gate": "lookup", "scope": "global:default"}], "dependency_path": [flag_key]}
            reason = "unknown_flag" if relationship == "target" else ("unknown_parent" if relationship == "parent" else "unknown_prerequisite")
            return _result({"key": flag_key, "source": "dependency", "matched_scope": ""}, False, reason,
                           [{"key": flag_key, "relationship": relationship, "gate": "lookup", "scope": "missing"}], [flag_key])
        matched_scope = _scope(matched["scope_type"], matched["scope_id"])
        base = {"key": flag_key, "source": matched["scope_type"], "matched_scope": matched_scope,
                "ttl_seconds": matched.get("evaluation_cache_ttl_seconds", matched.get("ttl_seconds", 0))}
        trace = [{"key": flag_key, "relationship": relationship, "gate": "flag", "scope": matched_scope}]
        if matched["scope_type"] == "global" and not _is_registry_global_key(flag_key):
            legacy_result = legacy.evaluate(flag_key, env=env, user=user)
            result = {**legacy_result, "source": "legacy-global", "matched_scope": matched_scope,
                      "trace": trace, "dependency_path": [flag_key]}
            cache[flag_key] = result
            return copy.deepcopy(result)
        visiting.append(flag_key)
        parent = matched.get("parent_key")
        if parent is not None:
            try:
                parent_key = _normalize_key(parent, "Parent key")
            except ValueError:
                parent_key = ""
            parent_result = assess(parent_key, "parent") if parent_key else _result(base, False, "unknown_parent", trace, [flag_key])
            trace.extend(parent_result.get("trace", []))
            if not parent_result.get("enabled"):
                visiting.pop()
                if parent_result.get("reason") in {"invalid_dependency_cycle", "unknown_parent", "unknown_prerequisite"}:
                    path = parent_result.get("dependency_path", [])
                    return _result(base, False, parent_result["reason"], trace, path if parent_result["reason"] == "invalid_dependency_cycle" else [flag_key] + path)
                return _result(base, False, "parent_disabled", trace, [flag_key, parent_key])
        raw_prerequisites = matched.get("prerequisites") or []
        if not isinstance(raw_prerequisites, (list, tuple)):
            raw_prerequisites = [None]
        for prerequisite in raw_prerequisites:
            try:
                prerequisite_key = _normalize_key(prerequisite, "Prerequisite key")
            except ValueError:
                prerequisite_key = ""
            prerequisite_result = assess(prerequisite_key, "prerequisite") if prerequisite_key else _result(base, False, "unknown_prerequisite", trace, [flag_key])
            trace.extend(prerequisite_result.get("trace", []))
            if not prerequisite_result.get("enabled"):
                visiting.pop()
                if prerequisite_result.get("reason") in {"invalid_dependency_cycle", "unknown_parent", "unknown_prerequisite"}:
                    path = prerequisite_result.get("dependency_path", [])
                    return _result(base, False, prerequisite_result["reason"], trace, path if prerequisite_result["reason"] == "invalid_dependency_cycle" else [flag_key] + path)
                return _result(base, False, "missing_prerequisite", trace, [flag_key, prerequisite_key], requires=prerequisite_key)
        visiting.pop()
        if matched.get("kill_switch"):
            result = _result(base, False, "kill_switch", trace, [flag_key])
        elif not matched.get("enabled", False):
            result = _result(base, False, "globally_disabled", trace, [flag_key])
        elif (matched.get("environments") or {}).get(env) is False:
            result = _result(base, False, f"disabled_in_{env}", trace, [flag_key])
        elif user and user in (matched.get("users_blacklist") or []):
            result = _result(base, False, "blacklisted", trace, [flag_key])
        elif user and user in (matched.get("users_whitelist") or []):
            result = _result(base, True, "whitelisted", trace, [flag_key])
        elif matched.get("variants"):
            bucket = legacy._bucket(flag_key, user or env)
            cursor = 0
            selected = matched["variants"][-1]["key"]
            for variant in matched["variants"]:
                cursor += int(variant["weight"]) * 10
                if bucket < cursor:
                    selected = variant["key"]
                    break
            result = _result(base, True, "variant_assignment", trace, [flag_key], variant=selected,
                             bucket=bucket, variants=copy.deepcopy(matched["variants"]))
        else:
            try:
                percent = max(0, min(100, int(matched.get("rollout_percent", 100))))
            except (TypeError, ValueError):
                percent = 100
            if percent >= 100:
                result = _result(base, True, "full_rollout", trace, [flag_key])
            elif percent <= 0:
                result = _result(base, False, "zero_rollout", trace, [flag_key])
            else:
                result = _result(base, legacy._bucket(flag_key, user or env) < percent * 10, "rollout", trace, [flag_key])
        cache[flag_key] = result
        return copy.deepcopy(result)

    result = assess(requested_key)
    if (project_id or org_id) and result.get("source") != "legacy-global":
        _append_history({"operation": "evaluation", "key": requested_key, "at": int(time.time()),
                         "actor": user or "anonymous", "environment": env, "project_id": project_id,
                         "enabled": bool(result.get("enabled")), "reason": result.get("reason", ""),
                         "variant": result.get("variant")}, "project" if project_id else ("global" if not org_id else "organization"), project_id or org_id)
    try:
        ttl = max(0, min(300, int((result.get("ttl_seconds") or 0))))
    except (TypeError, ValueError):
        ttl = 0
    if ttl:
        _EVALUATION_CACHE[cache_key] = (now + ttl, copy.deepcopy(result))
    return result


def _stored_scopes() -> Iterable[Tuple[str, Optional[str]]]:
    from storage import kv
    for scope in kv.kv_list_scopes(prefix="flags:"):
        parts = scope.split(":", 2)
        if len(parts) == 3:
            yield parts[1], None if parts[2] == "default" else parts[2]


def _scope_org_id(scope_type: str, scope_id: Optional[str]) -> Optional[str]:
    if scope_type == "organization":
        return scope_id
    if scope_type != "project" or not scope_id:
        return None
    from storage import pg
    row = pg.query_one("SELECT org_id FROM projects WHERE id = %s", (scope_id,))
    return str(row["org_id"]) if row and row.get("org_id") else None


def _matches_target(record: Optional[Dict[str, Any]], target_scope_type: str,
                    target_scope_id: Optional[str]) -> bool:
    return bool(record and record.get("scope_type") == target_scope_type
                and record.get("scope_id") == target_scope_id)


def find_dependents(key: str, scope_type: str = "global", scope_id: Optional[str] = None,
                    org_id: Optional[str] = None, authorized_context: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Return stored relationships that resolve to this exact scoped target.

    Matching references by key alone crosses tenant and precedence boundaries. A
    dependent is relevant only when resolving its relationship in its own
    effective context selects the lifecycle target being inspected.
    """
    key = _normalize_key(key)
    target = get_flag(key, scope_type, scope_id)
    if not target:
        return []
    target_scope_type = target["scope_type"]
    target_scope_id = target["scope_id"]
    dependents: List[Dict[str, Any]] = []
    allowed_org_ids = set((authorized_context or {}).get("org_ids") or [])
    allowed_project_ids = set((authorized_context or {}).get("project_ids") or [])
    is_global_authorized = bool((authorized_context or {}).get("global_admin"))
    for dependent_scope_type, dependent_scope_id in _stored_scopes():
        dependent_org_id = _scope_org_id(dependent_scope_type, dependent_scope_id)
        if authorized_context and not is_global_authorized:
            if dependent_scope_type == "project" and dependent_scope_id not in allowed_project_ids:
                continue
            if dependent_scope_type == "organization" and dependent_scope_id not in allowed_org_ids:
                continue
            if dependent_scope_type == "global":
                continue
        for flag in _load_registry(dependent_scope_type, dependent_scope_id):
            if not isinstance(flag, dict) or flag.get("_deleted"):
                continue
            parent_key = str(flag.get("parent_key") or "").strip().lower()
            prerequisite_keys = {
                str(value).strip().lower() for value in (flag.get("prerequisites") or [])
                if isinstance(value, str)
            }
            if parent_key == key and _matches_target(
                    _resolve_effective(key, dependent_scope_type, dependent_scope_id, dependent_org_id),
                    target_scope_type, target_scope_id):
                dependents.append({"key": flag.get("key"), "scope_type": dependent_scope_type,
                                   "scope_id": dependent_scope_id, "relationship": "parent"})
            if key in prerequisite_keys and _matches_target(
                    _resolve_effective(key, dependent_scope_type, dependent_scope_id, dependent_org_id),
                    target_scope_type, target_scope_id):
                dependents.append({"key": flag.get("key"), "scope_type": dependent_scope_type,
                                   "scope_id": dependent_scope_id, "relationship": "prerequisite"})
    return sorted(dependents, key=lambda item: (item["scope_type"], item["scope_id"] or "", item["key"] or "", item["relationship"]))


def get_ui_flags(scope_type: str = "global", scope_id: Optional[str] = None,
                 user_id: Optional[str] = None, env: str = "prod",
                 org_id: Optional[str] = None) -> Dict[str, bool]:
    """Retrieve evaluated boolean flags relevant for UI/Console modules."""
    flags = list_flags(scope_type, scope_id, effective=True, org_id=org_id)
    ui_flags: Dict[str, bool] = {}
    for flag in flags:
        if not isinstance(flag, dict) or not flag.get("key"):
            continue
        key = str(flag["key"])
        tags = [str(t).lower() for t in (flag.get("tags") or [])]
        if key.startswith("ui.") or key.startswith("console.") or "ui" in tags:
            evaluation = evaluate(
                key,
                env=env,
                user=user_id or "",
                project_id=scope_id if scope_type == "project" else None,
                org_id=org_id,
            )
            ui_flags[key] = bool(evaluation.get("enabled", False))
    return ui_flags


def can_create_preview_env(project_id: Optional[str] = None, preview_name: str = "",
                           env: str = "preview", user_id: str = "",
                           org_id: Optional[str] = None) -> bool:
    """Check if preview environment / stack creation is permitted by feature flags (UC157).

    Evaluates:
    - `block_preview`: if enabled -> False
    - `preview.allow`: if configured and False -> False
    - `preview.enabled`: if configured and False -> False
    - `preview.<preview_name>.enabled`: if configured and False -> False

    Defaults to True if no preview restriction flag is configured.
    """
    # 1. Check block_preview kill switch
    res_block = evaluate("block_preview", env=env, user=user_id, project_id=project_id, org_id=org_id)
    if res_block.get("enabled") is True:
        return False

    # 2. Check preview.enabled
    res_enabled = evaluate("preview.enabled", env=env, user=user_id, project_id=project_id, org_id=org_id)
    if res_enabled.get("source") != "legacy-global" or res_enabled.get("reason") != "unknown_flag":
        if res_enabled.get("enabled") is False:
            return False

    # 3. Check preview.allow
    res_allow = evaluate("preview.allow", env=env, user=user_id, project_id=project_id, org_id=org_id)
    if res_allow.get("source") != "legacy-global" or res_allow.get("reason") != "unknown_flag":
        if res_allow.get("enabled") is False:
            return False

    # 4. Check specific preview name flag if provided (e.g. preview.<preview_name>.enabled)
    if preview_name:
        clean_name = str(preview_name).strip().lower()
        if clean_name:
            res_spec = evaluate(f"preview.{clean_name}.enabled", env=env, user=user_id, project_id=project_id, org_id=org_id)
            if res_spec.get("source") != "legacy-global" or res_spec.get("reason") != "unknown_flag":
                if res_spec.get("enabled") is False:
                    return False

    return True


