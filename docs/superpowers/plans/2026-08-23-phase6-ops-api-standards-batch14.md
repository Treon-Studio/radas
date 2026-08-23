# Phase 6 System Operations, API Standards & Resilience Implementation Plan (Batch 14)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full-text search across stacks & runs, cursor pagination, standard rate limit headers, configurable client timeouts, Retry-After header handling, graceful shutdown draining, and DATA_DIR backup tooling (UC637, UC638, UC641, UC643, UC644, UC648, UC650).

**Architecture:**
- `services/search_service.py` & `api/search_routes.py`:
  - UC637: Unified full-text search across stacks, runs, execution logs, and tags.
- `utils/pagination.py`:
  - UC638: Cursor-based pagination utilities (`encode_cursor`, `decode_cursor`, `paginate_cursor`).
- `middleware/rate_limit.py` & `api/auth_routes.py`:
  - UC641 & UC644: Standard RateLimit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`) on rate-limited endpoints.
- `config/settings.py` / `services/playbook_runner.py`:
  - UC643: Configurable execution/client timeout per operation or integration.
- `services/lifecycle.py`:
  - UC648: Graceful shutdown draining manager for in-flight tasks and worker connections.
- `services/backup_service.py` & `api/backup_routes.py`:
  - UC650: DATA_DIR backup archive generator and restore tooling.

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC637 — Full-Text Search across Stacks & Runs

**Files:**
- Create: `apps/opensible-server/services/unified_search.py`
- Modify: `apps/opensible-server/api/search_routes.py`
- Test: `apps/opensible-server/tests/test_ops_standards_batch14_fase6.py`

**Interfaces:**
- Produces: `search_all(query: str, project_id: Optional[str] = None, types: Optional[List[str]] = None, limit: int = 50) -> Dict[str, Any]`
- Endpoint: `GET /api/search`

- [x] **Step 1: Write failing test in `test_ops_standards_batch14_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement unified full-text search**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: UC638 — API Cursor-Based Pagination

**Files:**
- Create: `apps/opensible-server/utils/cursor_pagination.py`
- Test: `apps/opensible-server/tests/test_ops_standards_batch14_fase6.py`

**Interfaces:**
- Produces: `paginate_with_cursor(items: List[Dict], cursor: Optional[str] = None, limit: int = 20, sort_key: str = "id") -> Dict[str, Any]`
- Produces: `encode_cursor(value: Any) -> str`
- Produces: `decode_cursor(cursor: str) -> Any`

- [x] **Step 1: Write failing test in `test_ops_standards_batch14_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement cursor pagination utilities**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: UC641 & UC644 — Standard Rate Limit Headers & Retry-After Support

**Files:**
- Modify: `apps/opensible-server/services/login_security.py`
- Modify: `apps/opensible-server/api/auth_routes.py`
- Test: `apps/opensible-server/tests/test_ops_standards_batch14_fase6.py`

**Interfaces:**
- Attaches headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` on rate-limited responses (HTTP 429).

- [x] **Step 1: Write failing test in `test_ops_standards_batch14_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement rate limit headers and Retry-After response**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: UC643 — Configurable Client & Execution Timeouts

**Files:**
- Create: `apps/opensible-server/services/timeout_policy.py`
- Test: `apps/opensible-server/tests/test_ops_standards_batch14_fase6.py`

**Interfaces:**
- Produces: `get_timeout_policy(scope: str, default_seconds: int = 300) -> int`
- Produces: `set_timeout_policy(scope: str, timeout_seconds: int) -> None`

- [x] **Step 1: Write failing test in `test_ops_standards_batch14_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement configurable timeout policy**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: UC648 — Server Graceful Shutdown & Run Draining

**Files:**
- Create: `apps/opensible-server/services/shutdown_drain.py`
- Test: `apps/opensible-server/tests/test_ops_standards_batch14_fase6.py`

**Interfaces:**
- Produces: `register_in_flight_job(job_id: str, metadata: Optional[Dict] = None) -> None`
- Produces: `unregister_in_flight_job(job_id: str) -> None`
- Produces: `is_draining() -> bool`
- Produces: `drain_and_shutdown(timeout_seconds: float = 5.0) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_ops_standards_batch14_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement graceful drain manager**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 6: UC650 — Backup DATA_DIR Tooling

**Files:**
- Create: `apps/opensible-server/services/backup_archive.py`
- Modify: `apps/opensible-server/api/backup_routes.py`
- Test: `apps/opensible-server/tests/test_ops_standards_batch14_fase6.py`

**Interfaces:**
- Produces: `create_backup_archive(data_dir: Path, destination_zip: Path, include_db_dump: bool = False) -> Dict[str, Any]`
- Produces: `restore_backup_archive(backup_zip: Path, target_data_dir: Path) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_ops_standards_batch14_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement backup and restore archive service**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 7: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC637, UC638, UC641, UC643, UC644, UC648, UC650 as ✅)
- Run complete pytest test suite across server.

- [x] **Step 1: Update `docs/ROADMAP.md`**
- [x] **Step 2: Run pytest full suite**
- [x] **Step 3: Commit and finalize**
