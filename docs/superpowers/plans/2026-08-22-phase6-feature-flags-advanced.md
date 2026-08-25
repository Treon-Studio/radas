# Phase 6 Feature Flags Advanced Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement advanced feature flag capabilities (UC126 snapshot rollback, UC128 approval flow flag integration, UC133 bulk import/export migration, UC146 flag cloning/template copy, and UC151 flag change webhook dispatches) with full test coverage and multi-tenant safety.

**Architecture:**
- Extend `services/feature_flag_registry.py` with `rollback_flag`, `copy_flag`, and webhook dispatches via `services/webhook_dispatcher.py`.
- Integrate feature flag checks into `services/approval_service.py` (`should_skip_approval`) and `services/cloud_provisioning.py` to allow automated bypass when configured.
- Expose REST API endpoints for `/api/flags/<key>/rollback`, `/api/flags/<key>/copy`, `/api/flags/export`, `/api/flags/import`.
- Validate via comprehensive pytest suite and update `docs/ROADMAP.md`.

**Tech Stack:** Python 3.14, Flask, PostgreSQL / SQLite kv_store, Pytest.

## Global Constraints

- Preserve all existing multi-tenant and legacy backward compatibility logic in `feature_flag_registry.py`.
- Use `_diff` and `_append_history` / `_append_history_tx` for every mutating action (copy, rollback, import).
- Never fail silent or crash on webhook delivery failure (fire-and-forget async dispatch).

---

### Task 1: UC126 — Snapshot Rollback for Feature Flags

**Files:**
- Modify: `apps/opensible-server/services/feature_flag_registry.py`
- Modify: `apps/opensible-server/api/feature_flag_routes.py`
- Test: `apps/opensible-server/tests/test_feature_flags_advanced_fase6.py`

**Interfaces:**
- Produces: `rollback_flag(key: str, snapshot_id: Optional[str] = None, steps: int = 1, scope_type: str = "global", scope_id: Optional[str] = None, actor: str = "", actor_name: str = "", org_id: Optional[str] = None) -> Dict[str, Any]`
- Endpoint: `POST /api/flags/<key>/rollback`

- [ ] **Step 1: Write the failing test for UC126 rollback**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `rollback_flag` and route**
- [ ] **Step 4: Run test to verify it passes**

---

### Task 2: UC146 — Copy / Clone Feature Flag as Template

**Files:**
- Modify: `apps/opensible-server/services/feature_flag_registry.py`
- Modify: `apps/opensible-server/api/feature_flag_routes.py`
- Test: `apps/opensible-server/tests/test_feature_flags_advanced_fase6.py`

**Interfaces:**
- Produces: `copy_flag(source_key: str, target_key: str, scope_type: str = "global", scope_id: Optional[str] = None, target_scope_type: Optional[str] = None, target_scope_id: Optional[str] = None, actor: str = "", actor_name: str = "", org_id: Optional[str] = None) -> Dict[str, Any]`
- Endpoint: `POST /api/flags/<key>/copy` and `POST /api/flags/<key>/clone`

- [ ] **Step 1: Write the failing test for UC146 copy/clone**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `copy_flag` and route**
- [ ] **Step 4: Run test to verify it passes**

---

### Task 3: UC133 — Enhanced Bulk Import/Export Flag for Migration

**Files:**
- Modify: `apps/opensible-server/services/feature_flag_registry.py`
- Modify: `apps/opensible-server/api/feature_flag_routes.py`
- Test: `apps/opensible-server/tests/test_feature_flags_advanced_fase6.py`

**Interfaces:**
- Produces: `export_flags(scope_type: str = "global", scope_id: Optional[str] = None, org_id: Optional[str] = None) -> Dict[str, Any]`
- Enhances: `import_flags(..., overwrite: bool = False)` to support updating existing flags when `overwrite=True` or skipping them.

- [x] **Step 1: Write the failing test for UC133 bulk import with overwrite option and export structure**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Implement export format enhancement and `overwrite` support in import_flags**
- [x] **Step 4: Run test to verify it passes**

---

### Task 4: UC128 — Feature Flag in Approval Flow (Skip Approval if Flag)

**Files:**
- Modify: `apps/opensible-server/services/approval_service.py`
- Modify: `apps/opensible-server/services/cloud_provisioning.py`
- Test: `apps/opensible-server/tests/test_feature_flags_advanced_fase6.py`

**Interfaces:**
- Produces: `should_skip_approval(stack: str, project_id: str, action: str = "apply", env: str = "") -> bool`
- When `approval.skip`, `approval.<action>.skip`, `approval.auto_approve`, or `stack.<stack>.skip_approval` is enabled, mutations proceed without requiring manual review approval.

- [ ] **Step 1: Write the failing test for UC128 approval skip**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `should_skip_approval` in `approval_service.py` and hook into `cloud_provisioning.py`**
- [ ] **Step 4: Run test to verify it passes**

---

### Task 5: UC151 — Outbound Webhooks on Flag Changes

**Files:**
- Modify: `apps/opensible-server/services/feature_flag_registry.py`
- Test: `apps/opensible-server/tests/test_feature_flags_advanced_fase6.py`

**Interfaces:**
- Dispatches event `flag.changed` (and `flag.created`, `flag.updated`, `flag.deleted`, `flag.rollback`) with payload `{ "event": ..., "key": ..., "scope_type": ..., "changes": ..., "actor": ..., "timestamp": ... }` via `services.webhook_dispatcher.dispatch_event`.

- [ ] **Step 1: Write the failing test for UC151 webhook dispatch**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Integrate webhook dispatching into registry mutation operations**
- [ ] **Step 4: Run test to verify it passes**

---

### Task 6: Roadmap Update & Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC126, UC128, UC133, UC146, UC151 as ✅)
- Run full test suite to ensure zero regressions.
