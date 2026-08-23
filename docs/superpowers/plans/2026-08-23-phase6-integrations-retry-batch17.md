# Phase 6 Integrations, Retry Engine, Cost & Template Sharing Implementation Plan (Batch 17)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement template sharing bundles, query/execution retry with jitter, locale date/number formatting, printable cost breakdown reports, inbound Slack approval button webhooks, welcome onboarding email notifications, and GraphQL schema router (UC572, UC583, UC605, UC607, UC617, UC624, UC639).

**Architecture:**
- `services/template_share.py` & `api/custom_template_routes.py`:
  - UC572: Shareable template bundle export and import with validation.
- `services/retry_engine.py`:
  - UC583: Automatic retry with exponential backoff and randomized jitter for cloud API calls and queries.
- `utils/locale_format.py`:
  - UC605: Locale-aware date, time, currency, and numeric formatting.
- `services/cost_export.py` & `api/cost_routes.py`:
  - UC607: Print-friendly cost report generation (HTML/JSON) with breakdown per stack and resource.
- `services/slack_interactive.py` & `api/webhook_routes.py`:
  - UC617: Inbound Slack interactive button webhook handler (approve/reject actions).
- `services/welcome_email.py`:
  - UC624: Welcome email onboarding notifier for newly registered / invited users.
- `api/graphql_routes.py`:
  - UC639: GraphQL schema query router and execution endpoint (`POST /api/graphql`).

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC572 & UC583 — Template Sharing & Retry Engine with Jitter

**Files:**
- Create: `apps/opensible-server/services/template_share.py`
- Create: `apps/opensible-server/services/retry_engine.py`
- Test: `apps/opensible-server/tests/test_integrations_batch17_fase6.py`

**Interfaces:**
- Produces: `export_template_bundle(template_name: str) -> Dict[str, Any]`
- Produces: `import_template_bundle(bundle_data: Dict[str, Any]) -> Dict[str, Any]`
- Produces: `retry_with_jitter(fn: Callable, max_retries: int = 3, base_delay: float = 0.1, max_delay: float = 2.0, exceptions: tuple = (Exception,)) -> Any`

- [x] **Step 1: Write failing test in `test_integrations_batch17_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement template sharing and retry engine**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: UC605 & UC607 — Locale Formatting & Print-Friendly Cost Reports

**Files:**
- Create: `apps/opensible-server/utils/locale_format.py`
- Create: `apps/opensible-server/services/cost_export.py`
- Modify: `apps/opensible-server/api/cost_routes.py`
- Test: `apps/opensible-server/tests/test_integrations_batch17_fase6.py`

**Interfaces:**
- Produces: `format_currency(amount: float, currency: str = "USD", locale: str = "en_US") -> str`
- Produces: `format_datetime_locale(timestamp: float, locale: str = "en_US") -> str`
- Produces: `generate_cost_report(project_id: Optional[str] = None, format_type: str = "html") -> str`
- Endpoint: `GET /api/cost/report/export`

- [x] **Step 1: Write failing test in `test_integrations_batch17_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement locale formatting and cost report generation**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: UC617 & UC624 — Slack Interactive Webhook & Onboarding Welcome Notifier

**Files:**
- Create: `apps/opensible-server/services/slack_interactive.py`
- Create: `apps/opensible-server/services/welcome_email.py`
- Test: `apps/opensible-server/tests/test_integrations_batch17_fase6.py`

**Interfaces:**
- Produces: `handle_slack_interaction(payload: Dict[str, Any]) -> Dict[str, Any]`
- Produces: `send_welcome_onboarding_email(email: str, username: str, login_url: str) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_integrations_batch17_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement Slack interactive handler and welcome email dispatcher**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: UC639 — GraphQL API Gateway Endpoint

**Files:**
- Create: `apps/opensible-server/api/graphql_routes.py`
- Test: `apps/opensible-server/tests/test_integrations_batch17_fase6.py`

**Interfaces:**
- Produces: `POST /api/graphql` executing GraphQL schema queries (stacks, runs, metrics).

- [x] **Step 1: Write failing test in `test_integrations_batch17_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement GraphQL API gateway endpoint**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC572, UC583, UC605, UC607, UC617, UC624, UC639 as ✅)
- Run complete pytest test suite across server.

- [x] **Step 1: Update `docs/ROADMAP.md`**
- [x] **Step 2: Run pytest full suite**
- [x] **Step 3: Commit and finalize**
