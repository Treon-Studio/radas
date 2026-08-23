# Phase 6 Lockfile Integrity, Backend Safety, Snapshot Lifecycles & Quota Management Implementation Plan (Batch 22)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement OpenTofu `.terraform.lock.hcl` dependency validation, `backend.hcl` edit guards, smart `tofu init` caching/skip optimization, snapshot naming & annotations, snapshot automated retention purger, periodic snapshot scheduler, soft vs hard quota policy engine, and quota increase request workflows (UC514, UC522, UC530, UC540, UC541, UC542, UC548, UC549).

**Architecture:**
- `services/lockfile_manager.py`:
  - UC514: Parses `.terraform.lock.hcl` ensuring provider version constraints and cryptographic hashes match expected dependencies.
- `services/backend_guard.py`:
  - UC522: Validates changes to `backend.hcl` or `backend.tf` to prevent accidental state key corruption, migration loss, or bucket rewrites.
- `services/init_optimizer.py`:
  - UC530: Evaluates hashes of modules, provider pins, and lockfiles to determine if `tofu init` can be safely skipped for faster runs.
- `services/snapshot_comment.py` & `services/snapshot_scheduler.py` & `services/snapshot_retention.py`:
  - UC540: Snapshot annotations and metadata (custom human-readable comments, tags, created by).
  - UC541: Automated periodic snapshot scheduler.
  - UC542: Enforces maximum snapshot count and age retention policies (pruning oldest snapshots beyond limit).
- `services/quota_evaluator.py` & `services/quota_request.py`:
  - UC548: Evaluates project resource allocations distinguishing between soft quota warnings (80-99%) and hard quota blocks (>=100%).
  - UC549: Self-service quota increase request workflow with admin approval routing.

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC514 & UC522 — Lockfile Integrity & Backend Guard

**Files:**
- Create: `apps/opensible-server/services/lockfile_manager.py`
- Create: `apps/opensible-server/services/backend_guard.py`
- Test: `apps/opensible-server/tests/test_lockfile_backend_quota_batch22_fase6.py`

**Interfaces:**
- Produces: `parse_terraform_lockfile(content: str) -> Dict[str, Any]`
- Produces: `validate_backend_config_change(old_backend: str, new_backend: str, expected_state_key: str) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_lockfile_backend_quota_batch22_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement lockfile manager and backend guard**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: UC530 & UC540 — Init Skip Optimizer & Snapshot Comments

**Files:**
- Create: `apps/opensible-server/services/init_optimizer.py`
- Create: `apps/opensible-server/services/snapshot_comment.py`
- Test: `apps/opensible-server/tests/test_lockfile_backend_quota_batch22_fase6.py`

**Interfaces:**
- Produces: `should_skip_init(project_id: str, stack: str, current_config_hash: str) -> bool`
- Produces: `record_init_success(project_id: str, stack: str, config_hash: str) -> None`
- Produces: `annotate_snapshot(snapshot_id: str, title: str, description: str, tags: Optional[List[str]] = None) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_lockfile_backend_quota_batch22_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement init optimizer and snapshot comment manager**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: UC541 & UC542 — Snapshot Scheduler & Retention Policy

**Files:**
- Create: `apps/opensible-server/services/snapshot_scheduler.py`
- Create: `apps/opensible-server/services/snapshot_retention.py`
- Test: `apps/opensible-server/tests/test_lockfile_backend_quota_batch22_fase6.py`

**Interfaces:**
- Produces: `schedule_periodic_snapshots(project_id: str, stack: str, cron_interval: str) -> Dict[str, Any]`
- Produces: `enforce_snapshot_retention(snapshots: List[Dict[str, Any]], max_retention_count: int = 10) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_lockfile_backend_quota_batch22_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement snapshot scheduler and retention policy**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: UC548 & UC549 — Soft/Hard Quota Evaluator & Quota Request Flow

**Files:**
- Create: `apps/opensible-server/services/quota_evaluator.py`
- Create: `apps/opensible-server/services/quota_request.py`
- Test: `apps/opensible-server/tests/test_lockfile_backend_quota_batch22_fase6.py`

**Interfaces:**
- Produces: `evaluate_quota(current_usage: int, limit: int, soft_threshold_percent: float = 80.0) -> Dict[str, Any]`
- Produces: `create_quota_increase_request(project_id: str, resource_type: str, requested_limit: int, reason: str, author: str) -> Dict[str, Any]`
- Produces: `approve_quota_increase(request_id: str, approver: str) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_lockfile_backend_quota_batch22_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement quota evaluator and quota request workflow**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC514, UC522, UC530, UC540, UC541, UC542, UC548, UC549 as ✅)
- Run complete pytest test suite across server.

- [x] **Step 1: Update `docs/ROADMAP.md`**
- [x] **Step 2: Run pytest full suite**
- [x] **Step 3: Commit and finalize**
