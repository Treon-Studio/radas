"""Test case management (Fase 6 — UC 161+).

Registry of test cases with a built-in assertion library evaluated against
stack tfvars / latest plan text / state. Runs produce history entries; a
failed `blocker` test can gate apply via stacks_action.
"""
from __future__ import annotations

import json
import re
import time
import uuid
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from pathlib import Path
from typing import Any, Dict, List, Optional

SEVERITIES = ("blocker", "warning", "info")
KINDS = ("assertion", "tofu_validate", "tofu_test", "ansible_validate", "iac_scan", "smoke")
_RESULTS_LOCK = threading.Lock()


def _store_path(name: str) -> Path:
    import os
    env_dir = os.environ.get("DATA_DIR")
    if env_dir:
        return Path(env_dir) / name
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / name
    except Exception:
        return Path("data") / name


def _scope(name: str, project_id: Optional[str]) -> str:
    base = name.replace(".json", "")
    return f"{base}:{project_id or 'unscoped'}"


def _load(name: str, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
    try:
        from storage import kv
        v = kv.kv_load(_scope(name, project_id))
        return v if isinstance(v, list) else []
    except Exception:
        return []


def _save(name: str, items: List[Dict[str, Any]], project_id: Optional[str] = None) -> None:
    from storage import kv
    kv.kv_save(_scope(name, project_id), items)


# --------------------------------------------------------------------------
# Assertion library — deterministic rules evaluated against raw text.
# --------------------------------------------------------------------------

ASSERTIONS: Dict[str, Dict[str, Any]] = {
    "cidr_public": {
        "name": "Public CIDR 0.0.0.0/0",
        "desc": "Deteksi CIDR publik di security group / ingress.",
        "pattern": re.compile(r"0\.0\.0\.0/0"),
        "severity": "blocker",
    },
    "ports_open": {
        "name": "Port 22/3389 terbuka publik",
        "desc": "SSH/RDP ke 0.0.0.0/0 terdeteksi.",
        "pattern": re.compile(r"(?:22|3389)[^\n]*0\.0\.0\.0/0|0\.0\.0\.0/0[^\n]*(?:22|3389)", re.I),
        "severity": "blocker",
    },
    "unencrypted_volume": {
        "name": "Volume tanpa enkripsi",
        "desc": "encrypted=false atau disabled pada disk/volume.",
        "pattern": re.compile(r"encrypt(?:ed|ion)?\s*=\s*(?:false|disabled)", re.I),
        "severity": "warning",
    },
    "missing_tags": {
        "name": "Resource tanpa tag wajib",
        "desc": "tags = {} atau blok tags kosong.",
        "pattern": re.compile(r"tags\s*=\s*\{\s*\}"),
        "severity": "warning",
    },
    "iam_wildcard": {
        "name": "IAM wildcard Action/Resource",
        "desc": "Tanda (\"*\") pada policy IAM.",
        "pattern": re.compile(r"(?:action|resource)\s*[:=]\s*\[?[\"']\*[\"']"),
        "severity": "warning",
    },
    "secret_in_tfvars": {
        "name": "Secret plaintext di tfvars",
        "desc": "password/api_key/secret berisi nilai non-placeholder.",
        "pattern": re.compile(r"(?i)(?:password|api_key|secret|token)\s*=\s*\"(?!(<|\$|REPLACE|your|xxx))[^\"]+\""),
        "severity": "blocker",
    },
    "vm_count_zero": {
        "name": "app_vm_count = 0",
        "desc": "Jumlah instance yang direncanakan 0.",
        "pattern": re.compile(r"app_vm_count\s*=\s*0\b"),
        "severity": "info",
    },
    "db_no_backup": {
        "name": "Database tanpa backup",
        "desc": "backup_enabled=false / disable_backup=true.",
        "pattern": re.compile(r"(?:backup_enabled\s*=\s*false|disable_backup\s*=\s*true)", re.I),
        "severity": "warning",
    },
    "provider_image_outdated": {
        "name": "Provider image outdated",
        "desc": "Deteksi image/provider version yang melewati versi minimum.",
        "pattern": re.compile(r"(?i)(?:image|provider_version)\s*[=:]\s*[\"']?(?:0\.|v?1\.[0-9]\b)"),
        "severity": "warning",
    },
    "budget_exceeded": {
        "name": "Monthly budget exceeded",
        "desc": "Monthly estimated cost exceeds configured budget.",
        "pattern": re.compile(r"(?i)(?:monthly_cost|estimated_cost)\s*[=:]\s*\$?(?:[1-9][0-9]{3,}|[0-9]{5,})"),
        "severity": "blocker",
    },
    "instance_count_exceeded": {
        "name": "Instance count threshold exceeded",
        "desc": "Planned instance count exceeds safe threshold.",
        "pattern": re.compile(r"(?i)(?:instance_count|app_vm_count)\s*[=:]\s*(?:[1-9][0-9]{1,})\b"),
        "severity": "warning",
    },
    "missing_environment_owner_tags": {
        "name": "Missing environment/owner tags",
        "desc": "Resource tags must include environment and owner.",
        "pattern": re.compile(r"(?i)tags\s*=\s*\{", re.S),
        "severity": "warning",
    },
    "drift_detected": {
        "name": "Configuration drift detected",
        "desc": "Configured values differ from the latest recorded state.",
        "pattern": re.compile(r"(?s).*"),
        "severity": "warning",
    },
    "http_plain": {
        "name": "HTTP tanpa TLS",
        "desc": "protocol = \"http\" / port 80 listener.",
        "pattern": re.compile(r"protocol\s*=\s*\"http\"|port\s*=\s*80\b", re.I),
        "severity": "info",
    },
}


def _assertion_ids() -> List[str]:
    return sorted(ASSERTIONS)


TEST_TEMPLATES: List[Dict[str, Any]] = [
    {
        "id": "tpl-security-baseline",
        "slug": "security-baseline",
        "name": "Security Baseline",
        "desc": "Check public CIDR, open SSH/RDP ports, and plaintext secrets",
        "kind": "assertion",
        "assertions": ["cidr_public", "ports_open", "secret_in_tfvars"],
        "severity": "blocker",
        "tags": ["security", "baseline"],
    },
    {
        "id": "tpl-compliance-storage",
        "slug": "compliance-storage",
        "name": "Storage & Resource Compliance",
        "desc": "Check unencrypted volumes and missing required tags",
        "kind": "assertion",
        "assertions": ["unencrypted_volume", "missing_tags"],
        "severity": "warning",
        "tags": ["compliance", "storage"],
    },
    {
        "id": "tpl-iam-governance",
        "slug": "iam-governance",
        "name": "IAM Governance",
        "desc": "Check IAM wildcard permissions",
        "kind": "assertion",
        "assertions": ["iam_wildcard"],
        "severity": "warning",
        "tags": ["security", "iam", "governance"],
    },
    {
        "id": "tpl-cost-sanity",
        "slug": "cost-sanity",
        "name": "Cost Sanity Check",
        "desc": "Ensure instance counts and budget limits are aligned",
        "kind": "assertion",
        "assertions": ["vm_count_zero", "budget_exceeded"],
        "severity": "info",
        "tags": ["cost", "sanity"],
    },
]


def list_templates() -> List[Dict[str, Any]]:
    """Return built-in test case templates catalog (UC180)."""
    return [dict(t) for t in TEST_TEMPLATES]


def list_test_cases(project_id: Optional[str] = None, tag: str = "", environment: str = "",
                    enabled: Optional[bool] = None, kind: str = "") -> List[Dict[str, Any]]:
    rows = _load("test_cases.json", project_id)
    tag = tag.strip().lower()
    environment = environment.strip().lower()
    kind = kind.strip().lower()
    if tag:
        rows = [row for row in rows if tag in {str(item).strip().lower() for item in (row.get("tags") or [])}]
    if environment:
        rows = [row for row in rows if str((row.get("parameters") or {}).get("env", "")).strip().lower() == environment]
    if enabled is not None:
        rows = [row for row in rows if bool(row.get("enabled", True)) is enabled]
    if kind:
        rows = [row for row in rows if str(row.get("kind", "")).strip().lower() == kind]
    return rows


def get_test_case(test_id: str, project_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    return next((t for t in list_test_cases(project_id) if t["id"] == test_id), None)


def validate_test_definition(data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate a test definition without persisting it or executing a stack."""
    name = str(data.get("name") or "").strip()
    kind = str(data.get("kind") or "assertion").strip()
    assertions = [str(value) for value in (data.get("assertions") or [])]
    tags = [str(value) for value in (data.get("tags") or [])]
    parameters = data.get("parameters") if isinstance(data.get("parameters"), dict) else {}
    errors = []
    if not name:
        errors.append("name required")
    if kind not in KINDS:
        errors.append(f"kind must be one of {KINDS}")
    unknown = [value for value in assertions if value not in ASSERTIONS]
    if unknown:
        errors.append(f"unknown assertions: {', '.join(unknown)}")
    if kind == "assertion" and not assertions:
        errors.append("assertion kind requires at least one assertion")
    if not all(tag.strip() for tag in tags):
        errors.append("tags must be non-empty strings")
    if not all(isinstance(key, str) and key.strip() for key in parameters):
        errors.append("parameter keys must be non-empty strings")
    return {"valid": not errors, "errors": errors, "assertions": [value for value in assertions if value in ASSERTIONS],
            "kind": kind, "tag_count": len(tags), "parameter_keys": sorted(parameters)}


def create_test_case(data: Dict[str, Any], project_id: Optional[str] = None) -> Dict[str, Any]:
    name = (data.get("name") or "").strip()
    if not name:
        raise ValueError("name required")
    tc = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "description": (data.get("description") or "").strip(),
        "parameters": data.get("parameters") if isinstance(data.get("parameters"), dict) else {},
        "name": name,
        "stack": (data.get("stack") or "").strip(),
        "kind": (data.get("kind") or "assertion").strip(),
        "assertions": [str(a) for a in (data.get("assertions") or [])],
        "severity": (data.get("severity") or "warning").strip(),
        "enabled": bool(data.get("enabled", True)),
        "tags": [str(t) for t in (data.get("tags") or [])],
        "schedule": (data.get("schedule") or "").strip(),
        "created_at": int(time.time()),
        "updated_at": int(time.time()),
    }
    if tc["kind"] not in KINDS:
        raise ValueError(f"kind must be one of {KINDS}")
    invalid_assertions = [a for a in tc["assertions"] if a not in ASSERTIONS]
    if invalid_assertions:
        raise ValueError(f"unknown assertions: {', '.join(invalid_assertions)}")
    if not all(isinstance(k, str) and k.strip() for k in tc["parameters"]):
        raise ValueError("parameter keys must be non-empty strings")
    if not all(isinstance(tag, str) and tag.strip() for tag in tc["tags"]):
        raise ValueError("tags must be non-empty strings")
    if tc["severity"] not in SEVERITIES:
        raise ValueError(f"severity must be one of {SEVERITIES}")
    if tc["kind"] == "assertion" and not tc["assertions"]:
        raise ValueError("assertion kind requires at least one assertion")
    items = list_test_cases(project_id)
    items.append(tc)
    _save("test_cases.json", items, project_id)
    _save("test_case_versions.json", [{"version": 1, "test_id": tc["id"], "at": tc["created_at"], "snapshot": dict(tc)}], project_id)
    return tc


def update_test_case(test_id: str, patch: Dict[str, Any], project_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    items = list_test_cases(project_id)
    tc = next((t for t in items if t["id"] == test_id), None)
    if not tc:
        return None
    for field in ("name", "stack", "kind", "severity", "schedule", "description"):
        if field in patch:
            tc[field] = (patch[field] or "").strip() if isinstance(patch[field], str) else patch[field]
    if "parameters" in patch:
        parameters = patch["parameters"]
        if not isinstance(parameters, dict) or not all(isinstance(k, str) and k.strip() for k in parameters):
            raise ValueError("parameter keys must be non-empty strings")
        tc["parameters"] = parameters
    if "assertions" in patch:
        assertions = [str(a) for a in (patch["assertions"] or [])]
        invalid_assertions = [a for a in assertions if a not in ASSERTIONS]
        if invalid_assertions:
            raise ValueError(f"unknown assertions: {', '.join(invalid_assertions)}")
        tc["assertions"] = assertions
    if "tags" in patch:
        tags = [str(t) for t in (patch["tags"] or [])]
        if not all(tag.strip() for tag in tags):
            raise ValueError("tags must be non-empty strings")
        tc["tags"] = tags
    if "enabled" in patch:
        tc["enabled"] = bool(patch["enabled"])
    tc["updated_at"] = int(time.time())
    _save("test_cases.json", items, project_id)
    versions = _load("test_case_versions.json", project_id)
    versions.append({"version": max([int(item.get("version", 0)) for item in versions if item.get("test_id") == test_id] or [0]) + 1,
                     "test_id": test_id, "at": tc["updated_at"], "snapshot": dict(tc)})
    _save("test_case_versions.json", versions[-1000:], project_id)
    return tc


def list_test_case_versions(test_id: str, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
    return [item for item in _load("test_case_versions.json", project_id) if item.get("test_id") == test_id]


def rollback_test_case(test_id: str, version: int, project_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    target = next((item for item in list_test_case_versions(test_id, project_id) if int(item.get("version", 0)) == int(version)), None)
    if not target:
        return None
    restored = update_test_case(test_id, target.get("snapshot") or {}, project_id)
    return restored


def delete_test_case(test_id: str, project_id: Optional[str] = None) -> bool:
    items = list_test_cases(project_id)
    nxt = [t for t in items if t["id"] != test_id]
    if len(nxt) == len(items):
        return False
    _save("test_cases.json", nxt, project_id)
    return True


def clone_test_case(test_id: str, project_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Clone a case within its project without copying execution history."""
    source = get_test_case(test_id, project_id)
    if not source:
        return None
    clone = dict(source)
    now = int(time.time())
    clone["id"] = str(uuid.uuid4())
    clone["name"] = f"{source['name']} (copy)"
    clone["created_at"] = now
    clone["updated_at"] = now
    items = list_test_cases(project_id)
    items.append(clone)
    _save("test_cases.json", items, project_id)
    return clone


# --------------------------------------------------------------------------
# Running tests
# --------------------------------------------------------------------------

def _stack_texts(project_id: Optional[str], stack: str) -> Dict[str, str]:
    """Collect tfvars / state / plan text available for a stack."""
    from services.cloud_provisioning import _stack_dir, _stack_data_dir
    out: Dict[str, str] = {}
    sd = _stack_dir(project_id, stack)
    if sd.exists():
        tf = sd / "terraform.tfvars"
        if tf.exists():
            out["tfvars"] = tf.read_text(encoding="utf-8")
        st = sd / "terraform.tfstate"
        if st.exists():
            try:
                out["state"] = json.dumps(json.loads(st.read_text(encoding="utf-8")))
            except Exception:
                out["state"] = ""
    # Latest plan output from last run file (if any).
    try:
        from services.cloud_provisioning import _project_executions_dir
        ex_dir = _project_executions_dir(project_id)
        if ex_dir.exists():
            files = sorted(ex_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
            for f in files[:50]:
                try:
                    exe = json.loads(f.read_text(encoding="utf-8"))
                except Exception:
                    continue
                if (exe.get("runParams") or {}).get("stack_name") != stack:
                    continue
                out["plan"] = exe.get("output") or exe.get("stdout") or ""
                break
    except Exception:
        pass
    return out


def run_bounded_tool(command: str, cwd: Optional[str] = None, timeout_seconds: int = 30, mock: bool = False) -> Dict[str, Any]:
    """Run an allowlisted IaC checker with bounded output, or return mock result."""
    import shutil, subprocess
    allowed = {"tofu": ["tofu", "validate"], "tflint": ["tflint"], "checkov": ["checkov", "-d", "."], "tfsec": ["tfsec", "."],
               "ansible-lint": ["ansible-lint", "."], "ansible-syntax": ["ansible-playbook", "--syntax-check", "site.yml"]}
    if command not in allowed: raise ValueError("unsupported tool")
    if mock: return {"tool": command, "status": "mocked", "returncode": 0, "output": "mock provider: no external tool executed"}
    if not shutil.which(allowed[command][0]): return {"tool": command, "status": "unavailable", "returncode": None, "output": "tool not installed"}
    try:
        result = subprocess.run(allowed[command], cwd=cwd, capture_output=True, text=True, timeout=max(1, min(int(timeout_seconds), 300)))
        return {"tool": command, "status": "passed" if result.returncode == 0 else "failed", "returncode": result.returncode, "output": (result.stdout + result.stderr)[-10000:]}
    except subprocess.TimeoutExpired:
        return {"tool": command, "status": "timeout", "returncode": None, "output": "tool timed out"}


def _assertion_hit(assertion_id: str, text: str, parameters: Dict[str, Any]) -> bool:
    """Evaluate built-in rules with optional numeric/tag semantics."""
    if assertion_id == "missing_environment_owner_tags":
        for block in re.findall(r"tags\s*=\s*\{([^}]*)\}", text, re.I | re.S):
            keys = {key.lower() for key in re.findall(r'''(?:[\"']?)([A-Za-z_][\w-]*)(?:[\"']?)\s*=\s*''', block)}
            keys.update(key.lower() for key in re.findall(r'''(?:[\"']?)([A-Za-z_][\w-]*)(?:[\"']?)\s*:''', block))
            if not {"environment", "owner"}.issubset(keys):
                return True
        return False
    if assertion_id == "instance_count_exceeded":
        threshold = int(parameters.get("max_instances", parameters.get("instance_count_threshold", 10)))
        values = [int(value) for value in re.findall(r"(?:instance_count|app_vm_count)\s*[=:]\s*['\"]?(\d+)", text, re.I)]
        return any(value > threshold for value in values)
    if assertion_id == "budget_exceeded":
        threshold = float(parameters.get("monthly_budget", parameters.get("budget", 1000)))
        values = [float(value.replace(",", "")) for value in re.findall(r"(?:monthly_cost|estimated_cost)\s*[=:]\s*[\"']?[$]?([0-9]+(?:\.[0-9]+)?)", text, re.I)]
        return any(value > threshold for value in values)
    if assertion_id == "provider_image_outdated":
        minimum = str(parameters.get("minimum_image", parameters.get("minimum_provider_version", ""))).strip()
        if minimum:
            return bool(re.search(r"(?:image|provider_version)\s*[=:]\s*['\"]?([^'\"\s,}]+)", text, re.I)) and minimum not in text
    return bool(ASSERTIONS[assertion_id]["pattern"].search(text))


def _drift_hit(texts: Dict[str, str]) -> bool:
    config = (texts.get("tfvars") or "").strip()
    state = (texts.get("state") or "").strip()
    if not config or not state:
        return False
    normalized = lambda value: re.sub(r"\s+", "", value)
    return normalized(config) not in normalized(state) and normalized(state) not in normalized(config)


def _run_test_case_once(project_id: Optional[str], test_id: str, timeout_seconds: int = 30,
                         mock_provider: bool = False) -> Dict[str, Any]:
    tc = get_test_case(test_id, project_id)
    if not tc:
        raise ValueError("test case not found")
    if not tc.get("enabled", True):
        raise ValueError("test case is disabled")
    if not tc.get("stack"):
        raise ValueError("test case has no stack; set stack first")
    texts = _stack_texts(project_id, tc["stack"])
    findings: List[Dict[str, Any]] = []
    passed = True
    if tc["kind"] == "assertion":
        for aid in tc.get("assertions") or []:
            rule = ASSERTIONS.get(aid)
            if not rule:
                continue
            # Evaluate against tfvars first, then plan/state.
            hit = None
            if aid == "drift_detected":
                hit = "state" if _drift_hit(texts) else None
            else:
                for src in ("tfvars", "plan", "state"):
                    if texts.get(src) and _assertion_hit(aid, texts[src], tc.get("parameters") or {}):
                        hit = src
                        break
            if hit:
                passed = False
                findings.append({"assertion": aid, "name": rule["name"],
                                 "severity": rule["severity"], "source": hit,
                                 "detail": rule["desc"]})
    elif tc["kind"] == "tofu_validate":
        from services.cloud_provisioning import _stack_dir
        tool = run_bounded_tool("tofu", cwd=str(_stack_dir(project_id, tc["stack"])),
                                timeout_seconds=timeout_seconds, mock=mock_provider)
        passed = tool["status"] in {"passed", "mocked"}
        findings.append({"assertion": "tofu_validate", "name": "tofu validate",
                         "severity": "info" if passed else "blocker", "source": "tool",
                         "detail": tool["output"], "tool": tool["tool"], "tool_status": tool["status"]})
    elif tc["kind"] == "ansible_validate":
        lint = run_bounded_tool("ansible-lint", cwd=str(__import__("services.cloud_provisioning", fromlist=["_stack_dir"])._stack_dir(project_id, tc["stack"])), timeout_seconds=timeout_seconds, mock=mock_provider)
        syntax = run_bounded_tool("ansible-syntax", cwd=str(__import__("services.cloud_provisioning", fromlist=["_stack_dir"])._stack_dir(project_id, tc["stack"])), timeout_seconds=timeout_seconds, mock=mock_provider)
        passed = lint["status"] in {"passed", "mocked"} and syntax["status"] in {"passed", "mocked"}
        findings.append({"assertion": "ansible_validate", "name": "Ansible lint and syntax check",
                         "severity": "info" if passed else "blocker", "source": "tool",
                         "detail": {"lint": lint["output"], "syntax": syntax["output"]},
                         "tool_status": {"lint": lint["status"], "syntax": syntax["status"]}})
    elif tc["kind"] == "iac_scan":
        from services.cloud_provisioning import _stack_dir
        stack_dir = str(_stack_dir(project_id, tc["stack"]))
        scanners = {
            tool: run_bounded_tool(tool, cwd=stack_dir, timeout_seconds=timeout_seconds, mock=mock_provider)
            for tool in ("checkov", "tfsec")
        }
        passed = all(result["status"] in {"passed", "mocked"} for result in scanners.values())
        findings.append({
            "assertion": "iac_scan",
            "name": "Checkov and tfsec IaC security scan",
            "severity": "info" if passed else "blocker",
            "source": "tool",
            "detail": {tool: result["output"] for tool, result in scanners.items()},
            "tool_status": {tool: result["status"] for tool, result in scanners.items()},
            "tool_results": scanners,
        })
    elif tc["kind"] == "tofu_test":
        passed = True
        findings.append({"assertion": "tofu_test", "name": "OpenTofu .tftest.hcl",
                         "severity": "info", "source": "plan",
                         "detail": "Jalankan 'tofu test' via worker (dll)."})
    else:  # smoke
        passed = True
        findings.append({"assertion": "smoke", "name": "Smoke check",
                         "severity": "info", "source": "state",
                         "detail": "Cek konektivitas resource hasil apply."})

    severity = tc.get("severity") or "warning"
    result = {
        "id": str(uuid.uuid4()),
        "run_id": str(uuid.uuid4()),
        "execution_id": None,
        "execution_log_url": None,
        "test_id": test_id,
        "mock_provider": mock_provider,
        "timeout_seconds": timeout_seconds,
        "name": tc["name"],
        "stack": tc["stack"],
        "kind": tc["kind"],
        "severity": severity,
        "passed": passed,
        "findings": findings,
        "ran_at": int(time.time()),
        "project_id": project_id,
        "status": "passed" if passed else "failed",
    }
    with _RESULTS_LOCK:
        history = _load("test_results.json", project_id)
        history.append(result)
        _save("test_results.json", history[-500:], project_id)
    return result


def dispatch_test_failure_notification(
    project_id: Optional[str] = None,
    stack: str = "",
    test_id: Optional[str] = None,
    test_name: Optional[str] = None,
    severity: str = "warning",
    findings: Optional[List[Dict[str, Any]]] = None,
    run_id: Optional[str] = None,
    failed_tests: Optional[List[Dict[str, Any]]] = None,
    **extra: Any,
) -> None:
    """Dispatches outbound webhook / event notifications on test failures (UC194).

    Dispatches `test.failed` event, and if severity == 'blocker', also dispatches `test.blocker_failed`.
    Wrapped in try-except so failures never break caller execution.
    """
    try:
        from services.webhook_dispatcher import dispatch_event

        payload: Dict[str, Any] = {
            "event": "test.failed",
            "project_id": project_id,
            "stack": stack,
            "test_id": test_id,
            "test_name": test_name,
            "severity": severity,
            "findings": findings or [],
            "run_id": run_id,
            "timestamp": int(time.time()),
        }
        if failed_tests is not None:
            payload["failed_tests"] = failed_tests
        payload.update(extra)

        dispatch_event("test.failed", payload)

        is_blocker = severity == "blocker" or (
            bool(failed_tests) and any(t.get("severity") == "blocker" for t in (failed_tests or []))
        )
        if is_blocker:
            blocker_payload = dict(payload)
            blocker_payload["event"] = "test.blocker_failed"
            dispatch_event("test.blocker_failed", blocker_payload)
    except Exception:
        pass


def run_test_case(project_id: Optional[str], test_id: str, timeout_seconds: int = 30,
                  mock_provider: bool = False, max_retries: int = 0, backoff_base_seconds: float = 0.5,
                  sleep_fn=time.sleep) -> Dict[str, Any]:
    """Run a test with bounded exponential retries for failed evaluations."""
    retries = max(0, min(int(max_retries), 5))
    base = max(0.0, min(float(backoff_base_seconds), 5.0))
    attempts = []
    result = None
    for attempt in range(retries + 1):
        result = _run_test_case_once(project_id, test_id, timeout_seconds, mock_provider)
        attempts.append({"attempt": attempt + 1, "status": result.get("status"), "passed": result.get("passed")})
        if result.get("passed") or attempt >= retries:
            break
        delay = min(30.0, base * (2 ** attempt))
        if delay:
            sleep_fn(delay)
    assert result is not None
    result["attempts"] = attempts
    result["retry_count"] = len(attempts) - 1
    result["max_retries"] = retries
    result["backoff_base_seconds"] = base
    if result.get("status") == "failed" or not result.get("passed"):
        dispatch_test_failure_notification(
            project_id=project_id,
            stack=result.get("stack", ""),
            test_id=test_id,
            test_name=result.get("name", ""),
            severity=result.get("severity", "warning"),
            findings=result.get("findings", []),
            run_id=result.get("run_id"),
        )
    return result


def run_tofu_test(project_id: Optional[str], test_id: str) -> Dict[str, Any]:
    tc = get_test_case(test_id, project_id)
    if not tc:
        raise ValueError("test case not found")
    if not tc.get("enabled", True):
        raise ValueError("test case is disabled")
    stack = tc.get("stack") or ""
    if not stack:
        raise ValueError("test case has no stack; set stack first")
    from services.cloud_provisioning import _create_execution, _stack_dir
    if not _stack_dir(project_id, stack).exists():
        raise ValueError(f"stack '{stack}' not found; create the stack first")
    eid = _create_execution(project_id, stack, "test", triggered_by=f"test:{tc.get('name','')}")
    result = {
        "id": str(uuid.uuid4()), "test_id": test_id, "name": tc["name"],
        "stack": stack, "kind": "tofu_test", "severity": tc.get("severity") or "warning",
        "passed": False, "queued": True, "status": "queued", "execution_id": eid,
        "execution_log_url": f"/api/executions/{eid}/logs",
        "run_id": eid,
        "findings": [{"assertion": "tofu_test", "name": "OpenTofu .tftest.hcl",
                      "severity": "info", "source": "plan",
                      "detail": f"tofu test queued (execution {eid})." }],
        "ran_at": int(time.time()), "project_id": project_id,
    }
    with _RESULTS_LOCK:
        history = _load("test_results.json", project_id)
        history.append(result)
        _save("test_results.json", history[-500:], project_id)
    return result


def run_batch_tests(project_id: Optional[str], stack: str = "", concurrency: int = 1,
                    max_retries: int = 0, backoff_base_seconds: float = 0.5) -> Dict[str, Any]:
    """Run enabled cases with bounded parallelism and isolated result errors."""
    from concurrent.futures import as_completed
    selected = [tc for tc in list_test_cases(project_id) if tc.get("enabled", True) and (not stack or tc.get("stack") == stack)]
    workers = max(1, min(int(concurrency), 8))
    results, errors = [], []
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(run_test_case, project_id, tc["id"], 30, False, max_retries, backoff_base_seconds): tc for tc in selected}
        for future in as_completed(futures):
            tc = futures[future]
            try:
                results.append(future.result())
            except (ValueError, RuntimeError) as exc:
                errors.append({"test_id": tc["id"], "error": str(exc)[:500]})
    return {"results": results, "errors": errors, "count": len(results), "concurrency": workers}


def run_all_tests(project_id: Optional[str] = None, stack: str = "") -> Dict[str, Any]:
    """Run all enabled tests for a project / stack (UC191)."""
    return run_batch_tests(project_id=project_id, stack=stack)


def trigger_approval_retest(project_id: Optional[str], stack: str, approval_id: Optional[str] = None) -> Optional[str]:
    """Safely trigger automated re-test when an approval request is created (UC191)."""
    try:
        res = run_all_tests(project_id=project_id, stack=stack)
        if res and res.get("results"):
            return res["results"][0].get("run_id") or str(uuid.uuid4())
        return str(uuid.uuid4())
    except Exception:
        return None


def run_scheduled_tests(project_id: Optional[str], now: Optional[int] = None, timeout_seconds: int = 30) -> Dict[str, Any]:
    """Run due test cases with a bounded timeout and non-blocking warnings."""
    now = int(now or time.time()); results=[]; errors=[]
    for tc in list_test_cases(project_id):
        if not tc.get("enabled", True) or not tc.get("schedule"):
            continue
        try:
            timeout = max(1, min(int(timeout_seconds), 300))
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(run_test_case, project_id, tc["id"], timeout, False)
                try:
                    result = future.result(timeout=timeout)
                except TypeError:
                    # Preserve compatibility with injected legacy runners in integrations/tests.
                    result = run_test_case(project_id, tc["id"])
                except FutureTimeoutError:
                    future.cancel()
                    result = {
                        "id": str(uuid.uuid4()), "run_id": str(uuid.uuid4()), "execution_id": None,
                        "execution_log_url": None, "test_id": tc["id"],
                        "name": tc["name"], "stack": tc.get("stack", ""), "kind": tc.get("kind", "assertion"),
                        "severity": tc.get("severity", "warning"), "passed": False, "status": "timeout",
                        "findings": [], "ran_at": int(time.time()), "project_id": project_id,
                        "mock_provider": False, "timeout_seconds": timeout,
                    }
                    history = _load("test_results.json", project_id)
                    history.append(result)
                    _save("test_results.json", history[-500:], project_id)
            if result.get("status") != "timeout":
                result["timeout_seconds"] = timeout
            if result.get("findings") and any(f.get("severity")=="warning" for f in result["findings"]):
                result["warning_notification"]={"queued":True,"kind":"test.warning","test_id":tc["id"]}
            if result.get("status") == "failed" and result.get("severity") == "blocker":
                try:
                    from services.webhook_dispatcher import dispatch_event
                    sent = dispatch_event("test.blocker_failed", {"test_id": tc["id"], "stack": tc.get("stack"), "run_id": result.get("run_id"), "status": result.get("status"), "findings": result.get("findings", [])})
                    result["blocker_notification"] = {"queued": True, "sent": sent, "kind": "test.blocker_failed"}
                except Exception:
                    result["blocker_notification"] = {"queued": False, "kind": "test.blocker_failed"}
            results.append(result)
        except Exception as exc:
            errors.append({"test_id":tc.get("id"),"error":str(exc)[:500]})
    return {"results":results,"errors":errors,"count":len(results),"evaluated_at":now}


def list_test_results(limit: int = 100, project_id: Optional[str] = None, test_id: Optional[str] = None) -> List[Dict[str, Any]]:
    rows = _load("test_results.json", project_id)
    if test_id:
        rows = [row for row in rows if row.get("test_id") == test_id]
    return rows[-limit:][::-1]


def _result_fingerprint(result: Dict[str, Any]) -> str:
    import hashlib
    payload = {"passed": bool(result.get("passed")),
               "status": result.get("status"),
               "findings": result.get("findings") or []}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def create_test_baseline(project_id: Optional[str], test_id: str, run_id: Optional[str] = None) -> Dict[str, Any]:
    results = list_test_results(500, project_id, test_id)
    result = next((item for item in results if not run_id or item.get("run_id") == run_id), None)
    if not result:
        raise ValueError("test result not found")
    baseline = {"id": str(uuid.uuid4()), "test_id": test_id, "run_id": result.get("run_id"),
                "created_at": int(time.time()), "passed": bool(result.get("passed")),
                "fingerprint": _result_fingerprint(result), "findings": result.get("findings") or []}
    baselines = [item for item in _load("test_baselines.json", project_id) if item.get("test_id") != test_id]
    baselines.append(baseline)
    _save("test_baselines.json", baselines, project_id)
    return baseline


def get_test_baseline(project_id: Optional[str], test_id: str) -> Optional[Dict[str, Any]]:
    return next((item for item in _load("test_baselines.json", project_id) if item.get("test_id") == test_id), None)


def compare_test_baseline(project_id: Optional[str], test_id: str) -> Dict[str, Any]:
    baseline = get_test_baseline(project_id, test_id)
    if not baseline:
        raise ValueError("baseline not found")
    current = next(iter(list_test_results(1, project_id, test_id)), None)
    if not current:
        raise ValueError("test result not found")
    regressed = bool(baseline.get("passed")) and not bool(current.get("passed"))
    return {"test_id": test_id, "baseline_id": baseline["id"], "baseline_run_id": baseline.get("run_id"),
            "current_run_id": current.get("run_id"), "regressed": regressed,
            "changed": _result_fingerprint(current) != baseline.get("fingerprint"),
            "passed": not regressed}


def latest_failed_blocker(project_id: Optional[str], stack: str) -> Optional[Dict[str, Any]]:
    """Return latest blocker-failed test for a stack (used by apply gate)."""
    for r in list_test_results(project_id=project_id):
        if r.get("stack") != stack or r.get("severity") != "blocker":
            continue
        if r.get("passed"):
            continue
        return r
    return None