"""Runtime route inventory and the required/optional blueprint policy.

Task 0.2 of the console–CLI integration plan (2026-08-27). Two
responsibilities live here:

1. ``register_blueprints`` mounts every API blueprint with an explicit
   required/optional policy. A failure in a *required* module fails closed:
   strict mode (the default) raises a startup error, and every mode records
   the outcome on ``app.extensions`` under :data:`REGISTRY_EXTENSION_KEY` so
   ``/readyz`` can report ``required_blueprints_ok=False``. A failure in an
   *optional* module stays a logged skip — integrations must never silently
   shrink the core API surface, and their loss must not break required APIs.
2. ``collect_routes`` renders the running ``url_map`` as the route inventory
   (path, methods, endpoint, blueprint, auth/scope class, contract namespace)
   used by ``docs/architecture/api-contract-inventory.md`` and later parity
   tooling.

The classification helpers are descriptive metadata derived from the route
path. They document intent for humans and checkers; they do not enforce
authorization.
"""
from __future__ import annotations

import re
from importlib import import_module
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from flask import Flask

REGISTRY_EXTENSION_KEY = "radas_blueprint_registry"

#: Forward-facing API contract served under ``/api/v2``. Legacy ``/api/*``
#: remains the compatibility surface until a separately reviewed migration.
API_CONTRACT_VERSION = "v2"

#: Blueprint modules whose absence or import failure means the server cannot
#: honor its documented contract. Covers auth, projects (list + dashboard),
#: executions, worker claim/heartbeat APIs, platform contracts (including the
#: ``/healthz``/``/readyz`` probes themselves), and the core services domain.
REQUIRED_BLUEPRINT_MODULES: tuple[str, ...] = (
    "api.auth_routes",
    "api.executions_routes",
    "api.platform_routes",
    "api.project_dashboard_routes",
    "api.projects_routes",
    "api.service_catalog_routes",
    "api.service_instance_routes",
    "api.service_observability_routes",
    "api.service_pipeline_routes",
    "api.service_plan_routes",
    "api.service_source_routes",
    "api.worker_routes",
)

#: Everything else: additive product modules and third-party integrations
#: (OAuth providers, AI routing, cloud provisioning, …). A failure here is a
#: logged skip visible in the registration report and diagnostics, never a
#: startup abort.
OPTIONAL_BLUEPRINT_MODULES: tuple[str, ...] = (
    "api.users_routes",
    "api.inventory_routes",
    "api.playbook_routes",
    "api.ansible_cfg_routes",
    "api.cloud_routes",
    "api.secrets_routes",
    "api.settings_routes",
    "api.logs_routes",
    "api.cost_routes",
    "api.templates_routes",
    "api.roles_usage_routes",
    "api.cicd_routes",
    "api.misc_routes",
    "api.backups_routes",
    "api.admin_routes",
    "api.budget_routes",
    "api.quota_routes",
    "api.approval_routes",
    "api.service_account_routes",
    "api.compliance_routes",
    "api.secret_rotation_routes",
    "api.cost_aggregator_routes",
    "api.ai_routes",
    "api.ai_router_routes",
    "api.metrics_routes",
    "api.inbound_webhook_routes",
    "api.automation_routes",
    "api.stack_lifecycle_routes",
    "api.notif_routes",
    "api.env_promotion_routes",
    "api.mfa_routes",
    "api.ai_roadmap_routes",
    "api.custom_template_routes",
    "api.retry_policy_routes",
    "api.oidc_routes",
    "api.bastion_routes",
    "api.provider_mirror_routes",
    "api.env_roles_routes",
    "api.environment_routes",
    "api.export_routes",
    "api.stack_import_routes",
    "api.webhook_routes",
    "api.global_secrets_routes",
    "api.roles_routes",
    "api.playbooks_routes",
    "api.vaults_routes",
    "api.sources_routes",
    "api.group_host_vars_routes",
    "api.api_tokens_docs_routes",
    "api.inventory_groups_hosts_routes",
    "api.inventory_files_routes",
    "api.yaml_routes",
    "api.data_routes",
    "api.host_checks_routes",
    "api.ansible_run_routes",
    "api.queue_search_routes",
    "api.audit_log_routes",
    "api.preview_env_routes",
    "api.feature_flag_routes",
    "api.test_case_routes",
    "api.github_actions_routes",
    "api.github_oauth_routes",
    "api.byoc_routes",
    "api.org_routes",
    "api.code_registry_routes",
    "api.tofu_module_routes",
    "api.usage_routes",
    "api.runtime_connection_routes",
    "api.service_change_request_routes",
    "api.catalog_metadata_routes",
    "api.billing_plan_routes",
    "api.drift_routes",
    "api.search_routes",
    "api.onboarding_routes",
    "api.branch_mapping_routes",
    "api.user_invite_routes",
    "api.google_oauth_routes",
)

