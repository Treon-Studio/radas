"""Namespaced and scoped feature-flag registry for the RADAS control plane."""
from __future__ import annotations

import copy
import re
import time
import uuid
from typing import Any, Dict, Iterable, List, Optional, Tuple

from services import feature_flags as legacy


_KEY_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")


def _history_key(scope_type: str, scope_id: Optional[str]) -> str:
    return f"flag_audit:{scope_type}:{scope_id or 'default'}"


def _append_history(entry: Dict[str, Any], scope_type: str, scope_id: Optional[str]) -> None:
    from storage import kv
    rows = kv.kv_get(_history_key(scope_type, scope_id), "entries") or []
    rows = (rows if isinstance(rows, list) else [])[-999:] + [entry]
    kv.kv_set(_history_key(scope_type, scope_id), "entries", rows)


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
    The legacy records are never copied into or removed from the registry store.
    """
    registry = _load_registry(scope_type, scope_id)
    if scope_type != "global" or scope_id:
        return registry
    merged = {str(flag.get("key", "")): dict(flag) for flag in legacy.list_flags() if isinstance(flag, dict)}
    merged.update({str(flag.get("key", "")): dict(flag) for flag in registry if isinstance(flag, dict)})
    return list(merged.values())


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


def create_flag(data: Dict[str, Any], scope_type: str = "global", scope_id: Optional[str] = None,
                actor: str = "", actor_name: str = "", org_id: Optional[str] = None) -> Dict[str, Any]:
    key = _normalize_key(data.get("key"))
    # A legacy global entry does not block its namespaced registry successor.
    if any(flag.get("key") == key for flag in _load_registry(scope_type, scope_id)):
        raise ValueError(f"Flag '{key}' already exists")
    parent, prerequisites = _normalize_relationships(data, key)
    now = int(time.time())
    try:
        rollout = max(0, min(100, int(data.get("rollout_percent", 100))))
    except (TypeError, ValueError):
        rollout = 100
    flag = {
        "id": str(uuid.uuid4()), "key": key, "name": (data.get("name") or key).strip(),
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
    for field in ("ttl_seconds", "scheduled_expire_at"):
        if data.get(field) is not None:
            try:
                flag[field] = int(data[field])
            except (TypeError, ValueError):
                pass
    _validate_dependency_graph(flag, scope_type, scope_id, org_id)
    flags = _load_registry(scope_type, scope_id)
    flags.append(flag)
    _save(flags, scope_type, scope_id)
    _append_history({"operation": "create", "key": key, "actor": actor or "system", "actor_name": actor_name or "", "at": now, "after": flag, "scope_type": scope_type, "scope_id": scope_id}, scope_type, scope_id)
    return _decorate(flag, scope_type, scope_id)


def update_flag(key: str, patch: Dict[str, Any], scope_type: str = "global", scope_id: Optional[str] = None,
                actor: str = "", actor_name: str = "", operation: str = "update", org_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    try:
        key = _normalize_key(key)
    except ValueError:
        return None
    flags = _load_registry(scope_type, scope_id)
    index = next((i for i, item in enumerate(flags) if item.get("key") == key), None)
    if index is None:
        return None
    before = copy.deepcopy(flags[index])
    candidate = copy.deepcopy(before)
    for field in ("name", "description", "tags", "reason", "type"):
        if field in patch:
            candidate[field] = patch[field]
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
    _append_history({"operation": operation, "key": key, "actor": actor or "system", "actor_name": actor_name or "", "at": int(time.time()), "before": before, "after": candidate, "changes": _diff(before, candidate), "scope_type": scope_type, "scope_id": scope_id}, scope_type, scope_id)
    return _decorate(candidate, scope_type, scope_id)


def delete_flag(key: str, scope_type: str = "global", scope_id: Optional[str] = None, actor: str = "", actor_name: str = "") -> bool:
    flags = _load_registry(scope_type, scope_id)
    remaining = [item for item in flags if item.get("key") != key]
    if len(remaining) == len(flags):
        return False
    removed = copy.deepcopy(next(item for item in flags if item.get("key") == key))
    _save(remaining, scope_type, scope_id)
    _append_history({"operation": "delete", "key": key, "actor": actor or "system", "actor_name": actor_name or "", "at": int(time.time()), "before": removed, "scope_type": scope_type, "scope_id": scope_id}, scope_type, scope_id)
    return True


def _is_registry_global_key(key: str) -> bool:
    return any(flag.get("key") == key for flag in _load_registry("global", None))


def _result(base: Dict[str, Any], enabled: bool, reason: str, trace: List[Dict[str, Any]],
            dependency_path: List[str], **extra: Any) -> Dict[str, Any]:
    return {**base, "enabled": enabled, "reason": reason, "trace": trace, "dependency_path": dependency_path, **extra}


def evaluate(key: str, env: str = "prod", user: str = "", project_id: Optional[str] = None,
             org_id: Optional[str] = None) -> Dict[str, Any]:
    """Evaluate a flag with scoped dependency gates and defensive graph handling."""
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
            return copy.deepcopy(cache[flag_key])
        matched = resolve(flag_key)
        if not matched:
            # Legacy's unknown result remains the public behaviour for top-level lookup.
            if relationship == "target":
                legacy_result = legacy.evaluate(flag_key, env=env, user=user)
                return {**legacy_result, "source": "legacy-global", "matched_scope": "global:default",
                        "trace": [{"key": flag_key, "relationship": relationship, "gate": "lookup", "scope": "global:default"}], "dependency_path": [flag_key]}
            reason = "unknown_parent" if relationship == "parent" else "unknown_prerequisite"
            return _result({"key": flag_key, "source": "dependency", "matched_scope": ""}, False, reason,
                           [{"key": flag_key, "relationship": relationship, "gate": "lookup", "scope": "missing"}], [flag_key])
        matched_scope = _scope(matched["scope_type"], matched["scope_id"])
        base = {"key": flag_key, "source": matched["scope_type"], "matched_scope": matched_scope}
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

    return assess(requested_key)


def _stored_scopes() -> Iterable[Tuple[str, Optional[str]]]:
    from storage import kv
    for scope in kv.kv_list_scopes(prefix="flags:"):
        parts = scope.split(":", 2)
        if len(parts) == 3:
            yield parts[1], None if parts[2] == "default" else parts[2]


def find_dependents(key: str) -> List[Dict[str, Any]]:
    """Return direct stored-registry relationship dependents for a logical key."""
    key = _normalize_key(key)
    dependents: List[Dict[str, Any]] = []
    for scope_type, scope_id in _stored_scopes():
        for flag in _load_registry(scope_type, scope_id):
            if not isinstance(flag, dict):
                continue
            if flag.get("parent_key") == key:
                dependents.append({"key": flag.get("key"), "scope_type": scope_type, "scope_id": scope_id, "relationship": "parent"})
            if key in (flag.get("prerequisites") or []):
                dependents.append({"key": flag.get("key"), "scope_type": scope_type, "scope_id": scope_id, "relationship": "prerequisite"})
    return sorted(dependents, key=lambda item: (item["scope_type"], item["scope_id"] or "", item["key"] or "", item["relationship"]))
