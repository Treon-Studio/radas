# Phase 6 Worker Health & FinOps Advanced Analytics Implementation Plan (Batch 23)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement worker resource usage monitoring, worker online/offline heartbeat tracking, cost forecast MAE accuracy evaluator, environment free-tier chargeback model, hierarchical budget rollup, rightsizing recommendation confidence engine, per-run cost attribution, and untagged cloud resource spend detector (UC534, UC535, UC551, UC552, UC553, UC555, UC557, UC563).

**Architecture:**
- `services/worker_metrics.py` & `services/worker_status.py`:
  - UC534: Records and aggregates CPU, memory, and disk load metrics from worker heartbeats.
  - UC535: Evaluates online/offline statuses for self-hosted workers based on last heartbeat timestamp.
- `services/cost_accuracy.py` & `services/env_charge.py`:
  - UC551: Computes Mean Absolute Error (MAE) comparing predicted cost forecasts against actual cloud invoices.
  - UC552: Applies tiered pricing with free-tier rules for development and sandboxed environments.
- `services/budget_rollup.py` & `services/rightsizing_advisor.py`:
  - UC553: Rolls up child project budgets into organization parent budget ceilings with over-budget alerts.
  - UC555: Analyzes instance CPU/RAM utilization and recommends smaller/larger instance types with statistical confidence scores.
- `services/run_cost_attribution.py` & `services/untagged_cost_detector.py`:
  - UC557: Attributes compute cost and execution duration per pipeline run.
  - UC563: Scans infrastructure spend identifying untagged assets contributing to shadow cloud costs.

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC534 & UC535 — Worker Metrics & Online/Offline Status

**Files:**
- Create: `apps/opensible-server/services/worker_metrics.py`
- Create: `apps/opensible-server/services/worker_status.py`
- Test: `apps/opensible-server/tests/test_worker_finops_batch23_fase6.py`

**Interfaces:**
- Produces: `record_worker_metrics(worker_id: str, cpu_percent: float, memory_percent: float, disk_percent: float) -> Dict[str, Any]`
- Produces: `get_worker_health_status(worker_id: str, timeout_seconds: int = 60) -> Dict[str, Any]`
- Produces: `list_active_workers(timeout_seconds: int = 60) -> List[Dict[str, Any]]`

- [x] **Step 1: Write failing test in `test_worker_finops_batch23_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement worker metrics and status tracker**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: UC551 & UC552 — Cost Forecast Accuracy & Environment Chargeback

**Files:**
- Create: `apps/opensible-server/services/cost_accuracy.py`
- Create: `apps/opensible-server/services/env_charge.py`
- Test: `apps/opensible-server/tests/test_worker_finops_batch23_fase6.py`

**Interfaces:**
- Produces: `calculate_forecast_mae(forecast_series: List[float], actual_series: List[float]) -> Dict[str, Any]`
- Produces: `calculate_env_chargeback(project_id: str, stack_costs: List[Dict[str, Any]], dev_free_tier: bool = True) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_worker_finops_batch23_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement forecast accuracy and environment chargeback**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: UC553 & UC555 — Hierarchical Budget Rollup & Rightsizing Advisor

**Files:**
- Create: `apps/opensible-server/services/budget_rollup.py`
- Create: `apps/opensible-server/services/rightsizing_advisor.py`
- Test: `apps/opensible-server/tests/test_worker_finops_batch23_fase6.py`

**Interfaces:**
- Produces: `rollup_org_budgets(org_id: str, child_projects: List[Dict[str, Any]]) -> Dict[str, Any]`
- Produces: `generate_rightsizing_recommendation(resource_id: str, current_type: str, avg_cpu: float, avg_mem: float) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_worker_finops_batch23_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement budget rollup and rightsizing advisor**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: UC557 & UC563 — Run Cost Attribution & Untagged Spend Detector

**Files:**
- Create: `apps/opensible-server/services/run_cost_attribution.py`
- Create: `apps/opensible-server/services/untagged_cost_detector.py`
- Test: `apps/opensible-server/tests/test_worker_finops_batch23_fase6.py`

**Interfaces:**
- Produces: `attribute_execution_run_cost(execution_id: str, duration_seconds: float, rate_per_second: float = 0.005) -> Dict[str, Any]`
- Produces: `detect_untagged_resource_costs(project_id: str, required_tags: Optional[List[str]] = None) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_worker_finops_batch23_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement run cost attribution and untagged cost detector**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC534, UC535, UC551, UC552, UC553, UC555, UC557, UC563 as ✅)
- Run complete pytest test suite across server.

- [x] **Step 1: Update `docs/ROADMAP.md`**
- [x] **Step 2: Run pytest full suite**
- [x] **Step 3: Commit and finalize**
