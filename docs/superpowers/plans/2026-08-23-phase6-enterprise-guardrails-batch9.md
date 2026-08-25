# Phase 6 Enterprise Access, Guardrails & Policy Management Implementation Plan (Batch 9)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement enterprise-grade access control, guardrails, and compliance tracking: UC494 Granular RBAC Roles, UC495 Kill-Switch Authorization Gate, UC500 Preview Environment Resource Auto-Tagging, UC523 State Force-Unlock Wrapper Guard, UC536 Post-Failure Cooldown Throttling, and UC547 Policy Violations Permanent Store & Query API.

**Architecture:**
- Implement in `auth/middleware.py`, `services/preview_envs.py`, `services/cloud_provisioning.py`, `services/policy_service.py`, and `api/`:
  - UC494: Module-specific RBAC helper `require_role_or_domain_admin` in `auth/middleware.py`.
  - UC495: `require_superadmin` / `can_execute_kill_switch` gate for critical actions.
  - UC500: Standard preview resource tag injection in `services/preview_envs.py`.
  - UC523: `force_unlock_state` wrapper and API route in `services/cloud_provisioning.py`.
  - UC536: `is_in_failure_cooldown` and `set_failure_cooldown` in `services/cloud_provisioning.py`.
  - UC547: `record_policy_violations` and `query_policy_violations` with table `policy_violations` in PostgreSQL.

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC494 — Granular RBAC Roles (`flags_admin`, `tests_admin`, `byoc_admin`)

**Files:**
- Modify: `apps/opensible-server/auth/middleware.py`
- Modify: `apps/opensible-server/auth/service.py`
- Test: `apps/opensible-server/tests/test_guardrails_batch9_fase6.py`

**Interfaces:**
- Produces: `has_domain_permission(user_roles: List[str], domain: str) -> bool`
- Decorator: `@require_domain_admin(domain: str)`

- [ ] **Step 1: Write failing test in `test_guardrails_batch9_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement domain RBAC checking and decorator**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 2: UC495 — Kill-Switch Action Gating (Restricted to Superadmin/Owner)

**Files:**
- Modify: `apps/opensible-server/auth/middleware.py`
- Modify: `apps/opensible-server/services/cloud_provisioning.py`
- Test: `apps/opensible-server/tests/test_guardrails_batch9_fase6.py`

**Interfaces:**
- Produces: `can_execute_kill_switch(user_roles: List[str]) -> bool`
- Decorator: `@require_kill_switch_privilege`

- [ ] **Step 1: Write failing test in `test_guardrails_batch9_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement kill-switch authorization gate**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 3: UC500 — Preview Environment Auto-Tagging (`tag preview=true`)

**Files:**
- Modify: `apps/opensible-server/services/preview_envs.py`
- Test: `apps/opensible-server/tests/test_guardrails_batch9_fase6.py`

**Interfaces:**
- Produces: `inject_preview_standard_tags(tfvars: Dict[str, Any], pr_number: int, project_id: str) -> Dict[str, Any]`
- Integrated automatically into `preview_envs.create()`

- [ ] **Step 1: Write failing test in `test_guardrails_batch9_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement preview auto-tagging**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 4: UC523 — State Force-Unlock Wrapper Guard

**Files:**
- Modify: `apps/opensible-server/services/cloud_provisioning.py`
- Test: `apps/opensible-server/tests/test_guardrails_batch9_fase6.py`

**Interfaces:**
- Produces: `force_unlock_stack_state(project_id: Optional[str], stack: str, lock_id: str, actor: str = "") -> Dict[str, Any]`
- Endpoint: `POST /api/cloud-provisioning/stacks/<stack>/force-unlock`

- [ ] **Step 1: Write failing test in `test_guardrails_batch9_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement force unlock wrapper and endpoint**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 5: UC536 — Stack Apply Failure Cooldown Period (Anti-Spam Throttling)

**Files:**
- Modify: `apps/opensible-server/services/cloud_provisioning.py`
- Test: `apps/opensible-server/tests/test_guardrails_batch9_fase6.py`

**Interfaces:**
- Produces:
  - `set_stack_cooldown(project_id, stack, cooldown_seconds: int = 60)`
  - `get_stack_cooldown_remaining(project_id, stack) -> int`
- Enforced on apply executions if cooldown is active.

- [ ] **Step 1: Write failing test in `test_guardrails_batch9_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement cooldown tracking and enforcement**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 6: UC547 — Policy Violations Permanent Store & Query API

**Files:**
- Modify: `apps/opensible-server/services/policy_service.py` (or `services/policy_storage.py`)
- Modify: `apps/opensible-server/api/policy_routes.py`
- Test: `apps/opensible-server/tests/test_guardrails_batch9_fase6.py`

**Interfaces:**
- Produces:
  - `record_policy_violations(project_id, stack, run_id, findings: List[Dict]) -> List[Dict]`
  - `query_policy_violations(project_id, stack: Optional[str] = None, severity: Optional[str] = None) -> List[Dict]`
  - Endpoint: `GET /api/policy/violations`

- [ ] **Step 1: Write failing test in `test_guardrails_batch9_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement violation recording and query API**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 7: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC494, UC495, UC500, UC523, UC536, UC547 as ✅)
- Run complete pytest test suite across server.

- [ ] **Step 1: Update `docs/ROADMAP.md`**
- [ ] **Step 2: Run pytest full suite**
- [ ] **Step 3: Commit and finalize**
