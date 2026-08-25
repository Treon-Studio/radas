"""GitHub OAuth routes (per-tenant connect) — Fase 7."""
from __future__ import annotations

from flask import Blueprint, jsonify, redirect, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services import github_oauth as oauth

bp = Blueprint("github_oauth_api", __name__)


def _tenant_from_request() -> str:
    """Tenant = active org (JWT) or project header; fallback 'org:default'."""
    cu = getattr(request, "current_user", {}) or {}
    org_id = cu.get("org_id") or ""
    if org_id:
        return oauth.tenant_key(org_id=org_id)
    pid = request.headers.get("X-Project-Id") or request.args.get("project_id") or ""
    if pid:
        return oauth.tenant_key(project_id=pid)
    return oauth.tenant_key()


@bp.route('/api/github/oauth/status', methods=['GET'])
@require_auth
def api_gh_oauth_status():
    tenant = _tenant_from_request()
    st = oauth.connection_status(tenant)
    st["oauth_configured"] = oauth.oauth_configured()
    return jsonify(st)


@bp.route('/api/github/oauth/authorize', methods=['GET'])
@require_auth
def api_gh_oauth_authorize():
    if not oauth.oauth_configured():
        return jsonify({
            "error": "GitHub OAuth App belum dikonfigurasi. Set GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET, atau gunakan Connect via PAT."}), 400
    # State membawa tenant supaya callback tahu menyimpan token ke org/project mana.
    tenant = _tenant_from_request()
    state = f"tenant:{tenant}"
    url = oauth.authorize_url(state)
    return jsonify({"authorize_url": url, "state": state, "tenant": tenant})


@bp.route('/api/github/oauth/callback', methods=['GET'])
def api_gh_oauth_callback():
    """GitHub redirects here after the user allows access. Exchange code,
    store token per tenant, then bounce back to the console."""
    code = request.args.get("code") or ""
    state = request.args.get("state") or ""
    if not code:
        return jsonify({"error": "missing code"}), 400
    try:
        tok = oauth.exchange_code(code)
    except Exception as e:
        return jsonify({"error": f"OAuth exchange gagal: {e}"}), 400
    access_token = tok.get("access_token")
    if not access_token:
        return jsonify({"error": "no access_token from GitHub"}), 400
    # Resolve owner from the token itself.
    owner = ""
    try:
        owner = oauth.me(access_token).get("login") or ""
    except Exception:
        owner = ""
    # Tenant comes from state (encoded as tenant:<key>) or falls back to default.
    tenant = state[len("tenant:"):] if state.startswith("tenant:") else "org:default"
    oauth.save_connection(tenant, access_token, owner)
    return redirect("http://localhost:8080/system/github-actions?connected=1")


@bp.route('/api/github/oauth/connect-pat', methods=['POST'])
@require_auth
def api_gh_connect_pat():
    """Fallback: connect dengan Personal Access Token (disimpan terenkripsi)."""
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or "").strip()
    if not token:
        return jsonify({"error": "token required"}), 400
    owner = ""
    try:
        owner = oauth.me(token).get("login") or ""
    except Exception as e:
        return jsonify({"error": f"Token tidak valid: {e}"}), 400
    tenant = _tenant_from_request()
    oauth.save_connection(tenant, token, owner)
    return jsonify({"success": True, "tenant": tenant, "owner": owner}), 201


@bp.route('/api/github/oauth/disconnect', methods=['POST'])
@require_auth
def api_gh_oauth_disconnect():
    tenant = _tenant_from_request()
    ok = oauth.delete_connection(tenant)
    if not ok:
        return jsonify({"error": "belum terhubung"}), 404
    return jsonify({"success": True})


# ---------------------------------------------------------------------------
# Repos / workflows / runs memakai token tenant
# ---------------------------------------------------------------------------

def _token_or_error():
    tenant = _tenant_from_request()
    conn = oauth.get_connection(tenant)
    if not conn:
        return None, tenant, {"error": "Belum terhubung ke GitHub. Hubungkan dulu (OAuth atau PAT)."}, 400
    return conn["access_token"], tenant, None, None


@bp.route('/api/github/oauth/repos', methods=['GET'])
@require_auth
def api_gh_oauth_repos():
    token, tenant, err, status = _token_or_error()
    if err:
        return jsonify(err), status
    owner = (request.args.get("owner") or "").strip()
    try:
        return jsonify({"tenant": tenant, "repos": oauth.list_repos(token, owner)})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400


@bp.route('/api/github/oauth/repos/<owner>/<repo>/workflows', methods=['GET'])
@require_auth
def api_gh_oauth_workflows(owner, repo):
    token, tenant, err, status = _token_or_error()
    if err:
        return jsonify(err), status
    try:
        return jsonify({"workflows": oauth.repo_workflows(token, owner, repo)})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400


@bp.route('/api/github/oauth/repos/<owner>/<repo>/runs', methods=['GET'])
@require_auth
def api_gh_oauth_runs(owner, repo):
    token, tenant, err, status = _token_or_error()
    if err:
        return jsonify(err), status
    per_page = request.args.get("per_page") or 20
    try:
        return jsonify({"runs": oauth.workflow_runs(token, owner, repo, int(per_page))})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400


@bp.route('/api/github/oauth/repos/<owner>/<repo>/dispatch', methods=['POST'])
@require_auth
def api_gh_oauth_dispatch(owner, repo):
    token, tenant, err, status = _token_or_error()
    if err:
        return jsonify(err), status
    data = request.get_json(silent=True) or {}
    out = oauth.dispatch(token, owner, repo, data.get("workflow_file") or "",
                         data.get("ref") or "main", data.get("inputs"))
    return jsonify(out), 200 if out.get("ok") else 400


@bp.route('/api/github/oauth/repos/<owner>/<repo>/runs/<int:run_id>/rerun', methods=['POST'])
@require_auth
def api_gh_oauth_rerun(owner, repo, run_id):
    token, tenant, err, status = _token_or_error()
    if err:
        return jsonify(err), status
    return jsonify(oauth.rerun(token, owner, repo, run_id))


@bp.route('/api/github/oauth/repos/<owner>/<repo>/runs/<int:run_id>/cancel', methods=['POST'])
@require_auth
def api_gh_oauth_cancel(owner, repo, run_id):
    token, tenant, err, status = _token_or_error()
    if err:
        return jsonify(err), status
    return jsonify(oauth.cancel(token, owner, repo, run_id))