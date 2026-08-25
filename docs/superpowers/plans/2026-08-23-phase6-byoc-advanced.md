# Phase 6 BYOC & Multi-Cloud Resource Import Advanced Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement advanced BYOC capabilities: UC273 IAM Assume-Role / Service Account impersonation, UC294 remote vs local state detection, UC306 inventory export to CSV, UC307 import-only adoption mode, UC308 cross-stack resource clash detection, and UC310 account quota thresholds.

**Architecture:**
- Extend `services/byoc_service.py` & `services/byoc_mapping.py` with:
  - `validate_assume_role(account_data)`
  - `detect_stack_backend_type(project_id, stack)`
  - `export_inventory_csv(account_id, project_id)`
  - `adopt_resources_import_only(account_id, stack, mappings, project_id)`
  - `check_resource_clash(account_id, resource_type, resource_id, target_stack, project_id)`
  - `evaluate_account_quota(account_id, new_resources_count, project_id)`
- Expose REST API routes in `api/byoc_routes.py`:
  - `GET /api/byoc/inventory/export/csv`
  - `POST /api/byoc/adopt-only`
  - `POST /api/byoc/clash-check`
  - `GET /api/byoc/accounts/<account_id>/quota` & `POST /api/byoc/accounts/<account_id>/quota`
  - `GET /api/byoc/stacks/<stack>/backend-type`

**Tech Stack:** Python 3.14, Flask, PostgreSQL / kv_store, Pytest.

---

### Task 1: UC273 — IAM Role-Based (Assume-Role / Service Account) Authentication

**Files:**
- Modify: `apps/opensible-server/services/byoc_service.py`
- Modify: `apps/opensible-server/api/byoc_routes.py`
- Test: `apps/opensible-server/tests/test_byoc_advanced_fase6.py`

**Interfaces:**
- Produces: Support for `auth_type: "assume_role"` (AWS role_arn, external_id, session_name) and `auth_type: "gcp_impersonate"` (service_account_email) in `create_account` / `test_connection`.

- [ ] **Step 1: Write failing test for UC273 Assume-Role authentication**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement Assume-Role validation and auth resolution in `byoc_service.py`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 2: UC294 — Multiple State File: Remote vs Local Backend Detection

**Files:**
- Modify: `apps/opensible-server/services/byoc_service.py`
- Modify: `apps/opensible-server/api/byoc_routes.py`
- Test: `apps/opensible-server/tests/test_byoc_advanced_fase6.py`

**Interfaces:**
- Produces: `detect_stack_backend_type(project_id: Optional[str], stack: str) -> Dict[str, Any]`
  - Identifies backend (`local`, `s3`, `gcs`, `http`, `pg`), state location, and sync status.
- Endpoint: `GET /api/byoc/stacks/<stack>/backend-type`

- [ ] **Step 1: Write failing test for UC294 backend detection**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `detect_stack_backend_type` and route**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 3: UC306 — Export BYOC Resource Inventory to CSV / JSON

**Files:**
- Modify: `apps/opensible-server/services/byoc_service.py`
- Modify: `apps/opensible-server/api/byoc_routes.py`
- Test: `apps/opensible-server/tests/test_byoc_advanced_fase6.py`

**Interfaces:**
- Produces: `export_inventory_csv(account_id: Optional[str] = None, project_id: Optional[str] = None) -> str`
- Endpoint: `GET /api/byoc/inventory/export/csv`

- [ ] **Step 1: Write failing test for UC306 inventory CSV export**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement CSV export and route**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 4: UC307 — Import-Only Mode (Adopt Resource Without Apply)

**Files:**
- Modify: `apps/opensible-server/services/byoc_mapping.py`
- Modify: `apps/opensible-server/api/byoc_routes.py`
- Test: `apps/opensible-server/tests/test_byoc_advanced_fase6.py`

**Interfaces:**
- Produces: `adopt_resources_import_only(account_id: str, stack: str, mappings: List[Dict[str, Any]], project_id: Optional[str] = None) -> Dict[str, Any]`
- Endpoint: `POST /api/byoc/adopt-only`

- [ ] **Step 1: Write failing test for UC307 import-only adoption**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `adopt_resources_import_only` and route**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 5: UC308 — Clash Detection: Resource Already Managed in Another Stack

**Files:**
- Modify: `apps/opensible-server/services/byoc_mapping.py`
- Modify: `apps/opensible-server/api/byoc_routes.py`
- Test: `apps/opensible-server/tests/test_byoc_advanced_fase6.py`

**Interfaces:**
- Produces: `check_resource_clash(account_id: str, resource_type: str, resource_id: str, target_stack: str, project_id: Optional[str] = None) -> Dict[str, Any]`
- Endpoint: `POST /api/byoc/clash-check`

- [ ] **Step 1: Write failing test for UC308 clash detection**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement clash detection and route**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 6: UC310 — Resource Quota Threshold per Account (Max VM/NAT/Volume)

**Files:**
- Modify: `apps/opensible-server/services/byoc_service.py`
- Modify: `apps/opensible-server/api/byoc_routes.py`
- Test: `apps/opensible-server/tests/test_byoc_advanced_fase6.py`

**Interfaces:**
- Produces:
  - `get_account_quota(account_id: str, project_id: Optional[str] = None) -> Dict[str, Any]`
  - `set_account_quota(account_id: str, quota_limits: Dict[str, int], project_id: Optional[str] = None) -> Dict[str, Any]`
  - `evaluate_account_quota(account_id: str, resource_type: str = "vm", additional_count: int = 1, project_id: Optional[str] = None) -> Dict[str, Any]`
- Endpoints:
  - `GET /api/byoc/accounts/<account_id>/quota`
  - `POST /api/byoc/accounts/<account_id>/quota`

- [ ] **Step 1: Write failing test for UC310 quota threshold management**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement quota management and endpoints**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 7: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC273, UC294, UC306, UC307, UC308, UC310 as ✅)
- Run full pytest test suite to ensure zero regressions across all components.

- [ ] **Step 1: Update `docs/ROADMAP.md`**
- [ ] **Step 2: Run entire test suite (`pytest apps/opensible-server/tests/`)**
- [ ] **Step 3: Commit and finalize**
