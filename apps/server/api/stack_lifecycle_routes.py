"""Stack lifecycle routes — snapshot, rollback, strip, remote state (Fase 5 — UC 12/13)."""
from __future__ import annotations

from flask import Blueprint, Response, jsonify, request

try:
    from auth.middleware import require_auth, require_project_access
except ImportError:
    from ..auth.middleware import require_auth

from services.stack_snapshots import (
    get_state_config, list_snapshots, restore, set_state_config, snapshot,
)
from services.cloud_provisioning import _stack_dir, _stack_data_dir, _create_execution, _get_execution_record
from services import cloud_state
from utils.request_ctx import get_project_id_from_request as _get_pid_raw

bp = Blueprint("stack_lifecycle_api", __name__)


def _lock_or_conflict(pid: str, name: str):
    dd = _stack_data_dir(pid, name)
    lock = cloud_state.read_lock(dd, _get_execution_record, pid)
    if lock:
        return jsonify({"error": f"State is locked by {lock.get('who')} ({lock.get('operation')}).", "lock": lock}), 409
    return None


def _ctx(name: str):
    pid = _get_pid_raw(lambda: None)
    if not pid or not _stack_dir(pid, name).exists():
        return None, None
    return pid, name


@bp.route('/api/cloud/stacks/<name>/snapshot', methods=['POST'])
@require_project_access
def api_snapshot(name):
    pid, name = _ctx(name)
    if not pid:
        return jsonify({"error": "Not found"}), 404
    sid = snapshot(pid, name, reason=(request.get_json(silent=True) or {}).get("reason") or "manual")
    if not sid:
        return jsonify({"error": "No tfvars/state to snapshot"}), 400
    return jsonify({"success": True, "snapshot_id": sid})


@bp.route('/api/cloud/stacks/<name>/snapshots', methods=['GET'])
@require_project_access
def api_list_snapshots(name):
    pid, name = _ctx(name)
    if not pid:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"snapshots": list_snapshots(pid, name)})


@bp.route('/api/cloud/stacks/<name>/rollback', methods=['POST'])
@require_project_access
def api_rollback(name):
    pid, name = _ctx(name)
    if not pid:
        return jsonify({"error": "Not found"}), 404
    conflict = _lock_or_conflict(pid, name)
    if conflict:
        return conflict
    sid = (request.get_json(silent=True) or {}).get("snapshot_id")
    restored = restore(pid, name, sid)
    if not restored:
        return jsonify({"error": "No snapshot to restore"}), 400
    eid = _create_execution(pid, name, "apply", triggered_by="rollback")
    cloud_state.acquire_lock(_stack_data_dir(pid, name), actor="rollback", operation="apply", run_id=eid, get_execution=_get_execution_record, project_id=pid)
    return jsonify({"success": True, "restored_snapshot": restored, "execution_id": eid})


@bp.route('/api/cloud/stacks/<name>/strip', methods=['POST'])
@require_project_access
def api_strip(name):
    pid, name = _ctx(name)
    if not pid:
        return jsonify({"error": "Not found"}), 404
    conflict = _lock_or_conflict(pid, name)
    if conflict:
        return conflict
    eid = _create_execution(pid, name, "destroy", triggered_by="strip")
    cloud_state.acquire_lock(_stack_data_dir(pid, name), actor="strip", operation="destroy", run_id=eid, get_execution=_get_execution_record, project_id=pid)
    return jsonify({"success": True, "message": "Strip queued (destroy infra, stack kept)", "execution_id": eid})


@bp.route('/api/cloud/stacks/<name>/state-config', methods=['GET'])
@require_project_access
def api_get_state_config(name):
    pid, name = _ctx(name)
    if not pid:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"remote_state": get_state_config(pid, name)})


@bp.route('/api/cloud/stacks/<name>/state-config', methods=['PUT'])
@require_project_access
def api_put_state_config(name):
    pid, name = _ctx(name)
    if not pid:
        return jsonify({"error": "Not found"}), 404
    try:
        cfg = set_state_config(pid, name, request.get_json(silent=True) or {})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"success": True, "remote_state": cfg})


@bp.route('/api/ci/secrets', methods=['GET'])
@require_project_access
def api_ci_secrets():
    """Export stack secrets as KEY=value for CI pipelines (UC 43).
    Readable by service accounts (readonly can GET)."""
    pid = _get_pid_raw(lambda: None)
    stack = (request.args.get("stack") or "").strip()
    if not pid or not stack:
        return jsonify({"error": "stack and project required"}), 400
    try:
        from services.cloud_provisioning import _load_secrets
        secrets = _load_secrets(pid, stack)
    except Exception:
        secrets = {}
    lines = "".join(f"{k.upper()}={v}\n" for k, v in sorted(secrets.items()))
    return Response(lines, mimetype="text/plain",
                    headers={"Content-Disposition": f"attachment; filename={stack}.secrets.env"})


