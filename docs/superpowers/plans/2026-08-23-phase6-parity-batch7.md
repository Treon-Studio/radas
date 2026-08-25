# Phase 6 Competitor Parity & Reliability Advanced Implementation Plan (Batch 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement critical Competitor Parity & Automation features: UC360 SIEM Audit Log Export, UC362 Multi-Step Approval Chain, UC405 Idempotency Key Middleware/Support, UC409 Circuit Breaker for Stack Apply, UC420 Plan Output Secret Scanner, and UC430 Stack Config JSON Import/Export.

**Architecture:**
- Extend `services/audit_service.py` & `api/audit_routes.py` with:
  - `export_audit_logs(format="jsonl", start_time=..., end_time=..., project_id=...) -> str`
  - `GET /api/audit/export`
- Extend `services/approval_service.py` & `api/approval_routes.py` with:
  - Multi-step approval chain evaluation (`create_approval_chain`, `approve_chain_step`, `get_chain_status`)
  - `POST /api/approvals/chain` & `POST /api/approvals/<id>/step`
- Implement Idempotency service in `services/idempotency.py` & middleware in `auth/middleware.py`:
  - `record_idempotency_key(key, response_data, status_code)` & `get_idempotent_response(key)`
- Extend `services/cloud_provisioning.py` & `api/cloud_provisioning_routes.py` with:
  - Circuit Breaker: `record_apply_result(stack, success)`, `is_circuit_open(stack)`, `reset_circuit_breaker(stack)`
  - Secret Scanner: `scan_plan_output_for_secrets(output_text)`
  - Stack Config Bundle: `export_stack_config(project_id, stack)`, `import_stack_config(project_id, stack, config_bundle)`
  - Endpoints: `GET /api/cloud-provisioning/stacks/<stack>/circuit-breaker`, `POST /api/cloud-provisioning/stacks/<stack>/circuit-breaker/reset`, `POST /api/cloud-provisioning/stacks/scan-plan`, `GET /api/cloud-provisioning/stacks/<stack>/config/export`, `POST /api/cloud-provisioning/stacks/<stack>/config/import`

**Tech Stack:** Python 3.14, Flask, PostgreSQL / kv_store, Pytest.

---

### Task 1: UC360 — Audit Log Export (JSONL / CSV) for SIEM

**Files:**
- Modify: `apps/opensible-server/services/audit_service.py`
- Modify: `apps/opensible-server/api/audit_routes.py`
- Test: `apps/opensible-server/tests/test_parity_batch7_fase6.py`

**Interfaces:**
- Produces: `export_audit_logs(project_id, format="jsonl", start_time=None, end_time=None, limit=1000) -> str`
- Endpoint: `GET /api/audit/export`

- [ ] **Step 1: Write failing test for UC360 in `test_parity_batch7_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement export in `audit_service.py` and route in `audit_routes.py`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 2: UC362 — Multi-step Approval Workflow Chain

**Files:**
- Modify: `apps/opensible-server/services/approval_service.py`
- Modify: `apps/opensible-server/api/approval_routes.py`
- Test: `apps/opensible-server/tests/test_parity_batch7_fase6.py`

**Interfaces:**
- Produces: `create_approval_chain(stack, project_id, action, steps: List[str], requested_by) -> Dict[str, Any]` and `approve_chain_step(approval_id, step_name, approver) -> Dict[str, Any]`
- Endpoints: `POST /api/approvals/chain` & `POST /api/approvals/<id>/step`

- [ ] **Step 1: Write failing test for UC362 in `test_parity_batch7_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement multi-step approval chain logic and endpoints**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 3: UC405 — Idempotency Key Handling & Middleware

**Files:**
- Modify: `apps/opensible-server/services/idempotency.py` (create)
- Modify: `apps/opensible-server/auth/middleware.py`
- Test: `apps/opensible-server/tests/test_parity_batch7_fase6.py`

**Interfaces:**
- Produces: `check_idempotency_key(key, scope) -> Optional[Dict]`, `save_idempotency_result(key, scope, status_code, body)`
- Decorator: `@idempotent_request`

- [ ] **Step 1: Write failing test for UC405 in `test_parity_batch7_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `idempotency.py` and middleware integration**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 4: UC409 — Circuit Breaker for Stack Apply (Auto-stop on Failures)

**Files:**
- Modify: `apps/opensible-server/services/cloud_provisioning.py`
- Modify: `apps/opensible-server/api/cloud_provisioning_routes.py`
- Test: `apps/opensible-server/tests/test_parity_batch7_fase6.py`

**Interfaces:**
- Produces: `record_apply_result(project_id, stack, success: bool, failure_threshold: int = 3)`, `is_circuit_open(project_id, stack)`, `reset_circuit_breaker(project_id, stack)`
- Endpoints: `GET /api/cloud-provisioning/stacks/<stack>/circuit-breaker` & `POST /api/cloud-provisioning/stacks/<stack>/circuit-breaker/reset`

- [ ] **Step 1: Write failing test for UC409 in `test_parity_batch7_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement circuit breaker logic and endpoints**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 5: UC420 — Secret Scanning in Plan Output & Logs

**Files:**
- Modify: `apps/opensible-server/services/cloud_provisioning.py`
- Modify: `apps/opensible-server/api/cloud_provisioning_routes.py`
- Test: `apps/opensible-server/tests/test_parity_batch7_fase6.py`

**Interfaces:**
- Produces: `scan_and_mask_secrets(text: str) -> Dict[str, Any]` (detects AWS keys, tokens, private keys, passwords and returns masked text + findings count)
- Endpoint: `POST /api/cloud-provisioning/scan-plan`

- [ ] **Step 1: Write failing test for UC420 in `test_parity_batch7_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement secret scanning and masking engine**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 6: UC430 — Import / Export Stack Config JSON

**Files:**
- Modify: `apps/opensible-server/services/cloud_provisioning.py`
- Modify: `apps/opensible-server/api/cloud_provisioning_routes.py`
- Test: `apps/opensible-server/tests/test_parity_batch7_fase6.py`

**Interfaces:**
- Produces: `export_stack_config_bundle(project_id, stack) -> Dict[str, Any]` and `import_stack_config_bundle(project_id, stack, bundle: Dict[str, Any]) -> Dict[str, Any]`
- Endpoints: `GET /api/cloud-provisioning/stacks/<stack>/config/export` & `POST /api/cloud-provisioning/stacks/<stack>/config/import`

- [ ] **Step 1: Write failing test for UC430 in `test_parity_batch7_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement stack config bundle export/import**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 7: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC360, UC362, UC405, UC409, UC420, UC430 as ✅)
- Run complete pytest test suite across server.

- [ ] **Step 1: Update `docs/ROADMAP.md`**
- [ ] **Step 2: Run pytest full suite**
- [ ] **Step 3: Commit and finalize**
