# Phase 6 Stack Health, Cost Intelligence & Playbook Automation Implementation Plan (Batch 19)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement stack composite health score calculation, cost anomaly detection & breakdown per environment, scheduled daily plan runner, cross-project stack cloner, multi-tag stack management, dynamic host inventory grouping, and multi-playbook workflow chains (UC385, UC386, UC412, UC414, UC426, UC427, UC429, UC431).

**Architecture:**
- `services/stack_health.py`:
  - UC427: Stack health score calculator combining drift status, test pass rates, age, and execution success history into 0-100 score.
- `services/cost_anomaly.py` & `services/cost_breakdown.py`:
  - UC412: Cost anomaly detector flagging abnormal sudden price increases based on standard deviations.
  - UC414: Multidimensional cost breakdown aggregation (per stack, per environment e.g. dev vs staging vs prod, per cloud provider).
- `services/scheduled_planner.py`:
  - UC426: Scheduled automated plan generator creating diff reports for drift surveillance.
- `services/cross_project_clone.py` & `services/stack_tagging.py`:
  - UC429: Deep clone stack across projects with state key rewriting and variables mapping.
  - UC431: Stack tagging service with multi-tag filtering, batch tag assignment, and query selector.
- `services/dynamic_inventory.py` & `services/playbook_chain.py`:
  - UC385: Dynamic host inventory generator grouping cloud instances by tags, region, and stack.
  - UC386: Multi-playbook workflow execution chain executing sequential Ansible tasks with dependency propagation.

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC427 & UC429 — Stack Health Score & Cross-Project Clone

**Files:**
- Create: `apps/opensible-server/services/stack_health.py`
- Create: `apps/opensible-server/services/cross_project_clone.py`
- Test: `apps/opensible-server/tests/test_health_cost_playbook_batch19_fase6.py`

**Interfaces:**
- Produces: `calculate_stack_health_score(project_id: str, stack: str) -> Dict[str, Any]`
- Produces: `clone_stack_across_projects(source_project_id: str, source_stack: str, target_project_id: str, target_stack: str) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_health_cost_playbook_batch19_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement stack health score and cross-project cloner**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: UC412 & UC414 — Cost Anomaly Detection & Environment Breakdown

**Files:**
- Create: `apps/opensible-server/services/cost_anomaly.py`
- Create: `apps/opensible-server/services/cost_breakdown.py`
- Test: `apps/opensible-server/tests/test_health_cost_playbook_batch19_fase6.py`

**Interfaces:**
- Produces: `detect_cost_anomalies(project_id: str) -> List[Dict[str, Any]]`
- Produces: `get_cost_breakdown_by_env(project_id: str) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_health_cost_playbook_batch19_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement cost anomaly detector and environment breakdown**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: UC426 & UC431 — Scheduled Plan Diff & Stack Tagging

**Files:**
- Create: `apps/opensible-server/services/scheduled_planner.py`
- Create: `apps/opensible-server/services/stack_tagging.py`
- Test: `apps/opensible-server/tests/test_health_cost_playbook_batch19_fase6.py`

**Interfaces:**
- Produces: `trigger_scheduled_plan(project_id: str, stack: str) -> Dict[str, Any]`
- Produces: `assign_stack_tags(project_id: str, stack: str, tags: Dict[str, str]) -> Dict[str, Any]`
- Produces: `find_stacks_by_tags(project_id: Optional[str], tag_filters: Dict[str, str]) -> List[Dict[str, Any]]`

- [x] **Step 1: Write failing test in `test_health_cost_playbook_batch19_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement scheduled planner and stack tagging**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: UC385 & UC386 — Dynamic Host Inventory & Multi-Playbook Workflow Chain

**Files:**
- Create: `apps/opensible-server/services/dynamic_inventory.py`
- Create: `apps/opensible-server/services/playbook_chain.py`
- Test: `apps/opensible-server/tests/test_health_cost_playbook_batch19_fase6.py`

**Interfaces:**
- Produces: `generate_dynamic_inventory(project_id: str) -> Dict[str, Any]`
- Produces: `create_playbook_workflow_chain(chain_name: str, playbooks: List[str], project_id: str) -> Dict[str, Any]`
- Produces: `execute_playbook_chain(chain_id: str) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_health_cost_playbook_batch19_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement dynamic inventory and multi-playbook chains**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC385, UC386, UC412, UC414, UC426, UC427, UC429, UC431 as ✅)
- Run complete pytest test suite across server.

- [x] **Step 1: Update `docs/ROADMAP.md`**
- [x] **Step 2: Run pytest full suite**
- [x] **Step 3: Commit and finalize**