@bp.route('/api/cloud/stacks/<name>/history', methods=['GET'])
@require_project_access
def api_stack_history(name):
    """Change history: snapshots + approvals + runs (Fase 5 — UC 72)."""
    pid = _get_pid_raw(lambda: None)
    if not pid or not _stack_dir(pid, name).exists():
        return jsonify({"error": "Not found"}), 404
    snaps = [{"kind": "snapshot", **x} for x in list_snapshots(pid, name)]
    approvals = []
    try:
        from services.approval_service import list_approvals
        approvals = [{"kind": "approval", "action": a.get("action"), "status": a.get("status"),
                      "by": a.get("decided_by"), "at": a.get("decided_at") or a.get("created_at"),
                      "note": a.get("note")} for a in list_approvals(project_id=pid) if a.get("stack") == name]
    except Exception:
        pass
    runs = []
    try:
        from services.execution_history import list_executions
        for e in list_executions(limit=50, project_id=pid):
            rn = e.get("runName") or ""
            if rn.startswith(f"{name}/"):
                runs.append({"kind": "run", "action": rn.split("/", 1)[-1],
                             "status": e.get("status"), "id": e.get("id"),
                             "at": e.get("createdAt") or e.get("startedAt")})
    except Exception:
        pass
    timeline = sorted(snaps + approvals + runs,
                      key=lambda x: x.get("at") or 0, reverse=True)
    return jsonify({"history": timeline[:50]})


@bp.route('/api/cloud/stacks/from-template', methods=['POST'])
@require_project_access
def api_stack_from_template():
    """Create a stack from an imported custom template (Fase 5 — UC 15/96)."""
    pid = _get_pid_raw(lambda: None)
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip().lower()
    template = (data.get("template") or "").strip()
    if not pid or not name or not template:
        return jsonify({"error": "name, template and project required"}), 400
    import re as _re
    if not _re.fullmatch(r"[a-z0-9][a-z0-9_-]{1,48}[a-z0-9]", name):
        return jsonify({"error": "Invalid stack name"}), 400
    from services.custom_templates import _custom_dir
    tdir = _custom_dir() / template
    if not tdir.is_dir():
        return jsonify({"error": f"template '{template}' not found"}), 404
    from services.cloud_provisioning import _stack_dir, _save_meta
    ws = _stack_dir(pid, name)
    if ws.exists():
        return jsonify({"error": f"Stack '{name}' already exists."}), 409
    import shutil
    ws.mkdir(parents=True, exist_ok=True)
    for item in tdir.iterdir():
        if item.name == ".git":
            continue
        dst = ws / item.name
        (shutil.copytree(item, dst) if item.is_dir() else shutil.copy2(item, dst))
    _save_meta(pid, name, provider="bytedc", status="template", template=template, env="dev")
    return jsonify({"success": True, "stack": {"name": name, "template": template}}), 201


@bp.route('/api/cloud/stacks/<name>/clone', methods=['POST'])
@require_project_access
def api_stack_clone(name):
    """Duplicate/clone a stack workspace (UC610)."""
    from services.stack_lifecycle import clone_stack
    pid = _get_pid_raw(lambda: None)
    data = request.get_json(silent=True) or {}
    target_stack = (data.get("target_stack") or "").strip().lower()
    if not target_stack:
        return jsonify({"error": "target_stack is required"}), 400
    try:
        res = clone_stack(
            project_id=pid,
            source_stack=name,
            target_stack=target_stack,
            copy_tfvars=data.get("copy_tfvars", True),
        )
        return jsonify(res), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@bp.route('/api/cloud/stacks/<name>/rename', methods=['POST'])
@require_project_access
def api_stack_rename(name):
    """Rename a stack workspace and migrate state keys (UC613)."""
    from services.stack_lifecycle import rename_stack
    pid = _get_pid_raw(lambda: None)
    data = request.get_json(silent=True) or {}
    new_name = (data.get("new_name") or "").strip().lower()
    if not new_name:
        return jsonify({"error": "new_name is required"}), 400
    try:
        res = rename_stack(
            project_id=pid,
            old_name=name,
            new_name=new_name,
            migrate_state=data.get("migrate_state", True),
        )
        return jsonify(res), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

