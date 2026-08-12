"""GitHub Actions management (Fase 6 — UC 216+).

Wraps GitHub REST API via the local `gh` CLI when available (authenticated
with the user's keyring) or a `GH_TOKEN` env var otherwise. Aggregates repos,
workflows, runs, dispatch/rerun/cancel and workflow templates.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
import urllib.parse
from typing import Any, Dict, List, Optional

API = "https://api.github.com"


def is_available() -> Dict[str, Any]:
    gh = shutil.which("gh")
    if gh:
        try:
            r = subprocess.run(["gh", "auth", "status", "--show-token"],
                               capture_output=True, text=True, timeout=10)
            token = ""
            for line in (r.stdout or "").splitlines():
                if "Token:" in line:
                    token = line.split("Token:")[-1].strip()
            ok = r.returncode == 0
            return {"available": True, "via": "gh", "authenticated": ok,
                    "token": token if ok else ""}
        except Exception:
            return {"available": True, "via": "gh", "authenticated": False, "token": ""}
    if os.environ.get("GH_TOKEN"):
        return {"available": True, "via": "env", "authenticated": True,
                "token": os.environ["GH_TOKEN"]}
    return {"available": False, "via": "", "authenticated": False, "token": ""}


def _gh_api(method: str, path: str, body: Optional[Dict[str, Any]] = None,
            timeout: int = 30) -> Dict[str, Any]:
    """Call GitHub REST API via gh CLI (preferred) or direct requests."""
    gh = shutil.which("gh")
    if gh:
        cmd = ["gh", "api", "--method", method, path]
        input_data = None
        if body is not None:
            cmd += ["--input", "-"]
            input_data = json.dumps(body).encode("utf-8")
        r = subprocess.run(cmd, capture_output=True, input=input_data, timeout=timeout)
        if r.returncode != 0:
            err = (r.stderr or r.stdout or b"gh api failed").decode("utf-8", "replace").strip()[:400]
            raise RuntimeError(err)
        return json.loads(r.stdout or "{}")
    token = os.environ.get("GH_TOKEN")
    if not token:
        raise RuntimeError("GitHub tidak tersedia: pasang gh CLI ber-auth atau set GH_TOKEN")
    import requests
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
               "X-GitHub-Api-Version": "2022-11-28"}
    url = API + path
    r = requests.request(method, url, headers=headers,
                         json=body if body is not None else None, timeout=timeout)
    if r.status_code >= 400:
        raise RuntimeError(r.text[:400])
    return r.json() if r.text else {}


def _gh_api_list(path: str, per_page: int = 100) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    page = 1
    while True:
        sep = "&" if "?" in path else "?"
        batch = _gh_api("GET", f"{path}{sep}per_page={per_page}&page={page}")
        if not isinstance(batch, list) or not batch:
            break
        out.extend(batch)
        if len(batch) < per_page:
            break
        page += 1
        if page > 20:
            break
    return out


# --------------------------------------------------------------------------
# Connections / status
# --------------------------------------------------------------------------

def status() -> Dict[str, Any]:
    info = is_available()
    owner = ""
    if info.get("authenticated"):
        try:
            me = _gh_api("GET", "/user")
            owner = (me.get("login") or "").strip()
        except Exception:
            pass
    return {"configured": bool(info.get("authenticated")),
            "owner": owner, "via": info.get("via")}


def list_repos(owner: str = "") -> List[Dict[str, Any]]:
    info = status()
    owner = owner or info.get("owner") or ""
    if not owner:
        raise RuntimeError("Tentukan owner atau pastikan gh login")
    repos = _gh_api_list(f"/users/{urllib.parse.quote(owner)}/repos")
    return [{
        "name": r.get("name"),
        "full_name": r.get("full_name"),
        "default_branch": r.get("default_branch"),
        "visibility": r.get("visibility"),
        "description": r.get("description"),
        "updated_at": r.get("updated_at"),
        "workflows_url": r.get("url"),
    } for r in repos if not r.get("archived")]


def repo_workflows(owner: str, repo: str) -> List[Dict[str, Any]]:
    wfs = _gh_api("GET", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/workflows")
    items = wfs.get("workflows") or []
    return [{
        "id": w.get("id"),
        "name": w.get("name"),
        "path": w.get("path"),
        "state": w.get("state"),
        "created_at": w.get("created_at"),
        "updated_at": w.get("updated_at"),
    } for w in items]


def workflow_runs(owner: str, repo: str, per_page: int = 20) -> List[Dict[str, Any]]:
    runs = _gh_api("GET", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/runs?per_page={per_page}")
    return [{
        "id": r.get("id"),
        "name": r.get("name"),
        "head_branch": r.get("head_branch"),
        "event": r.get("event"),
        "status": r.get("status"),
        "conclusion": r.get("conclusion"),
        "run_number": r.get("run_number"),
        "workflow_id": r.get("workflow_id"),
        "head_sha": (r.get("head_sha") or "")[:8],
        "created_at": r.get("created_at"),
        "updated_at": r.get("updated_at"),
        "display_title": r.get("display_title"),
    } for r in runs.get("workflow_runs") or []]


def dispatch(owner: str, repo: str, workflow_file: str, ref: str = "",
             inputs: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    info = status()
    ref = ref or "main"
    body: Dict[str, Any] = {"ref": ref}
    if inputs:
        body["inputs"] = inputs
    try:
        _gh_api("POST", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/workflows/{urllib.parse.quote(workflow_file)}/dispatches",
                body=body)
        return {"ok": True, "message": f"Workflow {workflow_file} dispatched (ref={ref})"}
    except RuntimeError as e:
        return {"ok": False, "error": str(e)}


def rerun(owner: str, repo: str, run_id: int) -> Dict[str, Any]:
    try:
        _gh_api("POST", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/runs/{run_id}/rerun")
        return {"ok": True, "message": f"Run {run_id} rerun requested"}
    except RuntimeError as e:
        return {"ok": False, "error": str(e)}


def cancel(owner: str, repo: str, run_id: int) -> Dict[str, Any]:
    try:
        _gh_api("POST", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/runs/{run_id}/cancel")
        return {"ok": True, "message": f"Run {run_id} cancel requested"}
    except RuntimeError as e:
        return {"ok": False, "error": str(e)}


# --------------------------------------------------------------------------
# Workflow templates & scaffold
# --------------------------------------------------------------------------

WORKFLOW_TEMPLATES: Dict[str, Dict[str, Any]] = {
    "tofu-plan": {
        "name": "Tofu plan (PR)",
        "file": "tofu-plan.yml",
        "desc": "Jalankan OpenTofu plan di PR dan komentari hasilnya.",
        "content": """name: tofu-plan
