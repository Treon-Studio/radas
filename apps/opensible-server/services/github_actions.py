"""GitHub Actions management (Fase 6 — UC 216+).

Wraps GitHub REST API via the local `gh` CLI when available (authenticated
with the user's keyring) or a `GH_TOKEN` env var otherwise. Aggregates repos,
workflows, runs, dispatch/rerun/cancel and workflow templates.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
import urllib.parse
from datetime import datetime, timedelta
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
            return {"available": True, "via": "gh", "authenticated": ok}
        except Exception:
            return {"available": True, "via": "gh", "authenticated": False, "token": ""}
    if os.environ.get("GH_TOKEN"):
        return {"available": True, "via": "env", "authenticated": True}
    return {"available": False, "via": "", "authenticated": False}


def _rate_limit_delay(response: Any, attempt: int) -> float:
    """Return a bounded delay for GitHub rate-limit responses."""
    headers = getattr(response, "headers", {}) or {}
    retry_after = headers.get("Retry-After")
    if retry_after:
        try:
            return min(5.0, max(0.0, float(retry_after)))
        except (TypeError, ValueError):
            pass
    reset = headers.get("X-RateLimit-Reset")
    if reset:
        try:
            return min(5.0, max(0.0, float(reset) - time.time()))
        except (TypeError, ValueError):
            pass
    return min(5.0, 0.25 * (2 ** attempt))


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
    for attempt in range(3):
        r = requests.request(method, url, headers=headers,
                             json=body if body is not None else None, timeout=timeout)
        if r.status_code in (429, 502, 503, 504) and attempt < 2:
            time.sleep(_rate_limit_delay(r, attempt))
            continue
        if r.status_code >= 400:
            detail = (r.text or "GitHub API request failed")[:400]
            raise RuntimeError(f"GitHub API {r.status_code}: {detail}")
        if not r.text:
            return {}
        parser = getattr(r, "json", None)
        return parser() if callable(parser) else json.loads(r.text)
    raise RuntimeError("GitHub API request failed after retries")


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


def _run_duration_seconds(run: Dict[str, Any]) -> Optional[float]:
    from datetime import datetime
    def parse(value: Any) -> Optional[datetime]:
        if not value:
            return None
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    start, end = parse(run.get("run_started_at") or run.get("created_at")), parse(run.get("updated_at"))
    if not start or not end or end < start:
        return None
    return (end - start).total_seconds()


def workflow_statistics(owner: str, repo: str, days: int = 7, workflow_id: Optional[int] = None) -> Dict[str, Any]:
    days = max(1, min(int(days), 90))
    since = (datetime.utcnow() - timedelta(days=days)).isoformat() + "Z"
    path = f"/repos/{urllib.parse.quote(owner, safe='')}/{urllib.parse.quote(repo, safe='')}/actions/runs"
    if workflow_id:
        path = f"/repos/{urllib.parse.quote(owner, safe='')}/{urllib.parse.quote(repo, safe='')}/actions/workflows/{int(workflow_id)}/runs"
    data = _gh_api("GET", f"{path}?per_page=100&created=>={urllib.parse.quote(since)}")
    runs = data.get("workflow_runs") or []
    completed = [run for run in runs if run.get("status") == "completed"]
    successes = [run for run in completed if run.get("conclusion") == "success"]
    durations = sorted(value for value in (_run_duration_seconds(run) for run in completed) if value is not None)
    p95 = durations[min(len(durations) - 1, max(0, int(len(durations) * 0.95) - 1))] if durations else None
    attempts = {}
    for run in runs:
        key = run.get("head_sha") or run.get("id")
        attempts.setdefault(key, []).append(run)
    flaky = sum(1 for values in attempts.values() if len(values) > 1 and any(v.get("conclusion") == "success" for v in values) and any(v.get("conclusion") == "failure" for v in values))
    return {"days": days, "workflow_id": workflow_id, "total_runs": len(runs), "completed_runs": len(completed),
            "success_count": len(successes), "success_rate": round(len(successes) / len(completed), 4) if completed else None,
            "average_duration_seconds": round(sum(durations) / len(durations), 3) if durations else None,
            "p95_duration_seconds": p95, "flaky_groups": flaky}


def workflow_runs(owner: str, repo: str, per_page: int = 20, status: str = "", event: str = "",
                  branch: str = "", since: str = "", head_sha: str = "", page: int = 1) -> List[Dict[str, Any]]:
    params = {"per_page": max(1, min(int(per_page), 100)), "page": max(1, min(int(page), 1000))}
    for key, value in (("status", status), ("event", event), ("branch", branch), ("created", since), ("head_sha", head_sha)):
        value = str(value or "").strip()
        if value:
            params[key] = value
    query = urllib.parse.urlencode(params)
    runs = _gh_api("GET", f"/repos/{urllib.parse.quote(owner, safe='')}/{urllib.parse.quote(repo, safe='')}/actions/runs?{query}")
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


def comment_on_pull_request(owner: str, repo: str, pull_number: int, body: str,
                            marker: str = "radas-plan") -> Dict[str, Any]:
    number = int(pull_number)
    text = str(body or "").strip()
    if number <= 0:
        raise ValueError("pull_number must be positive")
    if not text:
        raise ValueError("comment body is required")
    if len(text) > 60_000:
        raise ValueError("comment body exceeds 60000 characters")
    marker = str(marker or "radas-plan").strip()[:100]
    if marker and marker not in text:
        text = f"<!-- {marker} -->\n{text}"
    data = _gh_api("POST", f"/repos/{urllib.parse.quote(owner, safe='')}/{urllib.parse.quote(repo, safe='')}/issues/{number}/comments", body={"body": text})
    return {"ok": True, "pull_number": number, "comment_id": data.get("id") if isinstance(data, dict) else None,
            "body_length": len(text), "marker": marker}


def dispatch(owner: str, repo: str, workflow_file: str, ref: str = "",
             inputs: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    workflow_file = (workflow_file or "").strip()
    ref = (ref or "main").strip()
    if not workflow_file or workflow_file.startswith("/") or "\\" in workflow_file or ".." in workflow_file:
        return {"ok": False, "error": "workflow_file must be a repository-relative workflow path"}
    if not ref or ref.startswith("/") or ".." in ref or "\\" in ref or any(ord(ch) < 32 for ch in ref):
        return {"ok": False, "error": "ref must be a valid branch or tag"}
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
    "ansible-run": {
        "name": "Ansible run",
        "file": "ansible-run.yml",
        "desc": "Jalankan playbook Ansible pada perubahan atau dispatch manual.",
        "content": """name: ansible-run