#: Minimum route surface that must exist after a full production-style
#: registration. Paths were verified against this checkout's blueprint
#: declarations; the goal is regression detection, not exhaustive coverage.
EXPECTED_CORE_ROUTES: tuple[str, ...] = (
    "/healthz",
    "/healthz/details",
    "/readyz",
    "/api/auth/login",
    "/api/auth/refresh",
    "/api/auth/me",
    "/api/projects",
    "/api/executions",
    "/api/projects/<project_id>/services",
    "/api/worker/register",
    "/api/worker/claim",
    "/api/worker/heartbeat",
)

#: Routes reachable without credentials: health/readiness probes and the
#: token-issuance endpoints that bootstrap authentication itself, plus the
#: OpenAPI documents. Kept deliberately small; everything else is inventoried
#: as authenticated-by-default even if a route happens to be publicly safe.
_PUBLIC_ROUTES = frozenset(
    {
        "/healthz",
        "/healthz/details",
        "/readyz",
        "/api/auth/login",
        "/api/auth/refresh",
        "/api/v2/openapi.json",
        "/api/v2/docs",
    }
)

_PROJECT_SEGMENT_RE = re.compile(r"/projects/[^/]+")


def _contract_namespace(path: str) -> str:
    """Map a URL path to its contract namespace."""
    if path == "/healthz" or path.startswith(("/healthz/", "/readyz")):
        return "ops"
    if path == "/api/platform" or path.startswith("/api/platform/"):
        return "platform"
    if path == "/api/v2" or path.startswith("/api/v2/"):
        return "openapi-v2"
    if path == "/api" or path.startswith("/api/"):
        return "legacy"
    return "non-api"


def _auth_class(path: str) -> str:
    return "public" if path in _PUBLIC_ROUTES else "authenticated"


def _scope_class(path: str) -> str:
    return "project-scoped" if _PROJECT_SEGMENT_RE.search(path) else "global"


def collect_routes(app: "Flask") -> list[dict[str, Any]]:
    """Return the deterministic route inventory for a mounted application.

    Each entry carries: ``path``, ``methods`` (no HEAD/OPTIONS),
    ``endpoint``, owning ``blueprint`` (``None`` for app-level rules),
    ``auth_class``, ``scope_class``, and ``contract_namespace``.
    """
    routes: list[dict[str, Any]] = []
    for rule in app.url_map.iter_rules():
        path = rule.rule
        methods = sorted(rule.methods - {"HEAD", "OPTIONS"})
        blueprint_name = rule.endpoint.rsplit(".", 1)[0] if "." in rule.endpoint else None
        routes.append(
            {
                "path": path,
                "methods": methods,
                "endpoint": rule.endpoint,
                "blueprint": blueprint_name,
                "auth_class": _auth_class(path),
                "scope_class": _scope_class(path),
                "contract_namespace": _contract_namespace(path),
            }
        )
    routes.sort(key=lambda entry: (entry["path"], ",".join(entry["methods"])))
    return routes


def find_duplicate_routes(
    routes: list[dict[str, Any]] | Any,
) -> list[dict[str, Any]]:
    """Detect ``(method, path)`` pairs owned by more than one endpoint.

    Werkzeug happily registers overlapping rules and dispatches to whichever
    sorts first, so ownership conflicts only surface through inspection.
    Returns a sorted list of conflicts with every owner endpoint listed.
    """
    owners: dict[tuple[str, str], set[str]] = {}
    for entry in routes:
        for method in entry["methods"]:
            owners.setdefault((method, entry["path"]), set()).add(entry["endpoint"])

    duplicates = [
        {"method": method, "path": path, "owners": sorted(route_owners)}
        for (method, path), route_owners in owners.items()
        if len(route_owners) > 1
    ]
    duplicates.sort(key=lambda c: (c["path"], c["method"]))
    return duplicates


