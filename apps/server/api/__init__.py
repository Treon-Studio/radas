"""API blueprints package.

Blueprint registration policy lives in :mod:`api.route_inventory` (Task 0.2):
required modules fail closed (startup error in strict mode, readiness failure
otherwise), optional modules are logged skips. This package keeps the
historical import surface ``from api import register_blueprints`` so existing
call sites (``app.py``, tests) keep working unchanged.

Usage from app.py:
    from api import register_blueprints
    register_blueprints(app)                      # strict (default)
    register_blueprints(app, strict_required=False)
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from api.route_inventory import (
    API_CONTRACT_VERSION,
    EXPECTED_CORE_ROUTES,
    OPTIONAL_BLUEPRINT_MODULES,
    REGISTRY_EXTENSION_KEY,
    REQUIRED_BLUEPRINT_MODULES,
    collect_routes,
    contract_version,
    find_duplicate_routes,
    find_missing_expected_routes,
    register_blueprints,
    required_blueprints_ok,
)

if TYPE_CHECKING:
    from flask import Flask

__all__ = [
    "API_CONTRACT_VERSION",
    "EXPECTED_CORE_ROUTES",
    "OPTIONAL_BLUEPRINT_MODULES",
    "REGISTRY_EXTENSION_KEY",
    "REQUIRED_BLUEPRINT_MODULES",
    "collect_routes",
    "contract_version",
    "find_duplicate_routes",
    "find_missing_expected_routes",
    "register_blueprints",
    "required_blueprints_ok",
]
