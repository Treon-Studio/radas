# Phase 1: Service Catalog & Runtime Adapters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to deploy services from the catalog through the console, with the worker executing provider operations asynchronously.

**Architecture:** The control plane (Flask API) validates catalog definitions, creates service instances and revisions, and queues operations. The worker (Go) claims operations from the database, invokes the appropriate runtime provider (mock, local-container, or future OpenTofu/Kubernetes adapters), and writes back results. The console polls operation status and displays logs/endpoints.

**Tech Stack:** Flask (Python 3.14), PostgreSQL (Neon), Go worker, existing runtime registry and provider contracts, React 19 console.

## Global Constraints

- All new API endpoints require JWT authentication and project/org authorization.
- Every mutating operation is idempotent via `Idempotency-Key` header.
- Secrets never appear in logs, API responses, or operation payloads. Use `secret_ref` references.
- Provider adapters must return `ProviderResult` and `ProviderLogPage` with redacted fields.
- The worker must claim exactly one operation at a time via database CAS lock.
- Console UI must use existing `Card`, `StateView`, `Drawer`, and `ConfirmDialog` components.
- All database migrations are versioned in `pg_schema.py`; schema changes must be additive.

---
## Task 1.1: Harden Runtime Provider Interface and Registry

**Files:**
- Verify: `services/runtime_provider.py` (contract already defined)
- Verify: `services/runtime_registry.py` (registry already implements invoke, logs, validate)
- Modify: `services/runtime_providers/local_container.py` (add `plan` and `apply_plan` stubs if missing)
- Modify: `services/runtime_providers/mock.py` (already has plan/apply_plan — verify)
- Test: `tests/test_runtime_registry.py` (already covers most contract)
- Create: `tests/providers/test_first_party_runtimes.py` (new integration tests for local-container and future adapters)

**Interfaces:**
- Consumes: existing `RuntimeProvider` protocol and `RuntimeProviderRegistry` class.
- Produces: a fully registered set of providers (`mock` and `local-container`) with `plan`/`apply_plan` implemented and contract tests green.

- [ ] **Step 1: Verify mock provider plan/apply_plan implementation**

Mock provider already implements `plan` and `apply_plan` (lines 111-120 in `mock.py`). Run the existing contract test to confirm:

```bash
cd apps/opensible-server && .venv/bin/pytest tests/test_runtime_registry.py -v
```

Expected: all tests pass, including those that exercise plan/apply_plan.

- [ ] **Step 2: Add plan/apply_plan stubs to local_container.py**

Open `services/runtime_providers/local_container.py` and add:

```python
def plan(self, operation_id: str, spec: dict[str, Any], *, timeout: float | None = None) -> ProviderResult:
    return ProviderResult.failed("plan", "PROVIDER_DISABLED", "local container provider is disabled", provider_id=self.id, operation_id=operation_id)

def apply_plan(self, operation_id: str, spec: dict[str, Any], plan_fingerprint: str, *, idempotency_key: str | None = None, timeout: float | None = None) -> ProviderResult:
    return ProviderResult.failed("apply_plan", "PROVIDER_DISABLED", "local container provider is disabled", provider_id=self.id, operation_id=operation_id)
```

Also add `plan: False` and `apply_plan: False` to the `capabilities()` method.

- [ ] **Step 3: Run full runtime registry tests**

```bash
cd apps/opensible-server && .venv/bin/pytest tests/test_runtime_registry.py -q
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add services/runtime_providers/local_container.py tests/test_runtime_registry.py
git commit -m "feat(runtime): add plan/apply_plan stubs to local-container provider"
```

---
## Task 1.2: Integrate Service Instance API with Worker Queue

**Files:**
- Modify: `services/service_operation_runner.py` (ensure `execute_claimed` uses correct provider invocation)
- Modify: `api/service_instance_routes.py` (already creates operations; verify idempotency and conflict handling)
- Create: `tests/test_service_instance_worker_integration.py` (new tests for worker claiming and execution)

