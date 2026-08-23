# Phase 6 Quality Gates, Preview Lifecycles, Idempotency & Checksum Verification Implementation Plan (Batch 21)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement conventional commit validation, API idempotency store, 409 conflict detection for unique entities, full data snapshot backup/restore, automated preview TTL expiry sweeper, preview-to-prod promotion workflow with approval gate, PR status badge SVG generator, and cryptographic module checksum verifier (UC433, UC458, UC459, UC466, UC499, UC502, UC506, UC515).

**Architecture:**
- `utils/commit_lint.py`:
  - UC433: Validates commit messages according to Conventional Commits standards (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, etc.).
- `services/idempotency_store.py`:
  - UC458: Dedicated idempotency key tracker caching and returning saved responses for duplicated mutation requests.
- `utils/conflict_detector.py`:
  - UC459: Conflict detector enforcing unique key naming constraints and returning standardized 409 Conflict structures.
- `services/data_snapshot.py`:
  - UC466: Export/import snapshot engine for feature flags, test suites, and catalog definitions into portable JSON backups.
- `services/preview_ttl_sweeper.py`:
  - UC499: TTL evaluator identifying expired preview environments and queuing automated destroy actions.
- `services/preview_promotion.py`:
  - UC502: Workflow manager promoting preview environment configuration into production after required approvals.
- `services/pr_status_badge.py`:
  - UC506: Dynamic SVG badge generator rendering status badges (`passed`, `failed`, `running`, `drifted`, `cost: $X`).
- `services/checksum_verifier.py`:
  - UC515: Cryptographic SHA256 / SHA512 checksum validator for downloaded OpenTofu modules and artifacts.

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC433 & UC458 — Conventional Commit Linter & Idempotency Store

**Files:**
- Create: `apps/opensible-server/utils/commit_lint.py`
- Create: `apps/opensible-server/services/idempotency_store.py`
- Test: `apps/opensible-server/tests/test_quality_gates_preview_batch21_fase6.py`

**Interfaces:**
- Produces: `validate_conventional_commit(message: str) -> Dict[str, Any]`
- Produces: `check_or_set_idempotency(scope: str, idempotency_key: str, response_payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_quality_gates_preview_batch21_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement commit linter and idempotency store**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: UC459 & UC466 — Conflict Detection & Config Data Snapshots

**Files:**
- Create: `apps/opensible-server/utils/conflict_detector.py`
- Create: `apps/opensible-server/services/data_snapshot.py`
- Test: `apps/opensible-server/tests/test_quality_gates_preview_batch21_fase6.py`

**Interfaces:**
- Produces: `ensure_unique_key(scope: str, key: str, existing_keys: List[str]) -> None`
- Produces: `create_data_snapshot(project_id: str, include_types: Optional[List[str]] = None) -> Dict[str, Any]`
- Produces: `restore_data_snapshot(project_id: str, snapshot_data: Dict[str, Any]) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_quality_gates_preview_batch21_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement conflict detector and data snapshot service**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: UC499 & UC502 — Preview TTL Sweeper & Preview-to-Prod Promotion

**Files:**
- Create: `apps/opensible-server/services/preview_ttl_sweeper.py`
- Create: `apps/opensible-server/services/preview_promotion.py`
- Test: `apps/opensible-server/tests/test_quality_gates_preview_batch21_fase6.py`

**Interfaces:**
- Produces: `sweep_expired_previews(project_id: str) -> List[Dict[str, Any]]`
- Produces: `request_preview_promotion(project_id: str, preview_stack: str, prod_stack: str, author: str) -> Dict[str, Any]`
- Produces: `approve_preview_promotion(promotion_id: str, approver: str) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_quality_gates_preview_batch21_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement preview TTL sweeper and promotion manager**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: UC506 & UC515 — PR Status Badge Generator & Module Checksum Verifier

**Files:**
- Create: `apps/opensible-server/services/pr_status_badge.py`
- Create: `apps/opensible-server/services/checksum_verifier.py`
- Test: `apps/opensible-server/tests/test_quality_gates_preview_batch21_fase6.py`

**Interfaces:**
- Produces: `generate_status_badge_svg(label: str, status: str, color: Optional[str] = None) -> str`
- Produces: `verify_artifact_checksum(data_bytes: bytes, expected_checksum: str, algorithm: str = "sha256") -> bool`

- [x] **Step 1: Write failing test in `test_quality_gates_preview_batch21_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement status badge generator and checksum verifier**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC433, UC458, UC459, UC466, UC499, UC502, UC506, UC515 as ✅)
- Run complete pytest test suite across server.

- [x] **Step 1: Update `docs/ROADMAP.md`**
- [x] **Step 2: Run pytest full suite**
- [x] **Step 3: Commit and finalize**
