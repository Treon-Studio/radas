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
