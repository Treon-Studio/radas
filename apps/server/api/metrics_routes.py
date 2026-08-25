"""
Prometheus Metrics Route (UC464).
"""
from __future__ import annotations

from flask import Blueprint, Response
from services.metrics_exporter import generate_prometheus_metrics

bp = Blueprint("metrics_api", __name__)


@bp.route("/api/metrics", methods=["GET"])
@bp.route("/metrics", methods=["GET"])
def api_get_metrics():
    metrics_text = generate_prometheus_metrics()
    return Response(metrics_text, mimetype="text/plain; version=0.0.4; charset=utf-8")
