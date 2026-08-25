"""Approval workflow (Fase 2 — UC 50/68/72)."""
from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional


def _store_path() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "approvals.json"
    except Exception:
        return Path("data") / "approvals.json"


def _load() -> List[Dict[str, Any]]:
    try:
        p = _store_path()
        if p.exists():
            d = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(d, list):
                return d
    except Exception:
        pass
    return []


def _save(records: List[Dict[str, Any]]) -> None:
    p = _store_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(records, indent=2), encoding="utf-8")


def trigger_approval_retest(project_id: Optional[str], stack: str, approval_id: Optional[str] = None) -> Optional[str]:
    """Trigger re-test for approval request (UC191)."""
    try:
        from services import test_cases
        if hasattr(test_cases, "trigger_approval_retest"):
            return test_cases.trigger_approval_retest(project_id, stack, approval_id)
        if hasattr(test_cases, "run_all_tests"):
            res = test_cases.run_all_tests(project_id=project_id, stack=stack)
            if res and res.get("results"):
                return res["results"][0].get("run_id") or str(uuid.uuid4())
            return str(uuid.uuid4())
        if hasattr(test_cases, "run_batch_tests"):
            res = test_cases.run_batch_tests(project_id=project_id, stack=stack)
            if res and res.get("results"):
                return res["results"][0].get("run_id") or str(uuid.uuid4())
            return str(uuid.uuid4())
    except Exception:
        pass
    return None


def is_approval_expired(approval_dict: Dict[str, Any]) -> bool:
    """Check if an approval request has expired (UC615)."""
    if not approval_dict:
        return False
    expires_at = approval_dict.get("expires_at")
    if expires_at and approval_dict.get("status") == "pending":
        return time.time() > float(expires_at)
    return False


def create_approval(stack: str, project_id: str, action: str,
                    requested_by: str = "", note: str = "",
                    ttl_seconds: int = 86400) -> Dict[str, Any]:
    approval_id = str(uuid.uuid4())
    retest_run_id = None
    try:
        retest_run_id = trigger_approval_retest(project_id=project_id, stack=stack, approval_id=approval_id)
    except Exception:
        pass

    now = time.time()
    rec = {
        "id": approval_id,
        "stack": stack,
        "project_id": project_id,
        "action": action,
        "status": "pending",
        "requested_by": requested_by,
        "note": note,
        "created_at": now,
        "expires_at": now + max(60, int(ttl_seconds)),
        "decided_at": None,
        "decided_by": None,
        "retest_run_id": retest_run_id,
    }
    records = _load()
    records.append(rec)
    _save(records)
    return rec


def decide(approval_id: str, status: str, decided_by: str = "", reason: str = "") -> Optional[Dict[str, Any]]:
    if status == "rejected" and not (reason and str(reason).strip()):
        raise ValueError("rejection reason is mandatory")

    records = _load()
    for r in records:
        if r.get("id") == approval_id:
            # Check for TTL expiry
            if is_approval_expired(r):
                r["status"] = "expired"
                r["decided_at"] = time.time()
                r["decided_by"] = "system"
                _save(records)
                return r

            r["status"] = status
            r["decided_at"] = time.time()
            r["decided_by"] = decided_by
            if reason:
                r["rejection_reason"] = str(reason).strip()
            _save(records)
            if status == "approved" and r.get("action") == "apply":
                # Auto-apply after review (UC 51).
                try:
                    from services.cloud_provisioning import _create_execution
                    _create_execution(r.get("project_id"), r.get("stack"), "apply",
                                      triggered_by=f"approval:{approval_id}")
                except Exception:
                    pass
            return r
    return None


