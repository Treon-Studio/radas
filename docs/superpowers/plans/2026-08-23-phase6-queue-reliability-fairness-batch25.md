# Phase 6 Worker Queue Reliability, Fairness Scheduling & Uniform Error Architecture Implementation Plan (Batch 25)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement multi-stack bulk apply orchestrator, semantic 404 handler, standardized error envelope, structured JSON logger, worker queue durable recovery, execution claim conflict backoff, round-robin worker fairness dispatcher, and graceful worker draining (UC428, UC460, UC461, UC462, UC477, UC478, UC479, UC480).

**Architecture:**
- `services/bulk_stack_runner.py` & `utils/not_found_handler.py`:
  - UC428: Orchestrates bulk execution of `plan` or `apply` operations across multiple stacks simultaneously.
  - UC460: Standardized semantic 404 handler returning descriptive missing entity contexts.
- `utils/error_envelope.py` & `utils/structured_json_logger.py`:
  - UC461: Standard error response envelope formatter (`{"error": code, "message": text, "status_code": int, "details": {...}}`).
  - UC462: Structured JSON action logger for audit, execution, and security event streams.
- `services/worker_recovery.py` & `services/claim_backoff.py`:
  - UC477: Recovers pending/in-flight worker queues without message loss upon server/worker restarts.
  - UC478: Calculates jittered exponential backoffs for concurrent task claiming conflicts.
- `services/worker_fairness.py` & `services/worker_drain.py`:
  - UC479: Dispatches pending queue items using a round-robin fairness algorithm preventing starvation of busy stacks.
  - UC480: Coordinates graceful worker draining to complete active runs before shutdown.

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC428 & UC460 — Bulk Stack Orchestrator & Semantic 404 Handler

**Files:**
- Create: `apps/opensible-server/services/bulk_stack_runner.py`
- Create: `apps/opensible-server/utils/not_found_handler.py`
- Test: `apps/opensible-server/tests/test_queue_reliability_fairness_batch25_fase6.py`

**Interfaces:**
- Produces: `execute_bulk_stack_action(project_id: str, stack_names: List[str], action: str, actor: str) -> Dict[str, Any]`
- Produces: `format_not_found_response(entity_type: str, entity_id: str, context: Optional[str] = None) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_queue_reliability_fairness_batch25_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement bulk stack runner and semantic 404 handler**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: UC461 & UC462 — Standard Error Envelope & Structured JSON Logger

**Files:**
- Create: `apps/opensible-server/utils/error_envelope.py`
- Create: `apps/opensible-server/utils/structured_json_logger.py`
- Test: `apps/opensible-server/tests/test_queue_reliability_fairness_batch25_fase6.py`

**Interfaces:**
- Produces: `make_error_envelope(error_code: str, message: str, status_code: int = 400, details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]`
- Produces: `format_structured_log(event_type: str, message: str, level: str = "INFO", context: Optional[Dict[str, Any]] = None) -> str`

- [x] **Step 1: Write failing test in `test_queue_reliability_fairness_batch25_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement error envelope and structured JSON logger**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: UC477 & UC478 — Worker Queue Recovery & Claim Backoff Engine

**Files:**
- Create: `apps/opensible-server/services/worker_recovery.py`
- Create: `apps/opensible-server/services/claim_backoff.py`
- Test: `apps/opensible-server/tests/test_queue_reliability_fairness_batch25_fase6.py`

**Interfaces:**
- Produces: `recover_interrupted_queue(project_id: Optional[str] = None) -> Dict[str, Any]`
- Produces: `calculate_claim_backoff(attempt: int, base_delay: float = 0.5, max_delay: float = 10.0) -> float`

- [x] **Step 1: Write failing test in `test_queue_reliability_fairness_batch25_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement worker recovery and claim backoff engine**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: UC479 & UC480 — Round-Robin Fairness Dispatcher & Graceful Worker Drain

**Files:**
- Create: `apps/opensible-server/services/worker_fairness.py`
- Create: `apps/opensible-server/services/worker_drain.py`
- Test: `apps/opensible-server/tests/test_queue_reliability_fairness_batch25_fase6.py`

**Interfaces:**
- Produces: `schedule_fair_round_robin(queued_tasks: List[Dict[str, Any]]) -> List[Dict[str, Any]]`
- Produces: `initiate_worker_drain(worker_id: str, timeout_seconds: int = 300) -> Dict[str, Any]`
- Produces: `get_worker_drain_status(worker_id: str, active_jobs_count: int = 0) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_queue_reliability_fairness_batch25_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement worker fairness dispatcher and graceful drain manager**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC428, UC460, UC461, UC462, UC477, UC478, UC479, UC480 as ✅)
- Run complete pytest test suite across server.

- [x] **Step 1: Update `docs/ROADMAP.md`**
- [x] **Step 2: Run pytest full suite**
- [x] **Step 3: Commit and finalize**
