# Phase 6 Admin Governance, OpenAPI Standards, Component Health & Analytics Implementation Plan (Batch 16)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement audited admin user impersonation, OpenAPI operationId specification exporter, API schema versioning, component health status page, usage metrics aggregation, anonymized telemetry manager, and SSO/OAuth discovery configuration (UC601, UC602, UC604, UC627, UC628, UC636, UC640, UC642).

**Architecture:**
- `services/impersonation.py` & `api/impersonate_routes.py`:
  - UC636: Admin user impersonation with mandatory audit event logging.
- `services/openapi_generator.py` & `api/openapi_routes.py`:
  - UC640: API schema versioning & capability negotiation.
  - UC642: Consistent OpenAPI schema generator with explicit `operationId`.
- `services/component_status.py` & `api/status_routes.py`:
  - UC601: Component health status page (database, worker, scheduler, runner).
- `services/usage_analytics.py` & `services/telemetry.py`:
  - UC602: Product usage metrics (DAU stacks, run counts, active users).
  - UC604: Anonymized system telemetry collector with opt-in control.
- `services/sso_config.py`:
  - UC627 & UC628: OAuth/SSO provider discovery URL configuration.

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC636 — Audited Admin Impersonation

**Files:**
- Create: `apps/opensible-server/services/impersonation.py`
- Modify: `apps/opensible-server/api/auth_routes.py`
- Test: `apps/opensible-server/tests/test_governance_batch16_fase6.py`

**Interfaces:**
- Produces: `impersonate_user(admin_user_id: str, target_user_id: str) -> Dict[str, Any]`
- Produces: `revert_impersonation(impersonation_token: str) -> Dict[str, Any]`
- Endpoints:
  - `POST /api/auth/impersonate`
  - `POST /api/auth/impersonate/revert`

- [x] **Step 1: Write failing test in `test_governance_batch16_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement impersonation service**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: UC640 & UC642 — OpenAPI Schema Generation & API Schema Versioning

**Files:**
- Create: `apps/opensible-server/services/openapi_generator.py`
- Modify: `apps/opensible-server/api/api_routes.py` (or create `api/openapi_routes.py`)
- Test: `apps/opensible-server/tests/test_governance_batch16_fase6.py`

**Interfaces:**
- Produces: `generate_openapi_spec(app: Flask) -> Dict[str, Any]`
- Produces: `get_api_schema_version() -> Dict[str, Any]`
- Endpoint: `GET /api/openapi.json`
- Endpoint: `GET /api/schema/version`

- [x] **Step 1: Write failing test in `test_governance_batch16_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement OpenAPI and schema versioning**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: UC601 — Component Health Status Page

**Files:**
- Create: `apps/opensible-server/services/component_status.py`
- Modify: `apps/opensible-server/api/health_routes.py`
- Test: `apps/opensible-server/tests/test_governance_batch16_fase6.py`

**Interfaces:**
- Produces: `get_component_health_status() -> Dict[str, Any]`
- Endpoint: `GET /api/status/components`

- [x] **Step 1: Write failing test in `test_governance_batch16_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement component health status service**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: UC602 & UC604 — Usage Analytics & Anonymized Telemetry

**Files:**
- Create: `apps/opensible-server/services/usage_analytics.py`
- Create: `apps/opensible-server/services/telemetry.py`
- Test: `apps/opensible-server/tests/test_governance_batch16_fase6.py`

**Interfaces:**
- Produces: `get_product_usage_metrics(days: int = 30) -> Dict[str, Any]`
- Produces: `get_telemetry_payload(anonymize: bool = True) -> Dict[str, Any]`
- Produces: `set_telemetry_opt_in(enabled: bool) -> None`

- [x] **Step 1: Write failing test in `test_governance_batch16_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement usage analytics and telemetry services**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: UC627 & UC628 — SSO Discovery & OAuth Configuration

**Files:**
- Create: `apps/opensible-server/services/sso_config.py`
- Test: `apps/opensible-server/tests/test_governance_batch16_fase6.py`

**Interfaces:**
- Produces: `set_sso_discovery_config(provider_name: str, discovery_url: str, client_id: str, client_secret: Optional[str] = None) -> None`
- Produces: `get_sso_discovery_config(provider_name: str) -> Optional[Dict[str, Any]]`
- Produces: `list_configured_sso_providers() -> List[Dict[str, Any]]`

- [x] **Step 1: Write failing test in `test_governance_batch16_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement SSO config service**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 6: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC601, UC602, UC604, UC627, UC628, UC636, UC640, UC642 as ✅)
- Run complete pytest test suite across server.

- [x] **Step 1: Update `docs/ROADMAP.md`**
- [x] **Step 2: Run pytest full suite**
- [x] **Step 3: Commit and finalize**
