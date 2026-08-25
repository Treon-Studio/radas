# Phase 6 BYOC Extended & Competitor Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement advanced BYOC & Competitor Parity capabilities: UC312 BYOC Encrypted Config Backup, UC320 Unmanaged Resources Diff, UC323 Resource Delete Protection, UC333 Run History Comments, UC348 Stack Dependency DAG Graph, and UC357 Environment TTL Auto-Destroy Policy.

**Architecture:**
- Extend `services/byoc.py` & `services/byoc_mapping.py` with:
  - `backup_accounts_encrypted(org_id, project_id)` & `restore_accounts_encrypted(backup_data)`
  - `diff_inventory_unmanaged_resources(account_id, project_id)`
- Extend `services/cloud_provisioning.py` & `services/stack_dependencies.py` with:
  - `set_resource_protection(project_id, stack, resource_addresses, protected)` & `is_resource_protected(project_id, stack, resource_address)`
  - `add_execution_comment(project_id, execution_id, comment, author)` & `list_execution_comments(project_id, execution_id)`
  - `set_stack_dependencies(project_id, stack, depends_on)` & `get_stack_dependency_graph(project_id)`
  - `set_stack_ttl(project_id, stack, ttl_seconds, auto_destroy)` & `check_expired_ttl_stacks()`
- Expose REST API routes in `api/byoc_routes.py` & `api/cloud_provisioning_routes.py`:
  - `GET /api/byoc/backup/export` & `POST /api/byoc/backup/restore`
  - `GET /api/byoc/accounts/<account_id>/unmanaged`
  - `POST /api/stacks/<stack>/protect-resources`
  - `GET/POST /api/executions/<execution_id>/comments`
  - `GET/POST /api/stacks/dependencies/graph`
  - `GET/POST /api/stacks/<stack>/ttl`

**Tech Stack:** Python 3.14, Flask, PostgreSQL / kv_store, Pytest.

---

### Task 1: UC312 — Backup BYOC Config (Encrypted JSON Export & Restore)

**Files:**
- Modify: `apps/opensible-server/services/byoc.py`
- Modify: `apps/opensible-server/api/byoc_routes.py`
- Test: `apps/opensible-server/tests/test_parity_advanced_fase6.py`

**Interfaces:**
- Produces: `backup_accounts_encrypted(project_id, org_id) -> Dict[str, Any]` and `restore_accounts_encrypted(data, project_id) -> Dict[str, Any]`
- Endpoints: `GET /api/byoc/backup/export` and `POST /api/byoc/backup/restore`

- [ ] **Step 1: Write failing test for UC312 backup/restore in `test_parity_advanced_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement backup and restore in `byoc.py` and routes in `byoc_routes.py`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 2: UC320 — Diff Between Inventory vs Managed Stacks (Unmanaged Resources)

**Files:**
- Modify: `apps/opensible-server/services/byoc.py`
- Modify: `apps/opensible-server/api/byoc_routes.py`
- Test: `apps/opensible-server/tests/test_parity_advanced_fase6.py`

**Interfaces:**
- Produces: `diff_inventory_unmanaged_resources(account_id: str, project_id: Optional[str] = None) -> Dict[str, Any]`
- Endpoint: `GET /api/byoc/accounts/<account_id>/unmanaged`

- [ ] **Step 1: Write failing test for UC320 unmanaged resources diff**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `diff_inventory_unmanaged_resources` and route**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 3: UC323 — Resource Delete Protection Gate

**Files:**
- Modify: `apps/opensible-server/services/cloud_provisioning.py`
- Modify: `apps/opensible-server/api/cloud_provisioning_routes.py`
- Test: `apps/opensible-server/tests/test_parity_advanced_fase6.py`

**Interfaces:**
- Produces: `set_resource_protection(project_id, stack, protected_resources: List[str]) -> Dict[str, Any]`
- Endpoint: `POST /api/cloud-provisioning/stacks/<stack>/protection` & `GET /api/cloud-provisioning/stacks/<stack>/protection`

- [ ] **Step 1: Write failing test for UC323 resource delete protection**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement delete protection helpers and endpoints**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 4: UC333 — Run Execution History with Comments

**Files:**
- Modify: `apps/opensible-server/services/cloud_provisioning.py`
- Modify: `apps/opensible-server/api/cloud_provisioning_routes.py`
- Test: `apps/opensible-server/tests/test_parity_advanced_fase6.py`

**Interfaces:**
- Produces: `add_execution_comment(project_id, execution_id, comment, author) -> Dict[str, Any]` and `list_execution_comments(project_id, execution_id) -> List[Dict[str, Any]]`
- Endpoints: `GET /api/cloud-provisioning/executions/<execution_id>/comments` & `POST /api/cloud-provisioning/executions/<execution_id>/comments`

- [ ] **Step 1: Write failing test for UC333 execution comments**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement execution comments and routes**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 5: UC348 — Stack Dependencies & Dependency Graph (DAG)

**Files:**
- Modify: `apps/opensible-server/services/cloud_provisioning.py`
- Modify: `apps/opensible-server/api/cloud_provisioning_routes.py`
- Test: `apps/opensible-server/tests/test_parity_advanced_fase6.py`

**Interfaces:**
- Produces:
  - `set_stack_dependencies(project_id, stack, depends_on: List[str]) -> Dict[str, Any]`
  - `get_stack_dependency_graph(project_id) -> Dict[str, Any]`
- Endpoint: `GET /api/cloud-provisioning/dependencies/graph` & `POST /api/cloud-provisioning/stacks/<stack>/dependencies`

- [ ] **Step 1: Write failing test for UC348 stack dependencies DAG**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement dependency DAG validator, graph generator, and endpoints**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 6: UC357 — Environment TTL (Auto-Destroy Scheduling & Expiration Check)

**Files:**
- Modify: `apps/opensible-server/services/cloud_provisioning.py`
- Modify: `apps/opensible-server/api/cloud_provisioning_routes.py`
- Test: `apps/opensible-server/tests/test_parity_advanced_fase6.py`

**Interfaces:**
- Produces:
  - `set_stack_ttl(project_id, stack, ttl_seconds: int, auto_destroy: bool = True) -> Dict[str, Any]`
  - `get_stack_ttl(project_id, stack) -> Dict[str, Any]`
  - `check_expired_ttl_stacks(project_id: Optional[str] = None) -> List[Dict[str, Any]]`
- Endpoints: `GET /api/cloud-provisioning/stacks/<stack>/ttl` & `POST /api/cloud-provisioning/stacks/<stack>/ttl`

- [ ] **Step 1: Write failing test for UC357 environment TTL**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement TTL scheduling, expired stacks checker, and routes**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 7: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC312, UC320, UC323, UC333, UC348, UC357 as ✅)
- Run entire pytest test suite to verify 0 regressions.

- [ ] **Step 1: Update `docs/ROADMAP.md`**
- [ ] **Step 2: Run pytest across full test suite**
- [ ] **Step 3: Commit and finalize**
