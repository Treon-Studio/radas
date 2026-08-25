# Phase 6 GitHub Actions Management Advanced Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement advanced GitHub Actions management capabilities: UC249 auto-retry policy for failed runs, UC250 run webhook ingestion into audit log, UC255 repository metadata inspection, UC256 secrets exposure scanner in workflow files, UC257 SHA pinning validator for actions, and UC263 GitHub token rotation and connection health check.

**Architecture:**
- Extend `services/github_actions.py` with:
  - `evaluate_run_auto_retry(project_id, repo, run_id, ...)`
  - `ingest_github_webhook(event_name, payload, project_id)`
  - `get_repo_metadata(owner, repo, project_id)`
  - `scan_workflow_secrets_exposure(yaml_content)`
  - `validate_workflow_sha_pinning(yaml_content)`
  - `check_github_connection_health(project_id)` & `rotate_github_token(project_id, new_token)`
- Expose REST API routes in `api/github_actions_routes.py` (or `api/github_routes.py`):
  - `POST /api/github/runs/<run_id>/auto-retry`
  - `POST /api/github/webhooks/ingest`
  - `GET /api/github/repos/<owner>/<repo>/metadata`
  - `POST /api/github/workflows/scan-secrets`
  - `POST /api/github/workflows/validate-pinning`
  - `GET /api/github/connection/health` & `POST /api/github/connection/rotate-token`

**Tech Stack:** Python 3.14, Flask, PostgreSQL / kv_store, Pytest.

---

### Task 1: UC249 — Auto-retry Policy for Failed Workflow Runs

**Files:**
- Modify: `apps/opensible-server/services/github_actions.py`
- Modify: `apps/opensible-server/api/github_actions_routes.py`
- Test: `apps/opensible-server/tests/test_github_actions_advanced_fase6.py`

**Interfaces:**
- Produces: `evaluate_run_auto_retry(owner: str, repo: str, run_id: int, project_id: Optional[str] = None, max_retries: int = 2) -> Dict[str, Any]`
- Endpoint: `POST /api/github/runs/<run_id>/auto-retry`

- [ ] **Step 1: Write failing test for UC249 auto-retry policy**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `evaluate_run_auto_retry` and API route**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 2: UC250 — Workflow Run Webhooks Ingestion into Audit Log

**Files:**
- Modify: `apps/opensible-server/services/github_actions.py`
- Modify: `apps/opensible-server/api/github_actions_routes.py`
- Test: `apps/opensible-server/tests/test_github_actions_advanced_fase6.py`

**Interfaces:**
- Produces: `ingest_github_webhook(event: str, payload: Dict[str, Any], project_id: Optional[str] = None) -> Dict[str, Any]`
- Endpoint: `POST /api/github/webhooks/ingest`

- [ ] **Step 1: Write failing test for UC250 webhook ingestion**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `ingest_github_webhook` and route**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 3: UC255 — Repository Metadata Extraction & Inspection

**Files:**
- Modify: `apps/opensible-server/services/github_actions.py`
- Modify: `apps/opensible-server/api/github_actions_routes.py`
- Test: `apps/opensible-server/tests/test_github_actions_advanced_fase6.py`

**Interfaces:**
- Produces: `get_repo_metadata(owner: str, repo: str, project_id: Optional[str] = None) -> Dict[str, Any]`
- Endpoint: `GET /api/github/repos/<owner>/<repo>/metadata`

- [ ] **Step 1: Write failing test for UC255 repository metadata**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `get_repo_metadata` and route**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 4: UC256 — Secrets Exposure Scanner in Workflow Files

**Files:**
- Modify: `apps/opensible-server/services/github_actions.py`
- Modify: `apps/opensible-server/api/github_actions_routes.py`
- Test: `apps/opensible-server/tests/test_github_actions_advanced_fase6.py`

**Interfaces:**
- Produces: `scan_workflow_secrets_exposure(yaml_content: str) -> Dict[str, Any]`
  - Detects plaintext API tokens, AWS keys, password strings, and suspicious `echo ${{ secrets.* }}` or `dump env` steps.
- Endpoint: `POST /api/github/workflows/scan-secrets`

- [ ] **Step 1: Write failing test for UC256 secrets exposure scanner**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement scanner and route**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 5: UC257 — GitHub Action SHA Pinning Validator (Supply-Chain Security)

**Files:**
- Modify: `apps/opensible-server/services/github_actions.py`
- Modify: `apps/opensible-server/api/github_actions_routes.py`
- Test: `apps/opensible-server/tests/test_github_actions_advanced_fase6.py`

**Interfaces:**
- Produces: `validate_workflow_sha_pinning(yaml_content: str) -> Dict[str, Any]`
  - Analyzes all `uses:` directives (e.g. `actions/checkout@v4` vs `actions/checkout@b4ffde56f...`).
  - Reports unpinned actions with line numbers, action names, and current ref tag.
- Endpoint: `POST /api/github/workflows/validate-pinning`

- [ ] **Step 1: Write failing test for UC257 SHA pinning validator**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement pinning validator and route**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 6: UC263 — GitHub API Token Rotation & Connection Health Check

**Files:**
- Modify: `apps/opensible-server/services/github_actions.py`
- Modify: `apps/opensible-server/api/github_actions_routes.py`
- Test: `apps/opensible-server/tests/test_github_actions_advanced_fase6.py`

**Interfaces:**
- Produces:
  - `check_github_connection_health(project_id: Optional[str] = None) -> Dict[str, Any]`
  - `rotate_github_token(project_id: Optional[str] = None, new_token: str = "") -> Dict[str, Any]`
- Endpoints:
  - `GET /api/github/connection/health`
  - `POST /api/github/connection/rotate-token`

- [ ] **Step 1: Write failing test for UC263 token health and rotation**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement health check, token rotation, and routes**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 7: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC249, UC250, UC255, UC256, UC257, UC263 as ✅)
- Run full pytest test suite to ensure zero regressions across all components.

- [ ] **Step 1: Update `docs/ROADMAP.md`**
- [ ] **Step 2: Run entire test suite (`pytest apps/opensible-server/tests/`)**
- [ ] **Step 3: Commit and finalize**
