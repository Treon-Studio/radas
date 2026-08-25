# Phase 6 Cross-cutting Reliability, Security & Observability Implementation Plan (Batch 8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement critical Cross-cutting capabilities: UC456 Strict CORS Whitelisting, UC457 JSON Schema Validation Utility, UC463 Trace ID Propagation, UC464 Prometheus Metrics Endpoint, UC476 Outbound Webhooks for Test Runs, and UC481 Execution Timeout Policy Guard.

**Architecture:**
- Implement in `auth/middleware.py`, `utils/schema_validator.py`, `api/metrics_routes.py`, `services/test_cases.py`, and `services/cloud_provisioning.py`:
  - UC456: CORS origin verification helper in middleware.
  - UC457: `@validate_schema(schema)` request decorator with structured 400 error responses.
  - UC463: Distributed `X-Trace-Id` / `X-Request-Id` request context hook and response header injector.
  - UC464: `/api/metrics` Prometheus text-format exporter endpoint.
  - UC476: `dispatch_test_completion_webhook` in `services/test_cases.py` on test completion.
  - UC481: `set_execution_timeout` & `check_timed_out_executions` in `services/cloud_provisioning.py`.

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC456 — Strict CORS Origin Whitelisting

**Files:**
- Modify: `apps/opensible-server/auth/middleware.py`
- Modify: `apps/opensible-server/app.py`
- Test: `apps/opensible-server/tests/test_crosscutting_batch8_fase6.py`

**Interfaces:**
- Produces: `is_allowed_origin(origin: str, allowed_list: Optional[List[str]] = None) -> bool`
- Middleware / CORS hook setting `Access-Control-Allow-Origin` only for whitelisted origins.

- [ ] **Step 1: Write failing test in `test_crosscutting_batch8_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `is_allowed_origin` and CORS validation**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 2: UC457 — JSON Schema Validation Utility for REST Mutations

**Files:**
- Modify: `apps/opensible-server/utils/schema_validator.py` (create)
- Modify: `apps/opensible-server/auth/middleware.py`
- Test: `apps/opensible-server/tests/test_crosscutting_batch8_fase6.py`

**Interfaces:**
- Produces: `validate_payload_schema(data: dict, schema: dict) -> Tuple[bool, Optional[str]]`
- Decorator: `@validate_schema(schema)`

- [ ] **Step 1: Write failing test in `test_crosscutting_batch8_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `validate_payload_schema` and decorator**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 3: UC463 — Distributed Trace ID & Request ID Propagation

**Files:**
- Modify: `apps/opensible-server/utils/trace_ctx.py` (create)
- Modify: `apps/opensible-server/auth/middleware.py`
- Test: `apps/opensible-server/tests/test_crosscutting_batch8_fase6.py`

**Interfaces:**
- Produces: `get_current_trace_id() -> str`, `init_trace_context(trace_id: Optional[str] = None)`
- Response header injection: `X-Trace-Id` and `X-Request-Id`

- [ ] **Step 1: Write failing test in `test_crosscutting_batch8_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement trace context propagation**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 4: UC464 — Prometheus Metrics Exporter Endpoint (`/api/metrics`)

**Files:**
- Modify: `apps/opensible-server/services/metrics_exporter.py` (create)
- Modify: `apps/opensible-server/api/metrics_routes.py` (create)
- Test: `apps/opensible-server/tests/test_crosscutting_batch8_fase6.py`

**Interfaces:**
- Produces: `generate_prometheus_metrics() -> str`
- Endpoint: `GET /api/metrics` (content-type: `text/plain; version=0.0.4`)

- [ ] **Step 1: Write failing test in `test_crosscutting_batch8_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement metrics generator and `/api/metrics` route**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 5: UC476 — Outbound Webhook Dispatch on Test Run Completion Events

**Files:**
- Modify: `apps/opensible-server/services/test_cases.py`
- Test: `apps/opensible-server/tests/test_crosscutting_batch8_fase6.py`

**Interfaces:**
- Produces: `dispatch_test_completion_webhook(project_id, stack, results: List[Dict], passed: bool, duration_ms: int)`
- Dispatches event `test.completed` and `test.suite_finished`

- [ ] **Step 1: Write failing test in `test_crosscutting_batch8_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement webhook dispatch on test runs**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 6: UC481 — Execution Timeout Policy per Action (Configurable Deadline Guard)

**Files:**
- Modify: `apps/opensible-server/services/cloud_provisioning.py`
- Modify: `apps/opensible-server/api/cloud_provisioning_routes.py`
- Test: `apps/opensible-server/tests/test_crosscutting_batch8_fase6.py`

**Interfaces:**
- Produces:
  - `set_execution_timeout(project_id, stack, action, timeout_seconds: int)`
  - `check_execution_timed_out(started_at: float, timeout_seconds: int) -> bool`
  - Endpoints: `GET/POST /api/cloud-provisioning/stacks/<stack>/timeout`

- [ ] **Step 1: Write failing test in `test_crosscutting_batch8_fase6.py`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement timeout policy and endpoints**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 7: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC456, UC457, UC463, UC464, UC476, UC481 as ✅)
- Run complete pytest test suite across server.

- [ ] **Step 1: Update `docs/ROADMAP.md`**
- [ ] **Step 2: Run pytest full suite**
- [ ] **Step 3: Commit and finalize**
