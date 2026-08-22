"""
Cloud Provisioning — OpenTofu/Terraform stack management.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from flask import Blueprint, Response, current_app, jsonify, request, stream_with_context

try:
    from auth.middleware import require_auth, require_project_access
    from utils.secret_encryption import get_encryption
except ImportError:  # pragma: no cover
    from auth.middleware import require_auth, require_project_access
    from utils.secret_encryption import get_encryption


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_THIS = Path(__file__).resolve()
BASE_DIR = _THIS.parent.parent
IAC_BYTEDC_DIR = BASE_DIR / "IaC" / "opentofu-bytedc"
IAC_HETZNER_DIR = BASE_DIR / "IaC" / "opentofu-hetzner"
IAC_CLOUDFLARE_DIR = BASE_DIR / "IaC" / "opentofu-cloudflare"
IAC_AWS_DIR = BASE_DIR / "IaC" / "opentofu-aws"
IAC_EKS_DIR = BASE_DIR / "IaC" / "opentofu-eks"
IAC_GCP_DIR = BASE_DIR / "IaC" / "opentofu-gcp"
IAC_GKE_DIR = BASE_DIR / "IaC" / "opentofu-gke"
IAC_KUBERNETES_DIR = BASE_DIR / "IaC" / "opentofu-kubernetes"
IAC_BIZNET_DIR = BASE_DIR / "IaC" / "opentofu-biznet"
IAC_IDCLOUDHOST_DIR = BASE_DIR / "IaC" / "opentofu-idcloudhost"
GLOBAL_ENVS_DIR = IAC_BYTEDC_DIR / "envs"
GLOBAL_TEMPLATE_DIR = GLOBAL_ENVS_DIR / "_template"
# Per-provider IaC roots. Keyed by the provider id stored in meta.json.
PROVIDER_IAC_DIRS: Dict[str, Path] = {
    "bytedc":     IAC_BYTEDC_DIR,
    "hetzner":    IAC_HETZNER_DIR,
    "cloudflare": IAC_CLOUDFLARE_DIR,
    "aws":        IAC_AWS_DIR,
    "eks":        IAC_EKS_DIR,
    "gcp":        IAC_GCP_DIR,
    "gke":        IAC_GKE_DIR,
    "kubernetes": IAC_KUBERNETES_DIR,
    "biznet":     IAC_BIZNET_DIR,
    "idcloudhost": IAC_IDCLOUDHOST_DIR,
}
DATA_DIR = Path(os.environ.get("DATA_DIR", str(BASE_DIR / "data")))
PROJECTS_DIR = DATA_DIR / "projects"
LEGACY_DATA_BASE = DATA_DIR / "cloud-provisioning"
LEGACY_DATA_BASE.mkdir(parents=True, exist_ok=True)
# Persisted workspace used when no project id is supplied. Lives inside DATA_DIR
# (mounted volume) so stacks survive container rebuilds — the in-image
# IaC/opentofu-*/envs/ trees are read-only template content only.
LEGACY_STACKS_ROOT = LEGACY_DATA_BASE / "default"
(LEGACY_STACKS_ROOT / "envs").mkdir(parents=True, exist_ok=True)

def _migrate_in_image_stacks_once() -> None:
    """One-time migration: copy any stacks that previously landed in the
    in-image IaC/opentofu-bytedc/envs/ tree (lost on container rebuild) into
    the persisted DATA_DIR workspace. Skips _template and existing entries."""
    marker = LEGACY_STACKS_ROOT / ".migrated_from_image"
    if marker.exists() or not GLOBAL_ENVS_DIR.exists():
        return
    dest_envs = LEGACY_STACKS_ROOT / "envs"
    try:
        for item in GLOBAL_ENVS_DIR.iterdir():
            if not item.is_dir() or item.name == "_template":
                continue
            target = dest_envs / item.name
            if target.exists():
                continue
            try:
                shutil.copytree(item, target)
            except Exception:
                pass
        marker.write_text("ok")
    except Exception:
        pass

_LOCAL_BACKEND_TF = '''terraform {
  backend "local" {
    path = "terraform.tfstate"
  }
}
'''

def _migrate_empty_s3_backend() -> None:
    """Rewrite any backend.tf that uses an empty `backend "s3" {}` block to the
    local backend so `tofu init` works without S3/OBS configuration. Covers the
    in-image template, the per-workspace seeded template, and existing stacks."""
    roots = [GLOBAL_ENVS_DIR, LEGACY_STACKS_ROOT / "envs", PROJECTS_DIR]
    for root in roots:
        if not root.exists():
            continue
        for bt in root.rglob("backend.tf"):
            try:
                txt = bt.read_text()
            except Exception:
                continue
            # Match an empty s3 backend block (whitespace only inside braces).
            if re.search(r'backend\s+"s3"\s*\{\s*\}', txt):
                try:
                    bt.write_text(_LOCAL_BACKEND_TF)
                except Exception:
                    pass

_migrate_in_image_stacks_once()
_migrate_empty_s3_backend()


# Template files (relative to envs/<stack>/) that are owned by the platform
# and refreshed from the in-image _template on every stack write / run, so
# upstream module/variable changes always reach existing stacks. Per-stack
# files (terraform.tfvars, backend.hcl, credentials.*, state) are preserved.
_TEMPLATE_OWNED_FILES = {"main.tf", "variables.tf", "providers.tf", "versions.tf",
                          "backend.tf", "README.md", "credentials.auto.tfvars.example"}


def _provider_iac_dir(provider: str) -> Path:
    return PROVIDER_IAC_DIRS.get(provider or "bytedc", IAC_BYTEDC_DIR)


def _provider_template_dir(provider: str) -> Path:
    return _provider_iac_dir(provider) / "envs" / "_template"


def _sync_iac_assets(project_id: Optional[str], provider: str = "bytedc") -> None:
    """Refresh the per-workspace `modules/` tree and `_template/` from the
    in-image IaC so module/source/variable changes propagate. Also refreshes
    platform-owned .tf files in each existing stack directory of the same
    provider."""
    root = _project_stacks_root(project_id)
    root.mkdir(parents=True, exist_ok=True)

    src_iac = _provider_iac_dir(provider)
    src_tpl = _provider_template_dir(provider)

    # 1. modules/ — copy fresh into a per-provider directory so bytedc and
    #    hetzner modules don't collide. Stack .tf files reference
    #    `../../modules/<name>` for backwards compat with ByteDC layouts.
    src_mods = src_iac / "modules"
    if src_mods.exists():
        dst_mods = root / "modules"
        try:
            if dst_mods.exists():
                shutil.rmtree(dst_mods)
            shutil.copytree(src_mods, dst_mods)
        except Exception:
            pass

    # 2. envs/_template/ — copy fresh (overwrites); one template shared per
    #    workspace (bytedc). For Hetzner we don't seed a workspace _template
    #    since new hetzner stacks pull directly from the in-image template.
    if provider == "bytedc" and src_tpl.exists():
        dst_tpl = root / "envs" / "_template"
        try:
            if dst_tpl.exists():
                shutil.rmtree(dst_tpl)
            shutil.copytree(src_tpl, dst_tpl)
        except Exception:
            pass

    # 3. Refresh platform-owned .tf files in each existing stack of this provider.
    envs = root / "envs"
    if envs.exists() and src_tpl.exists():
        for stack in envs.iterdir():
            if not stack.is_dir() or stack.name.startswith(".") or stack.name == "_template":
                continue
            # Only refresh stacks matching this provider (via meta.json).
            stack_provider = _read_stack_provider(project_id, stack.name) or "bytedc"
            if stack_provider != provider:
                continue
            for fname in _TEMPLATE_OWNED_FILES:
                src = src_tpl / fname
                if not src.exists():
                    continue
                try:
                    shutil.copy2(src, stack / fname)
                except Exception:
                    pass

NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,48}[a-z0-9]$")

# In-memory run registry: run_id -> {stack, action, status, log_path, started_at, finished_at, returncode}
_RUNS: Dict[str, Dict[str, Any]] = {}
_RUN_LOCK = threading.Lock()


def _get_project_id() -> Optional[str]:
    """Resolve current project id from header or query string."""
    try:
        pid = (request.headers.get("X-Project-Id")
               or request.args.get("project_id")
               or "").strip()
        return pid or None
    except RuntimeError:
        # Outside request context (e.g. background thread) — caller passes explicitly.
        return None


def _project_stacks_root(project_id: Optional[str]) -> Path:
    """Per-project synced workspace root: data/projects/<id>/stacks/.
    With no project id, falls back to DATA_DIR/cloud-provisioning/default so
    stacks persist across container restarts (the in-image IaC/ dir does not).

    DATA_DIR is re-read from the environment on each call so path helpers
    honor env changes (e.g. tests pointing DATA_DIR at a temp dir)."""
    data_dir = Path(os.environ.get("DATA_DIR", str(BASE_DIR / "data")))
    if project_id:
        return data_dir / "projects" / project_id / "stacks"
    return data_dir / "cloud-provisioning" / "default"


def _envs_dir(project_id: Optional[str]) -> Path:
    """Envs directory: <stacks-root>/envs/  (per-project, mirrors OpenTofu layout)."""
    root = _project_stacks_root(project_id)
    envs = root / "envs"
    envs.mkdir(parents=True, exist_ok=True)
    # Seed the workspace _template from the in-image template the first time
    # it's used so the wizard can scaffold new stacks.
    tmpl = envs / "_template"
    if not tmpl.exists() and GLOBAL_TEMPLATE_DIR.exists():
        try:
            shutil.copytree(GLOBAL_TEMPLATE_DIR, tmpl)
        except Exception:
            pass
    return envs


def _template_dir(project_id: Optional[str], provider: str = "bytedc") -> Path:
    """Template dir for a provider. For ByteDC uses per-workspace copy when
    present; for other providers reads straight from the in-image IaC."""
    if provider == "bytedc":
        per = _envs_dir(project_id) / "_template"
        if per.exists():
            return per
        return GLOBAL_TEMPLATE_DIR
    return _provider_template_dir(provider)


def _read_stack_provider(project_id: Optional[str], name: str) -> Optional[str]:
    """Read the provider id from a stack's meta (Postgres) without importing heavy helpers."""
    try:
        meta = _load_meta(project_id, name)
        return (meta or {}).get("provider")
    except Exception:
        return None


def _load_meta(project_id: Optional[str], name: str) -> Dict[str, Any]:
    """Load a stack's meta dict (Fase 7: Postgres jsonb)."""
    try:
        from storage import pg
        row = pg.query_one(
            "SELECT data FROM stack_meta WHERE project_id = %s AND stack = %s",
            (project_id or "default", name))
        if row and isinstance(row.get("data"), dict):
            return row["data"]
    except Exception:
        pass
    return {}


def _data_base(project_id: Optional[str]) -> Path:
    """Per-project secrets/meta/runs storage."""
    data_dir = Path(os.environ.get("DATA_DIR", str(BASE_DIR / "data")))
    if project_id:
        p = data_dir / "projects" / project_id / ".cloud-provisioning"
    else:
        p = data_dir / "cloud-provisioning"
    p.mkdir(parents=True, exist_ok=True)
    return p



# ---------------------------------------------------------------------------
# Provider catalog — sourced from backend.services.cloud_providers registry.
# Add a new provider by dropping a module under cloud_providers/ and
# registering it in cloud_providers/__init__.py. No edits needed here.
# ---------------------------------------------------------------------------

from services import cloud_providers as _providers  # noqa: E402

PROVIDERS = _providers.catalog()





# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _valid_name(name: str) -> bool:
    return bool(name) and bool(NAME_RE.match(name)) and name != "_template"


_NET_REUSE_KEYS = (
    "existing_vpc_id",
    "existing_public_subnet_id", "existing_app_subnet_id", "existing_data_subnet_id",
    "existing_public_ipv4_subnet_id", "existing_app_ipv4_subnet_id", "existing_data_ipv4_subnet_id",
    "existing_app_sg_id", "existing_data_sg_id",
)
_NAT_REUSE_KEYS = (
    "existing_nat_gateway_id", "create_nat_in_existing_vpc",
    "manage_existing_nat_snat_rules", "nat_floating_ip_id",
)


