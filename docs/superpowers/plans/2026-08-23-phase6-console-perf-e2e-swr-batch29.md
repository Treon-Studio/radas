# Phase 6 Console Performance, Large Stack Indexing, E2E Selectors & SWR Caching Implementation Plan (Batch 29)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement quick project switcher LRU cache, large stack listing pagination engine (>500 stacks), optimistic state update & rollback manager, E2E Playwright test selector registry, bundle size budget validator, lazy loading chart splitter, and SWR caching header generator (UC518, UC564, UC567, UC574, UC575, UC577, UC578, UC579).

**Architecture:**
- `services/quick_project_switcher.py` & `services/large_stack_indexer.py`:
  - UC518: Maintains fast in-memory / KV project switching index with recent access timestamps.
  - UC564: Implements paginated cursor-based high-performance querying for projects with >500 infrastructure stacks.
- `services/optimistic_state_manager.py` & `services/e2e_test_selector_registry.py`:
  - UC567: Emits optimistic state change transactions with automatic revert/rollback on server rejection.
  - UC574 & UC575: Provides standardized, queryable `data-testid` mapping registry for automated Playwright E2E tests.
- `services/bundle_budget_validator.py` & `services/swr_cache_manager.py`:
  - UC577 & UC578: Validates bundle chunk sizes against performance budgets and identifies chart lazy-loading chunks.
  - UC579: Generates HTTP Cache-Control and ETag headers supporting stale-while-revalidate caching semantics.

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC518 & UC564 — Quick Project Switcher & Large Stack Indexer

**Files:**
- Create: `apps/opensible-server/services/quick_project_switcher.py`
- Create: `apps/opensible-server/services/large_stack_indexer.py`
- Test: `apps/opensible-server/tests/test_console_perf_e2e_swr_batch29_fase6.py`

**Interfaces:**
- Produces: `record_project_access(user_id: str, project_id: str) -> Dict[str, Any]`
- Produces: `get_recent_projects(user_id: str, limit: int = 5) -> List[Dict[str, Any]]`
- Produces: `paginate_large_stack_list(stacks: List[Dict[str, Any]], page: int = 1, page_size: int = 50, filter_query: Optional[str] = None) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_console_perf_e2e_swr_batch29_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement quick project switcher and large stack paginator**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: UC567, UC574 & UC575 — Optimistic State Manager & E2E Selectors

**Files:**
- Create: `apps/opensible-server/services/optimistic_state_manager.py`
- Create: `apps/opensible-server/services/e2e_test_selector_registry.py`
- Test: `apps/opensible-server/tests/test_console_perf_e2e_swr_batch29_fase6.py`

**Interfaces:**
- Produces: `apply_optimistic_update(entity_type: str, entity_id: str, prev_state: Dict[str, Any], next_state: Dict[str, Any]) -> Dict[str, Any]`
- Produces: `revert_optimistic_update(update_id: str) -> Dict[str, Any]`
- Produces: `get_stable_testid(component: str, action: str, entity_id: Optional[str] = None) -> str`

- [x] **Step 1: Write failing test in `test_console_perf_e2e_swr_batch29_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement optimistic state manager and test selector registry**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: UC577, UC578 & UC579 — Bundle Budget, Lazy Load & SWR Cache Manager

**Files:**
- Create: `apps/opensible-server/services/bundle_budget_validator.py`
- Create: `apps/opensible-server/services/swr_cache_manager.py`
- Test: `apps/opensible-server/tests/test_console_perf_e2e_swr_batch29_fase6.py`

**Interfaces:**
- Produces: `validate_bundle_budgets(chunks: Dict[str, int], max_chunk_kb: int = 500) -> Dict[str, Any]`
- Produces: `generate_swr_headers(resource_data: Any, max_age_sec: int = 60, stale_sec: int = 300) -> Dict[str, str]`

- [x] **Step 1: Write failing test in `test_console_perf_e2e_swr_batch29_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement bundle budget validator and SWR cache manager**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC518, UC564, UC567, UC574, UC575, UC577, UC578, UC579 as ✅)
- Run complete pytest test suite across server.

- [x] **Step 1: Update `docs/ROADMAP.md`**
- [x] **Step 2: Run pytest full suite**
- [x] **Step 3: Commit and finalize**
