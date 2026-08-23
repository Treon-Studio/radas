# Phase 6 Enterprise Approvals, User Governance & Audit Security Implementation Plan (Batch 11)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement enterprise approval quorum & TTL, rejection reasoning, audit CSV export, user deactivation lifecycle, and secret leak scanning in stack vars (UC614, UC615, UC616, UC619, UC623, UC630).

**Architecture:**
- `services/approval_service.py` & `api/approval_routes.py`:
  - UC614: Multi-party approval quorum (`min_approvals_required`, collection of approver signatures).
  - UC615: Expiration TTL on approval requests (status automatically becomes `expired` if `time.time() > expires_at`).
  - UC616: Mandatory rejection reason (`reject_approval(reason=...)` rejects empty reason).
- `services/audit_events.py` & `api/audit_routes.py`:
  - UC619: `export_audit_events_csv(org_id, project_id) -> str`.
- `services/user_service.py` & `auth/service.py`:
  - UC623: `deactivate_user(user_id, reason)` & `reactivate_user(user_id)` soft-disable status and token verification rejection.
- `services/secret_scanner.py` / `services/cloud_provisioning.py`:
  - UC630: `scan_variables_for_secrets(variables: Dict[str, Any]) -> List[Dict]`.

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC614 — Multi-party Approval Quorum Workflow

**Files:**
- Modify: `apps/opensible-server/services/approval_service.py`
- Test: `apps/opensible-server/tests/test_approvals_batch11_fase6.py`

**Interfaces:**
- Produces: `record_approval_signature(approval_id: str, approver: str, approver_name: str = "") -> Dict`
- Produces: `is_quorum_reached(approval_id: str) -> bool`

- [x] **Step 1: Write failing test in `test_approvals_batch11_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement multi-party quorum logic**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: UC615 — Approval Request Expiration TTL

**Files:**
- Modify: `apps/opensible-server/services/approval_service.py`
- Test: `apps/opensible-server/tests/test_approvals_batch11_fase6.py`

**Interfaces:**
- Produces: `is_approval_expired(approval_dict: Dict) -> bool`
- In `create_approval(..., ttl_seconds: int = 86400)` set `expires_at = now + ttl_seconds`.

- [x] **Step 1: Write failing test in `test_approvals_batch11_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement approval TTL evaluation**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: UC616 — Mandatory Rejection Reason on Approval Denial

**Files:**
- Modify: `apps/opensible-server/services/approval_service.py`
- Test: `apps/opensible-server/tests/test_approvals_batch11_fase6.py`

**Interfaces:**
- In `reject_approval(approval_id: str, rejected_by: str, reason: str)` enforce non-empty reason string.

- [x] **Step 1: Write failing test in `test_approvals_batch11_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement rejection validation**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: UC619 — Audit Log Export to CSV

**Files:**
- Modify: `apps/opensible-server/services/audit_events.py`
- Modify: `apps/opensible-server/api/audit_routes.py` (or blueprint)
- Test: `apps/opensible-server/tests/test_approvals_batch11_fase6.py`

**Interfaces:**
- Produces: `export_audit_events_csv(project_id: Optional[str] = None, org_id: Optional[str] = None) -> str`
- Endpoint: `GET /api/audit/export/csv`

- [x] **Step 1: Write failing test in `test_approvals_batch11_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement audit CSV export**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: UC623 — User Deactivation Lifecycle (Soft Disable)

**Files:**
- Modify: `apps/opensible-server/services/user_service.py`
- Modify: `apps/opensible-server/auth/service.py`
- Test: `apps/opensible-server/tests/test_approvals_batch11_fase6.py`

**Interfaces:**
- Produces: `deactivate_user(user_id: str, reason: str = "") -> Dict`
- Produces: `reactivate_user(user_id: str) -> Dict`
- Produces: `is_user_active(user_id: str) -> bool`

- [x] **Step 1: Write failing test in `test_approvals_batch11_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement user deactivation lifecycle**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 6: UC630 — Secret Leak Scanner in Stack Variables (.tfvars)

**Files:**
- Modify: `apps/opensible-server/services/secret_scanner.py` (or `services/cloud_provisioning.py`)
- Test: `apps/opensible-server/tests/test_approvals_batch11_fase6.py`

**Interfaces:**
- Produces: `scan_variables_for_secrets(variables: Dict[str, Any]) -> List[Dict[str, Any]]`

- [x] **Step 1: Write failing test in `test_approvals_batch11_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement secret scanner for variables**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 7: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC614, UC615, UC616, UC619, UC623, UC630 as ✅)
- Run complete pytest test suite across server.

- [x] **Step 1: Update `docs/ROADMAP.md`**
- [x] **Step 2: Run pytest full suite**
- [x] **Step 3: Commit and finalize**