**Interfaces:**
- Consumes: `service_operations.create_operation`, `service_operation_runner.claim_next_operation`, `service_operation_runner.finish_operation`, `runtime_registry.invoke`.
- Produces: a fully functional worker claim/execute/finish loop for service operations.

- [ ] **Step 1: Verify existing service operation creation**

Check that `api/service_instance_routes.py` already calls `service_operations.create_instance_and_deploy` and returns an `operation_response`. Run the existing integration test:

```bash
cd apps/opensible-server && .venv/bin/pytest tests/test_service_instance_routes.py -v
```

Expected: all tests pass.

- [ ] **Step 2: Write a worker claim test**

Create `tests/test_service_operation_runner.py` (or add to it) with:

```python
def test_claim_and_execute_mock_provider(tmp_path, monkeypatch):
    from services import service_operation_runner, service_instances, service_operations
    from storage import pg

    # Insert a user, org, project, and service instance
    # Create a queued operation
    # Call claim_next_operation and verify it returns a payload
    # Call execute_claimed and verify it finishes successfully
    # Assert the instance status updated to running
```

- [ ] **Step 3: Implement execute_claimed path for mock provider**

The existing `service_operation_runner.execute_claimed` already uses `runtime_registry.invoke`. Ensure the mock provider is registered and that the operation payload includes the necessary `spec` and `runtime_id`.

If the method is missing any fields, add them to `_payload` in `service_operation_runner.py`.

- [ ] **Step 4: Run worker integration tests**

```bash
cd apps/opensible-server && .venv/bin/pytest tests/test_service_operation_runner.py -q
```

Expected: tests pass (claim → execute → finish with success).

- [ ] **Step 5: Commit**

```bash
git add services/service_operation_runner.py tests/test_service_operation_runner.py
git commit -m "feat(worker): integrate service operation runner with mock provider"
```

---
## Task 1.3: Console UI for Service Management

**Files:**
- Modify: `apps/radas-console/src/routes/projects/$projectId/services/index.tsx` (list services, status badges)
- Modify: `apps/radas-console/src/routes/projects/$projectId/services/new.tsx` (catalog selection, configuration form)
- Modify: `apps/radas-console/src/routes/projects/$projectId/services/$serviceId.tsx` (detail view, operation panel)
- Create: `apps/radas-console/src/components/services/ServiceOperationProgress.tsx` (polling progress bar/logs)
- Modify: `apps/radas-console/src/lib/query.ts` (add service API query/mutation hooks)

**Interfaces:**
- Consumes: `api` client and existing `Card`, `Button`, `Badge` components.
- Produces: project-scoped service workspace with create, list, detail, and operation monitoring.

- [ ] **Step 1: Update service list page**

In `routes/projects/$projectId/services/index.tsx`, ensure the page:
- Fetches services via `GET /api/projects/${projectId}/services`
- Displays each service with name, status, environment, and a link to detail
- Shows a "New Service" button that navigates to `/projects/${projectId}/services/new`

- [ ] **Step 2: Update service creation page**

In `routes/projects/$projectId/services/new.tsx`:
- Fetch catalog definitions via `GET /api/catalog`
- Display a grid of catalog cards (n8n, PostgreSQL, etc.)
- On selection, show a configuration form with inputs from the manifest
- Call `POST /api/projects/${projectId}/services` with the normalized spec
- Handle `deploy` option and idempotency key

- [ ] **Step 3: Add operation progress component**

Create `components/services/ServiceOperationProgress.tsx`:
- Poll `GET /api/projects/${projectId}/services/${serviceId}/operations/${operationId}` every 2 seconds
- Show status badge, elapsed time, and error message if failed
- Display event logs via `GET .../operations/${operationId}/events`

- [ ] **Step 4: Update service detail page**

In `routes/projects/$projectId/services/$serviceId.tsx`:
- Show service metadata (name, status, endpoint, revision)
- Show latest operation and link to operation progress
- Add action buttons: start, stop, restart, destroy (with confirmation)
- Use the existing `Drawer` and `ConfirmDialog` for destructive actions