on:
  pull_request:
    paths: ['environments/**', 'modules/**']
  workflow_dispatch:

jobs:
  plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: opentofu/setup-opentofu@v1
      - name: tofu init
        run: tofu init
      - name: tofu plan
        run: tofu plan -no-color
""",
    },
    "tofu-apply": {
        "name": "Tofu apply (merge)",
        "file": "tofu-apply.yml",
        "desc": "Apply OpenTofu saat merge ke branch default.",
        "content": """name: tofu-apply
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  apply:
    runs-on: ubuntu-latest
    environment: production
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: opentofu/setup-opentofu@v1
      - name: tofu init
        run: tofu init
      - name: tofu apply
        run: tofu apply -auto-approve -no-color
        env:
          TF_VAR_env: production
""",
    },
    "ansible-lint": {
        "name": "Ansible lint",
        "file": "ansible-lint.yml",
        "desc": "Lint playbooks & roles di PR.",
        "content": """name: ansible-lint
on:
  pull_request:
    paths: ['playbooks/**', 'roles/**']
  workflow_dispatch:

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ansible/ansible-lint-action@v6
""",
    },
}


def workflow_templates() -> List[Dict[str, Any]]:
    return [{"id": k, **v} for k, v in WORKFLOW_TEMPLATES.items()]


def scaffold_workflow(owner: str, repo: str, template_id: str,
                      branch: str = "main", message: str = "") -> Dict[str, Any]:
    tpl = WORKFLOW_TEMPLATES.get(template_id)
    if not tpl:
        raise RuntimeError(f"Template '{template_id}' tidak dikenal")
    path = f".github/workflows/{tpl['file']}"
    info = status()
    commit_msg = message or f"Add {tpl['name']} workflow via Radas"
    body = {
        "message": commit_msg,
        "content": __import__("base64").b64encode(tpl["content"].encode("utf-8")).decode("utf-8"),
        "branch": branch,
    }
    try:
        _gh_api("PUT", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/contents/{path}",
                body=body)
        return {"ok": True, "path": path, "branch": branch}
    except RuntimeError as e:
        return {"ok": False, "error": str(e)}


# --------------------------------------------------------------------------
# Secrets / variables / runners (UC 230-235)
# --------------------------------------------------------------------------

def list_secrets(owner: str, repo: str) -> List[Dict[str, Any]]:
    d = _gh_api("GET", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/secrets")
    return [{"name": s.get("name"), "created_at": s.get("created_at"),
             "updated_at": s.get("updated_at"), "visibility": s.get("visibility")}
            for s in d.get("secrets") or []]


def upsert_secret(owner: str, repo: str, name: str, value: str) -> Dict[str, Any]:
    # Fetch repo public key, encrypt with libsodium sealed box via gh api put.
    # gh api handles this via /actions/secrets/<name> with encrypted_value.
    # For plan scope: store plaintext is NOT allowed — we require gh CLI to
    # encrypt. Use `gh secret set` which handles encryption automatically.
    import subprocess as sp
    r = sp.run(["gh", "secret", "set", name, "--repo", f"{owner}/{repo}",
                "--body", value], capture_output=True, text=True, timeout=30)
    if r.returncode != 0:
        return {"ok": False, "error": (r.stderr or r.stdout or "failed").strip()[:300]}
    return {"ok": True, "message": f"secret {name} set"}


def delete_secret(owner: str, repo: str, name: str) -> Dict[str, Any]:
    try:
        _gh_api("DELETE", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/secrets/{urllib.parse.quote(name)}")
        return {"ok": True}
    except RuntimeError as e:
        return {"ok": False, "error": str(e)}


def list_variables(owner: str, repo: str) -> List[Dict[str, Any]]:
    d = _gh_api("GET", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/variables")
    return [{"name": v.get("name"), "value": v.get("value"),
             "visibility": v.get("visibility"), "updated_at": v.get("updated_at")}
            for v in d.get("variables") or []]


def list_runners(owner: str) -> List[Dict[str, Any]]:
    d = _gh_api("GET", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(owner)}/actions/runners")
    return [{"id": r.get("id"), "name": r.get("name"), "os": r.get("os"),
             "status": r.get("status"), "labels": [l.get("name") for l in (r.get("labels") or [])]}
            for r in d.get("runners") or []]