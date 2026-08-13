"""GitHub OAuth connection (per-tenant) — Fase 7.

User is redirected to GitHub OAuth (authorize -> allow read/repo -> callback
exchanges code for an access token). The token is stored ENCRYPTED per tenant
(org or project) in kv_store, and GitHub API calls (list repos / workflows /
runs) use that token instead of a machine-level `gh` CLI.

Requires env:
  GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET (OAuth App)
  GITHUB_OAUTH_REDIRECT_URI (default http://localhost:5001/api/github/oauth/callback)

Fallback: when no OAuth App is configured, the console can save a PAT per
tenant (still encrypted) so the feature works without registering an app.
"""
from __future__ import annotations

import json
import os
import time
import urllib.parse
from typing import Any, Dict, Optional

from utils.secret_encryption import get_encryption

GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_API = "https://api.github.com"
SCOPE = "read:org repo"


def _enc(value: str) -> str:
    return get_encryption().encrypt(value)


def _dec(value: str) -> str:
    try:
        return get_encryption().decrypt(value)
    except Exception:
        return value


def tenant_key(org_id: str = "", project_id: str = "") -> str:
    if org_id:
        return f"org:{org_id}"
    if project_id:
        return f"project:{project_id}"
    return "org:default"


def oauth_configured() -> bool:
    return bool(os.environ.get("GITHUB_OAUTH_CLIENT_ID")
                and os.environ.get("GITHUB_OAUTH_CLIENT_SECRET"))


def redirect_uri() -> str:
    return os.environ.get(
        "GITHUB_OAUTH_REDIRECT_URI",
        "http://localhost:5001/api/github/oauth/callback")


def authorize_url(state: str) -> str:
    """GitHub authorize URL for the OAuth App flow."""
    params = urllib.parse.urlencode({
        "client_id": os.environ["GITHUB_OAUTH_CLIENT_ID"],
        "redirect_uri": redirect_uri(),
        "scope": SCOPE,
        "state": state,
        "allow_signup": "false",
    })
    return f"{GITHUB_AUTHORIZE}?{params}"


def exchange_code(code: str) -> Dict[str, Any]:
    """Exchange an OAuth code for an access token (GitHub App flow)."""
    import requests
    r = requests.post(
        GITHUB_TOKEN_URL,
        headers={"Accept": "application/json"},
        data={
            "client_id": os.environ["GITHUB_OAUTH_CLIENT_ID"],
            "client_secret": os.environ["GITHUB_OAUTH_CLIENT_SECRET"],
            "code": code,
            "redirect_uri": redirect_uri(),
        },
        timeout=20,
    )
    data = r.json()
    if "access_token" not in data:
        raise RuntimeError(data.get("error_description") or data.get("error") or "OAuth exchange failed")
    return data


# ---------------------------------------------------------------------------
# Per-tenant token storage (kv_store, encrypted)
# ---------------------------------------------------------------------------

def save_connection(tenant: str, access_token: str, owner: str = "") -> Dict[str, Any]:
    from storage import kv
    rec = {
        "access_token": _enc(access_token),
        "owner": owner,
        "connected_at": int(time.time()),
    }
    kv.kv_set("github_conn", tenant, rec)
    return {"tenant": tenant, "owner": owner, "connected": True}


def get_connection(tenant: str) -> Optional[Dict[str, Any]]:
    from storage import kv
    rec = kv.kv_get("github_conn", tenant)
    if not rec or not rec.get("access_token"):
        return None
    return {**rec, "access_token": _dec(rec["access_token"])}


def delete_connection(tenant: str) -> bool:
    from storage import kv
    if kv.kv_get("github_conn", tenant) is None:
        return False
    kv.kv_delete("github_conn", tenant)
    return True


def connection_status(tenant: str) -> Dict[str, Any]:
    rec = kv_get_raw(tenant)
    if not rec:
        return {"connected": False, "tenant": tenant}
    return {"connected": True, "tenant": tenant, "owner": rec.get("owner"),
            "connected_at": rec.get("connected_at")}


