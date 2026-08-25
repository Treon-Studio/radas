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


@bp.route("/api/audit/export", methods=["GET"])
@bp.route("/api/audit-log/export", methods=["GET"])
@require_auth
def api_export_audit_logs():
    from services.audit_events import export_audit_logs
    project_id = request.headers.get("X-Project-Id") or request.args.get("project_id")
    if project_id:
        scoped, error = _project_scope(project_id)
        if error:
            return error
    else:
        scoped = None

    fmt = (request.args.get("format") or "jsonl").lower()
    start_time = request.args.get("start_time")
    end_time = request.args.get("end_time")
    action_filter = request.args.get("action")
    actor_user_id = request.args.get("actor_user_id")
    limit = int(request.args.get("limit", 1000))

    try:
        content = export_audit_logs(
            project_id=scoped,
            output_format=fmt,
            start_time=start_time,
            end_time=end_time,
            action_filter=action_filter,
            actor_user_id=actor_user_id,
            limit=limit,
        )
        if fmt == "csv":
            mimetype = "text/csv"
            filename = "audit-export.csv"
        else:
            mimetype = "application/x-ndjson"
            filename = "audit-export.jsonl"

        return Response(
            content,
            mimetype=mimetype,
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    except Exception as exc:
        current_app.logger.error("Error exporting audit log", exc_info=True)
        return jsonify({"success": False, "error": str(exc)}), 500


@bp.route("/api/audit/search", methods=["GET"])
@bp.route("/api/audit-log/search", methods=["GET"])
@require_auth
def api_search_audit_logs():
    """Search audit logs with multi-field filtering and pagination (UC620)."""
    from services.audit_events import search_audit_events
    project_id = request.headers.get("X-Project-Id") or request.args.get("project_id")
    if project_id:
        scoped, error = _project_scope(project_id)
        if error:
            return error
    else:
        scoped = None

    try:
        limit = max(1, min(int(request.args.get("limit", 100)), 1000))
        offset = max(0, int(request.args.get("offset", 0)))
    except ValueError:
        limit = 100
        offset = 0

    query = request.args.get("query")
    action = request.args.get("action")
    actor_user_id = request.args.get("actor_user_id")
    target_type = request.args.get("target_type")
    target_id = request.args.get("target_id")
    start_time = request.args.get("start_time")
    end_time = request.args.get("end_time")

    try:
        res = search_audit_events(
            query=query,
            actor_user_id=actor_user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            start_time=start_time,
            end_time=end_time,
            project_id=scoped,
            limit=limit,
            offset=offset,
        )
        return jsonify({"success": True, **res})
    except Exception as exc:
        current_app.logger.error("Error searching audit log", exc_info=True)
        return jsonify({"success": False, "error": str(exc)}), 500


@bp.route("/api/audit/prune", methods=["POST"])
@bp.route("/api/audit-log/prune", methods=["POST"])
@require_auth
def api_prune_audit_logs():
    """Prune old audit logs based on retention policy (UC621)."""
    from services.audit_events import prune_audit_logs
    project_id = request.headers.get("X-Project-Id") or request.args.get("project_id")
    if project_id:
        scoped, error = _project_scope(project_id)
        if error:
            return error
    else:
        scoped = None

    data = request.json or {}
    try:
        retention_days = int(data.get("retention_days", 90))
    except (ValueError, TypeError):
        retention_days = 90

    try:
        deleted_count = prune_audit_logs(retention_days=retention_days, project_id=scoped)
        return jsonify({"success": True, "deleted_count": deleted_count, "retention_days": retention_days})
    except Exception as exc:
        current_app.logger.error("Error pruning audit logs", exc_info=True)
        return jsonify({"success": False, "error": str(exc)}), 500