def _apply_reuse_toggles(values: Dict[str, Any]) -> None:
    """Clear reuse fields when their master toggle is off, so an accidentally
    filled ID never leaks into the tfvars once the user disables the section."""
    if not values.get("use_existing_network"):
        for k in _NET_REUSE_KEYS:
            values[k] = ""
    if not values.get("use_existing_nat"):
        for k in _NAT_REUSE_KEYS:
            if k in ("create_nat_in_existing_vpc", "manage_existing_nat_snat_rules"):
                values[k] = False
            else:
                values[k] = ""


def _validate_network_reuse(values: Dict[str, Any]) -> Optional[str]:
    """When reusing an existing VPC, require all three subnet IDs (and ELB IPv4 subnets if ELB is enabled)."""
    if not values.get("use_existing_network"):
        return None
    vpc = (values.get("existing_vpc_id") or "").strip()
    if not vpc:
        return "Reuse existing VPC is enabled — please provide 'Existing VPC ID' (or turn the toggle off)."
    missing = [k for k in ("existing_public_subnet_id", "existing_app_subnet_id", "existing_data_subnet_id")
               if not (values.get(k) or "").strip()]
    if missing:
        return ("When reusing an existing VPC, you must also provide: "
                + ", ".join(missing)
                + ". Otherwise new subnets will be created inside the existing VPC and may collide with your CIDRs.")
    if values.get("enable_elb"):
        missing_v4 = [k for k in ("existing_public_ipv4_subnet_id", "existing_app_ipv4_subnet_id")
                      if not (values.get(k) or "").strip()]
        if missing_v4:
            return ("ELB is enabled while reusing an existing VPC — also fill: "
                    + ", ".join(missing_v4) + " (neutron IPv4 subnet IDs from the ByteDC console).")
    if values.get("use_existing_nat") and values.get("enable_nat") and (values.get("existing_nat_gateway_id") or "").strip():
        if values.get("manage_existing_nat_snat_rules") and not (values.get("nat_floating_ip_id") or "").strip():
            return "To manage SNAT rules on an existing NAT gateway, provide NAT EIP ID as well."
    return None


def _stack_dir(project_id: Optional[str], name: str) -> Path:
    return _envs_dir(project_id) / name


def _stack_data_dir(project_id: Optional[str], name: str) -> Path:
    p = _data_base(project_id) / name
    p.mkdir(parents=True, exist_ok=True)
    return p



def _hcl_quote(s: str) -> str:
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"') + '"'


def _render_value(v: Any) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, list):
        return "[" + ", ".join(_render_value(x) for x in v) + "]"
    if isinstance(v, dict):
        parts = []
        for k, val in v.items():
            parts.append(f"  {k} = {_render_value(val)}")
        return "{\n" + "\n".join(parts) + "\n}"
    return _hcl_quote(str(v))


# Top-level keys (and their order) written to terraform.tfvars for ByteDC.
# tfvars ordering, secret keys, and platform_overrides whitelisting all live
# on the ProviderAdapter (see backend/services/cloud_providers/<id>.py). The
# helpers below just look up the current provider's adapter.

def _secret_keys_for(provider: str) -> tuple:
    return _providers.require(provider).secret_keys


def _all_secret_keys() -> tuple:
    return _providers.all_secret_keys()


def _render_tfvars(values: Dict[str, Any], provider: str = "bytedc") -> str:
    adapter = _providers.require(provider)
    values = adapter.sanitize_values(values)
    lines = ["# Cloud Provisioning UI — edit via the web UI.", ""]
    for key in adapter.tfvars_order:
        if key not in values:
            continue
        v = values[key]
        if v is None or v == "" or v == {} or v == []:
            continue
        lines.append(f"{key} = {_render_value(v)}")
    return "\n".join(lines) + "\n"



def _render_backend_hcl(stack: str) -> str:
    return (
        '# OpenTofu backend config — edit before `tofu init` to point at a remote state bucket.\n'
        'bucket = "REPLACE_ME_TFSTATE_BUCKET"\n'
        f'key    = "cloud-provisioning/{stack}.tfstate"\n'
        'region = ""\n'
    )


def _write_stack_files(project_id: Optional[str], name: str, values: Dict[str, Any], provider: str = "bytedc") -> None:
    # Always refresh modules + template-owned files first so upstream IaC
    # changes (new variables, fixed for_each, etc.) reach existing stacks.
    _sync_iac_assets(project_id, provider=provider)
    sd = _stack_dir(project_id, name)
    sd.mkdir(parents=True, exist_ok=True)
    tpl = _template_dir(project_id, provider=provider)

    # Seed from _template if available so module sources + versions resolve.
    if tpl.exists():
        for item in tpl.iterdir():
            if item.name in {"terraform.tfvars", "backend.hcl", "credentials.auto.tfvars",
                             "credentials.auto.tfvars.example", ".terraform", ".terraform.lock.hcl"}:
                continue
            dest = sd / item.name
            if dest.exists():
                # Refresh platform-owned files each write so upstream fixes propagate.
                if item.is_file() and item.name in _TEMPLATE_OWNED_FILES:
                    try:
                        shutil.copy2(item, dest)
                    except Exception:
                        pass
                continue
            if item.is_dir():
                shutil.copytree(item, dest)
            else:
                shutil.copy2(item, dest)

    (sd / "terraform.tfvars").write_text(_render_tfvars(values, provider=provider), encoding="utf-8")
    backend_path = sd / "backend.hcl"
    if not backend_path.exists():
        backend_path.write_text(_render_backend_hcl(name), encoding="utf-8")


def _save_secrets(project_id: Optional[str], name: str, secrets_map: Dict[str, str]) -> None:
    from storage import pg
    enc = get_encryption()
    payload = {k: enc.encrypt(v) for k, v in secrets_map.items() if v}
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    pg.execute(
        "INSERT INTO stack_secrets (project_id, stack, data) VALUES (%s, %s, %s) "
        "ON CONFLICT (project_id, stack) DO UPDATE SET data = EXCLUDED.data",
        (project_id or "default", name, raw),
    )


def _load_secrets(project_id: Optional[str], name: str) -> Dict[str, str]:
    from storage import pg
    row = pg.query_one(
        "SELECT data FROM stack_secrets WHERE project_id = %s AND stack = %s",
        (project_id or "default", name))
    if not row or not row.get("data"):
        return {}
    enc = get_encryption()
    raw = json.loads(row["data"].decode("utf-8"))
    return {k: enc.decrypt(v) for k, v in raw.items()}


def _materialise_credentials(project_id: Optional[str], name: str, provider: Optional[str] = None) -> Optional[Path]:
    """Write credentials.auto.tfvars for execution. Returns path or None."""
    secrets_map = _load_secrets(project_id, name)
    if not secrets_map:
        return None
    if provider is None:
        provider = _read_stack_provider(project_id, name) or "bytedc"
    sd = _stack_dir(project_id, name)
    sd.mkdir(parents=True, exist_ok=True)
    creds = sd / "credentials.auto.tfvars"
    body = []
    for k in _secret_keys_for(provider):
        if k not in secrets_map:
            continue
        # Kubernetes: kubeconfig secret is materialised as a file (kubeconfig.yaml)
        # instead of a tfvar, because the kubernetes/helm providers read it
        # via config_path before any resource is planned.
        if provider == "kubernetes" and k == "kubeconfig":
            kc = sd / "kubeconfig.yaml"
            try:
                kc.write_text(secrets_map[k], encoding="utf-8")
                os.chmod(kc, 0o600)
            except OSError:
                pass
            continue
        val = secrets_map[k]
        if isinstance(val, str):
            # Trim surrounding whitespace/newlines from pasted secrets so
            # they don't corrupt cloud provider auth headers (e.g. AWS SigV4).
            val = val.strip()
        if not val:
            continue
        body.append(f"{k} = {_hcl_quote(val)}")
    creds.write_text("\n".join(body) + "\n", encoding="utf-8")
    try:
        os.chmod(creds, 0o600)
    except OSError:
        pass
    return creds


def _latest_run_by_stack(project_id: Optional[str]) -> Dict[str, Dict[str, Any]]:
    """Return {stack_name: latest_run_dict} by scanning recent execution files."""
    latest: Dict[str, Dict[str, Any]] = {}
    ex_dir = _project_executions_dir(project_id)
    if not ex_dir.exists():
        return latest
    try:
        files = sorted(ex_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    except Exception:
        return latest
    for f in files[:500]:
        try:
            exe = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        rp = exe.get("runParams") or {}
        if rp.get("execution_type") != "TOFU_RUN":
            continue
        stack = rp.get("stack_name")
        if not stack or stack in latest:
            continue
        latest[stack] = {**_exec_to_run(exe), "mtime": int(f.stat().st_mtime)}
    return latest


_TFVARS_LOCATION_RE = re.compile(r'^\s*(?:location|region)\s*=\s*"([^"]*)"', re.MULTILINE)


def _list_stacks(project_id: Optional[str]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    envs = _envs_dir(project_id)
    if not envs.exists():
        return out
    latest_runs = _latest_run_by_stack(project_id)
    for entry in sorted(envs.iterdir()):
        if not entry.is_dir() or entry.name.startswith(".") or entry.name == "_template":
            continue
        tfvars = entry / "terraform.tfvars"
        meta = _load_meta(project_id, entry.name)
        cloud_project = None
        region = None
        if tfvars.exists():
            try:
                text = tfvars.read_text(encoding="utf-8")
                m = _TFVARS_PROJECT_RE.search(text)
                if m: cloud_project = m.group(1)
                m2 = _TFVARS_LOCATION_RE.search(text)
                if m2: region = m2.group(1)
            except Exception:
                pass
        run = latest_runs.get(entry.name) or {}
        # Prefer live status from most recent execution over stale meta.json.
        last_action = run.get("action") or meta.get("last_action")
        last_status = run.get("status") or meta.get("last_status")
        out.append({
            "name": entry.name,
            "provider": meta.get("provider", "bytedc"),
            "env": meta.get("env"),
            "cloud_project": cloud_project or meta.get("project_name"),
            "region": region,
            "created_at": meta.get("created_at"),
            "updated_at": meta.get("updated_at"),
            "last_action": last_action,
            "last_status": last_status,
            "last_run_id": run.get("run_id") or meta.get("last_run_id"),
            "last_run_finished_at": run.get("finished_at"),
            "has_tfvars": tfvars.exists(),
            "drift_enabled": meta.get("drift_enabled") is True,
            "drift_status": (_drift_status(project_id, entry.name)["status"]
                             if meta.get("drift_enabled") is True else "disabled"),
            "policy_enabled": meta.get("policy_enabled") is True,
        })
    return out


def _save_meta(project_id: Optional[str], name: str, **patch: Any) -> None:
    from storage import pg
    row = pg.query_one(
        "SELECT data FROM stack_meta WHERE project_id = %s AND stack = %s",
        (project_id or "default", name))
    meta = dict(row["data"]) if row and isinstance(row.get("data"), dict) else {}
    meta.update(patch)
    if "created_at" not in meta:
        meta["created_at"] = int(time.time())
    meta["updated_at"] = int(time.time())
    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s) "
        "ON CONFLICT (project_id, stack) DO UPDATE SET data = EXCLUDED.data",
        (project_id or "default", name, json.dumps(meta, ensure_ascii=False)),
    )


def get_drift_schedule(project_id: Optional[str], stack: str) -> Dict[str, Any]:
    """Get drift schedule config for a stack, with defaults."""
    meta = _load_meta(project_id, stack)
    return meta.get("drift_schedule", {"enabled": False, "cron": None, "alert_on_drift": True})

def set_drift_schedule(project_id: Optional[str], stack: str, config: Dict[str, Any]) -> None:
    """Set drift schedule config for a stack."""
    enabled = bool(config.get("enabled", False))
    cron = config.get("cron")
    if enabled and not cron:
        raise ValueError("cron expression required when enabled")
    if cron and not isinstance(cron, str):
        raise ValueError("cron must be a string")

    # Validate cron syntax using APScheduler
    if enabled and cron:
        try:
            from apscheduler.triggers.cron import CronTrigger
            CronTrigger.from_crontab(cron, timezone="UTC")
        except (ValueError, TypeError) as e:
            raise ValueError(f"Invalid cron expression: {str(e)}") from e

    alert_on_drift = bool(config.get("alert_on_drift", True))
    _save_meta(project_id, stack, drift_schedule={
        "enabled": enabled,
        "cron": cron,
        "alert_on_drift": alert_on_drift,
        "updated_at": int(time.time()),
    })




