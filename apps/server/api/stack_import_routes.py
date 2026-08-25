"""Import an existing stack (Fase 1 — UC 97)."""
from __future__ import annotations

import re
from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth, require_project_access
except ImportError:
    from ..auth.middleware import require_auth

from utils.request_ctx import get_project_id_from_request as _get_pid_raw
from services.cloud_providers import known_ids

bp = Blueprint("stack_import_api", __name__)


def _project_id():
    return _get_pid_raw(lambda: None)


@bp.route('/api/cloud/stacks/import', methods=['POST'])
@require_project_access
def api_import_stack():
    pid = _project_id()
    if not pid:
        return jsonify({"error": "Project required", "message": "X-Project-Id header required"}), 400

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    provider = (data.get("provider") or "").strip().lower()
    tfvars = data.get("tfvars") or ""
    state_json = data.get("state_json") or ""
    source = (data.get("source") or "manual-import").strip()

    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{1,48}[a-z0-9]", name or ""):
        return jsonify({"error": "invalid name",
                        "message": "Stack name must be 3-50 chars, lowercase letters/digits/-/_"}), 400
    if provider not in known_ids():
        return jsonify({"error": "unknown provider",
                        "message": f"provider must be one of: {', '.join(known_ids())}"}), 400

    from services.cloud_provisioning import _stack_data_dir, _save_meta

    stack_dir = _stack_data_dir(pid, name)
    stack_dir.mkdir(parents=True, exist_ok=True)

    (stack_dir / "terraform.tfvars").write_text(tfvars or "", encoding="utf-8")
    if state_json:
        (stack_dir / "terraform.tfstate").write_text(state_json, encoding="utf-8")

    _save_meta(pid, name,
               provider=provider,
               status="imported",
               source=source,
               imported_at=__import__("time").time())

    return jsonify({"success": True, "stack": {"name": name, "provider": provider, "status": "imported"}}), 201
