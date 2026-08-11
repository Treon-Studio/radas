"""Export data as CSV/JSON (Fase 1 — UC 100)."""
from __future__ import annotations

import csv
import io
import json
from flask import Blueprint, Response, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from utils.request_ctx import get_project_id_from_request as _get_pid_raw

bp = Blueprint("export_api", __name__)


def _project_id():
    return _get_pid_raw(lambda: None)


def _as_csv(rows):
    if not rows:
        return ""
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)
    return out.getvalue()


def _respond(data, fmt, filename):
    if fmt == "csv":
        if isinstance(data, dict):
            data = [data]
        body = _as_csv(data)
        return Response(body, mimetype="text/csv",
                        headers={"Content-Disposition": f"attachment; filename={filename}.csv"})
    return Response(json.dumps(data, indent=2, ensure_ascii=False), mimetype="application/json",
                    headers={"Content-Disposition": f"attachment; filename={filename}.json"})


@bp.route('/api/export/stacks', methods=['GET'])
@require_auth
def api_export_stacks():
    pid = _project_id()
    if not pid:
        return jsonify({"error": "Project required"}), 400
    from services.cloud_provisioning import _stack_data_dir
    base = _stack_data_dir(pid, "_")  # resolve base dir
    base = base.parent
    rows = []
    if base.exists():
        for d in sorted(base.iterdir()):
            if not d.is_dir():
                continue
            meta_p = d / "meta.json"
            if not meta_p.exists():
                continue
            try:
                m = json.loads(meta_p.read_text(encoding="utf-8"))
            except Exception:
                continue
            rows.append({
                "name": m.get("name") or d.name,
                "provider": m.get("provider"),
                "status": m.get("status"),
                "env": m.get("env"),
                "region": m.get("region"),
                "updated_at": m.get("updated_at"),
                "created_at": m.get("created_at"),
            })
    return _respond(rows, request.args.get("format", "json"), "stacks")


@bp.route('/api/export/executions', methods=['GET'])
@require_auth
def api_export_executions():
    pid = _project_id()
    if not pid:
        return jsonify({"error": "Project required"}), 400
    from services.execution_history import list_executions
    try:
        rows = list_executions(limit=1000, project_id=pid)
    except Exception:
        rows = []
    clean = []
    for e in rows:
        clean.append({
            "id": e.get("id"),
            "status": e.get("status"),
            "type": e.get("type"),
            "started_at": e.get("startedAt"),
            "finished_at": e.get("finishedAt"),
            "duration": e.get("duration"),
            "worker_id": e.get("workerId"),
        })
    return _respond(clean, request.args.get("format", "json"), "executions")


@bp.route('/api/export/cost', methods=['GET'])
@require_auth
def api_export_cost():
    pid = _project_id()
    if not pid:
        return jsonify({"error": "Project required"}), 400
    try:
        from storage.cost_store import list_estimates
        rows = list_estimates(pid)
    except Exception:
        rows = []
    return _respond(rows, request.args.get("format", "json"), "cost")