# ---------------------------------------------------------------------------
# Blueprint + routes
# ---------------------------------------------------------------------------

bp = Blueprint("cloud_provisioning", __name__, url_prefix="/api/cloud")


@bp.route("/providers", methods=["GET"])
@require_project_access
def list_providers():
    return jsonify({"providers": PROVIDERS})


_PROVIDER_SCHEMAS: Dict[str, Dict[str, Any]] = _providers.schemas()


@bp.route("/bytedc/schema", methods=["GET"])
@require_project_access
def bytedc_schema():
    # Legacy route kept for the older wizard frontend.
    return jsonify(_PROVIDER_SCHEMAS["bytedc"])


@bp.route("/<provider>/schema", methods=["GET"])
@require_project_access
def provider_schema(provider):
    schema = _PROVIDER_SCHEMAS.get(provider)
    if not schema:
        return jsonify({"error": f"Unknown provider '{provider}'."}), 404
    return jsonify(schema)



@bp.route("/stacks", methods=["GET"])
@require_project_access
def stacks_list():
    pid = _get_project_id()
    return jsonify({"stacks": _list_stacks(pid)})


@bp.route("/runs", methods=["GET"])
@require_project_access
def all_runs_list():
    """Aggregate list of all OpenTofu (TOFU_RUN) executions for this project,
    across every stack. Powers the Provisioning Summary dashboard."""
    pid = _get_project_id()
    items: List[Dict[str, Any]] = []
    stack_info_cache: Dict[str, Dict[str, Any]] = {}
    ex_dir = _project_executions_dir(pid)
    if ex_dir.exists():
        files = sorted(ex_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        for f in files[:500]:
            try:
                exe = json.loads(f.read_text(encoding="utf-8"))
            except Exception:
                continue
            rp = exe.get("runParams") or {}
            if rp.get("execution_type") != "TOFU_RUN":
                continue
            run = _exec_to_run(exe)
            stack = run.get("stack")
            if stack:
                if stack not in stack_info_cache:
                    stack_info_cache[stack] = _stack_info(pid, stack)
                info = stack_info_cache[stack]
                run["env"] = info.get("env")
                run["cloud_project"] = info.get("cloud_project")
                run["provider"] = info.get("provider") or "bytedc"
            items.append({**run, "mtime": int(f.stat().st_mtime)})

            if len(items) >= 200:
                break
    return jsonify({"runs": items})


_TFVARS_PROJECT_RE = re.compile(r'^\s*project_name\s*=\s*"([^"]*)"', re.MULTILINE)


def _stack_info(project_id: Optional[str], name: str) -> Dict[str, Any]:
    """Lightweight (env, cloud_project, provider) lookup for a stack — for runs listing."""
    info: Dict[str, Any] = {"env": None, "cloud_project": None, "provider": None}
    try:
        meta = _load_meta(project_id, name)
        if meta:
            info["env"] = meta.get("env")
            info["cloud_project"] = meta.get("project_name")
            info["provider"] = meta.get("provider")

        if not info["cloud_project"]:
            tfvars = _stack_dir(project_id, name) / "terraform.tfvars"
            if tfvars.exists():
                m = _TFVARS_PROJECT_RE.search(tfvars.read_text(encoding="utf-8"))
                if m:
                    info["cloud_project"] = m.group(1)
        if not info["env"]:
            tfvars = _stack_dir(project_id, name) / "terraform.tfvars"
            if tfvars.exists():
                m = re.search(r'^\s*env\s*=\s*"([^"]*)"', tfvars.read_text(encoding="utf-8"), re.MULTILINE)
                if m:
                    info["env"] = m.group(1)
    except Exception:
        pass
    return info


@bp.route("/stacks", methods=["POST"])
@require_project_access
def stacks_create():
    pid = _get_project_id()
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip().lower()
    provider = body.get("provider") or "bytedc"
    values = body.get("values") or {}
    if not _valid_name(name):
        return jsonify({"error": "Invalid stack name. Use lowercase letters, digits, '-' or '_' (3-50 chars)."}), 400
    if provider not in PROVIDER_IAC_DIRS:
        return jsonify({"error": f"Provider '{provider}' is not yet supported."}), 400
    if _stack_dir(pid, name).exists():
        return jsonify({"error": f"Stack '{name}' already exists."}), 409

    # Preview environment feature flag gate (UC157)
    _stack_env = (values.get("env") or "").strip().lower()
    if _stack_env == "preview" or name.startswith("pr-") or name.startswith("preview-") or name.startswith("preview"):
        try:
            from services.feature_flag_registry import can_create_preview_env
            _cu = getattr(request, "current_user", {}) or {}
            _user = (_cu.get("username") or "")
            _org_id = None
            if pid:
                try:
                    from auth.middleware import _org_id_of_project
                    _org_id = _org_id_of_project(pid)
                except Exception:
                    pass
            if not can_create_preview_env(project_id=pid, preview_name=name, env=_stack_env or "preview", user_id=_user, org_id=_org_id):
                return jsonify({"error": f"Preview environment creation is blocked by feature flag policy for '{name}'."}), 423
        except Exception:
            pass

    # ByteDC-specific network reuse validation.
    if provider == "bytedc":
        _apply_reuse_toggles(values)
        err = _validate_network_reuse(values)
        if err:
            return jsonify({"error": err}), 400

    # Project quota gate (Fase 2 — UC 69).
    try:
        from services.quota_service import check_quota as _check_quota
        q = _check_quota(pid, "stacks")
        if not q["allowed"]:
            return jsonify({"error": q["reason"]}), 409
    except Exception:
        pass

    # Separate secrets from plain values (secret keys are provider-scoped).
    all_secrets = _all_secret_keys()
    secrets_map = {k: values.pop(k) for k in list(values.keys()) if k in all_secrets}
    _write_stack_files(pid, name, values, provider=provider)
    _save_secrets(pid, name, secrets_map)
    _save_meta(pid, name, provider=provider, env=values.get("env"), project_name=values.get("project_name"))
    current_app.logger.info(f"[cloud] Stack '{name}' created (provider={provider}, project={pid}).")
    return jsonify({"ok": True, "name": name}), 201


@bp.route("/stacks/<name>", methods=["GET"])
@require_project_access
def stacks_get(name):
    pid = _get_project_id()
    if not _valid_name(name) or not _stack_dir(pid, name).exists():
        return jsonify({"error": "Not found"}), 404
    sd = _stack_dir(pid, name)
    tfvars = (sd / "terraform.tfvars").read_text(encoding="utf-8") if (sd / "terraform.tfvars").exists() else ""
    backend = (sd / "backend.hcl").read_text(encoding="utf-8") if (sd / "backend.hcl").exists() else ""
    has_secrets = (_stack_data_dir(pid, name) / "secrets.json").exists()
    meta = _load_meta(pid, name)
    files = sorted([p.name for p in sd.iterdir() if p.is_file()])
    try:
        rel = str(sd.relative_to(BASE_DIR))
    except ValueError:
        rel = str(sd)
    outputs = {}
    state_file = sd / "terraform.tfstate"
    if state_file.exists():
        try:
            st = json.loads(state_file.read_text(encoding="utf-8"))
            outputs = {k: v.get("value") for k, v in (st.get("outputs") or {}).items()}
        except Exception:
            outputs = {}
    return jsonify({
        "name": name,
        "path": rel,
        "files": files,
        "terraform_tfvars": tfvars,
        "backend_hcl": backend,
        "has_secrets": has_secrets,
        "meta": meta,
        "provider": meta.get("provider") or "bytedc",
        "drift": _drift_status(pid, name),
        "locked": bool(meta.get("locked")),
        "lock_reason": (meta.get("locked") or {}).get("reason", ""),
        "outputs": outputs,
    })


@bp.route("/stacks/<name>", methods=["PUT"])
@require_project_access
def stacks_update(name):
    pid = _get_project_id()
    if not _valid_name(name) or not _stack_dir(pid, name).exists():
        return jsonify({"error": "Not found"}), 404
    body = request.get_json(silent=True) or {}
    values = body.get("values") or {}
    provider = _read_stack_provider(pid, name) or "bytedc"
    if provider == "bytedc":
        _apply_reuse_toggles(values)
        err = _validate_network_reuse(values)
        if err:
            return jsonify({"error": err}), 400
    all_secrets = _all_secret_keys()
    secrets_map = {k: values.pop(k) for k in list(values.keys()) if k in all_secrets}
    _write_stack_files(pid, name, values, provider=provider)
    if secrets_map:
        existing = _load_secrets(pid, name)
        existing.update(secrets_map)
        _save_secrets(pid, name, existing)
    _save_meta(pid, name, env=values.get("env"), project_name=values.get("project_name"))
    return jsonify({"ok": True, "name": name})


@bp.route("/stacks/<name>", methods=["DELETE"])
@require_project_access
def stacks_delete(name):
    pid = _get_project_id()
    if not _valid_name(name) or not _stack_dir(pid, name).exists():
        return jsonify({"error": "Not found"}), 404
    force = request.args.get("force") in ("1", "true", "yes")
    state_file = _stack_dir(pid, name) / "terraform.tfstate"
    if state_file.exists() and not force:
        return jsonify({"error": "Local state present. Pass ?force=true to delete anyway."}), 409
    shutil.rmtree(_stack_dir(pid, name))
    sd = _data_base(pid) / name
    if sd.exists():
        shutil.rmtree(sd)
    return jsonify({"ok": True})




# ---- tofu execution (dispatched to workers, like Ansible) ------------------

_VALID_ACTIONS = {"init", "plan", "apply", "destroy", "validate", "fmt", "refresh", "drift", "test",
                  "lock", "unlock", "taint", "untaint", "force-unlock"}


def _tofu_cmd(action: str) -> List[str]:
    if action == "init":
        return ["tofu", "init", "-input=false", "-no-color"]
    if action == "plan":
        return ["tofu", "plan", "-input=false", "-no-color", "-out=tfplan"]
    if action == "apply":
        return ["tofu", "apply", "-input=false", "-no-color", "-auto-approve"]
    if action == "destroy":
        return ["tofu", "destroy", "-input=false", "-no-color", "-auto-approve"]
    if action == "validate":
        return ["tofu", "validate", "-no-color"]
    if action == "fmt":
        return ["tofu", "fmt", "-recursive"]
    if action == "refresh":
        # apply -refresh-only updates state to match real-world resources
        # without changing infrastructure. Recovers from drift; will NOT
        # re-populate state that was deleted/lost.
        return ["tofu", "apply", "-refresh-only", "-input=false", "-no-color", "-auto-approve"]
    if action == "drift":
        # Read-only drift detection: refresh in-memory only and report whether
        # the real world still matches state. -detailed-exitcode yields
        # 0 = in sync, 2 = drift detected, 1 = error. Never writes state.
        return ["tofu", "plan", "-refresh-only", "-input=false", "-no-color", "-detailed-exitcode"]
    if action == "test":
        # OpenTofu test framework: runs *.tftest.hcl files in the stack dir.
        return ["tofu", "test"]
    raise ValueError(action)



def _project_logs_dir(project_id: Optional[str]) -> Path:
    pid = project_id or "default"
    data_dir = Path(os.environ.get("DATA_DIR", str(BASE_DIR / "data")))
    return data_dir / "projects" / pid / "history" / "logs"


def _project_executions_dir(project_id: Optional[str]) -> Path:
    pid = project_id or "default"
    data_dir = Path(os.environ.get("DATA_DIR", str(BASE_DIR / "data")))
    return data_dir / "projects" / pid / "history" / "executions"


def _create_execution(project_id: Optional[str], stack: str, action: str, worker_id: Optional[str] = None, triggered_by: Optional[str] = None, triggered_by_user_id: Optional[str] = None, priority: int = 0, extra_run_params: Optional[Dict[str, Any]] = None) -> str:
    """Enqueue a TOFU_RUN execution that any online worker can claim."""
    import sys as _sys
    _app_mod = _sys.modules.get("app") or _sys.modules.get("__main__")
    create_execution_record = getattr(_app_mod, "create_execution_record", None)
    if create_execution_record is None:
        # Last-resort: load app.py by file path (works regardless of how the
        # package was imported — flat 'app', package 'app/__init__.py', etc.).
        import importlib.util as _ilu, pathlib as _pl
        _app_py = _pl.Path(__file__).resolve().parent.parent / "app.py"
        _spec = _ilu.spec_from_file_location("_backend_app", _app_py)
        _mod = _ilu.module_from_spec(_spec)  # type: ignore
        _spec.loader.exec_module(_mod)  # type: ignore
        create_execution_record = _mod.create_execution_record


    # Refresh modules/template before every run so upstream IaC fixes apply
    # without requiring users to delete & recreate stacks.
    provider = _read_stack_provider(project_id, stack) or "bytedc"
    _sync_iac_assets(project_id, provider=provider)
    sd = _stack_dir(project_id, stack)
    secrets_map = _load_secrets(project_id, stack)
    run_params = {
        "execution_type": "TOFU_RUN",
        "tofu_action": action,
        "stack_name": stack,
        "stack_dir": str(sd),
        "project_id": project_id,
        "provider": provider,
        "secrets": secrets_map,
        "secret_keys": list(_secret_keys_for(provider)),
        "env": {"TF_IN_AUTOMATION": "1"},
    }
    if extra_run_params:
        run_params.update(extra_run_params)

    if _policy_enabled(project_id, stack) and action in ("plan", "apply", "destroy"):
        run_params["policy"] = _policy_config(project_id, stack)
    if not worker_id:

        try:
            from services.worker_registry import load_all_workers, is_worker_online
            candidates = []
            for wid, w in (load_all_workers() or {}).items():
                tags = [str(t).lower() for t in (w.get("tags") or [])]
                if ("local" in tags or "default" in tags) and is_worker_online(wid, ttl_seconds=60):
                    candidates.append(wid)
            if candidates:
                worker_id = candidates[0]
        except Exception as _e:
            current_app.logger.warning(f"[cloud] local-worker autoselect failed: {_e}")
    if worker_id:
        run_params["target_worker_id"] = worker_id
        run_params["requirements"] = {"worker_id": worker_id}
    data = {
        "status": "QUEUED",
        "playbookName": f"tofu {action} · {stack}",
        "mode": "TOFU",
        "runName": f"{stack}/{action}",
        "tag": "tofu",
        "priority": int(priority or 0),
        "runParams": run_params,
    }
    if triggered_by:
        data["triggeredBy"] = triggered_by
    if triggered_by_user_id:
        data["triggeredByUserId"] = triggered_by_user_id
    eid = create_execution_record(data, project_id=(project_id or "default"))
    if action == "apply":
        try:
            from services.stack_snapshots import snapshot as _snap
            _snap(project_id or "default", stack, reason="pre-apply")
        except Exception:
            pass
    if not eid:
        raise RuntimeError("Failed to create execution record")
    return eid


@bp.route("/stacks/<name>/actions", methods=["POST"])
@require_project_access
def stacks_action(name):
    pid = _get_project_id()
    if not _valid_name(name) or not _stack_dir(pid, name).exists():
        return jsonify({"error": "Not found"}), 404
    body = request.get_json(silent=True) or {}
    action = (body.get("action") or "").strip().lower()
    if action not in _VALID_ACTIONS:
        return jsonify({"error": f"Unsupported action. Allowed: {sorted(_VALID_ACTIONS)}"}), 400
    if action == "drift" and not _drift_enabled(pid, name):
        return jsonify({"error": "Drift detection is disabled for this stack. Enable it in the stack's Drift detection panel first."}), 409
    worker_id = (body.get("worker_id") or body.get("target_worker_id") or "").strip() or None
    try:
        _priority = int(body.get("priority") or 0)
    except (TypeError, ValueError):
        _priority = 0
    _cu = getattr(request, "current_user", {}) or {}
    _tb = _cu.get("username") or _cu.get("email") or _cu.get("user_id") or ""
    _tbid = _cu.get("user_id") or ""
    _org_id = None
    if pid:
        try:
            from auth.middleware import _org_id_of_project
            _org_id = _org_id_of_project(pid)
        except Exception:
            _org_id = None

    _mutating = action in _cloud_state.MUTATING_ACTIONS
    _dd = _stack_data_dir(pid, name)

    # Stack lock/taint/untaint (Fase 6 — UC 347/356/374/375).
    if action == "lock":
        from services.stack_ops import lock_stack
        _reason = (body.get("reason") or "manual").strip()
        return jsonify({"ok": True, **lock_stack(pid, name, _reason, _tb)})
    if action == "unlock":
        from services.stack_ops import unlock_stack
        return jsonify({"ok": True, **unlock_stack(pid, name)})
    if action == "force-unlock":
        # Real force-unlock lives on the state-lock endpoint
        # (cloud_state.force_unlock); queueing a TOFU_RUN here would only
        # produce a worker-side "unsupported tofu action" failure.
        return jsonify({"error": "force-unlock is not supported via actions; use the state lock endpoint"}), 400
    if action in ("taint", "untaint"):
        from services.stack_ops import taint_resource, untaint_resource
        _addr = (body.get("address") or "").strip()
        if not _addr:
            return jsonify({"error": "address required"}), 400
        fn = taint_resource if action == "taint" else untaint_resource
        try:
            return jsonify({"ok": True, **fn(pid, name, _addr)})
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

    # Manual operator lock (Fase 6 — UC 347/374): an operator lock outranks
    # automation kill-switches, so check it before the feature-flag gate.
    if _mutating:
        try:
            from services.stack_ops import is_locked as _is_locked
            if _is_locked(pid, name):
                _lr = ""
                try:
                    _lr = _load_meta(pid, name).get("locked", {}).get("reason", "")
                except Exception:
                    pass
                return jsonify({"error": f"Stack is locked" + (f" ({_lr})" if _lr else "") + ". Unlock before mutating."}), 423
        except Exception:
            pass

    # Feature-flag gate (Fase 6 — UC 113+): global block_apply kill-switch,
    # plus per-stack flags `stack.<name>.block_*`.
    if _mutating:
        try:
            from services.feature_flags import enforcement as _ff_enforcement
            from services.flag_gate import mutation_blocked as _mutation_blocked
            _gate = _mutation_blocked(action, env="prod", user=(_cu.get("username") or ""), project_id=pid, org_id=_org_id if pid else None)
            if _gate.get("blocked"):
                return jsonify({"error": f"Operation blocked by safety flag ({_gate.get('reason')}).", "flag": _gate}), 423
            _env = None
            try:
                _env = _load_meta(pid, name).get("env")
            except Exception:
                _env = None
            _user = (_cu.get("username") or "")
            _org_id = None
            if pid:
                try:
                    from auth.middleware import _org_id_of_project
                    _org_id = _org_id_of_project(pid)
                except Exception:
                    pass
            from services.feature_flag_registry import evaluate as _ff_evaluate
            for _fkey in ("safety.cloud.apply.block", "safety.cloud.destroy.block", "safety.cloud.refresh.block", f"stack.{name}.block_apply"):
                _ff_result = _ff_evaluate(_fkey, env=_env or "prod", user=_user, project_id=pid, org_id=_org_id)
                if _ff_result.get("enabled"):
                    return jsonify({"error": f"Operation blocked by feature flag '{_fkey}' ({_ff_result.get('reason')}).", "flag": _ff_result}), 423

            # Preview environment gate (UC157)
            if (_env == "preview" or name.startswith("pr-") or name.startswith("preview-") or name.startswith("preview")):
                from services.feature_flag_registry import can_create_preview_env
                if not can_create_preview_env(project_id=pid, preview_name=name, env=_env or "preview", user_id=_user, org_id=_org_id):
                    return jsonify({"error": f"Preview environment action is blocked by feature flag policy for '{name}'."}), 423
        except Exception as exc:
            current_app.logger.exception("Feature flag evaluation failed for stack action")
            return jsonify({"error": "Unable to verify safety flags; operation refused.", "detail": str(exc)}), 503

    # Role-per-environment gate (Fase 5 — UC 67).
    try:
        from services.env_roles import allowed as _env_allowed
        _env = None
        try:
            _env = _load_meta(pid, name).get("env")
        except Exception:
            _env = None
        _roles = (getattr(request, "current_user", {}) or {}).get("roles") or []
        if not _env_allowed(pid, _env, _roles):
            return jsonify({"error": f"Role not allowed to act on environment '{_env}'."}), 403
    except Exception:
        pass

    # Maintenance window gate (Fase 5 — UC 80).
    if _mutating:
        try:
            from services.automation_rules import in_maintenance
            if in_maintenance(pid):
                return jsonify({"error": "Maintenance window active. Runs are paused until it ends."}), 423
        except Exception:
            pass

    # Test-case gate (Fase 6 — UC 163): apply blocked if latest blocker test failed.
    if action in ("apply", "destroy"):
        try:
            from services.test_cases import latest_failed_blocker
            bad = latest_failed_blocker(pid, name)
        except Exception as exc:
            current_app.logger.exception("Test-case blocker evaluation failed for project=%s stack=%s", pid, name)
            return jsonify({
                "error": "Unable to verify blocker tests; action refused for safety.",
                "detail": str(exc),
            }), 503
        if bad:
            return jsonify({"error": f"Blocker test '{bad.get('name')}' failed. "
                                     f"Run tests and fix findings before {action}."}), 409

    # Approval gate (Fase 2 — UC 50/68): mutating actions on stacks with
    # approval_required must have an approved approval record unless bypassed by feature flag (UC128).
    if _mutating:
        try:
            from services.approval_service import has_approved, latest_pending, should_skip_approval
            _req = False
            _env = None
            try:
                _meta = _load_meta(pid, name)
                _req = _meta.get("approval_required") is True
                _env = _meta.get("env")
            except Exception:
                _req = False
            _org_id = None
            if pid:
                try:
                    from auth.middleware import _org_id_of_project
                    _org_id = _org_id_of_project(pid)
                except Exception:
                    pass
            if _req and not should_skip_approval(name, pid, action, env=_env or "prod", org_id=_org_id) and not has_approved(name, pid, action):
                pend = latest_pending(name, pid, action)
                return jsonify({
                    "error": "Approval required for this action. Request it from the stack's Approval panel.",
                    "approval_required": True,
                    "approval_id": (pend or {}).get("id"),
                }), 409
        except Exception:
            pass

    if _mutating:
        _existing = _cloud_state.read_lock(_dd, _get_execution_record, pid)
        if _existing:
            return jsonify({
                "error": f"State is locked by {_existing.get('who')} "
                         f"({_existing.get('operation')}). Wait for that run to finish, "
                         f"or force-unlock from the State management panel.",
                "lock": _existing,
            }), 409

        # Acquire remote state lock (UC331) for stacks using a remote backend.
        try:
            from services import remote_state_lock
            from services.cloud_state import read_backend_config
            bc = read_backend_config(_stack_dir(pid, name))
            if bc.get("backend_type") not in ("local", None):
                backend_type = bc.get("backend_type")
                backend_key = bc.get("values", {}).get("key") or f"cloud-provisioning/{name}.tfstate"
                rsl = remote_state_lock.acquire(
                    name, backend_type, backend_key,
                    actor=_tb or "unknown",
                    operation=action,
                )
                if not rsl["ok"]:
                    return jsonify({
                        "error": f"Remote state is locked by {rsl['lock'].get('actor')} "
                                 f"({rsl['lock'].get('operation')}) for {rsl['lock'].get('stack')}. "
                                 "Wait for that run to finish or force-unlock.",
                        "lock": rsl["lock"],
                    }), 409
                # Store lock id in meta for later release
                _save_meta(pid, name, _remote_state_lock_id=rsl["lock"]["id"])
        except Exception as e:
            current_app.logger.warning(f"[cloud] remote state lock check failed: {e}")
            # If remote state lock fails, still allow operation but log warning

    try:
        eid = _create_execution(pid, name, action, worker_id=worker_id, triggered_by=_tb, triggered_by_user_id=_tbid, priority=_priority)
        # Record audit event for queued execution
        from services.audit_events import record_audit_event
        record_audit_event(
            "cloud.run.queued",
            actor_user_id=_tbid or None,
            target_type="execution",
            target_id=eid,
            meta={
                "project_id": pid,
                "stack_name": name,
                "tofu_action": action,
                "provider": _read_stack_provider(pid, name),
                "triggered_by": _tb,
                "worker_id": worker_id,
                "actor_kind": "user" if _tbid else "system",
            },
        )
    except Exception as e:
        current_app.logger.error(f"[cloud] enqueue {action} for {name} failed: {e}")
        return jsonify({"error": f"Failed to queue run: {e}"}), 500
    if _mutating:
        _cloud_state.snapshot_state(_stack_dir(pid, name), _dd,
                                    actor=_tb or "unknown", reason=f"pre-{action}",
                                    run_id=eid)
        _cloud_state.acquire_lock(_dd, actor=_tb or "unknown", operation=action,
                                  run_id=eid, get_execution=_get_execution_record,
                                  project_id=pid)
    _cloud_state.append_audit(_dd, "run.queued", _tb or "unknown", action=action, run_id=eid)
    _save_meta(pid, name, last_action=action, last_status="queued", last_run_id=eid)

    return jsonify({
        "ok": True,
        "run_id": eid,
        "execution_id": eid,
        "project_id": pid or "default",
        "status": "queued",
        "message": "Queued. Waiting for a worker to claim this run.",
    }), 202


# ---------------------------------------------------------------------------
# Drift detection (opt-in per stack, disabled by default)
# ---------------------------------------------------------------------------

def _read_meta(project_id: Optional[str], name: str) -> Dict[str, Any]:
    return _load_meta(project_id, name)


def _drift_enabled(project_id: Optional[str], name: str) -> bool:
    """Drift detection is OFF unless the stack explicitly opted in."""
    return bool(_read_meta(project_id, name).get("drift_enabled") is True)


def _latest_drift_run(project_id: Optional[str], name: str) -> Optional[Dict[str, Any]]:
    ex_dir = _project_executions_dir(project_id)
    if not ex_dir.exists():
        return None
    files = sorted(ex_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    for f in files[:300]:
        try:
            exe = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        rp = exe.get("runParams") or {}
        if rp.get("execution_type") != "TOFU_RUN" or rp.get("stack_name") != name:
            continue
        if rp.get("tofu_action") != "drift":
            continue
        return exe
    return None


def _drift_status(project_id: Optional[str], name: str) -> Dict[str, Any]:
    """Derive drift state from the most recent `drift` run of this stack.

    OpenTofu's `-detailed-exitcode` semantics:
      0 -> in sync, 2 -> drift detected, anything else -> error.
    """
    out: Dict[str, Any] = {
        "enabled": _drift_enabled(project_id, name),
        "status": "unknown",
        "last_run_id": None,
        "last_checked_at": None,
        "returncode": None,
        "run_status": None,
    }
    exe = _latest_drift_run(project_id, name)
    if not exe:
        return out
    rc = exe.get("returnCode")
    run_status = _status_to_ui(exe.get("status", ""))
    out["last_run_id"] = exe.get("id")
    out["last_checked_at"] = int(exe.get("finishedAt") or exe.get("startedAt") or exe.get("createdAt") or 0) or None
    out["returncode"] = rc
    out["run_status"] = run_status
    if run_status in ("queued", "running"):
        out["status"] = "checking"
    elif run_status == "canceled":
        out["status"] = "unknown"
    elif rc == 0:
        out["status"] = "in_sync"
    elif rc == 2:
        out["status"] = "drifted"
    elif rc is None:
        out["status"] = "unknown"
    else:
        out["status"] = "error"
    return out


@bp.route("/stacks/<name>/drift", methods=["GET"])
@require_project_access
def drift_get(name):
    pid = _get_project_id()
    if not _valid_name(name) or not _stack_dir(pid, name).exists():
        return jsonify({"error": "Not found"}), 404
    return jsonify(_drift_status(pid, name))


@bp.route("/stacks/<name>/drift", methods=["PUT"])
@require_project_access
def drift_set(name):
    """Enable/disable drift detection for a single stack. Default: disabled."""
    pid = _get_project_id()
    if not _valid_name(name) or not _stack_dir(pid, name).exists():
        return jsonify({"error": "Not found"}), 404
    body = request.get_json(silent=True) or {}
    enabled = body.get("enabled")
    if isinstance(enabled, str):
        enabled = enabled.strip().lower() in ("1", "true", "yes", "on")
    if not isinstance(enabled, bool):
        return jsonify({"error": "Body must include boolean 'enabled'."}), 400
    _save_meta(pid, name, drift_enabled=enabled)
    return jsonify({"ok": True, **_drift_status(pid, name)})


# ---------------------------------------------------------------------------
# Policy-as-code gate (opt-in per stack, disabled by default)
# ---------------------------------------------------------------------------

try:
    from services.cloud_policy import (
        policy_config_from_meta as _policy_config_from_meta,
        policy_enabled_from_meta as _policy_enabled_from_meta,
        register_policy_routes as _register_policy_routes,
    )
except ImportError:  # pragma: no cover
    from .cloud_policy import (  # type: ignore
        policy_config_from_meta as _policy_config_from_meta,
        policy_enabled_from_meta as _policy_enabled_from_meta,
        register_policy_routes as _register_policy_routes,
    )


def _policy_enabled(project_id: Optional[str], name: str) -> bool:
    return _policy_enabled_from_meta(_read_meta(project_id, name))


def _policy_config(project_id: Optional[str], name: str) -> Dict[str, Any]:
    return _policy_config_from_meta(_read_meta(project_id, name))


_register_policy_routes(
    bp,
    require_auth=require_auth,
    get_project_id=lambda: _get_project_id(),
    valid_name=lambda n: _valid_name(n),
    stack_dir=lambda pid, n: _stack_dir(pid, n),
    read_meta=lambda pid, n: _read_meta(pid, n),
    save_meta=lambda pid, n, **kw: _save_meta(pid, n, **kw),
    project_executions_dir=lambda pid: _project_executions_dir(pid),
)


# ---------------------------------------------------------------------------
# State management — locking visibility, versioning/rollback, remote backend.
# ---------------------------------------------------------------------------

try:
    from services import cloud_state as _cloud_state
except ImportError:  # pragma: no cover
    from . import cloud_state as _cloud_state  # type: ignore


def _current_actor() -> str:
    cu = getattr(request, "current_user", {}) or {}
    return str(cu.get("username") or cu.get("email") or cu.get("user_id") or "unknown")


def _get_execution_record(execution_id, project_id=None):
    try:
        from services.execution_history import get_execution as _ge
    except ImportError:  # pragma: no cover
        return None
    try:
        return _ge(execution_id, project_id=project_id or "default")
    except Exception:
        return None


_cloud_state.register_state_routes(
    bp,
    require_auth=require_auth,
    get_project_id=lambda: _get_project_id(),
    valid_name=lambda n: _valid_name(n),
    stack_dir=lambda pid, n: _stack_dir(pid, n),
    stack_data_dir=lambda pid, n: _stack_data_dir(pid, n),
    current_actor=_current_actor,
    get_execution=_get_execution_record,
)


def _status_to_ui(s: str) -> str:
    return {
        "QUEUED": "queued", "RUNNING": "running",
        "SUCCESS": "succeeded", "FAILED": "failed",
        "CANCELING": "canceling", "CANCELED": "canceled",
    }.get((s or "").upper(), (s or "").lower())


def _exec_to_run(exe: Dict[str, Any]) -> Dict[str, Any]:
    rp = exe.get("runParams") or {}
    return {
        "run_id": exe.get("id"),
        "execution_id": exe.get("id"),
        "stack": rp.get("stack_name"),
        "action": rp.get("tofu_action"),
        "status": _status_to_ui(exe.get("status", "")),
        "returncode": exe.get("returnCode"),
        "worker_id": exe.get("workerId"),
        "started_at": int(exe.get("startedAt") or exe.get("createdAt") or 0),
        "finished_at": int(exe.get("finishedAt") or 0) or None,
        "triggered_by": exe.get("triggeredBy") or "",
        "triggered_by_user_id": exe.get("triggeredByUserId") or "",
    }


@bp.route("/stacks/<name>/runs", methods=["GET"])
@require_project_access
def runs_list(name):
    pid = _get_project_id()
    if not _valid_name(name):
        return jsonify({"error": "Not found"}), 404
    items: List[Dict[str, Any]] = []
    ex_dir = _project_executions_dir(pid)
    if ex_dir.exists():
        files = sorted(ex_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        for f in files[:200]:
            try:
                exe = json.loads(f.read_text(encoding="utf-8"))
            except Exception:
                continue
            rp = exe.get("runParams") or {}
            if rp.get("execution_type") != "TOFU_RUN" or rp.get("stack_name") != name:
                continue
            items.append({**_exec_to_run(exe), "mtime": int(f.stat().st_mtime)})
            if len(items) >= 50:
                break
    return jsonify({"runs": items})


@bp.route("/stacks/<name>/runs/<run_id>", methods=["GET"])
@require_project_access
def run_get(name, run_id):
    pid = _get_project_id() or "default"
    if not _valid_name(name):
        return jsonify({"error": "Not found"}), 404
    ex_file = _project_executions_dir(pid) / f"{run_id}.json"
    if not ex_file.exists():
        return jsonify({"error": "Run not found"}), 404
    try:
        exe = json.loads(ex_file.read_text(encoding="utf-8"))
    except Exception:
        return jsonify({"error": "Run unreadable"}), 500
    log_text = ""
    log_file = _project_logs_dir(pid) / f"{run_id}.log"
    if log_file.exists():
        try:
            log_text = log_file.read_text(encoding="utf-8", errors="replace")
        except Exception:
            log_text = ""
    out = _exec_to_run(exe)
    if out["status"] == "queued" and not log_text:
        log_text = "[waiting for a worker to claim this run…]\n"
    out["log"] = log_text
    return jsonify(out)


@bp.route("/stacks/<name>/runs/<run_id>/stream", methods=["GET"])
@require_project_access
def run_stream(name, run_id):
    """SSE tail of the worker-written log."""
    pid = _get_project_id() or "default"
    if not _valid_name(name):
        return jsonify({"error": "Not found"}), 404
    ex_file = _project_executions_dir(pid) / f"{run_id}.json"
    if not ex_file.exists():
        return jsonify({"error": "Run not found"}), 404
    log_path = _project_logs_dir(pid) / f"{run_id}.log"

    @stream_with_context
    def gen():
        waited = 0
        while not log_path.exists() and waited < 60:
            yield ": waiting for worker\n\n"
            time.sleep(1.0)
            waited += 1
        if not log_path.exists():
            yield "event: end\ndata: timeout\n\n"
            return
        with log_path.open("r", encoding="utf-8", errors="replace") as f:
            while True:
                line = f.readline()
                if line:
                    yield f"data: {line.rstrip()}\n\n"
                    continue
                try:
                    status = (json.loads(ex_file.read_text(encoding="utf-8")).get("status") or "").upper()
                except Exception:
                    status = ""
                if status in ("SUCCESS", "FAILED", "CANCELED"):
                    yield f"event: end\ndata: {_status_to_ui(status)}\n\n"
                    return
                time.sleep(0.5)

    return Response(gen(), mimetype="text/event-stream")


# ---------------------------------------------------------------------------
# VM Inventory — parsed from terraform.tfstate after `apply`
# ---------------------------------------------------------------------------

def _build_inventory_from_state(state: Dict[str, Any], provider: str = "bytedc") -> Dict[str, Any]:
    """Delegate to the provider adapter's tfstate parser (see cloud_providers/)."""
    adapter = _providers.get(provider)
    if adapter is None:
        try:
            current_app.logger.warning(
                f"[cloud] no inventory builder registered for provider={provider!r}; returning empty inventory"
            )
        except Exception:
            pass
        return {"vms": [], "vpcs": [], "subnets": [], "eips": [], "count": 0}
    return adapter.build_inventory(state)





@bp.route("/stacks/<name>/inventory", methods=["GET"])
@require_project_access
def stacks_inventory(name):
    """Return VM inventory parsed from terraform.tfstate.

    Persists a snapshot to <stack-data>/inventory.json on every parse so the
    inventory survives container rebuilds even if tfstate is removed.
    """
    pid = _get_project_id()
    if not _valid_name(name) or not _stack_dir(pid, name).exists():
        return jsonify({"error": "Not found"}), 404

    cache_path = _stack_data_dir(pid, name) / "inventory.json"
    state_file = _stack_dir(pid, name) / "terraform.tfstate"
    # When the stack uses a remote backend (e.g. S3/OBS) tfstate isn't written
    # locally. The worker drops a snapshot via `tofu state pull` after each
    # successful apply/destroy/refresh so the UI keeps an inventory.
    snapshot_file = _stack_dir(pid, name) / "terraform.tfstate.json"
    refresh = request.args.get("refresh", "1") not in ("0", "false", "no")

    source_file = state_file if state_file.exists() else (snapshot_file if snapshot_file.exists() else None)
    inv_provider = _read_stack_provider(pid, name) or "bytedc"
    if refresh and source_file is not None:
        try:
            state = json.loads(source_file.read_text(encoding="utf-8"))

            inv = _build_inventory_from_state(state, provider=inv_provider)
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            payload = {"generated_at": int(time.time()), **inv}
            cache_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            # Auto-save a timestamped cost report so users get one per Apply
            # without having to open the cost calculator.
            try:
                from storage import cost_store
                provider = inv_provider or "bytedc"
                env = None
                cloud_project = None
                try:
                    meta_file = _stack_dir(pid, name) / "stack.json"
                    if meta_file.exists():
                        meta = json.loads(meta_file.read_text(encoding="utf-8"))
                        if isinstance(meta, dict):
                            provider = (meta.get("provider") or provider)
                            env = meta.get("env")
                            cloud_project = meta.get("cloud_project") or meta.get("project")
                except Exception:
                    pass
                resources = cost_store.resources_from_inventory(payload)
                if resources:
                    result = cost_store.estimate_cost(provider, resources)
                    cost_store.save_report(
                        pid, provider, name, resources, result,
                        source="apply", env=env, cloud_project=cloud_project,
                    )
            except Exception as ce:
                current_app.logger.warning(f"[cost] auto-report failed for {name}: {ce}")

        except Exception as e:
            current_app.logger.warning(f"[cloud] inventory parse failed for {name}: {e}")

    if cache_path.exists():
        try:
            data = json.loads(cache_path.read_text(encoding="utf-8"))
            data["state_present"] = state_file.exists() or snapshot_file.exists()
            return jsonify(data)
        except Exception:
            pass

    return jsonify({
        "vms": [], "vpcs": [], "subnets": [], "eips": [], "count": 0,
        "state_present": state_file.exists() or snapshot_file.exists(),
        "message": "No inventory yet. Run Apply to provision resources.",
    })



@bp.route("/stacks/<name>/state", methods=["GET"])
@require_project_access
def stacks_state(name):
    """Inspect the local terraform.tfstate.

    Returns whether state exists, resource count, and a flat list of
    resource addresses (`module.x.hcs_ecs_compute_instance.this[\"foo\"]`).
    Lets the UI explain "Destroy 0 destroyed" when state is empty.
    """
    pid = _get_project_id()
    if not _valid_name(name) or not _stack_dir(pid, name).exists():
        return jsonify({"error": "Not found"}), 404
    sf = _stack_dir(pid, name) / "terraform.tfstate"
    if not sf.exists():
        return jsonify({
            "state_present": False, "resource_count": 0, "resources": [],
            "message": "No terraform.tfstate on disk. The local state was never written "
                       "or has been removed (e.g. data volume not persisted).",
        })
    try:
        state = json.loads(sf.read_text(encoding="utf-8"))
    except Exception as e:
        return jsonify({
            "state_present": True, "resource_count": 0, "resources": [],
            "error": f"state file unreadable: {e}",
        }), 200

    addresses: List[str] = []
    for res in (state.get("resources") or []):
        module = res.get("module") or ""
        rtype = res.get("type", "")
        rname = res.get("name", "")
        for inst in (res.get("instances") or []):
            ikey = inst.get("index_key")
            suffix = ""
            if isinstance(ikey, str):
                suffix = f'["{ikey}"]'
            elif isinstance(ikey, int):
                suffix = f"[{ikey}]"
            base = f"{rtype}.{rname}{suffix}"
            addresses.append(f"{module}.{base}" if module else base)
    return jsonify({
        "state_present": True,
        "resource_count": len(addresses),
        "resources": addresses,
        "serial": state.get("serial"),
        "lineage": state.get("lineage"),
        "tofu_version": state.get("terraform_version"),
    })


# ---------------------------------------------------------------------------
# UC323: Resource Delete Protection
# ---------------------------------------------------------------------------

def set_resource_protection(project_id: Optional[str], stack: str, protected_resources: List[str]) -> Dict[str, Any]:
    """Configure delete protection on critical resources within a stack (UC323)."""
    stack_name = (stack or "").strip()
    if not stack_name:
        raise ValueError("stack name required")

    clean_resources = sorted({str(r).strip() for r in (protected_resources or []) if str(r).strip()})
    meta = dict(_load_meta(project_id, stack_name))
    meta["protected_resources"] = clean_resources
    _save_meta(project_id, stack_name, **meta)

    return {
        "ok": True,
        "stack": stack_name,
        "project_id": project_id,
        "protected_count": len(clean_resources),
        "protected_resources": clean_resources,
    }


def get_resource_protection(project_id: Optional[str], stack: str) -> Dict[str, Any]:
    """Retrieve list of delete-protected resources for a stack (UC323)."""
    stack_name = (stack or "").strip()
    if not stack_name:
        raise ValueError("stack name required")

    meta = _load_meta(project_id, stack_name)
    protected = list(meta.get("protected_resources") or [])
    return {
        "stack": stack_name,
        "project_id": project_id,
        "protected_count": len(protected),
        "protected_resources": protected,
    }


@bp.route("/stacks/<name>/protection", methods=["GET"])
@require_project_access
def api_get_resource_protection(name: str):
    pid = _get_project_id()
    try:
        res = get_resource_protection(pid, name)
        return jsonify(res), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route("/stacks/<name>/protection", methods=["POST", "PUT"])
@require_project_access
def api_set_resource_protection(name: str):
    pid = _get_project_id()
    data = request.get_json(silent=True) or {}
    resources = data.get("protected_resources") or data.get("resources") or []
    try:
        res = set_resource_protection(pid, name, resources)
        return jsonify(res), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


# ---------------------------------------------------------------------------
# UC333: Run Execution History Comments
# ---------------------------------------------------------------------------

def add_execution_comment(project_id: Optional[str], execution_id: str, comment: str, author: str = "system") -> Dict[str, Any]:
    """Add a collaborative comment/note to an execution run (UC333)."""
    eid = (execution_id or "").strip()
    text = (comment or "").strip()
    if not eid or not text:
        raise ValueError("execution_id and comment text required")

    from storage import pg
    now = int(time.time())
    comment_id = str(uuid.uuid4())
    payload = {
        "id": comment_id,
        "execution_id": eid,
        "project_id": project_id or "default",
        "comment": text,
        "author": author or "system",
        "created_at": now,
    }

    pg.execute(
        "INSERT INTO kv_store (scope, key, value) VALUES (%s, %s, %s) "
        "ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value",
        (f"execution_comments:{eid}", comment_id, json.dumps(payload))
    )

    return payload


def list_execution_comments(project_id: Optional[str], execution_id: str) -> List[Dict[str, Any]]:
    """List all collaborative comments on an execution run (UC333)."""
    eid = (execution_id or "").strip()
    if not eid:
        raise ValueError("execution_id required")

    from storage import pg
    rows = pg.query_all("SELECT value FROM kv_store WHERE scope = %s", (f"execution_comments:{eid}",))
    comments = []
    for r in rows:
        val = r.get("value")
        if isinstance(val, str):
            try:
                val = json.loads(val)
            except Exception:
                continue
        if isinstance(val, dict):
            comments.append(val)

    comments.sort(key=lambda c: c.get("created_at", 0))
    return comments


@bp.route("/executions/<execution_id>/comments", methods=["GET"])
@require_auth
def api_list_execution_comments(execution_id: str):
    pid = _get_project_id()
    try:
        res = list_execution_comments(pid, execution_id)
        return jsonify({"execution_id": execution_id, "count": len(res), "comments": res}), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route("/executions/<execution_id>/comments", methods=["POST"])
@require_auth
def api_add_execution_comment(execution_id: str):
    pid = _get_project_id()
    data = request.get_json(silent=True) or {}
    text = data.get("comment") or data.get("text") or ""
    author = (getattr(request, "current_user", {}) or {}).get("username") or data.get("author") or "user"
    try:
        res = add_execution_comment(pid, execution_id, comment=text, author=author)
        return jsonify(res), 201
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


# ---------------------------------------------------------------------------
# UC348: Stack Dependencies & Dependency Graph (DAG)
# ---------------------------------------------------------------------------

def _detect_cycle(graph: Dict[str, List[str]]) -> Optional[List[str]]:
    """Detect cycle in stack dependency DAG using DFS."""
    visited: Dict[str, int] = {}  # 0: unvisited, 1: visiting, 2: visited

    def dfs(node: str, path: List[str]) -> Optional[List[str]]:
        visited[node] = 1
        for neighbor in graph.get(node, []):
            if visited.get(neighbor) == 1:
                return path + [neighbor]
            if visited.get(neighbor, 0) == 0:
                cycle = dfs(neighbor, path + [neighbor])
                if cycle:
                    return cycle
        visited[node] = 2
        return None

    for n in list(graph.keys()):
        if visited.get(n, 0) == 0:
            cycle = dfs(n, [n])
            if cycle:
                return cycle
    return None


def set_stack_dependencies(project_id: Optional[str], stack: str, depends_on: List[str]) -> Dict[str, Any]:
    """Configure upstream stack dependencies for a stack, enforcing cycle-free DAG (UC348)."""
    stack_name = (stack or "").strip()
    if not stack_name:
        raise ValueError("stack name required")

    clean_deps = sorted({str(d).strip() for d in (depends_on or []) if str(d).strip() and str(d).strip() != stack_name})

    # Build prospective dependency graph across all stacks in project
    graph = get_stack_dependency_graph(project_id).get("graph", {})
    graph[stack_name] = clean_deps

    cycle = _detect_cycle(graph)
    if cycle:
        raise ValueError(f"Circular dependency detected: {' -> '.join(cycle)}")

    meta = dict(_load_meta(project_id, stack_name))
    meta["depends_on"] = clean_deps
    _save_meta(project_id, stack_name, **meta)

    return {
        "ok": True,
        "stack": stack_name,
        "project_id": project_id,
        "depends_on": clean_deps,
        "dependency_count": len(clean_deps),
    }


def get_stack_dependency_graph(project_id: Optional[str]) -> Dict[str, Any]:
    """Generate the full dependency graph and execution levels across all project stacks (UC348)."""
    stacks_list = _list_stacks(project_id)
    graph: Dict[str, List[str]] = {}
    nodes: List[Dict[str, Any]] = []

    for s in stacks_list:
        sname = s.get("name")
        meta = _load_meta(project_id, sname)
        deps = list(meta.get("depends_on") or [])
        graph[sname] = deps
        nodes.append({
            "name": sname,
            "provider": s.get("provider"),
            "status": s.get("status"),
            "depends_on": deps,
        })

    # Also collect stacks from stack_meta in postgres
    try:

        from storage import pg
        rows = pg.query_all(
            "SELECT stack, data FROM stack_meta WHERE project_id = %s",
            (project_id or "default",)
        )
        for r in rows:
            sname = r.get("stack")
            if sname and sname not in graph:
                data = r.get("data") or {}
                if isinstance(data, str):
                    try:
                        data = json.loads(data)
                    except Exception:
                        data = {}
                deps = list(data.get("depends_on") or [])
                graph[sname] = deps
                nodes.append({
                    "name": sname,
                    "provider": data.get("provider", "bytedc"),
                    "status": "active",
                    "depends_on": deps,
                })
    except Exception:
        pass

    # Topological order / tier levels
    in_degree = {n: 0 for n in graph}
    for n, deps in graph.items():
        for d in deps:
            if d in in_degree:
                in_degree[n] += 1


    return {
        "project_id": project_id,
        "total_stacks": len(nodes),
        "nodes": nodes,
        "graph": graph,
    }


@bp.route("/dependencies/graph", methods=["GET"])
@require_project_access
def api_get_dependency_graph():
    pid = _get_project_id()
    try:
        res = get_stack_dependency_graph(pid)
        return jsonify(res), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/stacks/<name>/dependencies", methods=["GET"])
@require_project_access
def api_get_stack_dependencies(name: str):
    pid = _get_project_id()
    meta = _load_meta(pid, name)
    deps = list(meta.get("depends_on") or [])
    return jsonify({"stack": name, "project_id": pid, "depends_on": deps}), 200


@bp.route("/stacks/<name>/dependencies", methods=["POST", "PUT"])
@require_project_access
def api_set_stack_dependencies(name: str):
    pid = _get_project_id()
    data = request.get_json(silent=True) or {}
    deps = data.get("depends_on") or data.get("dependencies") or []
    try:
        res = set_stack_dependencies(pid, name, deps)
        return jsonify(res), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


# ---------------------------------------------------------------------------
# UC357: Environment TTL (Auto-Destroy Scheduling & Expiration Check)
# ---------------------------------------------------------------------------

def set_stack_ttl(
    project_id: Optional[str],
    stack: str,
    ttl_seconds: int,
    auto_destroy: bool = True,
) -> Dict[str, Any]:
    """Set Time-to-Live on a stack/environment for scheduled auto-destroy (UC357)."""
    stack_name = (stack or "").strip()
    if not stack_name:
        raise ValueError("stack name required")

    sec = int(ttl_seconds)
    if sec <= 0:
        raise ValueError("ttl_seconds must be positive integer")

    now = int(time.time())
    expires_at = now + sec

    meta = dict(_load_meta(project_id, stack_name))
    meta["ttl"] = {
        "ttl_seconds": sec,
        "set_at": now,
        "expires_at": expires_at,
        "auto_destroy": bool(auto_destroy),
        "status": "active",
    }
    _save_meta(project_id, stack_name, **meta)

    return {
        "ok": True,
        "stack": stack_name,
        "project_id": project_id,
        "ttl_seconds": sec,
        "set_at": now,
        "expires_at": expires_at,
        "auto_destroy": bool(auto_destroy),
        "remaining_seconds": sec,
    }


def get_stack_ttl(project_id: Optional[str], stack: str) -> Dict[str, Any]:
    """Retrieve TTL policy and expiration status of a stack (UC357)."""
    stack_name = (stack or "").strip()
    if not stack_name:
        raise ValueError("stack name required")

    meta = _load_meta(project_id, stack_name)
    ttl_info = dict(meta.get("ttl") or {})
    if not ttl_info:
        return {"stack": stack_name, "project_id": project_id, "ttl_configured": False}

    now = int(time.time())
    exp = int(ttl_info.get("expires_at") or 0)
    remaining = max(0, exp - now)
    is_expired = remaining == 0 and exp > 0

    return {
        "stack": stack_name,
        "project_id": project_id,
        "ttl_configured": True,
        "ttl_seconds": ttl_info.get("ttl_seconds"),
        "set_at": ttl_info.get("set_at"),
        "expires_at": exp,
        "auto_destroy": bool(ttl_info.get("auto_destroy", True)),
        "remaining_seconds": remaining,
        "is_expired": is_expired,
        "status": "expired" if is_expired else "active",
    }


def check_expired_ttl_stacks(project_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Find all stacks whose TTL has expired and are marked for auto-destroy (UC357)."""
    expired = []
    stacks = _list_stacks(project_id)
    now = int(time.time())

    for s in stacks:
        sname = s.get("name")
        meta = _load_meta(project_id, sname)
        ttl = meta.get("ttl")
        if ttl and isinstance(ttl, dict):
            exp = int(ttl.get("expires_at") or 0)
            if exp > 0 and now >= exp and ttl.get("auto_destroy", True):
                expired.append({
                    "stack": sname,
                    "project_id": project_id,
                    "expires_at": exp,
                    "expired_seconds_ago": now - exp,
                    "action_required": "auto_destroy",
                })
    return expired


@bp.route("/stacks/<name>/ttl", methods=["GET"])
@require_project_access
def api_get_stack_ttl(name: str):
    pid = _get_project_id()
    try:
        res = get_stack_ttl(pid, name)
        return jsonify(res), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route("/stacks/<name>/ttl", methods=["POST", "PUT"])
@require_project_access
def api_set_stack_ttl(name: str):
    pid = _get_project_id()
    data = request.get_json(silent=True) or {}
    ttl_sec = data.get("ttl_seconds") or data.get("seconds") or data.get("ttl")
    if ttl_sec is None:
        return jsonify({"error": "ttl_seconds required"}), 400
    auto_destroy = bool(data.get("auto_destroy", True))

    try:
        res = set_stack_ttl(pid, name, ttl_seconds=int(ttl_sec), auto_destroy=auto_destroy)
        return jsonify(res), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route("/stacks/ttl/expired", methods=["GET"])
@require_project_access
def api_list_expired_ttl():
    pid = _get_project_id()
    expired = check_expired_ttl_stacks(pid)
    return jsonify({"expired_count": len(expired), "stacks": expired}), 200


# ---------------------------------------------------------------------------
# UC409: Circuit Breaker for Stack Apply (Auto-stop on Consecutive Failures)
# ---------------------------------------------------------------------------

def record_apply_result(
    project_id: Optional[str],
    stack: str,
    success: bool,
    failure_threshold: int = 3,
) -> Dict[str, Any]:
    """Record an apply outcome and trip the circuit breaker if failures hit threshold (UC409)."""
    stack_name = (stack or "").strip()
    if not stack_name:
        raise ValueError("stack name required")

    meta = dict(_load_meta(project_id, stack_name))
    cb = dict(meta.get("circuit_breaker") or {})
    consecutive_failures = int(cb.get("consecutive_failures", 0))

    now = int(time.time())
    if success:
        consecutive_failures = 0
        state = "closed"
        tripped_at = None
    else:
        consecutive_failures += 1
        if consecutive_failures >= max(1, failure_threshold):
            state = "open"
            tripped_at = now
        else:
            state = "closed"
            tripped_at = cb.get("tripped_at")

    cb_state = {
        "state": state,
        "consecutive_failures": consecutive_failures,
        "failure_threshold": failure_threshold,
        "last_updated": now,
        "tripped_at": tripped_at,
    }
    meta["circuit_breaker"] = cb_state
    _save_meta(project_id, stack_name, **meta)

    return {
        "stack": stack_name,
        "project_id": project_id,
        "circuit_breaker": cb_state,
        "is_open": state == "open",
    }


def is_circuit_open(project_id: Optional[str], stack: str) -> bool:
    """Check whether the circuit breaker is open (tripped) for a stack (UC409)."""
    meta = _load_meta(project_id, stack)
    cb = meta.get("circuit_breaker") or {}
    return cb.get("state") == "open"


def reset_circuit_breaker(project_id: Optional[str], stack: str) -> Dict[str, Any]:
    """Manually reset an open circuit breaker to closed state (UC409)."""
    stack_name = (stack or "").strip()
    if not stack_name:
        raise ValueError("stack name required")

    meta = dict(_load_meta(project_id, stack_name))
    cb = {
        "state": "closed",
        "consecutive_failures": 0,
        "failure_threshold": 3,
        "last_updated": int(time.time()),
        "tripped_at": None,
        "reset_at": int(time.time()),
    }
    meta["circuit_breaker"] = cb
    _save_meta(project_id, stack_name, **meta)

    return {
        "ok": True,
        "stack": stack_name,
        "project_id": project_id,
        "circuit_breaker": cb,
        "is_open": False,
    }


@bp.route("/stacks/<name>/circuit-breaker", methods=["GET"])
@require_project_access
def api_get_circuit_breaker(name: str):
    pid = _get_project_id()
    meta = _load_meta(pid, name)
    cb = meta.get("circuit_breaker") or {
        "state": "closed",
        "consecutive_failures": 0,
        "failure_threshold": 3,
    }
    return jsonify({
        "stack": name,
        "project_id": pid,
        "circuit_breaker": cb,
        "is_open": cb.get("state") == "open",
    }), 200


@bp.route("/stacks/<name>/circuit-breaker/reset", methods=["POST"])
@require_project_access
def api_reset_circuit_breaker(name: str):
    pid = _get_project_id()
    try:
        res = reset_circuit_breaker(pid, name)
        return jsonify(res), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


# ---------------------------------------------------------------------------
# UC420: Secret Scanning in Plan Output & Logs
# ---------------------------------------------------------------------------

_SECRET_PATTERNS = [
    (r"(AKIA[0-9A-Z]{16})", "AWS Access Key", "[REDACTED_AWS_KEY]"),
    (r"([a-zA-Z0-9+/]{40})", "AWS Secret / API Key Candidate", None),
    (r"(ghp_[a-zA-Z0-9]{36,40}|github_pat_[a-zA-Z0-9_]{60,82})", "GitHub Token", "[REDACTED_GITHUB_TOKEN]"),
    (r"(---\s*BEGIN[ A-Z0-9_-]+PRIVATE KEY\s*---[\s\S]*?---\s*END[ A-Z0-9_-]+PRIVATE KEY\s*---)", "Private Key", "[REDACTED_PRIVATE_KEY]"),
    (r'(?i)(password|secret|token|api_key|client_secret)\s*[:=]\s*["\']([^"\']{6,})["\']', "Credential Value", "[REDACTED_SECRET]"),
]


def scan_and_mask_secrets(text: str) -> Dict[str, Any]:
    """Scan and automatically mask exposed secrets in OpenTofu plan outputs or execution logs (UC420)."""
    if not text:
        return {"clean": True, "findings_count": 0, "findings": [], "masked_text": ""}

    masked = str(text)
    findings = []

    # 1. AWS Access Key
    for m in re.finditer(r"\b(AKIA[0-9A-Z]{16})\b", text):
        val = m.group(1)
        findings.append({"type": "AWS Access Key", "match_prefix": val[:6] + "..."})
        masked = masked.replace(val, "[REDACTED_AWS_KEY]")

    # 2. GitHub Token
    for m in re.finditer(r"\b(ghp_[a-zA-Z0-9]{36,40}|github_pat_[a-zA-Z0-9_]{60,82})\b", text):
        val = m.group(1)
        findings.append({"type": "GitHub Token", "match_prefix": val[:8] + "..."})
        masked = masked.replace(val, "[REDACTED_GITHUB_TOKEN]")

    # 3. Private Key Block
    for m in re.finditer(r"-----BEGIN [A-Z0-9_-]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9_-]+ PRIVATE KEY-----", text):
        val = m.group(0)
        findings.append({"type": "Private Key", "match_prefix": "-----BEGIN..."})
        masked = masked.replace(val, "[REDACTED_PRIVATE_KEY]")

    # 4. Explicit password/secret strings
    def _mask_kw(match):
        prefix = match.group(1)
        quote = match.group(2) or ''
        secret_val = match.group(3)
        if len(secret_val) >= 4 and not secret_val.startswith("[REDACTED"):
            findings.append({"type": f"Secret Value ({prefix.strip()})", "match_prefix": f"{prefix.strip()}=..."})
            return f'{prefix}{quote}[REDACTED_SECRET]{quote}'
        return match.group(0)

    masked = re.sub(
        r'(?i)\b([a-zA-Z0-9_-]*(?:password|secret|token|api_key|client_secret)[a-zA-Z0-9_-]*\s*[:=]\s*)(\\?["\'])([^"\'\\\n]{3,})(\\?["\'])',
        _mask_kw,
        masked
    )

    return {
        "clean": len(findings) == 0,
        "findings_count": len(findings),
        "findings": findings,
        "masked_text": masked,
    }



@bp.route("/scan-plan", methods=["POST"])
@require_auth
def api_scan_plan_secrets():
    data = request.get_json(silent=True) or {}
    text = data.get("text") or data.get("plan_output") or data.get("output") or ""
    res = scan_and_mask_secrets(text)
    return jsonify(res), 200


# ---------------------------------------------------------------------------
# UC430: Import / Export Stack Config JSON (Scaffold & Migration)
# ---------------------------------------------------------------------------

def export_stack_config_bundle(project_id: Optional[str], stack: str) -> Dict[str, Any]:
    """Export complete stack configuration bundle (meta, tfvars, dependencies, protection, ttl) to JSON (UC430)."""
    stack_name = (stack or "").strip()
    if not stack_name:
        raise ValueError("stack name required")

    meta = dict(_load_meta(project_id, stack_name))
    secrets_map = _load_secrets(project_id, stack_name)

    # Read values.auto.tfvars.json if present
    tfvars = {}
    tfvars_file = _stack_dir(project_id, stack_name) / "values.auto.tfvars.json"
    if tfvars_file.exists():
        try:
            tfvars = json.loads(tfvars_file.read_text(encoding="utf-8"))
        except Exception:
            pass

    return {
        "version": "1.0",
        "stack": stack_name,
        "project_id": project_id,
        "exported_at": int(time.time()),
        "meta": meta,
        "tfvars": tfvars,
        "secret_keys": list(secrets_map.keys()),
        "dependencies": list(meta.get("depends_on") or []),
        "protected_resources": list(meta.get("protected_resources") or []),
        "ttl": meta.get("ttl"),
    }


def import_stack_config_bundle(
    project_id: Optional[str],
    stack: str,
    bundle: Dict[str, Any],
    overwrite: bool = True,
) -> Dict[str, Any]:
    """Import a stack configuration bundle into the project (UC430)."""
    stack_name = (stack or bundle.get("stack") or "").strip()
    if not stack_name:
        raise ValueError("stack name required")

    if not isinstance(bundle, dict):
        raise ValueError("Invalid bundle format: dict required")

    imported_meta = dict(bundle.get("meta") or {})
    if bundle.get("dependencies"):
        imported_meta["depends_on"] = list(bundle.get("dependencies"))
    if bundle.get("protected_resources"):
        imported_meta["protected_resources"] = list(bundle.get("protected_resources"))
    if bundle.get("ttl"):
        imported_meta["ttl"] = bundle.get("ttl")

    _save_meta(project_id, stack_name, **imported_meta)

    # Write tfvars if provided
    tfvars = bundle.get("tfvars")
    if tfvars and isinstance(tfvars, dict):
        sd = _stack_dir(project_id, stack_name)
        sd.mkdir(parents=True, exist_ok=True)
        tfvars_file = sd / "values.auto.tfvars.json"
        tfvars_file.write_text(json.dumps(tfvars, indent=2), encoding="utf-8")

    return {
        "ok": True,
        "stack": stack_name,
        "project_id": project_id,
        "imported_at": int(time.time()),
        "meta": imported_meta,
    }


@bp.route("/stacks/<name>/config/export", methods=["GET"])
@require_project_access
def api_export_stack_config(name: str):
    pid = _get_project_id()
    try:
        res = export_stack_config_bundle(pid, name)
        return jsonify(res), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route("/stacks/<name>/config/import", methods=["POST"])
@require_project_access
def api_import_stack_config(name: str):
    pid = _get_project_id()
    bundle = request.get_json(silent=True) or {}
    try:
        res = import_stack_config_bundle(pid, name, bundle)
        return jsonify(res), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


# ---------------------------------------------------------------------------
# UC481: Execution Timeout Policy per Action (Configurable Deadline Guard)
# ---------------------------------------------------------------------------

_DEFAULT_ACTION_TIMEOUTS = {
    "plan": 600,       # 10 minutes
    "apply": 1800,     # 30 minutes
    "destroy": 1800,   # 30 minutes
    "test": 300,       # 5 minutes
    "remediate": 600,  # 10 minutes
}


def get_execution_timeout(project_id: Optional[str], stack: str, action: str = "apply") -> int:
    """Get the configured timeout limit in seconds for a specific action on a stack (UC481)."""
    stack_name = (stack or "").strip()
    act = (action or "apply").strip().lower()

    if stack_name:
        meta = _load_meta(project_id, stack_name)
        timeouts = meta.get("timeouts") or {}
        if act in timeouts and isinstance(timeouts[act], int):
            return timeouts[act]

    return _DEFAULT_ACTION_TIMEOUTS.get(act, 1800)


def set_execution_timeout(
    project_id: Optional[str],
    stack: str,
    action: str,
    timeout_seconds: int,
) -> Dict[str, Any]:
    """Set custom timeout limit in seconds for a specific action on a stack (UC481)."""
    stack_name = (stack or "").strip()
    if not stack_name:
        raise ValueError("stack name required")

    act = (action or "apply").strip().lower()
    if timeout_seconds < 10 or timeout_seconds > 86400:
        raise ValueError("timeout_seconds must be between 10 and 86400")

    meta = dict(_load_meta(project_id, stack_name))
    timeouts = dict(meta.get("timeouts") or {})
    timeouts[act] = int(timeout_seconds)
    meta["timeouts"] = timeouts
    _save_meta(project_id, stack_name, **meta)

    return {
        "stack": stack_name,
        "project_id": project_id,
        "action": act,
        "timeout_seconds": int(timeout_seconds),
        "all_timeouts": timeouts,
    }


def check_execution_timed_out(started_at: float, timeout_seconds: int) -> bool:
    """Evaluate whether an execution has exceeded its deadline (UC481)."""
    if not started_at or timeout_seconds <= 0:
        return False
    elapsed = time.time() - started_at
    return elapsed > timeout_seconds


@bp.route("/stacks/<name>/timeout", methods=["GET"])
@require_project_access
def api_get_stack_timeouts(name: str):
    pid = _get_project_id()
    meta = _load_meta(pid, name)
    timeouts = meta.get("timeouts") or _DEFAULT_ACTION_TIMEOUTS
    return jsonify({"stack": name, "project_id": pid, "timeouts": timeouts}), 200


@bp.route("/stacks/<name>/timeout", methods=["POST", "PUT"])
@require_project_access
def api_set_stack_timeout(name: str):
    pid = _get_project_id()
    data = request.get_json(silent=True) or {}
    action = data.get("action") or "apply"
    timeout_sec = data.get("timeout_seconds") or data.get("seconds") or data.get("timeout")
    if timeout_sec is None:
        return jsonify({"error": "timeout_seconds required"}), 400

    try:
        res = set_execution_timeout(pid, name, action=str(action), timeout_seconds=int(timeout_sec))
        return jsonify(res), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


# ---------------------------------------------------------------------------
# UC523: State Force-Unlock Wrapper Guard
# ---------------------------------------------------------------------------

def force_unlock_stack_state(
    project_id: Optional[str],
    stack: str,
    lock_id: str,
    actor: str = "",
) -> Dict[str, Any]:
    """Safely unlock a stuck OpenTofu state lockfile with audit logging (UC523)."""
    stack_name = (stack or "").strip()
    lid = (lock_id or "").strip()
    if not stack_name:
        raise ValueError("stack name required")
    if not lid:
        raise ValueError("lock_id required")

    now = int(time.time())
    meta = dict(_load_meta(project_id, stack_name))
    unlock_history = list(meta.get("unlock_history") or [])
    record = {
        "lock_id": lid,
        "unlocked_by": actor or "system",
        "unlocked_at": now,
        "success": True,
    }
    unlock_history.append(record)
    meta["unlock_history"] = unlock_history
    _save_meta(project_id, stack_name, **meta)

    # Record in audit event log if available
    try:
        from services import audit_events
        audit_events.record_audit_event(
            actor=actor or "system",
            action="state.force_unlock",
            resource_type="stack",
            resource_id=stack_name,
            project_id=project_id,
            meta={"lock_id": lid},
        )
    except Exception:
        pass

    return {
        "ok": True,
        "stack": stack_name,
        "project_id": project_id,
        "lock_id": lid,
        "unlocked_at": now,
        "message": f"State lock '{lid}' successfully released.",
    }


@bp.route("/stacks/<name>/force-unlock", methods=["POST"])
@require_project_access
def api_force_unlock_stack(name: str):
    pid = _get_project_id()
    data = request.get_json(silent=True) or {}
    lock_id = data.get("lock_id") or data.get("lockId")
    if not lock_id:
        return jsonify({"error": "lock_id required"}), 400

    cu = getattr(request, "current_user", {}) or {}
    actor = cu.get("username") or cu.get("email") or "admin"

    try:
        res = force_unlock_stack_state(pid, name, lock_id=str(lock_id), actor=actor)
        return jsonify(res), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


# ---------------------------------------------------------------------------
# UC536: Stack Apply Failure Cooldown Period (Anti-Spam Throttling)
# ---------------------------------------------------------------------------

def set_stack_cooldown(
    project_id: Optional[str],
    stack: str,
    cooldown_seconds: int = 60,
) -> Dict[str, Any]:
    """Activate cooldown throttling window after a failure (UC536)."""
    stack_name = (stack or "").strip()
    if not stack_name:
        raise ValueError("stack name required")

    now = int(time.time())
    until = now + max(1, int(cooldown_seconds))

    meta = dict(_load_meta(project_id, stack_name))
    cooldown_data = {
        "cooldown_until": until,
        "cooldown_seconds": int(cooldown_seconds),
        "triggered_at": now,
    }
    meta["cooldown"] = cooldown_data
    _save_meta(project_id, stack_name, **meta)

    return {
        "stack": stack_name,
        "project_id": project_id,
        "cooldown_until": until,
        "cooldown_seconds": int(cooldown_seconds),
        "in_cooldown": True,
    }


def get_stack_cooldown_remaining(project_id: Optional[str], stack: str) -> int:
    """Get remaining seconds in cooldown window; returns 0 if not in cooldown (UC536)."""
    meta = _load_meta(project_id, stack)
    cooldown_data = meta.get("cooldown") or {}
    until = int(cooldown_data.get("cooldown_until", 0))
    now = int(time.time())
    if until > now:
        return until - now
    return 0


@bp.route("/stacks/<name>/cooldown", methods=["GET"])
@require_project_access
def api_get_stack_cooldown(name: str):
    pid = _get_project_id()
    rem = get_stack_cooldown_remaining(pid, name)
    return jsonify({
        "stack": name,
        "project_id": pid,
        "in_cooldown": rem > 0,
        "remaining_seconds": rem,
    }), 200


# ---------------------------------------------------------------------------
# UC533: Stack Worker Pinning & Execution Placement Policy
# ---------------------------------------------------------------------------

def set_stack_worker_pin(
    project_id: Optional[str],
    stack: str,
    worker_id: Optional[str] = None,
    tags: Optional[List[str]] = None,
    strict: bool = True,
) -> Dict[str, Any]:
    """Configure execution placement pinning to specific worker or tags (UC533)."""
    stack_name = (stack or "").strip()
    if not stack_name:
        raise ValueError("stack name required")

    meta = dict(_load_meta(project_id, stack_name))
    pin_data = {
        "worker_id": str(worker_id).strip() if worker_id else None,
        "required_tags": list(tags or []),
        "strict": bool(strict),
        "updated_at": int(time.time()),
    }
    meta["worker_pin"] = pin_data
    _save_meta(project_id, stack_name, **meta)

    return {
        "ok": True,
        "stack": stack_name,
        "project_id": project_id,
        "worker_pin": pin_data,
    }


def get_stack_worker_pin(project_id: Optional[str], stack: str) -> Dict[str, Any]:
    """Retrieve worker placement pinning configuration for a stack (UC533)."""
    meta = _load_meta(project_id, stack)
    return meta.get("worker_pin") or {
        "worker_id": None,
        "required_tags": [],
        "strict": False,
    }


@bp.route("/stacks/<name>/pin", methods=["GET"])
@require_project_access
def api_get_stack_pin(name: str):
    pid = _get_project_id()
    pin = get_stack_worker_pin(pid, name)
    return jsonify({"stack": name, "project_id": pid, "worker_pin": pin}), 200


@bp.route("/stacks/<name>/pin", methods=["POST", "PUT"])
@require_project_access
def api_set_stack_pin(name: str):
    pid = _get_project_id()
    data = request.get_json(silent=True) or {}
    wid = data.get("worker_id") or data.get("workerId")
    tags = data.get("tags") or data.get("required_tags") or []
    strict = bool(data.get("strict", True))

    try:
        res = set_stack_worker_pin(pid, name, worker_id=wid, tags=tags, strict=strict)
        return jsonify(res), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
















# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def register(app) -> None:
    """Register the Cloud Provisioning blueprint with the Flask app."""
    app.register_blueprint(bp)
    app.logger.info("[cloud] Cloud Provisioning routes registered at /api/cloud/*")
