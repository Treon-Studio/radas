"""API blueprints package.

Phase 1 (scaffold): empty blueprints, no routes moved yet.
Subsequent phases will move route handlers out of app.py into these
blueprint modules. Each blueprint module exposes a `bp` attribute.

Usage from app.py:
    from api import register_blueprints
    register_blueprints(app)
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from flask import Flask


def register_blueprints(app: "Flask") -> None:
    """Register all API blueprints onto the given Flask app.

    Imports are lazy/local so a broken blueprint module can't take down
    the whole app at import time — the offending module logs and skips.
    """
    from importlib import import_module

    # The response contract is opt-in. It installs request finalization at app
    # scope. ``platform_routes`` is intentionally legacy-only (health probes
    # and the idempotency status route), so it must not receive new-contract
    # blueprint handlers.
    from api.platform_contracts import register_platform_contracts
    register_platform_contracts(app)

    modules = [
        "api.auth_routes",
        "api.users_routes",
        "api.inventory_routes",
        "api.playbook_routes",
        "api.ansible_cfg_routes",
        "api.cloud_routes",
        "api.worker_routes",
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
        "api.executions_routes",
        "api.budget_routes",
        "api.quota_routes",
        "api.approval_routes",
        "api.service_account_routes",
        "api.compliance_routes",
        "api.secret_rotation_routes",
        "api.cost_aggregator_routes",
        "api.ai_routes",
        "api.metrics_routes",
        "api.inbound_webhook_routes",
        "api.automation_routes",
        "api.stack_lifecycle_routes",
        "api.notif_routes",
        "api.platform_routes",
        "api.env_promotion_routes",
        "api.mfa_routes",
        "api.ai_roadmap_routes",
        "api.custom_template_routes",
        "api.retry_policy_routes",
        "api.oidc_routes",
        "api.bastion_routes",
        "api.provider_mirror_routes",
        "api.env_roles_routes",
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
        "api.projects_routes",
        "api.audit_log_routes",
        "api.preview_env_routes",
        "api.feature_flag_routes",
        "api.test_case_routes",
        "api.github_actions_routes",
        "api.github_oauth_routes",
        "api.byoc_routes",
        "api.org_routes",
        "api.code_registry_routes",
    ]
    for mod_name in modules:
        try:
            mod = import_module(mod_name)
            bp = getattr(mod, "bp", None)
            if bp is not None:
                app.register_blueprint(bp)
        except Exception as e:  # pragma: no cover - defensive
            app.logger.error(f"Failed to register blueprint {mod_name}: {e}", exc_info=True)
