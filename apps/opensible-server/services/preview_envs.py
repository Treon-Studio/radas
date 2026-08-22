"""Preview environment per PR (Fase 5 — UC 49).

Clones a base stack into an ephemeral `pr-<number>` stack, queues an apply so
the PR's infra can be reviewed, and tears it down when the PR closes. Also
exposes a GitHub `pull_request` webhook handler.
"""
from __future__ import annotations

import json
import shutil
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

PREVIEW_PREFIX = "pr-"


def _store_path() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "preview_envs.json"
    except Exception:
        return Path("data") / "preview_envs.json"


def _load() -> List[Dict[str, Any]]:
    from storage import kv
    v = kv.kv_load("preview_envs")
    return v if isinstance(v, list) else []


def _save(items: List[Dict[str, Any]]) -> None:
    from storage import kv
    kv.kv_save("preview_envs", items)


def inject_preview_standard_tags(
    tfvars: Optional[Dict[str, Any]],
    pr_number: int,
    project_id: Optional[str] = None,
    base_stack: str = "",
) -> Dict[str, Any]:
    """Inject standard cloud resource tags for preview environments (UC500)."""
    res = dict(tfvars or {})
    current_tags = dict(res.get("tags") or {})
    standard_tags = {
        "Environment": "preview",
        "ManagedBy": "radas",
        "PRNumber": str(int(pr_number)),
        "AutoExpire": "true",
        "BaseStack": base_stack or "default",
        "Project": project_id or "default",
    }
    current_tags.update(standard_tags)
    res["tags"] = current_tags
    res["preview"] = True
    return res


def list_previews(project_id: Optional[str] = None) -> List[Dict[str, Any]]:

    _cleanup_finished(project_id)
    items = _load()
    out = []
    for r in items:
        if project_id and r.get("project_id") != project_id:
            continue
        r2 = dict(r)
        r2.pop("id", None)
        out.append(r2)
    return sorted(out, key=lambda x: (x.get("pr_number") or 0))


def _latest_stack_status(project_id: Optional[str], name: str) -> str:
    try:
        from services.cloud_provisioning import _latest_run_by_stack
        run = _latest_run_by_stack(project_id).get(name) or {}
        return run.get("status") or ""
    except Exception:
        return ""


def _cleanup_finished(project_id: Optional[str]) -> None:
    """Remove preview stack dirs once their destroy run finished."""
    items = _load()
    changed = False
    for r in items:
        if r.get("status") != "tearing_down":
            continue
        if project_id and r.get("project_id") != project_id:
            continue
        name = r.get("name") or ""
        st = _latest_stack_status(project_id, name)
        if st in ("SUCCEEDED", "FAILED", "ERROR", ""):
            try:
                from services.cloud_provisioning import _stack_dir, _stack_data_dir, _data_base
                for p in (_stack_dir(project_id, name), _stack_data_dir(project_id, name)):
                    if p.exists():
                        shutil.rmtree(p, ignore_errors=True)
            except Exception:
                pass
            r["status"] = "destroyed"
            changed = True
    if changed:
        _save(items)


def create(project_id: Optional[str], base_stack: str, pr_number: int,
           repo: str = "", refresh: bool = False) -> Dict[str, Any]:
    """Clone a base stack into a preview stack and queue `apply`."""
    from services.cloud_provisioning import (
        _create_execution, _data_base, _save_meta, _stack_data_dir, _stack_dir,
    )
    name = f"{PREVIEW_PREFIX}{int(pr_number)}"
    src = _stack_dir(project_id, base_stack)
    dst = _stack_dir(project_id, name)
    existing = next((r for r in _load()
                     if r.get("name") == name and r.get("project_id") == project_id), None)
    if existing and existing.get("status") == "active":
        if not refresh:
            raise ValueError(f"Preview {name} already exists. Use refresh=true or tear down first.")


    # Clear any leftover clone (fresh or refresh) before copying.
    if dst.exists():
        shutil.rmtree(dst, ignore_errors=True)
    sdd = _stack_data_dir(project_id, name)
    if sdd.exists():
        shutil.rmtree(sdd, ignore_errors=True)

    if not src.exists():
        raise FileNotFoundError(f"Base stack '{base_stack}' workspace directory not found")

    from services.feature_flag_registry import can_create_preview_env
    if not can_create_preview_env(project_id=project_id, preview_name=name, env="preview"):
        raise ValueError(f"Preview environment creation is blocked by feature flag for '{name}'")

    # Clone workspace dir (envs/<name>) into envs/pr-<n>.
    shutil.copytree(src, dst, dirs_exist_ok=True)


    # UC500: Inject standard tags into values.auto.tfvars.json
    tfvars_path = dst / "values.auto.tfvars.json"
    existing_vars = {}
    if tfvars_path.exists():
        try:
            existing_vars = json.loads(tfvars_path.read_text(encoding="utf-8"))
        except Exception:
            existing_vars = {}
    tagged_vars = inject_preview_standard_tags(existing_vars, int(pr_number), project_id=project_id, base_stack=base_stack)
    tfvars_path.write_text(json.dumps(tagged_vars, indent=2), encoding="utf-8")

    # Clone control-plane data dir (meta/secrets/snapshots) too.
    sdd = _stack_data_dir(project_id, base_stack)
    if sdd.exists():
        shutil.copytree(sdd, _stack_data_dir(project_id, name), dirs_exist_ok=True)
    # Isolate remote state: rewrite backend.hcl key so the preview never
    # shares the base stack's tfstate file.
    from services.cloud_provisioning import _render_backend_hcl
    backend_path = dst / "backend.hcl"
    if backend_path.exists():
        backend_path.write_text(_render_backend_hcl(name), encoding="utf-8")
    _save_meta(project_id, name, preview=True, base_stack=base_stack,
               pr_number=int(pr_number), repo=repo or "", env="preview",
               preview_status="active", tags=tagged_vars.get("tags"))
    eid = _create_execution(project_id, name, "apply", triggered_by=f"preview:pr-{int(pr_number)}")

    _save([r for r in _load() if r.get("name") != name] + [{
        "project_id": project_id, "name": name, "base_stack": base_stack,
        "pr_number": int(pr_number), "repo": repo or "", "status": "active",
        "execution_id": eid, "created_at": int(time.time()),
        "tags": tagged_vars.get("tags"),
    }])


    # UC192: Auto-trigger test execution for the preview stack context
    try:
        from services.test_cases import run_all_tests
        run_all_tests(project_id=project_id, stack=name)
    except Exception:
        pass

    return {"name": name, "base_stack": base_stack, "pr_number": int(pr_number),
            "repo": repo or "", "status": "active", "execution_id": eid}