def get_approval(approval_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve an approval by ID."""
    records = _load()
    for r in records:
        if r.get("id") == approval_id:
            return r
    return None


def approve_approval(approval_id: str, decided_by: str = "", note: str = "") -> Optional[Dict[str, Any]]:
    """Approve an approval request (UC617)."""
    return decide(approval_id, "approved", decided_by=decided_by, reason=note)


def reject_approval(approval_id: str, rejected_by: str = "", reason: str = "") -> Optional[Dict[str, Any]]:
    """Reject an approval request with mandatory reason (UC616)."""
    return decide(approval_id, "rejected", decided_by=rejected_by, reason=reason)


request_approval = create_approval




def list_approvals(project_id: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
    records = _load()
    changed = False
    for r in records:
        if is_approval_expired(r):
            r["status"] = "expired"
            changed = True
    if changed:
        _save(records)

    out = []
    for r in records:
        if project_id and r.get("project_id") != project_id:
            continue
        if status and r.get("status") != status:
            continue
        out.append(r)
    out.sort(key=lambda x: x.get("created_at") or 0, reverse=True)
    return out



def has_approved(stack: str, project_id: str, action: str) -> bool:
    for r in list_approvals(project_id=project_id):
        if (r.get("stack") == stack and r.get("action") == action
                and r.get("status") == "approved"):
            return True
    return False


def latest_pending(stack: str, project_id: str, action: str) -> Optional[Dict[str, Any]]:
    for r in list_approvals(project_id=project_id):
        if (r.get("stack") == stack and r.get("action") == action
                and r.get("status") == "pending"):
            return r
    return None


def should_skip_approval(stack: str, project_id: str, action: str = "apply", env: str = "",
                         org_id: Optional[str] = None) -> bool:
    """Evaluate whether approval gate can be skipped based on feature flags (UC128)."""
    try:
        from services.feature_flag_registry import evaluate
    except Exception:
        return False

    candidate_keys = [
        f"approval.skip.{action}",
        f"approval.{action}.skip",
        "approval.skip",
        "approval.auto_approve",
        f"stack.{stack}.skip_approval",
        f"approval.stack.{stack}.skip",
    ]

    for key in candidate_keys:
        try:
            res = evaluate(key, env=env or "prod", project_id=project_id, org_id=org_id)
            if res and res.get("enabled"):
                return True
        except Exception:
            continue

    return False


# ---------------------------------------------------------------------------
# UC362: Multi-step Approval Workflow Chain
# ---------------------------------------------------------------------------

def create_approval_chain(
    stack: str,
    project_id: str,
    action: str,
    steps: List[str],
    requested_by: str = "",
    note: str = "",
) -> Dict[str, Any]:
    """Create a sequential multi-step approval chain (UC362)."""
    approval_id = str(uuid.uuid4())
    clean_steps = [str(s).strip() for s in (steps or ["tech-lead", "devops"]) if str(s).strip()]
    if not clean_steps:
        clean_steps = ["tech-lead", "devops"]

    chain_state = [
        {
            "step": s,
            "status": "pending",
            "approver": None,
            "approved_at": None,
        }
        for s in clean_steps
    ]

    retest_run_id = None
    try:
        retest_run_id = trigger_approval_retest(project_id=project_id, stack=stack, approval_id=approval_id)
    except Exception:
        pass

    rec = {
        "id": approval_id,
        "stack": stack,
        "project_id": project_id,
        "action": action,
        "status": "pending",
        "is_chain": True,
        "steps": chain_state,
        "current_step_index": 0,
        "current_step": clean_steps[0],
        "requested_by": requested_by,
        "note": note,
        "created_at": time.time(),
        "decided_at": None,
        "decided_by": None,
        "retest_run_id": retest_run_id,
    }
    records = _load()
    records.append(rec)
    _save(records)
    return rec


def approve_chain_step(
    approval_id: str,
    step_name: Optional[str] = None,
    approver: str = "approver",
    decision: str = "approved",
) -> Dict[str, Any]:
    """Approve or reject a specific step in a multi-step approval chain (UC362)."""
    records = _load()
    target = None
    for r in records:
        if r.get("id") == approval_id:
            target = r
            break

    if not target:
        raise ValueError("approval not found")

    if not target.get("is_chain"):
        # Single step approval fallback
        return decide(approval_id, decision, decided_by=approver) or target

    if target.get("status") in ("approved", "rejected"):
        return target

    steps = target.get("steps") or []
    idx = target.get("current_step_index", 0)

    if decision == "rejected":
        target["status"] = "rejected"
        target["decided_at"] = time.time()
        target["decided_by"] = approver
        if idx < len(steps):
            steps[idx]["status"] = "rejected"
            steps[idx]["approver"] = approver
            steps[idx]["approved_at"] = time.time()
        _save(records)
        return target

    # Find step to approve
    if idx < len(steps):
        step_rec = steps[idx]
        if step_name and step_rec.get("step") != step_name:
            raise ValueError(f"Expected approval for step '{step_rec.get('step')}', got '{step_name}'")

        step_rec["status"] = "approved"
        step_rec["approver"] = approver
        step_rec["approved_at"] = time.time()

        next_idx = idx + 1
        if next_idx >= len(steps):
            # All steps completed!
            target["status"] = "approved"
            target["current_step_index"] = next_idx
            target["current_step"] = None
            target["decided_at"] = time.time()
            target["decided_by"] = approver
            _save(records)

            if target.get("action") == "apply":
                try:
                    from services.cloud_provisioning import _create_execution
                    _create_execution(target.get("project_id"), target.get("stack"), "apply",
                                      triggered_by=f"approval:{approval_id}")
                except Exception:
                    pass
        else:
            target["current_step_index"] = next_idx
            target["current_step"] = steps[next_idx].get("step")
            _save(records)

    return target


# ---------------------------------------------------------------------------
# UC614: Multi-party Approval Quorum Workflow
# ---------------------------------------------------------------------------

def create_quorum_approval(
    stack: str,
    project_id: str,
    action: str = "apply",
    min_approvals: int = 2,
    requested_by: str = "",
    note: str = "",
    ttl_seconds: int = 86400,
) -> Dict[str, Any]:
    """Create an approval request requiring quorum of multiple signatures (UC614)."""
    approval_id = str(uuid.uuid4())
    now = time.time()
    rec = {
        "id": approval_id,
        "stack": stack,
        "project_id": project_id,
        "action": action,
        "status": "pending",
        "is_quorum": True,
        "min_approvals": max(1, int(min_approvals)),
        "signatures": [],
        "requested_by": requested_by,
        "note": note,
        "created_at": now,
        "expires_at": now + ttl_seconds,
        "decided_at": None,
        "decided_by": None,
    }
    records = _load()
    records.append(rec)
    _save(records)
    return rec


def record_approval_signature(
    approval_id: str,
    approver: str,
    approver_name: str = "",
) -> Dict[str, Any]:
    """Record an approver's signature towards the quorum (UC614)."""
    records = _load()
    target = next((r for r in records if r.get("id") == approval_id), None)
    if not target:
        raise ValueError("approval request not found")

    if target.get("status") != "pending":
        return target

    now = time.time()
    signatures = list(target.get("signatures") or [])
    # Check if already signed by this user
    if any(s.get("approver") == approver for s in signatures):
        return target

    signatures.append({
        "approver": approver,
        "approver_name": approver_name or approver,
        "signed_at": now,
    })
    target["signatures"] = signatures

    min_required = int(target.get("min_approvals", 1))
    if len(signatures) >= min_required:
        target["status"] = "approved"
        target["decided_at"] = now
        target["decided_by"] = approver
        if target.get("action") == "apply":
            try:
                from services.cloud_provisioning import _create_execution
                _create_execution(target.get("project_id"), target.get("stack"), "apply",
                                  triggered_by=f"approval:{approval_id}")
            except Exception:
                pass

    _save(records)
    return target


def is_quorum_reached(approval_id: str) -> bool:
    """Check if quorum threshold of approvals has been reached (UC614)."""
    records = _load()
    target = next((r for r in records if r.get("id") == approval_id), None)
    if not target:
        return False
    if target.get("status") == "approved":
        return True
    signatures = target.get("signatures") or []
    min_required = int(target.get("min_approvals", 1))
    return len(signatures) >= min_required