- [ ] **Step 5: Typecheck and build**

```bash
cd apps/radas-console && pnpm typecheck && pnpm build
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/radas-console/src/routes/projects/$projectId/services/ apps/radas-console/src/components/services/
git commit -m "feat(console): add service management UI"
```

---
## Task 1.4: Seed Catalog with Service Definitions

**Files:**
- Modify: `services/service_catalog.py` (ensure `seed_recommended_definitions` exists and is idempotent)
- Create: `services/catalog_definitions.py` (new file with recommended definition manifests)
- Modify: `storage/pg_schema.py` (ensure v3 migrations are applied, but seed is separate)

**Interfaces:**
- Consumes: `service_catalog` functions.
- Produces: a seeded set of recommended catalog definitions (n8n, PostgreSQL, Redis, MinIO, WordPress, etc.)

- [ ] **Step 1: Create catalog_definitions.py with manifests**

Write a dictionary of recommended definitions, each with:
- `slug`, `name`, `category`, `summary`, `version`
- `runtime`, `image`, `production_ready`, `persistence`
- `inputs`, `secrets`, `storage`, `healthcheck`, `outputs`

Example for n8n:

```python
N8N_DEFINITION = {
    "slug": "n8n",
    "name": "n8n",
    "category": "automation",
    "summary": "Workflow automation and integrations",
    "version": "1.0.0",
    "runtime": "container",
    "image": "n8nio/n8n:latest",
    "production_ready": False,
    "persistence": "required",
    "inputs": [
        {"name": "hostname", "type": "domain", "required": False},
        {"name": "memory_mb", "type": "integer", "default": 1024, "min": 256},
        {"name": "port", "type": "port", "default": 5678},
    ],
    "secrets": [{"name": "encryption_key", "required": True}],
    "storage": [{"name": "data", "size_gb": 10, "mount_path": "/data", "required": True}],
    "healthcheck": {"path": "/healthz", "port": 5678, "interval_seconds": 30},
    "outputs": ["endpoint", "admin_url"],
}
```

- [ ] **Step 2: Seed definitions in service_catalog.py**

Add a function `seed_recommended_definitions()` that:
- Checks if any definitions already exist (by slug/version)
- Inserts only missing definitions using `publish_definition`
- Is idempotent (can be called multiple times)

- [ ] **Step 3: Call seed during server startup (optional)**

In `app.py`, after schema migrations, call `service_catalog.seed_recommended_definitions()` if enabled via env var or explicitly.

- [ ] **Step 4: Test seed**

Write a test in `tests/test_service_catalog.py`:

```python
def test_seed_recommended_definitions_is_idempotent(data_dir, pg_db):
    from services import service_catalog
    first = service_catalog.seed_recommended_definitions()
    second = service_catalog.seed_recommended_definitions()
    assert len(first) == len(second)
    assert service_catalog.list_definitions() == first
```

- [ ] **Step 5: Commit**

```bash
git add services/catalog_definitions.py services/service_catalog.py tests/test_service_catalog.py
git commit -m "feat(catalog): seed recommended service definitions"
```

---
## Verification Gates

Run all verification commands after each task. Before merging the full Phase 1, run the entire suite:

```bash
cd apps/opensible-server && .venv/bin/pytest -q
cd apps/radas-console && pnpm typecheck && pnpm build
cd ../.. && git diff --check
```

Ensure:
- All backend tests pass (including runtime registry, service instances, operations)
- Console typecheck and build succeed
- No uncommitted whitespace or merge conflicts

---
## Execution Order

1. Task 1.1 – Harden Runtime Provider Interface and Registry
2. Task 1.2 – Integrate Service Instance API with Worker Queue
3. Task 1.3 – Console UI for Service Management
4. Task 1.4 – Seed Catalog with Service Definitions

Each task is independently testable and should be committed before starting the next.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-20-phase1-service-catalog.md`. Two execution options:**

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**