"""Prometheus metrics endpoint (Fase 5 — UC 62)."""
from __future__ import annotations

from flask import Blueprint, Response

from services.metrics import render_prometheus

bp = Blueprint("metrics_api", __name__)


@bp.route('/metrics', methods=['GET'])
def api_metrics():
    """Prometheus scrape endpoint (unauthenticated, internal network)."""
    return Response(render_prometheus(), mimetype="text/plain; version=0.0.4; charset=utf-8")
