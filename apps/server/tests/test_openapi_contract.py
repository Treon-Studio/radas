"""OpenAPI contract surface for ``/api/v2`` (Task 2.1, 2026-08-27 plan).

Covers the brief's required interfaces:

- ``GET /api/v2/openapi.json`` serves OpenAPI 3.1 with a stable
  ``info.version`` and stable, unique operation IDs; required tags, schemas
  and the shared BearerAuth security scheme are present.
- ``scripts/export_openapi.py`` renders the served document to a
  byte-stable committed snapshot at ``contracts/radas-api-v2.openapi.json``.
- Contract-quality checks (duplicate operation IDs, undocumented required
  parameters, missing error responses) gate on no-regression against the
  explicit committed baseline in
  ``contracts/radas-api-v2-violations-baseline.json`` — pre-existing
  violations are a documented, reviewable ratchet, never silently waived.
- flask-smorest is a required dependency: a failed v2 mount fails closed
  (raises, and readiness reports ``v2_contract_ok=False``) instead of the
  old silently-disabled pilot behavior.
- Legacy ``/api/openapi.json`` and ``/api/docs`` remain untouched until a
  separately reviewed migration.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest
from flask import Flask

import services.health as health_module
from api.platform_routes import bp as platform_bp
from api.route_inventory import REGISTRY_EXTENSION_KEY, register_blueprints
from api_v2 import (
    API_V2_INFO_VERSION,
    API_V2_OPENAPI_VERSION,
    V2_SURFACE_EXTENSION_KEY,
    finalize_api_v2,
    init_api_v2,
    v2_surface_ok,
)
from api_v2.contract_checks import find_contract_violations
from tests.openapi_semantic import assert_semantic_equivalence

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVER_ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_PATH = REPO_ROOT / "contracts" / "radas-api-v2.openapi.json"
BASELINE_PATH = REPO_ROOT / "contracts" / "radas-api-v2-violations-baseline.json"

#: Tags that must always exist in the v2 document: the manually converted
#: rich-schema blueprints plus the core platform domains console/CLI rely on.
REQUIRED_V2_TAGS = (
    "Auth",
    "Executions",
    "Platform Api",
    "Projects",
    "api_tokens_v2",
    "queue_search_v2",
    "roles_usage_v2",
    "yaml_v2",
)
REQUIRED_V2_SCHEMAS = ("Error", "PaginationMetadata")
REQUIRED_V2_SECURITY_SCHEMES = ("BearerAuth",)

_HTTP_METHOD_RE = re.compile(r"^(get|post|put|patch|delete|head|options|trace)$")


@pytest.fixture(scope="module")
def contract_app():
    """App mounted exactly like production app.py (blueprints + cloud + v2)."""
    app = Flask(__name__)
    app.config.update(TESTING=True)
    register_blueprints(app)
    # Mirrors app.py: cloud provisioning service blueprint is also served.
    from services.cloud_provisioning import register as _register_cloud

    _register_cloud(app)
    init_api_v2(app)
    finalize_api_v2(app)
    return app


@pytest.fixture(scope="module")
def v2_spec(contract_app):
    response = contract_app.test_client().get("/api/v2/openapi.json")
    assert response.status_code == 200
    return response.get_json()


@pytest.fixture
def isolated_readiness(tmp_path, monkeypatch):
    """Isolate readiness() from the real postgres/data-dir environment."""
    from storage import pg

    monkeypatch.setattr(pg, "ping", lambda: True)
    monkeypatch.setattr(health_module, "_data_dir", lambda: tmp_path)


def _iter_operations(spec: dict):
    for path, path_item in (spec.get("paths") or {}).items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            if _HTTP_METHOD_RE.match(str(method)) and isinstance(operation, dict):
                yield str(method).upper(), path, operation


# ---------------------------------------------------------------------------
# v2 availability, OpenAPI 3.1, stable info and required tags/schemas
# ---------------------------------------------------------------------------


def test_v2_openapi_document_is_available_and_pinned(v2_spec):
    assert v2_spec["openapi"] == API_V2_OPENAPI_VERSION == "3.1.0"
    assert v2_spec["info"]["title"] == "OpenSible API (v2)"
    assert v2_spec["info"]["version"] == API_V2_INFO_VERSION == "v2"


def test_v2_document_declares_required_tags_schemas_and_security(v2_spec):
    tags = {tag["name"] for tag in v2_spec.get("tags", [])}
    missing_tags = set(REQUIRED_V2_TAGS) - tags
    assert not missing_tags, f"required v2 tags missing: {sorted(missing_tags)}"

    schemas = v2_spec.get("components", {}).get("schemas", {})
    missing_schemas = set(REQUIRED_V2_SCHEMAS) - set(schemas)
    assert not missing_schemas, f"required v2 schemas missing: {sorted(missing_schemas)}"

    security = v2_spec.get("components", {}).get("securitySchemes", {})
    missing_security = set(REQUIRED_V2_SECURITY_SCHEMES) - set(security)
    assert not missing_security
    assert security["BearerAuth"]["type"] == "http"

    # The document must actually describe operations for consumers to bind.
    assert len(list(_iter_operations(v2_spec))) > 400


def test_v2_operations_have_stable_unique_operation_ids(v2_spec):
    seen: dict[str, str] = {}
    for method, path, operation in _iter_operations(v2_spec):
        operation_id = operation.get("operationId")
        assert operation_id, f"{method} {path} has no operationId"
        assert re.fullmatch(r"[A-Za-z0-9_.-]{1,128}", operation_id), (
            f"{method} {path} operationId {operation_id!r} is not a stable token"
        )
        assert operation_id not in seen, (
            f"duplicate operationId {operation_id!r}: {seen[operation_id]} vs {method} {path}"
        )
        seen[operation_id] = f"{method} {path}"


# ---------------------------------------------------------------------------
# No-regression gating on documented baseline
# ---------------------------------------------------------------------------


def test_v2_contract_violations_do_not_regress_baseline(v2_spec):
    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    current = find_contract_violations(v2_spec)

    assert set(current) == set(baseline["violations"]), "violation categories drifted"
    for category, allowed in baseline["violations"].items():
        new = sorted(set(current[category]) - set(allowed))
        assert not new, (
            f"new {category} violations ({len(new)}) — fix them or regenerate "
            f"snapshot + baseline together after review; first offenders: {new[:5]}"
        )


# ---------------------------------------------------------------------------
# Committed snapshot + byte-stable exporter
# ---------------------------------------------------------------------------


def test_committed_snapshot_matches_served_document(v2_spec):
    """Semantic surface pin (Elixir migration Phase 0.1).

    The snapshot must serve the identical (path, method, operationId) surface
    and remain a structurally valid OpenAPI document. Byte identity and JSON
    serialization no longer gate: no client depends on them; the
    cross-client fixtures assert semantic equivalence.
    """
    assert SNAPSHOT_PATH.exists(), (
        f"missing {SNAPSHOT_PATH}; run scripts/export_openapi.py --output {SNAPSHOT_PATH}"
    )
    snapshot_doc = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    assert_semantic_equivalence(snapshot_doc, v2_spec, label="served")


def test_exporter_output_is_byte_stable_and_matches_snapshot(tmp_path):
    """Exporter determinism is kept (reviewable diffs); snapshot equality is
    relaxed to semantic equivalence (see openapi_semantic.py)."""
    outputs = []
    for run in (1, 2):
        out = tmp_path / f"export-{run}.json"
        proc = subprocess.run(
            [sys.executable, str(SERVER_ROOT / "scripts" / "export_openapi.py"),
             "--output", str(out)],
            capture_output=True,
            text=True,
            cwd=SERVER_ROOT,
            timeout=300,
        )
        assert proc.returncode == 0, f"exporter run {run} failed:\n{proc.stderr[-2000:]}"
        outputs.append(out.read_bytes())

    assert outputs[0] == outputs[1], "exporter is not byte-stable across runs"
    snapshot_doc = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    exporter_doc = json.loads(outputs[0])
    assert_semantic_equivalence(snapshot_doc, exporter_doc, label="exporter")


# ---------------------------------------------------------------------------
# Legacy surface stays untouched
# ---------------------------------------------------------------------------


def test_legacy_openapi_surface_unchanged(contract_app):
    from openapi.spec import get_openapi_spec

    legacy = get_openapi_spec("http://localhost:5000")
    assert legacy["openapi"] == "3.0.3"
    assert legacy["info"]["version"] == "v1"
    assert not [p for p in legacy["paths"] if p.startswith("/api/v2")], (
        "legacy document must not absorb v2 paths"
    )

    rules = {rule.rule: rule.endpoint for rule in contract_app.url_map.iter_rules()}
    assert rules["/api/openapi.json"] == "api_tokens_docs_api.api_openapi_spec"
    assert rules["/api/docs"] == "api_tokens_docs_api.api_docs_swagger_ui"

    # The flask-smorest doc routes at /api/v2 must have exactly one owner
    # (previously the auto-proxy mirrored the legacy doc routes on top of
    # them, creating hidden duplicate ownership).
    v2_doc_owners = [
        rule.endpoint
        for rule in contract_app.url_map.iter_rules()
        if rule.rule == "/api/v2/openapi.json"
    ]
    assert v2_doc_owners == ["api-docs.openapi_json"]

    client = contract_app.test_client()
    served = client.get("/api/v2/openapi.json")
    assert served.status_code == 200
    assert b"3.1.0" in served.data


# ---------------------------------------------------------------------------
# flask-smorest is required: fail closed on mount failure
# ---------------------------------------------------------------------------


def test_init_api_v2_fails_closed_without_flask_smorest(monkeypatch, isolated_readiness):
    app = Flask(__name__)
    app.config.update(TESTING=True)
    # register_blueprints mounts the platform blueprint providing /readyz.
    register_blueprints(app)

    # Simulate the dependency being absent from the environment.
    monkeypatch.setitem(sys.modules, "flask_smorest", None)

    with pytest.raises(RuntimeError, match="flask-smorest"):
        init_api_v2(app)

    state = app.extensions[V2_SURFACE_EXTENSION_KEY]
    assert state["ok"] is False
    assert state["error_type"]  # failure is observable, never silent

    response = app.test_client().get("/readyz")
    assert response.status_code == 503
    body = response.get_json()
    assert body["v2_contract_ok"] is False
    assert body["ok"] is False


def test_finalize_failure_fails_closed_and_fails_readiness(monkeypatch, isolated_readiness):
    import api_v2.auto_register as auto_register

    app = Flask(__name__)
    app.config.update(TESTING=True)
    # register_blueprints mounts the platform blueprint providing /readyz.
    register_blueprints(app)
    init_api_v2(app)

    def _explode(api, flask_app):
        raise RuntimeError("auto-proxy registration exploded")

    monkeypatch.setattr(auto_register, "register_auto_proxies", _explode)
    with pytest.raises(RuntimeError, match="finalize"):
        finalize_api_v2(app)

    assert v2_surface_ok(app) is False
    response = app.test_client().get("/readyz")
    assert response.status_code == 503
    assert response.get_json()["v2_contract_ok"] is False


def test_readyz_reports_v2_contract_ok_when_mounted(contract_app):
    report = contract_app.extensions[V2_SURFACE_EXTENSION_KEY]
    assert report["ok"] is True

    with contract_app.app_context():
        readiness = health_module.readiness()
    assert readiness["v2_contract_ok"] is True

    # The mount path must also leave a complete blueprint registration.
    registry = contract_app.extensions[REGISTRY_EXTENSION_KEY]
    assert registry["failed_required"] == []


def test_readyz_ignores_apps_that_never_mount_v2(isolated_readiness):
    """Missing evidence stays healthy — same policy as required blueprints."""
    app = Flask(__name__)
    app.config.update(TESTING=True)
    app.register_blueprint(platform_bp)

    with app.app_context():
        readiness = health_module.readiness()
    assert readiness["v2_contract_ok"] is True
    assert readiness["ok"] is True
