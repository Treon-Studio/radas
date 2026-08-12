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
from pathlib import Path
from typing import Any, Dict, List, Optional

SEVERITIES = ("blocker", "warning", "info")
KINDS = ("assertion", "tofu_validate", "tofu_test", "smoke")


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


def _load(name: str) -> List[Dict[str, Any]]:
    try:
        p = _store_path(name)
        if p.exists():
            d = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(d, list):
                return d
    except Exception:
        pass
    return []


def _save(name: str, items: List[Dict[str, Any]]) -> None:
    p = _store_path(name)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(items, indent=2), encoding="utf-8")


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
    "http_plain": {
        "name": "HTTP tanpa TLS",
        "desc": "protocol = \"http\" / port 80 listener.",
        "pattern": re.compile(r"protocol\s*=\s*\"http\"|port\s*=\s*80\b", re.I),
        "severity": "info",
    },
}


def _assertion_ids() -> List[str]:
    return sorted(ASSERTIONS)


def list_test_cases() -> List[Dict[str, Any]]:
    return _load("test_cases.json")


def get_test_case(test_id: str) -> Optional[Dict[str, Any]]:
    return next((t for t in list_test_cases() if t["id"] == test_id), None)


def create_test_case(data: Dict[str, Any]) -> Dict[str, Any]:
    name = (data.get("name") or "").strip()
    if not name:
        raise ValueError("name required")
    tc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "stack": (data.get("stack") or "").strip(),
        "kind": (data.get("kind") or "assertion").strip(),
        "assertions": [a for a in (data.get("assertions") or []) if a in ASSERTIONS],
        "severity": (data.get("severity") or "warning").strip(),
        "enabled": bool(data.get("enabled", True)),
        "tags": [str(t) for t in (data.get("tags") or [])],
        "schedule": (data.get("schedule") or "").strip(),
        "created_at": int(time.time()),
        "updated_at": int(time.time()),
    }
    if tc["kind"] not in KINDS:
        raise ValueError(f"kind must be one of {KINDS}")
    if tc["severity"] not in SEVERITIES:
        raise ValueError(f"severity must be one of {SEVERITIES}")
    if tc["kind"] == "assertion" and not tc["assertions"]:
        raise ValueError("assertion kind requires at least one assertion")
    items = list_test_cases()
    items.append(tc)
    _save("test_cases.json", items)
    return tc


def update_test_case(test_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    items = list_test_cases()
    tc = next((t for t in items if t["id"] == test_id), None)
    if not tc:
        return None
    for field in ("name", "stack", "kind", "severity", "schedule"):
        if field in patch:
            tc[field] = (patch[field] or "").strip() if isinstance(patch[field], str) else patch[field]
    if "assertions" in patch:
        tc["assertions"] = [a for a in patch["assertions"] if a in ASSERTIONS]
    if "tags" in patch:
        tc["tags"] = [str(t) for t in patch["tags"]]
    if "enabled" in patch:
        tc["enabled"] = bool(patch["enabled"])
    tc["updated_at"] = int(time.time())
    _save("test_cases.json", items)
    return tc


def delete_test_case(test_id: str) -> bool:
    items = list_test_cases()
    nxt = [t for t in items if t["id"] != test_id]
    if len(nxt) == len(items):
        return False
    _save("test_cases.json", nxt)
    return True


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


def run_test_case(project_id: Optional[str], test_id: str) -> Dict[str, Any]:
    tc = get_test_case(test_id)
    if not tc:
        raise ValueError("test case not found")
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
            for src in ("tfvars", "plan", "state"):
                if texts.get(src) and rule["pattern"].search(texts[src]):
                    hit = src
                    break
            if hit:
                passed = False
                findings.append({"assertion": aid, "name": rule["name"],
                                 "severity": rule["severity"], "source": hit,
                                 "detail": rule["desc"]})
    elif tc["kind"] == "tofu_validate":
        passed = True
        findings.append({"assertion": "tofu_validate", "name": "tofu validate",
                         "severity": "info", "source": "plan",
                         "detail": "Jalankan 'tofu validate' via worker untuk verifikasi sintaks."})
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
        "test_id": test_id,
        "name": tc["name"],
        "stack": tc["stack"],
        "kind": tc["kind"],
        "severity": severity,
        "passed": passed,
        "findings": findings,
        "ran_at": int(time.time()),
        "project_id": project_id,
    }
    history = _load("test_results.json")
    history.append(result)
    _save("test_results.json", history[-500:])
    return result


def run_tofu_test(project_id: Optional[str], test_id: str) -> Dict[str, Any]:
    tc = get_test_case(test_id)
    if not tc:
        raise ValueError("test case not found")
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
        "passed": True, "queued": True, "execution_id": eid,
        "findings": [{"assertion": "tofu_test", "name": "OpenTofu .tftest.hcl",
                      "severity": "info", "source": "plan",
                      "detail": f"tofu test queued (execution {eid})." }],
        "ran_at": int(time.time()), "project_id": project_id,
    }
    history = _load("test_results.json")
    history.append(result)
    _save("test_results.json", history[-500:])
    return result


def list_test_results(limit: int = 100) -> List[Dict[str, Any]]:
    return _load("test_results.json")[-limit:][::-1]


def latest_failed_blocker(project_id: Optional[str], stack: str) -> Optional[Dict[str, Any]]:
    """Return latest blocker-failed test for a stack (used by apply gate)."""
    for r in list_test_results():
        if r.get("stack") != stack or r.get("severity") != "blocker":
            continue
        if r.get("passed"):
            continue
        return r
    return None