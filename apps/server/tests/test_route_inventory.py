"""Runtime route inventory + required/optional blueprint policy (Task 0.2).

Covers:
- ``collect_routes(app)`` output schema with auth/scope class and contract
  namespace classification.
- Required-blueprint policy: broken required blueprints fail closed via a
  startup exception (strict mode) or an unhealthy readiness report; optional
  modules keep the logged-skip behavior.
- Duplicate ``(method, path)`` ownership detection and expected-core-route
  presence checks.
"""
from __future__ import annotations

import logging

import pytest
from flask import Blueprint, Flask, jsonify

import api.route_inventory as route_inventory
import services.health as health_module
from api.platform_routes import bp as platform_bp
from api.route_inventory import (
    API_CONTRACT_VERSION,
    EXPECTED_CORE_ROUTES,
    REGISTRY_EXTENSION_KEY,
    REQUIRED_BLUEPRINT_MODULES,
    collect_routes,
    find_duplicate_routes,
    find_missing_expected_routes,
    register_blueprints,
)


BROKEN_REQUIRED_MODULE = "api.totally_missing_required_probe"
BROKEN_OPTIONAL_MODULE = "api.totally_missing_optional_probe"


@pytest.fixture
def probe_app() -> Flask:
    """Plain Flask app without blueprints.

    ``register_blueprints`` itself mounts the platform/readiness blueprint
    while the required-module list stays intact, so registration outcomes are
    exercised exactly like production.
    """
    app = Flask(__name__)
    app.config.update(TESTING=True)
    return app


@pytest.fixture
def isolated_readiness(tmp_path, monkeypatch):
    """Isolate readiness() from the real postgres/data-dir environment."""
    from storage import pg

    monkeypatch.setattr(pg, "ping", lambda: True)
    monkeypatch.setattr(health_module, "_data_dir", lambda: tmp_path)


def _with_broken_required(monkeypatch):
    monkeypatch.setattr(
        route_inventory,
        "REQUIRED_BLUEPRINT_MODULES",
        (*REQUIRED_BLUEPRINT_MODULES, BROKEN_REQUIRED_MODULE),
    )


# ---------------------------------------------------------------------------
# Readiness fails closed when a required blueprint is broken
# ---------------------------------------------------------------------------


def test_readyz_is_unhealthy_when_required_blueprint_is_broken(
    probe_app, monkeypatch, isolated_readiness
):
    _with_broken_required(monkeypatch)
    # Non-strict boot records the failure instead of raising, mirroring how
    # app.py converts a strict-mode failure into a readiness-failing state.
    register_blueprints(probe_app, strict_required=False)

    response = probe_app.test_client().get("/readyz")

    assert response.status_code == 503
    body = response.get_json()
    assert body["ok"] is False
    assert body["required_blueprints_ok"] is False
    assert body["database_ok"] is True
    assert body["checks"]["data_dir"] is True


def test_strict_registration_raises_and_records_broken_required_blueprint(
    monkeypatch,
):
    _with_broken_required(monkeypatch)
    app = Flask(__name__)
    app.config.update(TESTING=True)

    with pytest.raises(RuntimeError, match=BROKEN_REQUIRED_MODULE):
        register_blueprints(app)

    report = app.extensions[REGISTRY_EXTENSION_KEY]
    failed = [entry["module"] for entry in report["failed_required"]]
    assert BROKEN_REQUIRED_MODULE in failed
    assert report["strict_required"] is True
    assert all(m in report["registered"] for m in REQUIRED_BLUEPRINT_MODULES)


def test_pre_contract_failure_still_records_registry_report(monkeypatch):
    """A platform-contract init failure must still land the registry report.

    app.py converts strict registration errors into a readiness-failing boot
    state, which only works when the outcome is on ``app.extensions`` — the
    docstring promises this "regardless of the mode", including failures that
    happen before any blueprint is attempted.
    """
    from api import platform_contracts

    def _explode(app):
        raise RuntimeError("contract init failed")

    monkeypatch.setattr(platform_contracts, "register_platform_contracts", _explode)
    app = Flask(__name__)
    app.config.update(TESTING=True)

    with pytest.raises(RuntimeError, match="contract init failed"):
        register_blueprints(app)

    report = app.extensions[REGISTRY_EXTENSION_KEY]
    assert isinstance(report, dict)
    assert report["strict_required"] is True
    assert report["registered"] == []
    assert report["failed_required"] == []
    assert report["skipped_optional"] == []


def test_broken_optional_blueprint_is_logged_skip_not_failure(
    probe_app, monkeypatch, caplog
):
    monkeypatch.setattr(
        route_inventory,
        "OPTIONAL_BLUEPRINT_MODULES",
        (BROKEN_OPTIONAL_MODULE,),
    )

    with caplog.at_level(logging.WARNING):
        register_blueprints(probe_app, strict_required=True)

    report = probe_app.extensions[REGISTRY_EXTENSION_KEY]
    assert report["failed_required"] == []
    assert [entry["module"] for entry in report["skipped_optional"]] == [
        BROKEN_OPTIONAL_MODULE
    ]
    assert any(
        BROKEN_OPTIONAL_MODULE in record.getMessage()
        for record in caplog.records
    )
    # All required modules still made it onto the app.
    registered = set(report["registered"])
    assert registered == {
        f"api.{_mod}"
        for _mod in (
            "auth_routes",
            "projects_routes",
            "project_dashboard_routes",
            "executions_routes",
            "worker_routes",
            "platform_routes",
            "service_catalog_routes",
            "service_instance_routes",
            "service_pipeline_routes",
            "service_observability_routes",
            "service_source_routes",
            "service_plan_routes",
        )
    }


