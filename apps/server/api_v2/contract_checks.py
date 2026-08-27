"""Deterministic contract-quality checks over a rendered OpenAPI document.

Shared by:

- ``tests/test_openapi_contract.py`` — gates the served ``/api/v2``
  document on no-regression against the explicit committed baseline in
  ``contracts/radas-api-v2-violations-baseline.json``.
- ``scripts/export_openapi.py`` — prints a violation summary at export time
  so baseline drift is visible next to the snapshot it came from.

The checks are deliberately mechanical and stable: every violation entry is
a deterministic ``"<METHOD> <path>: <detail>"`` string derived purely from
the document, so two renders of the same surface produce identical lists.
"""
from __future__ import annotations

import re
from typing import Any, Iterator

_HTTP_METHODS = frozenset({"get", "post", "put", "patch", "delete", "head", "options", "trace"})

_PATH_PARAM_RE = re.compile(r"\{([^/}]+)\}")


def iter_operations(spec: dict[str, Any]) -> Iterator[tuple[str, str, dict]]:
    """Yield ``(METHOD, path, operation)`` for every HTTP operation."""
    for path, path_item in (spec.get("paths") or {}).items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            if str(method).lower() in _HTTP_METHODS and isinstance(operation, dict):
                yield str(method).upper(), path, operation


def find_duplicate_operation_ids(spec: dict[str, Any]) -> list[str]:
    """Operation IDs claimed by more than one operation."""
    owners: dict[str, list[str]] = {}
    for method, path, operation in iter_operations(spec):
        operation_id = operation.get("operationId")
        if operation_id:
            owners.setdefault(str(operation_id), []).append(f"{method} {path}")
    return sorted(
        f"operationId {operation_id} claimed by {', '.join(sorted(claimants))}"
        for operation_id, claimants in owners.items()
        if len(claimants) > 1
    )


def find_undocumented_required_parameters(spec: dict[str, Any]) -> list[str]:
    """Required request parameters that the document fails to describe.

    Two failure shapes:
    - a declared path/header parameter without ``required: true``;
    - a path template variable with no matching declared parameter.
    """
    violations: set[str] = set()
    for method, path, operation in iter_operations(spec):
        declared = [p for p in (operation.get("parameters") or []) if isinstance(p, dict)]
        declared_names = {p.get("name") for p in declared}
        for parameter in declared:
            if (
                parameter.get("in") in ("path", "header")
                and parameter.get("required") is not True
            ):
                violations.add(
                    f"{method} {path}: parameter {parameter.get('name')!r} "
                    f"(in {parameter.get('in')}) is missing required=true"
                )
        for name in _PATH_PARAM_RE.findall(path):
            if name not in declared_names:
                violations.add(
                    f"{method} {path}: path parameter {name!r} is not documented"
                )
    return sorted(violations)


def find_missing_error_responses(spec: dict[str, Any]) -> list[str]:
    """Operations without any documented error response (4xx/5xx/default).

    flask-smorest documents its own ``default`` error response on every
    operation it renders, so a healthy surface gates at zero; an operation
    losing that coverage (e.g. a hand-written responses override) fails.
    """
    violations: list[str] = []
    for method, path, operation in iter_operations(spec):
        responses = operation.get("responses") or {}
        has_error = any(
            str(code) == "default" or (str(code).isdigit() and int(code) >= 400)
            for code in responses
        )
        if not has_error:
            violations.append(f"{method} {path}: no 4xx/5xx/default response documented")
    return sorted(violations)


#: Canonical category order used by both the baseline file and the tests.
VIOLATION_CATEGORIES: tuple[str, ...] = (
    "duplicate_operation_ids",
    "undocumented_required_parameters",
    "missing_error_responses",
)


def find_contract_violations(spec: dict[str, Any]) -> dict[str, list[str]]:
    """Run every check; returns ``{category: sorted entries}``."""
    return {
        "duplicate_operation_ids": find_duplicate_operation_ids(spec),
        "undocumented_required_parameters": find_undocumented_required_parameters(spec),
        "missing_error_responses": find_missing_error_responses(spec),
    }
