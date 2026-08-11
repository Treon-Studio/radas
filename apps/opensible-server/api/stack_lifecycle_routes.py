"""Stack lifecycle routes — snapshot, rollback, strip, remote state (Fase 5 — UC 12/13)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.stack_snapshots import (
    get_state_config, list_snapshots, restore, set_state_config, snapshot,
)
from services.cloud_provisioning import _stack_dir, _create_execution
from utils.request_ctx import get_project_id_from_request as _get_pid_raw

bp = Blueprint("stack_lifecycle_api", __name__)


def _ctx(name: str):
    pid = _get_pid_raw(lambda: None)
    if not pid or not _stack_dir(pid, name).exists():
        return None, None
    return pid, name


@bp.route('/api/cloud/stacks/<name>/snapshot', methods=['POST'])
@require_auth
def api_snapshot(name):
    pid, name = _ctx(name)
    if not pid:
        return jsonify({"error": "Not found"}), 404
    sid = snapshot(pid, name, reason=(request.get_json(silent=True) or {}).get("reason") or "manual")
    if not sid:
        return jsonify({"error": "No tfvars/state to snapshot"}), 400
    return jsonify({"success": True, "snapshot_id": sid})


@bp.route('/api/cloud/stacks/<name>/snapshots', methods=['GET'])
@require_auth
def api_list_snapshots(name):
    pid, name = _ctx(name)
    if not pid:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"snapshots": list_snapshots(pid, name)})


@bp.route('/api/cloud/stacks/<name>/rollback', methods=['POST'])
@require_auth
def api_rollback(name):
    pid, name = _ctx(name)
    if not pid:
        return jsonify({"error": "Not found"}), 404
    sid = (request.get_json(silent=True) or {}).get("snapshot_id")
    restored = restore(pid, name, sid)
    if not restored:
        return jsonify({"error": "No snapshot to restore"}), 400
    eid = _create_execution(pid, name, "apply", triggered_by="rollback")
    return jsonify({"success": True, "restored_snapshot": restored, "execution_id": eid})


@bp.route('/api/cloud/stacks/<name>/strip', methods=['POST'])
@require_auth
def api_strip(name):
    pid, name = _ctx(name)
    if not pid:
        return jsonify({"error": "Not found"}), 404
    eid = _create_execution(pid, name, "destroy", triggered_by="strip")
    return jsonify({"success": True, "message": "Strip queued (destroy infra, stack kept)", "execution_id": eid})


@bp.route('/api/cloud/stacks/<name>/state-config', methods=['GET'])
@require_auth
def api_get_state_config(name):
    pid, name = _ctx(name)
    if not pid:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"remote_state": get_state_config(pid, name)})


@bp.route('/api/cloud/stacks/<name>/state-config', methods=['PUT'])
@require_auth
def api_put_state_config(name):
    pid, name = _ctx(name)
    if not pid:
        return jsonify({"error": "Not found"}), 404
    try:
        cfg = set_state_config(pid, name, request.get_json(silent=True) or {})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"success": True, "remote_state": cfg})