def test_optional_failure_keeps_readiness_requirements_green(
    probe_app, monkeypatch, isolated_readiness
):
    monkeypatch.setattr(
        route_inventory,
        "OPTIONAL_BLUEPRINT_MODULES",
        (BROKEN_OPTIONAL_MODULE,),
    )
    register_blueprints(probe_app, strict_required=False)

    response = probe_app.test_client().get("/readyz")

    body = response.get_json()
    assert response.status_code == 200
    assert body["required_blueprints_ok"] is True
    assert body["database_ok"] is True
    assert body["contract_version"] == API_CONTRACT_VERSION


# ---------------------------------------------------------------------------
# Production-shape registration: full default surface
# ---------------------------------------------------------------------------


@pytest.fixture
def full_app():
    app = Flask(__name__)
    app.config.update(TESTING=True)
    register_blueprints(app)
    return app


def test_full_registration_registers_every_required_module(full_app):
    report = full_app.extensions[REGISTRY_EXTENSION_KEY]
    assert report["failed_required"] == []
    assert report["skipped_optional"] == []
    assert set(REQUIRED_BLUEPRINT_MODULES).issubset(set(report["registered"]))


def test_full_registration_has_no_duplicates_or_missing_core_routes(full_app):
    routes = collect_routes(full_app)

    assert find_duplicate_routes(routes) == []
    assert find_missing_expected_routes(routes) == []


def test_collect_routes_classifies_public_auth_endpoints(full_app):
    routes = {entry["path"]: entry for entry in collect_routes(full_app)}

    assert routes["/api/auth/login"]["auth_class"] == "public"
    assert routes["/api/auth/refresh"]["auth_class"] == "public"
    assert routes["/readyz"]["auth_class"] == "public"
    assert routes["/api/auth/me"]["auth_class"] == "authenticated"


# ---------------------------------------------------------------------------
# collect_routes schema and classification on a synthetic app
# ---------------------------------------------------------------------------


def test_collect_routes_entries_expose_the_contracted_schema():
    app = Flask(__name__)
    widget_bp = Blueprint("widget_api", __name__)

    @widget_bp.get("/api/projects/<project_id>/widgets")
    def list_widgets(project_id: str):
        return jsonify([])

    @app.get("/legacy/widgets")
    def legacy_widgets():
        return jsonify([])

    app.register_blueprint(widget_bp)
    app.register_blueprint(platform_bp)

    entries = collect_routes(app)

    expected_keys = {
        "path",
        "methods",
        "endpoint",
        "blueprint",
        "auth_class",
        "scope_class",
        "contract_namespace",
    }
    assert entries
    assert all(expected_keys == set(entry.keys()) for entry in entries)
    assert all("HEAD" not in entry["methods"] for entry in entries)
    assert all("OPTIONS" not in entry["methods"] for entry in entries)

    by_path = {entry["path"]: entry for entry in entries}
    widget = by_path["/api/projects/<project_id>/widgets"]
    assert widget["methods"] == ["GET"]
    assert widget["endpoint"] == "widget_api.list_widgets"
    assert widget["blueprint"] == "widget_api"
    assert widget["scope_class"] == "project-scoped"
    assert widget["contract_namespace"] == "legacy"

    assert by_path["/legacy/widgets"]["blueprint"] is None
    assert by_path["/readyz"]["contract_namespace"] == "ops"
    assert by_path["/api/platform/idempotency"]["contract_namespace"] == "platform"


def test_collect_routes_marks_v2_namespace_when_mounted():
    app = Flask(__name__)
    v2_like = Blueprint("v2_probe", __name__)

    @v2_like.get("/api/v2/things")
    def things():
        return jsonify([])

    @v2_like.get("/api/v2/openapi.json")
    def spec():
        return jsonify({})

    app.register_blueprint(v2_like)

    by_path = {entry["path"]: entry for entry in collect_routes(app)}
    assert by_path["/api/v2/things"]["contract_namespace"] == "openapi-v2"
    assert by_path["/api/v2/openapi.json"]["auth_class"] == "public"


# ---------------------------------------------------------------------------
# Duplicate ownership + expected-route detection helpers
# ---------------------------------------------------------------------------


def test_find_duplicate_routes_flags_conflicting_method_path_ownership():
    app = Flask(__name__)

    def owner_one():
        return "one"

    def owner_two():
        return "two"

    app.add_url_rule("/dup/thing", "owner_one", owner_one, methods=["GET"])
    app.add_url_rule("/dup/thing", "owner_two", owner_two, methods=["GET"])

    duplicates = find_duplicate_routes(collect_routes(app))

    assert len(duplicates) == 1
    conflict = duplicates[0]
    assert conflict["method"] == "GET"
    assert conflict["path"] == "/dup/thing"
    assert set(conflict["owners"]) == {"owner_one", "owner_two"}


def test_find_duplicate_routes_empty_for_unique_surface():
    app = Flask(__name__)
    app.add_url_rule("/only/one", "a", lambda: "")
    app.add_url_rule("/two", "b", lambda: "")

    assert find_duplicate_routes(collect_routes(app)) == []


def test_find_missing_expected_routes_reports_unregistered_paths():
    app = Flask(__name__)
    app.add_url_rule("/healthz", "h", lambda: "")

    missing = find_missing_expected_routes(collect_routes(app))

    assert "/readyz" in missing
    assert "/api/auth/login" in missing
    assert missing == sorted(missing)