def kv_get_raw(tenant: str) -> Optional[Dict[str, Any]]:
    from storage import kv
    return kv.kv_get("github_conn", tenant)


# ---------------------------------------------------------------------------
# GitHub API with tenant token
# ---------------------------------------------------------------------------

def _gh_api(token: str, method: str, path: str, body: Optional[Dict[str, Any]] = None,
            timeout: int = 30) -> Dict[str, Any]:
    import requests
    headers = {"Authorization": f"Bearer {token}",
               "Accept": "application/vnd.github+json",
               "X-GitHub-Api-Version": "2022-11-28"}
    r = requests.request(method, GITHUB_API + path, headers=headers,
                         json=body if body is not None else None, timeout=timeout)
    if r.status_code >= 400:
        raise RuntimeError(r.text[:400])
    return r.json() if r.text else {}


def _gh_api_list(token: str, path: str, per_page: int = 100) -> list:
    out = []
    page = 1
    while True:
        sep = "&" if "?" in path else "?"
        batch = _gh_api(token, "GET", f"{path}{sep}per_page={per_page}&page={page}")
        if not isinstance(batch, list) or not batch:
            break
        out.extend(batch)
        if len(batch) < per_page:
            break
        page += 1
        if page > 20:
            break
    return out


def me(token: str) -> Dict[str, Any]:
    return _gh_api(token, "GET", "/user")


def list_repos(token: str, owner: str = "") -> list:
    if owner:
        repos = _gh_api_list(token, f"/users/{urllib.parse.quote(owner)}/repos")
    else:
        repos = _gh_api_list(token, "/user/repos")
    return [{
        "name": r.get("name"),
        "full_name": r.get("full_name"),
        "default_branch": r.get("default_branch"),
        "visibility": r.get("visibility"),
        "description": r.get("description"),
        "updated_at": r.get("updated_at"),
    } for r in repos if not r.get("archived")]


def repo_workflows(token: str, owner: str, repo: str) -> list:
    wfs = _gh_api(token, "GET", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/workflows")
    return [{"id": w.get("id"), "name": w.get("name"), "path": w.get("path"),
             "state": w.get("state"), "created_at": w.get("created_at")}
            for w in (wfs.get("workflows") or [])]


def workflow_runs(token: str, owner: str, repo: str, per_page: int = 20) -> list:
    runs = _gh_api(token, "GET", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/runs?per_page={per_page}")
    return [{"id": r.get("id"), "name": r.get("name"), "head_branch": r.get("head_branch"),
             "event": r.get("event"), "status": r.get("status"), "conclusion": r.get("conclusion"),
             "run_number": r.get("run_number"), "workflow_id": r.get("workflow_id"),
             "head_sha": (r.get("head_sha") or "")[:8], "created_at": r.get("created_at"),
             "display_title": r.get("display_title")}
            for r in runs.get("workflow_runs") or []]


def dispatch(token: str, owner: str, repo: str, workflow_file: str, ref: str = "",
             inputs: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    body: Dict[str, Any] = {"ref": ref or "main"}
    if inputs:
        body["inputs"] = inputs
    try:
        _gh_api(token, "POST", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/workflows/{urllib.parse.quote(workflow_file)}/dispatches",
                body=body)
        return {"ok": True, "message": f"Workflow {workflow_file} dispatched (ref={ref or 'main'})"}
    except RuntimeError as e:
        return {"ok": False, "error": str(e)}


def rerun(token: str, owner: str, repo: str, run_id: int) -> Dict[str, Any]:
    try:
        _gh_api(token, "POST", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/runs/{run_id}/rerun")
        return {"ok": True, "message": f"Run {run_id} rerun requested"}
    except RuntimeError as e:
        return {"ok": False, "error": str(e)}


def cancel(token: str, owner: str, repo: str, run_id: int) -> Dict[str, Any]:
    try:
        _gh_api(token, "POST", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/runs/{run_id}/cancel")
        return {"ok": True, "message": f"Run {run_id} cancel requested"}
    except RuntimeError as e:
        return {"ok": False, "error": str(e)}
