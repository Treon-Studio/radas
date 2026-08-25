# Phase 6 Stack Lifecycle, Pinning & Cost Optimization Implementation Plan (Batch 10)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement stack lifecycle, placement pinning, policy exemptions, and cost analytics: UC533 Worker Pinning Policy, UC547 Policy Exemptions Workflow, UC550 Cost Anomaly Alerts, UC560 Cost Usage CSV Export, UC609 Bulk Stack Tagging, and UC611/612 Stack Archival & Restore Lifecycle.

**Architecture:**
- Implement in `services/cloud_provisioning.py`, `services/cloud_policy.py`, `services/cost_analytics.py` (or `services/usage_service.py`), and API blueprints:
  - UC533: `set_stack_worker_pin` & `get_stack_worker_pin` in `services/cloud_provisioning.py`.
  - UC547: `create_policy_exemption` & `get_active_exemptions` in `services/cloud_policy.py`.
  - UC550: `set_cost_anomaly_threshold` & `check_cost_anomaly` in `services/cost_analytics.py`.
  - UC560: `export_cost_usage_csv` and route in `api/cost_routes.py` / `api/usage_routes.py`.
  - UC609: `bulk_update_stack_tags` in `services/cloud_provisioning.py`.
  - UC611/612: `archive_stack` & `restore_archived_stack` in `services/cloud_provisioning.py`.

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC533 — Stack Worker Pinning & Execution Placement Policy

**Files:**
- Modify: `apps/opensible-server/services/cloud_provisioning.py`
- Test: `apps/opensible-server/tests/test_lifecycle_batch10_fase6.py`

**Interfaces:**
- Produces: `set_stack_worker_pin(project_id, stack, worker_id, tags: Optional[List[str]]) -> Dict`
- Produces: `get_stack_worker_pin(project_id, stack) -> Dict`
- Endpoints: `GET/POST /api/cloud-provisioning/stacks/<stack>/pin`

- [ ] **Step 1: Write failing test in `test_lifecycle_batch10_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement stack worker pinning**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 2: UC547 — Policy Exemptions with Approval Workflow

**Files:**
- Modify: `apps/opensible-server/services/cloud_policy.py`
- Test: `apps/opensible-server/tests/test_lifecycle_batch10_fase6.py`

**Interfaces:**
- Produces:
  - `create_policy_exemption(project_id, stack, rule_id, reason, requested_by, ttl_seconds: int) -> Dict`
  - `is_rule_exempted(project_id, stack, rule_id) -> bool`
  - `list_policy_exemptions(project_id, stack: Optional[str]) -> List[Dict]`
- Endpoint: `POST /api/policy/exemptions` & `GET /api/policy/exemptions`

- [ ] **Step 1: Write failing test in `test_lifecycle_batch10_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement policy exemptions workflow**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 3: UC550 — Cost Anomaly Alert Threshold Configuration

**Files:**
- Modify: `apps/opensible-server/services/usage_service.py` (or `services/cost_guard.py`)
- Test: `apps/opensible-server/tests/test_lifecycle_batch10_fase6.py`

**Interfaces:**
- Produces:
  - `set_cost_anomaly_config(project_id, max_percentage_spike: int, max_amount_delta: float)`
  - `detect_cost_anomaly(project_id, previous_cost: float, current_cost: float) -> Dict`
- Endpoint: `POST /api/usage/anomaly-config`

- [ ] **Step 1: Write failing test in `test_lifecycle_batch10_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement cost anomaly detection**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 4: UC560 — Monthly Cost Usage Export to CSV

**Files:**
- Modify: `apps/opensible-server/services/usage_service.py`
- Modify: `apps/opensible-server/api/usage_routes.py`
- Test: `apps/opensible-server/tests/test_lifecycle_batch10_fase6.py`

**Interfaces:**
- Produces: `export_cost_usage_csv(project_id: Optional[str], month: Optional[str] = None) -> str`
- Endpoint: `GET /api/usage/export/csv`

- [ ] **Step 1: Write failing test in `test_lifecycle_batch10_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement cost CSV export**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 5: UC609 — Bulk Stack Tagging & Label Management

**Files:**
- Modify: `apps/opensible-server/services/cloud_provisioning.py`
- Test: `apps/opensible-server/tests/test_lifecycle_batch10_fase6.py`

**Interfaces:**
- Produces: `bulk_update_stack_tags(project_id: Optional[str], stacks: List[str], tags: Dict[str, Any], overwrite: bool = False) -> Dict`
- Endpoint: `POST /api/cloud-provisioning/stacks/bulk-tags`

- [ ] **Step 1: Write failing test in `test_lifecycle_batch10_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement bulk stack tagging**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 6: UC611 / 612 — Stack Archival & Soft-Delete Restore Lifecycle

**Files:**
- Modify: `apps/opensible-server/services/cloud_provisioning.py`
- Test: `apps/opensible-server/tests/test_lifecycle_batch10_fase6.py`

**Interfaces:**
- Produces:
  - `archive_stack(project_id: Optional[str], stack: str, actor: str = "") -> Dict`
  - `restore_archived_stack(project_id: Optional[str], stack: str, actor: str = "") -> Dict`
  - `list_archived_stacks(project_id: Optional[str]) -> List[Dict]`
- Endpoints:
  - `POST /api/cloud-provisioning/stacks/<stack>/archive`
  - `POST /api/cloud-provisioning/stacks/<stack>/restore`
  - `GET /api/cloud-provisioning/stacks/archived`

- [ ] **Step 1: Write failing test in `test_lifecycle_batch10_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement stack archive & restore lifecycle**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 7: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC533, UC547, UC550, UC560, UC609, UC611, UC612 as ✅)
- Run complete pytest test suite across server.

- [ ] **Step 1: Update `docs/ROADMAP.md`**
- [ ] **Step 2: Run pytest full suite**
- [ ] **Step 3: Commit and finalize**
