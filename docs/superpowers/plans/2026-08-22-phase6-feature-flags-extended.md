# Phase 6 Feature Flags Extended Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 6 extended feature flag capabilities: UC134 remediation rule gating, UC140 UI feature flag evaluation endpoints, UC148 user notification dispatches on flag changes, UC150 environment variable export for CI/CD, UC157 preview environment control flags, and UC159 multi-project flag diff comparisons.

**Architecture:**
- Extend `services/automation_rules.py` with feature flag checks before triggering auto-remediation drift executions (UC134).
- Add UI flags evaluation endpoints in `api/feature_flag_routes.py` for client/console modules (UC140).
- Integrate team notification dispatching in `services/feature_flag_registry.py` via `services.notifications` / `storage.config_db` (UC148).
- Expose `.env` formatted export endpoint `GET /api/flags/export/env` (UC150).
- Integrate preview flags evaluation in `services/cloud_provisioning.py` or preview lifecycles (UC157).
- Implement `diff_flags` in `services/feature_flag_registry.py` and `POST /api/flags/diff` (UC159).

**Tech Stack:** Python 3.14, Flask, PostgreSQL / kv_store, Pytest.

## Global Constraints

- Preserve all existing multi-tenant and legacy backward compatibility logic in `feature_flag_registry.py`.
- Use `_diff` and `_append_history` / `_append_history_tx` for mutating actions.
- Async / non-blocking external deliveries (webhooks & notifications).

---

### Task 1: UC134 — Remediation Rule Feature Flag Gating (`remediate only if flag`)

**Files:**
- Modify: `apps/opensible-server/services/automation_rules.py`
- Test: `apps/opensible-server/tests/test_automation_rules.py`

**Interfaces:**
- Produces: Gating check in `run_rules_once` for `kind == "remediate"` checking `remediation.enabled`, `remediation.<stack>.enabled`, or `auto_remediate` flags.

- [ ] **Step 1: Write the failing test for UC134 remediation flag gating**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement flag evaluation in `automation_rules.py`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 2: UC140 — UI Feature Flags & Console Modular Evaluation

**Files:**
- Modify: `apps/opensible-server/services/feature_flag_registry.py`
- Modify: `apps/opensible-server/api/feature_flag_routes.py`
- Test: `apps/opensible-server/tests/test_feature_flags_advanced_fase6.py`

**Interfaces:**
- Produces: `get_ui_flags(scope_type: str = "global", scope_id: Optional[str] = None, user_id: Optional[str] = None, env: str = "prod", org_id: Optional[str] = None) -> Dict[str, bool]`
- Endpoint: `GET /api/flags/ui` returning map `{"ui.module.<name>": bool, ...}`.

- [ ] **Step 1: Write the failing test for UC140 UI flags evaluation**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `get_ui_flags` and `GET /api/flags/ui` route**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 3: UC148 — Team Notification on Flag Changes

**Files:**
- Modify: `apps/opensible-server/services/feature_flag_registry.py`
- Test: `apps/opensible-server/tests/test_feature_flags_advanced_fase6.py`

**Interfaces:**
- Produces: Outbound team notification logging/dispatch on flag updates, rollbacks, and deletions (recorded in notifications or audit log).

- [ ] **Step 1: Write the failing test for UC148 flag change notifications**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement notification dispatch in `feature_flag_registry.py`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 4: UC150 — Export Feature Flags as Environment Variables for CI

**Files:**
- Modify: `apps/opensible-server/services/feature_flag_registry.py`
- Modify: `apps/opensible-server/api/feature_flag_routes.py`
- Test: `apps/opensible-server/tests/test_feature_flags_advanced_fase6.py`

**Interfaces:**
- Produces: `export_flags_env(scope_type: str = "global", scope_id: Optional[str] = None, prefix: str = "FF_", org_id: Optional[str] = None) -> str`
- Endpoint: `GET /api/flags/export/env` (content-type: text/plain).

- [ ] **Step 1: Write the failing test for UC150 env export**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `export_flags_env` and API route**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 5: UC157 — Preview Environment Control Feature Flags

**Files:**
- Modify: `apps/opensible-server/services/feature_flag_registry.py`
- Modify: `apps/opensible-server/services/cloud_provisioning.py`
- Test: `apps/opensible-server/tests/test_feature_flags_advanced_fase6.py`

**Interfaces:**
- Produces: `can_create_preview_env(project_id: str, preview_name: str = "", org_id: Optional[str] = None) -> bool`
- Gates preview stack creations when `preview.enabled` or `preview.allow` is configured/toggled.

- [ ] **Step 1: Write the failing test for UC157 preview flag control**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement preview flag validation check**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 6: UC159 — Diff Audit: Compare Flag Configurations Across Projects

**Files:**
- Modify: `apps/opensible-server/services/feature_flag_registry.py`
- Modify: `apps/opensible-server/api/feature_flag_routes.py`
- Test: `apps/opensible-server/tests/test_feature_flags_advanced_fase6.py`

**Interfaces:**
- Produces: `diff_flags_between_scopes(source_scope_type: str, source_scope_id: Optional[str], target_scope_type: str, target_scope_id: Optional[str], org_id: Optional[str] = None) -> Dict[str, Any]`
- Endpoint: `POST /api/flags/diff`

- [ ] **Step 1: Write the failing test for UC159 flag diff comparison**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement diff calculation and API route**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 7: Roadmap Update & Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC134, UC140, UC148, UC150, UC157, UC159 as ✅)
- Run full pytest test suite to ensure zero regressions across all components.

- [ ] **Step 1: Update `docs/ROADMAP.md`**
- [ ] **Step 2: Run entire test suite (`pytest apps/opensible-server/tests/`)**
- [ ] **Step 3: Commit and finalize**
