"""Tests for Enterprise Access, Guardrails & Policy Management Fase 6 Batch 9.

UC494: Granular RBAC Roles (flags_admin, tests_admin, byoc_admin).
"""
from __future__ import annotations

import flask
import pytest
from auth import middleware


def test_granular_domain_rbac_permissions():
    """UC494: Evaluate domain permissions for granular roles."""
    # 1. flags_admin can access flags, but not tests/byoc
    assert middleware.has_domain_permission(["flags_admin"], "flags") is True
    assert middleware.has_domain_permission(["flags_admin"], "tests") is False
    assert middleware.has_domain_permission(["flags_admin"], "byoc") is False

    # 2. tests_admin can access tests, but not flags
    assert middleware.has_domain_permission(["tests_admin"], "tests") is True
    assert middleware.has_domain_permission(["tests_admin"], "flags") is False

    # 3. byoc_admin can access byoc, but not flags/tests
    assert middleware.has_domain_permission(["byoc_admin"], "byoc") is True
    assert middleware.has_domain_permission(["byoc_admin"], "tests") is False

    # 4. Superadmin / Owner has universal domain access
    assert middleware.has_domain_permission(["admin"], "flags") is True
    assert middleware.has_domain_permission(["owner"], "tests") is True
    assert middleware.has_domain_permission(["superadmin"], "byoc") is True


def test_require_domain_admin_decorator():
    """UC494: @require_domain_admin endpoint protection."""
    app = flask.Flask(__name__)

    @app.route("/api/flags/mutate", methods=["POST"])
    @middleware.require_domain_admin("flags")
    def flags_mutate():
        return flask.jsonify({"ok": True}), 200

    client = app.test_client()

    # 1. Unprivileged user -> 403
    with app.test_request_context("/api/flags/mutate", method="POST"):
        flask.request.current_user = {"username": "viewer", "roles": ["viewer"]}
        resp = app.dispatch_request()
        assert resp[1] == 403

    # 2. flags_admin user -> 200
    with app.test_request_context("/api/flags/mutate", method="POST"):
        flask.request.current_user = {"username": "flag_mgr", "roles": ["flags_admin"]}
        resp = app.dispatch_request()
        assert resp[1] == 200


def test_kill_switch_privilege_evaluation():
    """UC495: Evaluate kill switch permissions for user roles."""
    from auth import middleware

    assert middleware.can_execute_kill_switch(["superadmin"]) is True
    assert middleware.can_execute_kill_switch(["owner"]) is True
    assert middleware.can_execute_kill_switch(["admin"]) is True

    # Developer, operator, qa, flags_admin are denied
    assert middleware.can_execute_kill_switch(["developer"]) is False
    assert middleware.can_execute_kill_switch(["operator"]) is False
    assert middleware.can_execute_kill_switch(["qa"]) is False
    assert middleware.can_execute_kill_switch(["flags_admin"]) is False


def test_require_kill_switch_privilege_decorator():
    """UC495: @require_kill_switch_privilege endpoint protection."""
    from auth import middleware

    app = flask.Flask(__name__)

    @app.route("/api/system/emergency-stop", methods=["POST"])
    @middleware.require_kill_switch_privilege
    def emergency_stop():
        return flask.jsonify({"status": "halted"}), 200

    # 1. Developer -> 403 Forbidden
    with app.test_request_context("/api/system/emergency-stop", method="POST"):
        flask.request.current_user = {"username": "dev_user", "roles": ["developer"]}
        resp = app.dispatch_request()
        assert resp[1] == 403

    # 2. Superadmin -> 200 OK
    with app.test_request_context("/api/system/emergency-stop", method="POST"):
        flask.request.current_user = {"username": "root_admin", "roles": ["superadmin"]}
        resp = app.dispatch_request()
        assert resp[1] == 200
        assert resp[0].get_json()["status"] == "halted"


def test_preview_auto_tagging():
    """UC500: Standard preview resource tag injection."""
    from services.preview_envs import inject_preview_standard_tags

    existing_vars = {
        "instance_type": "t3.micro",
        "tags": {"App": "web"},
    }

    tagged = inject_preview_standard_tags(existing_vars, pr_number=42, project_id="proj-preview-99", base_stack="web-prod")
    assert tagged["instance_type"] == "t3.micro"
    assert tagged["preview"] is True

    tags = tagged["tags"]
    assert tags["App"] == "web"
    assert tags["Environment"] == "preview"
    assert tags["ManagedBy"] == "radas"
    assert tags["PRNumber"] == "42"
    assert tags["AutoExpire"] == "true"
    assert tags["BaseStack"] == "web-prod"
    assert tags["Project"] == "proj-preview-99"
