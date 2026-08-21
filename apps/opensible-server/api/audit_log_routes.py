"""Tenant-scoped audit log query and export routes."""
from __future__ import annotations

import csv
import io
import sys

from flask import Blueprint, current_app, jsonify, request, Response

from auth.middleware import require_auth
from services import org_service

try:
    from storage import auth_db, pg
except ImportError:  # pragma: no cover
    from backend.storage import auth_db, pg  # type: ignore

bp = Blueprint("audit_log_api", __name__)


def _data_dir():
    app_mod = next(
        (m for m in (sys.modules.get("__main__"), sys.modules.get("app")) if getattr(m, "DATA_DIR", None)),
        None,
    )
    if app_mod:
        return app_mod.DATA_DIR
    from app_context import get_data_dir
    return get_data_dir()


def _project_scope(project_id: str):
    row = pg.query_one("SELECT org_id FROM projects WHERE id = %s", (project_id,))
    if not row or not row.get("org_id"):
        return None, (jsonify({"success": False, "error": "Project not found"}), 404)
    user_id = (getattr(request, "current_user", {}) or {}).get("user_id")
    role = org_service.member_role(row["org_id"], user_id) if user_id else None
    if role is None:
        return None, (jsonify({"success": False, "error": "Project access denied"}), 403)
    if role not in {"owner", "admin"} and user_id != "__internal__":
        return None, (jsonify({"success": False, "error": "Audit access denied"}), 403)
    return project_id, None


def _entries(project_id: str):
    try:
        limit = max(1, min(int(request.args.get("limit", 100)), 1000))
    except ValueError:
        limit = 100
    return auth_db.list_audit(
        _data_dir(),
        limit=limit,
        target_type=request.args.get("target_type") or None,
        target_id=request.args.get("target_id") or None,
        actor_user_id=request.args.get("actor_user_id") or None,
        project_id=project_id,
    )


@bp.route("/api/audit-log", methods=["GET"])
@require_auth
def api_list_audit_log():
    project_id = request.headers.get("X-Project-Id") or request.args.get("project_id")
    if not project_id:
        return jsonify({"success": False, "error": "X-Project-Id is required"}), 422
    scoped, error = _project_scope(project_id)
    if error:
        return error
    try:
        entries = _entries(scoped)
        if (request.args.get("format") or "").lower() == "csv":
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(["id", "actor_user_id", "action", "target_type", "target_id", "created_at", "meta"])
            for entry in entries:
                writer.writerow([
                    entry.get("id"), entry.get("actor_user_id"), entry.get("action"),
                    entry.get("target_type"), entry.get("target_id"), entry.get("created_at"), entry.get("meta"),
                ])
            return Response(output.getvalue(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=audit-log.csv"})
        return jsonify({"success": True, "entries": entries, "count": len(entries)})
    except Exception:
        current_app.logger.error("Error listing audit log", exc_info=True)
        return jsonify({"success": False, "error": "Error reading audit log"}), 500
