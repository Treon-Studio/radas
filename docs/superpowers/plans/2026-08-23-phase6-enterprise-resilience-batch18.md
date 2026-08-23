# Phase 6 Enterprise Resilience, Security & Automation Implementation Plan (Batch 18)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement outbound webhook DLQ retry, execution failure DLQ, IP allowlist enforcement, session inactivity lock, daily email digest for failures/drifts, semver constraint resolver for modules, bill spike protection triggers, and custom template versioning (UC404, UC410, UC422, UC423, UC475, UC512, UC554, UC571).

**Architecture:**
- `services/webhook_dispatcher.py`:
  - UC404: Outbound webhook dispatcher with dead-letter queue (DLQ) for failed deliveries after max retries.
- `services/execution_dlq.py`:
  - UC410: Execution dead-letter queue storing terminal execution failures for post-mortem investigation and redrive.
- `services/ip_allowlist.py`:
  - UC422: IP allowlist policy per organization / project with CIDR matching.
- `services/session_inactivity.py`:
  - UC423: User session inactivity tracking and auto-lock after configured idle duration.
- `services/daily_digest.py`:
  - UC475: Daily summary digest compiler aggregating failed test runs, drift alerts, and approval requests.
- `services/semver_resolver.py`:
  - UC512: Semantic version constraint resolution (`^1.2.0`, `~> 2.1`, `>= 1.0, < 3.0`) for modules and registry items.
- `services/bill_spike_protection.py`:
  - UC554: Bill spike monitor triggering automated safeguards (alert or auto-stop flags) when projected cost exceeds threshold.
- `services/template_versioning.py`:
  - UC571: Semantic versioning for custom templates (`publish_template_version`, `get_template_version`, `list_template_versions`).

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC404 & UC410 — Webhook & Execution Dead-Letter Queues (DLQ)

**Files:**
- Create: `apps/opensible-server/services/webhook_dispatcher.py`
- Create: `apps/opensible-server/services/execution_dlq.py`
- Test: `apps/opensible-server/tests/test_resilience_batch18_fase6.py`

**Interfaces:**
- Produces: `dispatch_webhook_with_dlq(target_url: str, event_type: str, payload: Dict[str, Any], max_retries: int = 3) -> Dict[str, Any]`
- Produces: `list_webhook_dlq(limit: int = 100) -> List[Dict[str, Any]]`
- Produces: `push_execution_to_dlq(execution_id: str, stack: str, project_id: str, error_message: str, run_metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]`
- Produces: `list_execution_dlq(project_id: Optional[str] = None) -> List[Dict[str, Any]]`
- Produces: `redrive_execution_dlq(dlq_id: str) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_resilience_batch18_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement webhook dispatcher and execution DLQ**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: UC422 & UC423 — IP Allowlist & Session Inactivity Lock

**Files:**
- Create: `apps/opensible-server/services/ip_allowlist.py`
- Create: `apps/opensible-server/services/session_inactivity.py`
- Test: `apps/opensible-server/tests/test_resilience_batch18_fase6.py`

**Interfaces:**
- Produces: `set_org_ip_allowlist(org_id: str, allowed_cidrs: List[str]) -> None`
- Produces: `is_ip_allowed(ip_address: str, org_id: Optional[str] = None) -> bool`
- Produces: `record_session_activity(session_token: str, user_id: str) -> None`
- Produces: `is_session_inactive(session_token: str, max_idle_seconds: int = 1800) -> bool`

- [x] **Step 1: Write failing test in `test_resilience_batch18_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement IP allowlist and session inactivity services**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: UC475 & UC512 — Daily Failure/Drift Digest & Semver Resolver

**Files:**
- Create: `apps/opensible-server/services/daily_digest.py`
- Create: `apps/opensible-server/services/semver_resolver.py`
- Test: `apps/opensible-server/tests/test_resilience_batch18_fase6.py`

**Interfaces:**
- Produces: `compile_daily_digest(project_id: Optional[str] = None) -> Dict[str, Any]`
- Produces: `resolve_semver_constraint(available_versions: List[str], constraint: str) -> Optional[str]`

- [x] **Step 1: Write failing test in `test_resilience_batch18_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement daily digest and semver resolver**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: UC554 & UC571 — Bill Spike Safeguards & Custom Template Versioning

**Files:**
- Create: `apps/opensible-server/services/bill_spike_protection.py`
- Create: `apps/opensible-server/services/template_versioning.py`
- Test: `apps/opensible-server/tests/test_resilience_batch18_fase6.py`

**Interfaces:**
- Produces: `check_bill_spike(project_id: str, current_projected_cost: float, threshold_percentage: float = 50.0) -> Dict[str, Any]`
- Produces: `publish_template_version(template_name: str, version: str, files: Dict[str, str], changelog: str = "") -> Dict[str, Any]`
- Produces: `get_template_version(template_name: str, version: str) -> Optional[Dict[str, Any]]`
- Produces: `list_template_versions(template_name: str) -> List[Dict[str, Any]]`

- [x] **Step 1: Write failing test in `test_resilience_batch18_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement bill spike protection and template versioning**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC404, UC410, UC422, UC423, UC475, UC512, UC554, UC571 as ✅)
- Run complete pytest test suite across server.

- [x] **Step 1: Update `docs/ROADMAP.md`**
- [x] **Step 2: Run pytest full suite**
- [x] **Step 3: Commit and finalize**
