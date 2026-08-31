"""Ontology read-only routes (Phase 2 of the domain ontology plan).

Serves the domain ontology (contracts/domain-ontology.json) so the desktop
pet and console fetch the live semantic contract instead of hardcoding rules
or state machines. Read-only and authenticated; the payload is entity
metadata and alert rules only — no secrets or payloads by construction.

Envelope note: ``GET /api/ontology`` returns the ontology document itself as
``data`` (so clients read ``data.ontology_version`` / ``data.entities``
directly), while ``GET /api/ontology/alerts`` nests the rule set under
``data.alerts`` — both as pinned by tests/test_ontology_parity.py.
"""
from __future__ import annotations

from flask import Blueprint

from api.platform_contracts import success_response
from auth.middleware import require_auth
from services import ontology

bp = Blueprint("ontology_api", __name__)


@bp.get("/api/ontology")
@require_auth
def get_ontology():
    return success_response(ontology.load_ontology())


@bp.get("/api/ontology/alerts")
@require_auth
def get_ontology_alerts():
    return success_response({"alerts": ontology.alert_rules()})
