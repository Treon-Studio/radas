"""Semantic (shape-level) equivalence for the OpenAPI contract gate.

Elixir migration (2026-09, Phase 0.1): the byte-level pin on the served
OpenAPI document is relaxed to a semantic surface contract. The snapshot must
still describe exactly the production surface — the set of
``(path, method, operationId)`` triples must be identical and the document
must remain structurally valid — but key order, whitespace, and
documentation-only details (descriptions, examples, serialization) no longer
fail the gate.

Rationale: every client (console TypeScript, Go CLI, Go worker) asserts
semantic equivalence against ``contracts/cross-client-fixtures.json`` and its
own typed decoders — none depends on byte identity or JSON key order. The
surface triple-set check keeps the snapshot an honest mirror of what the
running server serves; shape validation keeps it a valid OpenAPI document.
"""

from __future__ import annotations

import re

_HTTP_METHOD_RE = re.compile(r"^(get|post|put|patch|delete|head|options|trace)$")

#: OpenAPI 3.1 allows ``type`` to be one of these strings or a list/null.
_VALID_TYPES = {
    "null",
    "boolean",
    "object",
    "array",
    "number",
    "string",
    "integer",
}


def surface_operations(doc: dict) -> set[tuple[str, str, str]]:
    """The (path, method, operationId) triples a document serves."""
    triples: set[tuple[str, str, str]] = set()
    for path, path_item in (doc.get("paths") or {}).items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            if not (_HTTP_METHOD_RE.match(str(method)) and isinstance(operation, dict)):
                continue
            operation_id = str(operation.get("operationId") or "")
            triples.add((str(path), str(method).upper(), operation_id))
    return triples


def diff_surface(snapshot_doc: dict, served_doc: dict) -> list[str]:
    """Human-readable differences between two documents' served surfaces."""
    snapshot_surface = surface_operations(snapshot_doc)
    served_surface = surface_operations(served_doc)
    diffs: list[str] = []

    missing = sorted(snapshot_surface - served_surface)
    extra = sorted(served_surface - snapshot_surface)
    if missing:
        missing_paths = sorted({path for path, _, _ in missing})
        diffs.append(
            f"{len(missing)} operation(s) in the snapshot are no longer served "
            f"(first paths: {missing_paths[:5]})"
        )
    if extra:
        extra_paths = sorted({path for path, _, _ in extra})
        diffs.append(
            f"{len(extra)} operation(s) are served but absent from the snapshot "
            f"(first paths: {extra_paths[:5]})"
        )
    return diffs


def validate_document_shape(doc: dict, *, label: str) -> None:
    """Assert the document is structurally a valid served OpenAPI surface.

    Deliberately shallow: catches accidental corruption (empty paths,
    missing operationIds, invalid ``type`` values) without re-implementing a
    full OpenAPI validator.
    """
    if not isinstance(doc, dict):
        raise AssertionError(f"{label}: document is not a JSON object")
    for key in ("openapi", "info", "paths"):
        if key not in doc:
            raise AssertionError(f"{label}: missing required top-level key {key!r}")
    if not isinstance(doc.get("paths"), dict):
        raise AssertionError(f"{label}: 'paths' is not an object")
    if not doc["paths"]:
        raise AssertionError(f"{label}: 'paths' is empty — the served surface vanished")

    invalid_type_ops: list[str] = []
    missing_id_ops: list[str] = []

    for path, method, operation in _iter_operations(doc):
        if not isinstance(operation, dict):
            continue
        if not operation.get("operationId"):
            missing_id_ops.append(f"{method} {path}")
        for responses in [operation.get("responses") or {}]:
            if not isinstance(responses, dict):
                continue
            for _status, response in responses.items():
                if not isinstance(response, dict):
                    continue
                content = response.get("content") or {}
                if not isinstance(content, dict):
                    continue
                for _media, media_obj in content.items():
                    schema = (media_obj or {}).get("schema") or {}
                    if not isinstance(schema, dict):
                        continue
                    schema_type = schema.get("type")
                    if isinstance(schema_type, str) and schema_type not in _VALID_TYPES:
                        invalid_type_ops.append(
                            f"{method} {path} [{_status}]: type={schema_type!r}"
                        )

    if missing_id_ops:
        raise AssertionError(
            f"{label}: operations without operationId (first 5): {missing_id_ops[:5]}"
        )
    if invalid_type_ops:
        raise AssertionError(
            f"{label}: schemas with invalid 'type' values (first 5): {invalid_type_ops[:5]}"
        )


def _iter_operations(doc: dict):
    for path, path_item in (doc.get("paths") or {}).items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            if _HTTP_METHOD_RE.match(str(method)) and isinstance(operation, dict):
                yield str(path), str(method).upper(), operation


def assert_semantic_equivalence(snapshot_doc: dict, served_doc: dict, *, label: str = ""):
    """Snapshot and served doc must serve the identical operation surface.

    Byte and JSON-serialization drift are explicitly allowed; the surface
    (paths × methods × operationIds) is not negotiable.
    """
    validate_document_shape(snapshot_doc, label=label or "snapshot")
    validate_document_shape(served_doc, label=label or "served")

    diffs = diff_surface(snapshot_doc, served_doc)
    if diffs:
        raise AssertionError(
            "the served /api/v2 surface drifted from the committed snapshot:\n"
            + "\n".join(f"  - {diff}" for diff in diffs)
            + "\n\nIf the surface change is intentional, regenerate the snapshot:\n"
            "  cd apps/server && .venv/bin/python scripts/export_openapi.py "
            "--output <repo>/contracts/radas-api-v2.openapi.json\n"
            "and review the committed diff. Otherwise revert the surface change."
        )