def teardown(project_id: Optional[str], name: str, force: bool = False) -> Dict[str, Any]:
    """Queue a destroy for a preview env; dirs are removed once it finishes."""
    from services.cloud_provisioning import _create_execution, _save_meta, _stack_dir
    sd = _stack_dir(project_id, name)
    if not sd.exists():
        raise ValueError(f"Preview '{name}' not found")
    state_file = sd / "terraform.tfstate"
    items = _load()
    rec = next((r for r in items
                if r.get("name") == name and r.get("project_id") == project_id), None)
    if force or not state_file.exists():
        # Nothing to destroy (no local state) — remove immediately.
        from services.cloud_provisioning import _stack_data_dir, _data_base
        for p in (sd, _stack_data_dir(project_id, name)):
            if p.exists():
                shutil.rmtree(p, ignore_errors=True)
        if rec:
            rec["status"] = "destroyed"
            _save(items)
        return {"name": name, "status": "destroyed"}
    eid = _create_execution(project_id, name, "destroy", triggered_by="preview:teardown")
    _save_meta(project_id, name, preview_status="tearing_down")
    if rec:
        rec["status"] = "tearing_down"
        _save(items)
    return {"name": name, "status": "tearing_down", "execution_id": eid}


def handle_github_event(payload: Dict[str, Any], stack: Optional[str] = None) -> Dict[str, Any]:
    """Handle a GitHub `pull_request` webhook (opened/reopened/sync → create/refresh;
    closed/merged → teardown). `stack` comes from the webhook query param, or is
    looked up from the base repo in the payload."""
    action = (payload.get("action") or "").lower()
    pr = payload.get("pull_request") or {}
    number = pr.get("number") or payload.get("number") or 0
    repo_full = (((payload.get("repository") or {}).get("full_name")) or "").strip()
    if not number or not action:
        return {"ok": False, "error": "missing pull_request number/action"}
    project_id = None

    if not stack:
        # Match a base stack whose meta contains the repo (set on stack create).
        try:
            from services.cloud_provisioning import _list_stacks
            for s in _list_stacks(None):
                if (s.get("repo") or "") == repo_full or (s.get("cloud_project") or "") == repo_full:
                    stack = s["name"]
                    break
        except Exception:
            pass
    if not stack:
        return {"ok": False, "error": "no stack mapped to this repo (pass ?stack=<name> or set repo on the stack)"}

    if action in ("opened", "reopened", "synchronize"):
        try:
            rec = create(project_id, stack, number, repo=repo_full, refresh=True)
            return {"ok": True, **rec}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    if action in ("closed",):
        name = f"{PREVIEW_PREFIX}{number}"
        try:
            rec = teardown(project_id, name)
            return {"ok": True, **rec}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    return {"ok": True, "action": action, "ignored": True}


def verify_github_signature(secret: str, body: bytes, signature: Optional[str]) -> bool:
    import hashlib
    import hmac as _hmac
    if not signature:
        return False
    expected = "sha256=" + _hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return _hmac.compare_digest(expected, signature)


def webhook_secret() -> str:
    """Resolve the webhook secret without a repository-known fallback.

    Production validation is delegated to the canonical runtime secret resolver.
    Development and tests may explicitly configure the variable; when they do
    not, an ephemeral value is generated and therefore cannot authenticate a
    request using a shared, known secret.
    """
    from utils.runtime_secrets import resolve_secret

    return resolve_secret("PREVIEW_WEBHOOK_SECRET", generate_in_nonproduction=True)