def find_missing_expected_routes(
    routes: list[dict[str, Any]] | Any,
    expected: tuple[str, ...] | None = None,
) -> list[str]:
    """Return expected core paths that are absent from the inventory."""
    expected_paths = EXPECTED_CORE_ROUTES if expected is None else expected
    present = {entry["path"] for entry in routes}
    return sorted(set(expected_paths) - present)


def register_blueprints(app: "Flask", *, strict_required: bool = True) -> None:
    """Register all API blueprints under the required/optional policy.

    Platform contract finalization is installed first so any successfully
    registered blueprint is covered even if a required failure aborts the
    remainder of the process.

    Args:
        app: Target Flask application.
        strict_required: When true (default), a failed *required* module
            raises :class:`RuntimeError` after the whole pass completed;
            when false, the failure is only recorded for readiness.

    Registration outcomes always land on
    ``app.extensions[REGISTRY_EXTENSION_KEY]`` with ``registered``,
    ``failed_required``, and ``skipped_optional`` lists plus the
    ``strict_required`` flag, regardless of the mode. Exception details are
    reduced to the exception type name in log output so accidental
    credential leakage through messages has no channel; correlation uses the
    module name.
    """
    # The outcome report is created and published on extensions BEFORE any
    # registration step runs, so even a platform-contract init failure lands
    # registry state on the app (the docstring's "regardless of the mode"
    # promise) and app.py's readiness-failing boot path can observe it.
    report: dict[str, Any] = {
        "strict_required": bool(strict_required),
        "registered": [],
        "failed_required": [],
        "skipped_optional": [],
    }
    app.extensions[REGISTRY_EXTENSION_KEY] = report

    # The response contract is opt-in. It installs request finalization at
    # app scope. ``platform_routes`` is intentionally legacy-only (health
    # probes and the idempotency status route), so it must not receive
    # new-contract blueprint handlers.
    from api.platform_contracts import register_platform_contracts

    register_platform_contracts(app)

    # De-duplicate while preserving order: REQUIRED first so the mandatory
    # surface mounts and reports before anything optional.
    module_names = tuple(
        dict.fromkeys((*REQUIRED_BLUEPRINT_MODULES, *OPTIONAL_BLUEPRINT_MODULES))
    )
    for mod_name in module_names:
        try:
            mod = import_module(mod_name)
            bp = getattr(mod, "bp", None)
            if bp is None:
                raise AttributeError(f"module {mod_name} exposes no 'bp' blueprint")
            app.register_blueprint(bp)
            report["registered"].append(mod_name)
        except Exception as exc:
            entry = {"module": mod_name, "error_type": type(exc).__name__}
            if mod_name in REQUIRED_BLUEPRINT_MODULES:
                report["failed_required"].append(entry)
                app.logger.error(
                    "Required blueprint failed to register module=%s error_type=%s",
                    mod_name,
                    type(exc).__name__,
                )
            else:
                report["skipped_optional"].append(entry)
                app.logger.warning(
                    "Optional blueprint skipped module=%s error_type=%s",
                    mod_name,
                    type(exc).__name__,
                )

    app.extensions[REGISTRY_EXTENSION_KEY] = report

    if report["failed_required"]:
        detail = ", ".join(
            sorted(str(item["module"]) for item in report["failed_required"])
        )
        message = f"Required API blueprints failed to register: {detail}"
        if strict_required:
            raise RuntimeError(message)
        app.logger.error("%s", message)


# ---------------------------------------------------------------------------
# Readiness accessors (consumed by services.health.readiness)
# ---------------------------------------------------------------------------


def registration_report(app: Any | None = None) -> dict[str, Any] | None:
    """Return the last blueprint registration report for ``app``.

    Falls back to the active application context. ``None`` means no
    registration ran on this process yet (e.g. health probed outside an app).
    """
    if app is None:
        try:
            from flask import current_app

            app = current_app._get_current_object()  # noqa: SLF001
        except Exception:
            return None
    extensions = getattr(app, "extensions", None) or {}
    report = extensions.get(REGISTRY_EXTENSION_KEY)
    return report if isinstance(report, dict) else None


def required_blueprints_ok(app: Any | None = None) -> bool:
    """True unless a required blueprint actually failed on this app.

    Missing evidence (no registration report) is reported healthy: the flag
    exists to convert observed failures into unhealthy readiness, not to
    guess about processes that never ran registration.
    """
    report = registration_report(app)
    if report is None:
        return True
    return not report.get("failed_required")


def contract_version() -> str:
    """Version label of the forward-facing API contract."""
    return API_CONTRACT_VERSION