on:
  workflow_dispatch:
    inputs:
      playbook:
        required: true
        default: site.yml
      inventory:
        required: true
        default: inventory
  push:
    branches: [main]
    paths: ['playbooks/**', 'roles/**', 'inventory/**']

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.x'
      - run: pip install ansible-core
      - name: ansible syntax check
        run: ansible-playbook ${{ inputs.playbook || 'site.yml' }} --syntax-check -i ${{ inputs.inventory || 'inventory' }}
      - name: ansible run
        run: ansible-playbook ${{ inputs.playbook || 'site.yml' }} -i ${{ inputs.inventory || 'inventory' }}
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
    try:
        r = subprocess.run(["gh", "secret", "set", name, "--repo", f"{owner}/{repo}",
                            "--body", value], capture_output=True, text=True, timeout=30)
    except FileNotFoundError:
        return {"ok": False, "error": "gh CLI tidak tersedia. Install gh atau set GH_TOKEN."}
    except subprocess.CalledProcessError as e:
        return {"ok": False, "error": (e.stderr or e.stdout or str(e)).strip()[:300]}
    except Exception as e:  # noqa: BLE001 — never raise; report as failure
        return {"ok": False, "error": str(e).strip()[:300]}
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


def workflow_detail(owner: str, repo: str, workflow_id: int) -> Dict[str, Any]:
    return _gh_api("GET", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/workflows/{workflow_id}")


def set_workflow_state(owner: str, repo: str, workflow_id: int, state: str) -> Dict[str, Any]:
    if state not in {"active", "disabled_manually"}:
        raise ValueError("state must be active or disabled_manually")
    return _gh_api("PUT", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/workflows/{workflow_id}/{state}")


def run_detail(owner: str, repo: str, run_id: int) -> Dict[str, Any]:
    return _gh_api("GET", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/runs/{run_id}")


def watch_run(owner: str, repo: str, run_id: int, timeout_seconds: int = 120,
              interval_seconds: float = 2.0, sleep_fn=time.sleep) -> Dict[str, Any]:
    """Poll a workflow run with bounded timeout and terminal-state handling."""
    timeout = max(1, min(int(timeout_seconds), 600))
    interval = max(0.1, min(float(interval_seconds), 30.0))
    started = time.monotonic()
    polls = 0
    latest = {}
    while True:
        latest = run_detail(owner, repo, run_id)
        polls += 1
        status = str(latest.get("status") or "").lower()
        if status in {"completed", "cancelled", "failure", "success", "timed_out"}:
            return {"run_id": int(run_id), "status": status, "conclusion": latest.get("conclusion"),
                    "completed": True, "timed_out": False, "polls": polls, "run": latest}
        if time.monotonic() - started >= timeout:
            return {"run_id": int(run_id), "status": status or "unknown", "conclusion": latest.get("conclusion"),
                    "completed": False, "timed_out": True, "polls": polls, "run": latest}
        sleep_fn(interval)


def run_jobs(owner: str, repo: str, run_id: int) -> List[Dict[str, Any]]:
    data = _gh_api("GET", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/runs/{run_id}/jobs?per_page=100")
    return data.get("jobs") or []


def job_logs(owner: str, repo: str, job_id: int) -> str:
    gh = shutil.which("gh")
    path = f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/jobs/{job_id}/logs"
    if gh:
        r = subprocess.run(["gh", "api", path], capture_output=True, text=True, timeout=30)
        if r.returncode != 0: raise RuntimeError((r.stderr or r.stdout or "job logs failed")[:400])
        return (r.stdout or "")[:100_000]
    return str(_gh_api("GET", path))[:100_000]


def _runner_path(owner: str, repo: str, suffix: str = "") -> str:
    base = f"{_repo_path(owner, repo)}/actions/runners" if repo else f"/orgs/{urllib.parse.quote(owner, safe='')}/actions/runners"
    return f"{base}/{suffix}" if suffix else base


def list_runners(owner: str, repo: str = "") -> List[Dict[str, Any]]:
    d = _gh_api("GET", _runner_path(owner, repo))
    return [{"id": r.get("id"), "name": r.get("name"), "os": r.get("os"),
             "status": r.get("status"), "busy": r.get("busy"), "labels": [l.get("name") for l in (r.get("labels") or [])]}
            for r in d.get("runners") or []]


def runner_registration_instructions(owner: str, repo: str, labels: Optional[List[str]] = None) -> Dict[str, Any]:
    """Request a one-time registration token without returning or persisting it."""
    labels = sorted({str(label).strip() for label in (labels or ["self-hosted"]) if str(label).strip()})
    if len(labels) > 50 or any(len(label) > 100 for label in labels):
        raise ValueError("runner labels exceed limits")
    data = _gh_api("POST", f"{_repo_path(owner, repo)}/actions/runners/registration-token")
    token_present = bool(data.get("token")) if isinstance(data, dict) else False
    return {"configured": token_present, "token_available": token_present, "token_exposed": False,
            "labels": labels, "runner_url": f"https://github.com/{owner}/{repo}",
            "instructions": ["Install the GitHub Actions runner on a trusted host.",
                             "Use the one-time token through the approved runner setup channel.",
                             f"Register labels: {', '.join(labels)}"],
            "expires_at": data.get("expires_at") if isinstance(data, dict) else None}


def remove_runner(owner: str, runner_id: int, repo: str = "", require_offline: bool = True) -> Dict[str, Any]:
    runner_id = int(runner_id)
    if runner_id <= 0:
        raise ValueError("runner_id must be positive")
    if require_offline:
        runner = next((item for item in list_runners(owner, repo) if item.get("id") == runner_id), None)
        if runner and (runner.get("status") != "offline" or runner.get("busy")):
            raise ValueError("runner must be offline and idle before removal")
    _gh_api("DELETE", _runner_path(owner, repo, str(runner_id)))
    return {"ok": True, "runner_id": runner_id, "removed": True}


def replace_runner_labels(owner: str, runner_id: int, labels: List[str], repo: str = "") -> Dict[str, Any]:
    runner_id = int(runner_id)
    cleaned = sorted({str(label).strip() for label in (labels or []) if str(label).strip()})
    if runner_id <= 0:
        raise ValueError("runner_id must be positive")
    if len(cleaned) > 50 or any(len(label) > 100 for label in cleaned):
        raise ValueError("runner labels exceed limits")
    data = _gh_api("PUT", _runner_path(owner, repo, f"{runner_id}/labels"), body={"labels": cleaned})
    return {"ok": True, "runner_id": runner_id, "labels": data.get("labels", cleaned) if isinstance(data, dict) else cleaned}


# --------------------------------------------------------------------------
# Deployment protection and required checks
# --------------------------------------------------------------------------

def _repo_path(owner: str, repo: str) -> str:
    return f"/repos/{urllib.parse.quote(owner, safe='')}/{urllib.parse.quote(repo, safe='')}"


def _require_branch(branch: str) -> str:
    branch = (branch or "").strip()
    if not branch or branch.startswith("/") or ".." in branch or any(ord(ch) < 32 for ch in branch):
        raise ValueError("branch must be a valid branch name")
    return branch


def branch_protection(owner: str, repo: str, branch: str) -> Dict[str, Any]:
    branch = _require_branch(branch)
    data = _gh_api("GET", f"{_repo_path(owner, repo)}/branches/{urllib.parse.quote(branch, safe='')}/protection")
    checks = ((data.get("required_status_checks") or {}).get("contexts") or [])
    check_entries = ((data.get("required_status_checks") or {}).get("checks") or [])
    return {
        "branch": branch,
        "required_checks": [c.get("context") if isinstance(c, dict) else c for c in check_entries] or checks,
        "strict": bool((data.get("required_status_checks") or {}).get("strict")),
        "required_reviews": bool(data.get("required_pull_request_reviews")),
        "enforce_admins": bool((data.get("enforce_admins") or {}).get("enabled")),
        "raw": data,
    }


def set_branch_protection(owner: str, repo: str, branch: str, required_checks: List[str],
                          strict: bool = True, required_reviews: bool = True,
                          enforce_admins: bool = True) -> Dict[str, Any]:
    branch = _require_branch(branch)
    checks = sorted({str(check).strip() for check in (required_checks or []) if str(check).strip()})
    if not checks:
        raise ValueError("at least one required check is required")
    body = {
        "required_status_checks": {"strict": bool(strict), "contexts": checks,
                                    "checks": [{"context": check, "app_id": -1} for check in checks]},
        "enforce_admins": bool(enforce_admins),
        "required_pull_request_reviews": ({"required_approving_review_count": 1,
                                             "dismiss_stale_reviews": True,
                                             "require_code_owner_reviews": False} if required_reviews else None),
        "restrictions": None,
        "required_linear_history": False,
        "allow_force_pushes": False,
        "allow_deletions": False,
        "block_creations": False,
        "required_conversation_resolution": True,
    }
    _gh_api("PUT", f"{_repo_path(owner, repo)}/branches/{urllib.parse.quote(branch, safe='')}/protection", body=body)
    return {"ok": True, "branch": branch, "required_checks": checks,
            "strict": bool(strict), "required_reviews": bool(required_reviews),
            "enforce_admins": bool(enforce_admins)}


def required_checks_status(owner: str, repo: str, branch: str, head_sha: str) -> Dict[str, Any]:
    protection = branch_protection(owner, repo, branch)
    sha = (head_sha or "").strip()
    if not re.fullmatch(r"[0-9a-fA-F]{7,64}", sha):
        raise ValueError("head_sha must be a commit SHA")
    data = _gh_api("GET", f"{_repo_path(owner, repo)}/commits/{urllib.parse.quote(sha, safe='')}/check-runs")
    runs = data.get("check_runs") or []
    by_name = {str(run.get("name")): run for run in runs}
    results = []
    for required in protection["required_checks"]:
        run = by_name.get(required)
        results.append({"name": required, "present": bool(run),
                        "status": run.get("status") if run else "missing",
                        "conclusion": run.get("conclusion") if run else None,
                        "passed": bool(run and run.get("status") == "completed" and run.get("conclusion") == "success")})
    return {"branch": branch, "head_sha": sha, "required": results,
            "passed": bool(results) and all(item["passed"] for item in results)}


def environment_protection(owner: str, repo: str, environment: str) -> Dict[str, Any]:
    environment = (environment or "").strip()
    if not environment or "/" in environment or ".." in environment:
        raise ValueError("environment must be a valid name")
    data = _gh_api("GET", f"{_repo_path(owner, repo)}/environments/{urllib.parse.quote(environment, safe='')}")
    return {"name": environment, "wait_timer": data.get("wait_timer", 0),
            "reviewers": data.get("protection_rules", []),
            "deployment_branch_policy": data.get("deployment_branch_policy"), "raw": data}


def pending_deployments(owner: str, repo: str, run_id: int) -> List[Dict[str, Any]]:
    data = _gh_api("GET", f"{_repo_path(owner, repo)}/actions/runs/{int(run_id)}/pending_deployments")
    return data if isinstance(data, list) else []


def decide_deployment(owner: str, repo: str, run_id: int, environment_ids: List[int], state: str,
                      comment: str = "") -> Dict[str, Any]:
    if state not in {"approved", "rejected"}:
        raise ValueError("state must be approved or rejected")
    ids = sorted({int(value) for value in (environment_ids or [])})
    if not ids:
        raise ValueError("at least one environment id is required")
    comment = str(comment or "").strip()[:500]
    _gh_api("POST", f"{_repo_path(owner, repo)}/actions/runs/{int(run_id)}/pending_deployments",
             body={"environment_ids": ids, "state": state, "comment": comment})
    return {"ok": True, "run_id": int(run_id), "environment_ids": ids, "state": state, "comment": comment}


def set_environment_protection(owner: str, repo: str, environment: str, reviewers: List[Dict[str, Any]] = None,
                               wait_timer: int = 0, protected_branches: bool = True) -> Dict[str, Any]:
    environment = (environment or "").strip()
    if not environment or "/" in environment or ".." in environment:
        raise ValueError("environment must be a valid name")
    wait_timer = max(0, min(int(wait_timer), 30 * 24 * 60))
    body = {"wait_timer": wait_timer, "reviewers": reviewers or [],
            "deployment_branch_policy": {"protected_branches": bool(protected_branches), "custom_branch_policies": False}}
    data = _gh_api("PUT", f"{_repo_path(owner, repo)}/environments/{urllib.parse.quote(environment, safe='')}", body=body)
    return {"ok": True, "name": environment, "wait_timer": wait_timer,
            "reviewers": reviewers or [], "deployment_branch_policy": body["deployment_branch_policy"], "raw": data}


def evaluate_run_auto_retry(owner: str, repo: str, run_id: int, project_id: Optional[str] = None,
                            max_retries: int = 2,
                            retry_conclusions: Optional[List[str]] = None) -> Dict[str, Any]:
    """Evaluate if a failed/timed_out workflow run is eligible for auto-retry (UC249)."""
    if retry_conclusions is None:
        retry_conclusions = ["failure", "timed_out", "cancelled"]

    run_info = run_detail(owner, repo, int(run_id))
    status = run_info.get("status")
    conclusion = run_info.get("conclusion") or ""
    run_attempt = int(run_info.get("run_attempt") or 1)

    if status != "completed":
        return {
            "retried": False,
            "run_id": int(run_id),
            "reason": f"run is not completed (status: {status})",
            "conclusion": conclusion,
            "run_attempt": run_attempt,
        }

    if conclusion not in retry_conclusions:
        return {
            "retried": False,
            "run_id": int(run_id),
            "reason": f"conclusion '{conclusion}' is not in retryable list",
            "conclusion": conclusion,
            "run_attempt": run_attempt,
        }

    if run_attempt > max_retries:
        return {
            "retried": False,
            "run_id": int(run_id),
            "reason": f"max retries exceeded (attempt {run_attempt} > max {max_retries})",
            "conclusion": conclusion,
            "run_attempt": run_attempt,
            "max_retries": max_retries,
        }

    # Trigger re-run of failed jobs / workflow
    try:
        re_run_res = rerun(owner, repo, int(run_id))
    except Exception as exc:
        re_run_res = {"error": str(exc)}

    return {
        "retried": True,
        "run_id": int(run_id),
        "previous_attempt": run_attempt,
        "max_retries": max_retries,
        "conclusion": conclusion,
        "action": "re_run_triggered",
        "result": re_run_res,
    }


