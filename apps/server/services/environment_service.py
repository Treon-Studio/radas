"""Project-scoped environment records and redacted variable overlays."""
from __future__ import annotations

import re
import time
import uuid
from collections.abc import Mapping
from typing import Any

from psycopg.types.json import Jsonb

from storage import pg

DEFAULT_ENVIRONMENTS = ("dev", "staging", "prod", "preview")
_ENVIRONMENT_RE = re.compile(r"^[a-z][a-z0-9-]{0,31}$")
_SENSITIVE_RE = re.compile(
    r"(?i)(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|credential|authorization)"
)


class EnvironmentError(ValueError):
    pass


def _now() -> float:
    return time.time()


def _validate_name(name: str) -> str:
    value = str(name or "").strip().lower()
    if not _ENVIRONMENT_RE.fullmatch(value):
        raise EnvironmentError("environment name must use lowercase letters, numbers, and hyphens")
    return value


def _redact_value(key: str, value: Any) -> Any:
    if _SENSITIVE_RE.search(key):
        return "[REDACTED]"
    if isinstance(value, Mapping):
        return {str(child): _redact_value(str(child), item) for child, item in value.items()}
    if isinstance(value, list):
        return [_redact_value(key, item) for item in value]
    return value


def redact_variables(variables: Mapping[str, Any] | None) -> dict[str, Any]:
    return {str(key): _redact_value(str(key), value) for key, value in (variables or {}).items()}


def _row(row: Mapping[str, Any]) -> dict[str, Any]:
    result = dict(row)
    result["protected"] = bool(result.get("protected", False))
    result["variables"] = redact_variables(result.get("variables") or {})
    return result


def ensure_defaults(project_id: str, org_id: str) -> list[dict[str, Any]]:
    now = _now()
    with pg.transaction() as conn:
        for name in DEFAULT_ENVIRONMENTS:
            conn.execute(
                "INSERT INTO project_environments "
                "(id,org_id,project_id,name,protected,variables,created_at,updated_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (project_id,name) DO NOTHING",
                (str(uuid.uuid4()), org_id, project_id, name, name == "prod", Jsonb({}), now, now),
            )
        rows = conn.execute(
            "SELECT * FROM project_environments WHERE project_id=%s ORDER BY name", (project_id,)
        ).fetchall()
    return [_row(row) for row in rows]


def list_environments(project_id: str, org_id: str) -> list[dict[str, Any]]:
    return ensure_defaults(project_id, org_id)


def get_environment(project_id: str, org_id: str, name: str) -> dict[str, Any] | None:
    normalized = _validate_name(name)
    ensure_defaults(project_id, org_id)
    row = pg.query_one(
        "SELECT * FROM project_environments WHERE project_id=%s AND org_id=%s AND name=%s",
        (project_id, org_id, normalized),
    )
    return _row(row) if row else None


def update_environment(
    project_id: str,
    org_id: str,
    name: str,
    *,
    protected: bool | None = None,
    variables: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    normalized = _validate_name(name)
    ensure_defaults(project_id, org_id)
    with pg.transaction() as conn:
        current = conn.execute(
            "SELECT * FROM project_environments WHERE project_id=%s AND org_id=%s AND name=%s FOR UPDATE",
            (project_id, org_id, normalized),
        ).fetchone()
        if not current:
            raise EnvironmentError("environment not found")
        next_protected = bool(current["protected"]) if protected is None else bool(protected)
        next_variables = dict(current.get("variables") or {}) if variables is None else dict(variables)
        now = _now()
        row = conn.execute(
            "UPDATE project_environments SET protected=%s,variables=%s,updated_at=%s "
            "WHERE project_id=%s AND org_id=%s AND name=%s RETURNING *",
            (next_protected, Jsonb(next_variables), now, project_id, org_id, normalized),
        ).fetchone()
    return _row(row)


def overlay_diff(before: Mapping[str, Any] | None, after: Mapping[str, Any] | None) -> dict[str, dict[str, Any]]:
    left, right = dict(before or {}), dict(after or {})
    diff: dict[str, dict[str, Any]] = {}
    for key in sorted(set(left) | set(right)):
        if left.get(key) != right.get(key) or key not in left or key not in right:
            diff[key] = {
                "before": _redact_value(str(key), left.get(key)),
                "after": _redact_value(str(key), right.get(key)),
            }
    return diff
