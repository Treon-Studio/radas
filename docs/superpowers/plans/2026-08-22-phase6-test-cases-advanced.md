# Phase 6 Test Case Management & IaC Validation Advanced Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement advanced test case management capabilities: UC191 approval-triggered automated re-testing, UC192 preview environment test suite execution, UC194 webhook/issue dispatch on test failure, UC202 stack security/compliance score calculation (0–100), UC206 Ansible playbook idempotency check, and UC210 `.tftest.hcl` parser and importer into test registry.

**Architecture:**
- Extend `services/test_cases.py` with score calculator (`compute_stack_security_score`), issue/webhook dispatcher on test failure (`dispatch_test_failure_webhook`), `.tftest.hcl` importer (`import_tftest_hcl`), and idempotency testing (`run_ansible_idempotency_test`).
- Hook approval creation in `services/approval_service.py` to auto-trigger test batch executions (UC191).
- Hook preview stack creation in `services/preview_envs.py` to auto-run test suite (UC192).
- Expose REST API endpoints in `api/test_case_routes.py` for `/api/test-cases/score`, `/api/test-cases/import/tftest`, `/api/test-cases/ansible-idempotency`.

**Tech Stack:** Python 3.14, Flask, PostgreSQL / kv_store, Pytest.

## Global Constraints

- Preserve all existing multi-tenant and legacy backward compatibility logic in `test_cases.py` and `test_case_routes.py`.
- Thread-safe, non-blocking asynchronous dispatch for webhooks and test triggers.
- Full pytest coverage for every endpoint and service function.

---

### Task 1: UC191 — Approval Request Auto-triggers Re-test

**Files:**
- Modify: `apps/opensible-server/services/approval_service.py`
- Modify: `apps/opensible-server/services/test_cases.py`
- Test: `apps/opensible-server/tests/test_test_cases_advanced_fase6.py`

**Interfaces:**
- Produces: `trigger_approval_retest(project_id: str, stack: str, approval_id: str) -> Optional[str]`
- When `create_approval(stack, project_id, action, ...)` is called, automatically enqueues/executes test suite for `(project_id, stack)`.

- [ ] **Step 1: Write failing test for UC191 approval re-test trigger**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement trigger in `approval_service.py`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 2: UC192 — Automated Test Execution on Preview Environments

**Files:**
- Modify: `apps/opensible-server/services/preview_envs.py`
- Test: `apps/opensible-server/tests/test_test_cases_advanced_fase6.py`

**Interfaces:**
- Produces: Automatic test suite execution during preview creation (`preview_envs.create`) recording test runs under preview stack context.

- [ ] **Step 1: Write failing test for UC192 preview test run**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement preview testing hook in `preview_envs.py`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 3: UC194 — Outbound Issue / Webhook Dispatch on Test Failures

**Files:**
- Modify: `apps/opensible-server/services/test_cases.py`
- Test: `apps/opensible-server/tests/test_test_cases_advanced_fase6.py`

**Interfaces:**
- Produces: `dispatch_test_failure_notification(project_id: str, stack: str, failed_tests: List[Dict[str, Any]], run_id: Optional[str] = None)`
- Dispatches `test.failed` and `test.blocker_failed` webhooks via `services.webhook_dispatcher.dispatch_event`.

- [ ] **Step 1: Write failing test for UC194 test failure webhook dispatch**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement failure notification dispatch in `test_cases.py`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 4: UC202 — Security & Compliance Score per Stack (0–100)

**Files:**
- Modify: `apps/opensible-server/services/test_cases.py`
- Modify: `apps/opensible-server/api/test_case_routes.py`
- Test: `apps/opensible-server/tests/test_test_cases_advanced_fase6.py`

**Interfaces:**
- Produces: `compute_stack_security_score(project_id: str, stack: str) -> Dict[str, Any]`
  - Calculates weighted score: Blocker failure (-30), Warning failure (-10), Info failure (-2), baseline score 100. Min score: 0.
- Endpoint: `GET /api/test-cases/score?project_id=...&stack=...`

- [ ] **Step 1: Write failing test for UC202 security score calculation and endpoint**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `compute_stack_security_score` and route**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 5: UC206 — Ansible Playbook Idempotency Testing

**Files:**
- Modify: `apps/opensible-server/services/test_cases.py`
- Modify: `apps/opensible-server/api/test_case_routes.py`
- Test: `apps/opensible-server/tests/test_test_cases_advanced_fase6.py`

**Interfaces:**
- Produces: `run_ansible_idempotency_test(project_id: str, stack: str, playbook: str = "main.yml") -> Dict[str, Any]`
  - Simulates 2-pass check mode; verifies second pass `changed=0`.
- Endpoint: `POST /api/test-cases/ansible-idempotency`

- [ ] **Step 1: Write failing test for UC206 Ansible idempotency testing**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `run_ansible_idempotency_test` and route**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 6: UC210 — Import Tests from `.tftest.hcl` Files to Test Registry

**Files:**
- Modify: `apps/opensible-server/services/test_cases.py`
- Modify: `apps/opensible-server/api/test_case_routes.py`
- Test: `apps/opensible-server/tests/test_test_cases_advanced_fase6.py`

**Interfaces:**
- Produces: `import_tftest_hcl(content: str, project_id: str, stack: str, actor: str = "") -> List[Dict[str, Any]]`
  - Parses `run "..." { ... assert { condition = ... format_version = ... } }` blocks and creates test cases in registry.
- Endpoint: `POST /api/test-cases/import/tftest`

- [ ] **Step 1: Write failing test for UC210 `.tftest.hcl` importer**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement parser and import endpoint**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 7: Roadmap Update & Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC191, UC192, UC194, UC202, UC206, UC210 as ✅)
- Run full pytest test suite to ensure zero regressions across all components.

- [ ] **Step 1: Update `docs/ROADMAP.md`**
- [ ] **Step 2: Run entire test suite (`pytest apps/opensible-server/tests/`)**
- [ ] **Step 3: Commit and finalize**
