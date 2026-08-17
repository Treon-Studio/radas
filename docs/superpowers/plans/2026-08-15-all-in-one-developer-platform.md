# RADAS All-in-One Developer Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a project-centric, multi-tenant all-in-one developer platform where a user enters an authorized project and can create, deploy, operate, update, observe, and destroy services inside that project without leaving the RADAS workspace.

**Architecture:** RADAS remains a self-contained control plane and source of truth. The primary user journey is `Organization → Project → Service → Environment → Deployment`; project is the operational boundary for services, infrastructure, secrets, deployments, logs, endpoints, usage, and access checks. The console provides one project-centric developer workspace; the Flask server owns tenant-scoped APIs, service catalog/instances, policy, secrets, audit, and job orchestration; the Go worker executes provider-specific jobs. RADAS manages its own runtimes through OpenTofu, Ansible, Kubernetes, Docker/Podman, and first-party adapters; it does not connect to, depend on, or delegate deployment to SumoPod. The first delivery is one complete project vertical slice (open project → choose service → configure → review → deploy → endpoint/logs/health → update/rollback → destroy), followed by platform capabilities that reuse the same models.

**Tech Stack:** React 19 + TanStack Router/Query (`apps/radas-console`), Flask/Python 3.14 (`apps/opensible-server`), PostgreSQL/Neon with versioned schema migrations, Go worker (`apps/opensible-worker`), OpenTofu/Ansible/Kubernetes/Docker/Podman adapters, existing RBAC/org/project/audit/secrets infrastructure.

## Global Constraints

- **PostgreSQL is mandatory.** `DATABASE_URL` is required; schema changes go through `apps/opensible-server/storage/pg_schema.py` migrations, never ad-hoc production tables.
- **Dependency flow remains `apps → modules → packages`;** do not introduce imports from `packages` into `modules` or broken `@radas/*` aliases.
- **All new API endpoints require JWT authentication and tenant/project authorization.** Never trust a project/org/provider identifier supplied by the browser without server-side authorization.
- **All mutating operations are idempotent and asynchronous where they touch infrastructure.** Return a stable operation/job ID, prevent duplicate execution, and expose status/logs/retry.
- **Secrets never appear in logs, audit diffs, URLs, client query keys, or ordinary API responses.** Store encrypted secret values and return references/metadata only.
- **Provider integrations are additive.** Existing OpenTofu/Ansible stack APIs and worker contracts must continue to work; new service APIs must not silently change existing response shapes.
- **Every service lifecycle transition is audited with actor, tenant, project, service instance, operation ID, before/after status, and redacted metadata.**
- **Console UX must distinguish loading, empty, error, and forbidden states;** destructive or production-affecting actions require explicit impact-aware confirmation.
- **Use the repository toolchain:** console `pnpm typecheck` and `pnpm build`; backend `.venv/bin/pytest`, `.venv/bin/python -m compileall`; run commands from the package directory, not the repository root.
- **Do not deploy or push during implementation tasks** until the full verification gate and final review pass.
- **RADAS does not connect to SumoPod.** Do not add SumoPod API clients, runtime adapters, provider credentials, reverse-engineered endpoints, or operational dependencies. RADAS owns and operates its own runtime/provider adapters.

---

## Project-centric product contract

The core UX contract is deliberately simple:

```text
1. User signs in.
2. User selects an organization and opens an authorized project.
3. Project overview is the home for that project's services, infrastructure, environments, deployments, configuration, observability, and governance.
4. User selects Services → New service.
5. User chooses a catalog definition, configures it for one environment/runtime, reviews the impact, and deploys.
6. RADAS returns an async operation; the user stays in the project and watches progress/logs.
7. When healthy, the service exposes endpoint/health/resource information inside the project.
8. Later changes create a new immutable revision; update, rollback, restart, stop, and destroy remain project-scoped operations.
```

A user must never need to understand internal worker IDs, raw OpenTofu/Ansible commands, provider credentials, or global storage scopes to complete the first deployment. Advanced infrastructure details remain available as progressive disclosure for operators.

The project overview must make the following hierarchy visible:

```text
Project: Treon Website
├── Environment: development
│   └── Services
├── Environment: staging
│   └── Services
├── Environment: production
│   └── Services
├── Infrastructure
├── Deployments
├── Secrets & configuration
└── Activity / audit
```

Every project-scoped service request must derive and verify `org_id` server-side from the project. The browser may select a project route, but it cannot move a service, secret, operation, or endpoint into another project by supplying an arbitrary organization identifier.

## Initial service catalog

The first catalog should be intentionally simple and familiar to users of one-click deployment platforms. These are **RADAS-owned service definitions**, not integrations with SumoPod and not copied runtime internals. Each entry is a versioned manifest that RADAS deploys through its own Docker/Podman, Kubernetes, OpenTofu, or Ansible adapter.

### MVP catalog groups

| Group | Initial services | Purpose |
|---|---|---|
| Automation | **n8n**, **Activepieces** | Workflow automation and integrations |
| Messaging/API | **WAHA Plus** | WhatsApp HTTP API service; deployment availability depends on image/license policy |
| Data | **PostgreSQL**, **Redis** | Relational database and cache/queue |
| Storage | **MinIO** | S3-compatible object storage for development and internal workloads |
| Observability | **Uptime Kuma**, **Grafana** | Endpoint monitoring and dashboards |
| Web | **WordPress**, **Static web app**, **Custom container** | Simple application/site deployment |

The catalog UI should initially present six to eight recommended cards, not a large provider matrix. Each card must show: service name, one-sentence purpose, runtime compatibility, minimum resources, persistence requirement, exposed ports/endpoints, and whether the service is suitable for production. `Custom container` remains an advanced escape hatch, not the default path.

### Service selection UX

```text
Project → Services → New service
→ Recommended services
   [n8n] [Activepieces] [PostgreSQL] [Redis]
   [MinIO] [Uptime Kuma] [WordPress] [Custom container]
→ Configure only the selected service's inputs
→ Review resources, persistence, secrets, endpoint, and environment
→ Deploy
```

The catalog must not expose raw Docker commands or provider credentials in the primary flow. Advanced users may open a manifest/provider details panel, while ordinary users see friendly fields such as `Admin URL`, `Persistent storage`, `Database password`, `Public endpoint`, and `Resource size`.

A service definition must declare whether it is:

- **Stateless** or **persistent**;
- safe for development only or production-capable;
- dependent on a database, cache, storage, domain, or secret;
- deployable on Docker/Podman, Kubernetes, OpenTofu, and/or Ansible;
- eligible for start/stop/restart/update/rollback/destroy;
- able to report health, logs, endpoints, and resource usage.

The initial catalog is a product seed, not an implicit production deployment. Every image, version, license, default, health check, and resource minimum must be reviewed and pinned in the manifest before it is published.

## Product shape and bounded domains

RADAS should present one coherent navigation model:

```text
Workspace
├── Projects
│   └── Project workspace
│       ├── Services (catalog + deployed instances)
│       ├── Infrastructure (stacks, hosts, Kubernetes)
│       ├── Code & sources (Git repositories, templates)
│       ├── Environments (dev/staging/prod/preview)
│       ├── Deployments (pipeline + execution history)
│       ├── Configuration & secrets
│       ├── Observability (logs, health, events)
│       └── Governance (members, approvals, policies, audit)
├── Organization
│   ├── Members/RBAC
│   ├── Providers/runtime connections
│   ├── Quotas and usage
│   └── Billing-ready usage records
└── Platform administration
    ├── Service catalog definitions
    ├── Workers/runtimes
    └── System settings
```

The core domain entities are:

```text
service_definitions       reusable catalog entry and versioned manifest
service_instances         one deployed service inside a project/environment
service_revisions         immutable desired configuration snapshots
service_operations        async deploy/update/start/stop/restart/destroy jobs
service_endpoints         internal/public URL, port, health and TLS metadata
service_bindings          dependency links to database/cache/volume/network services
service_secrets           encrypted values or references scoped to instance/environment
runtime_connections       authorized provider/runtime credentials and capabilities
usage_records             resource/time/event usage, not billing charges yet
```

Existing `projects`, `orgs`, `org_members`, `stack_meta`, `executions`, worker, audit, secrets, and provider structures remain authoritative where their semantics already fit. New service entities must include `org_id`, `project_id`, and `environment` (or derive them immutably from the instance owner) and must never use a global fallback for a tenant-scoped request.

---

## Phase 0 — Product foundation and contract inventory

### Task 0.1: Freeze current contracts and define the platform glossary

**Files:**
- Create: `docs/architecture/all-in-one-platform.md`
- Create: `docs/architecture/service-platform-glossary.md`
- Modify: `docs/ROADMAP.md` (add a new All-in-One Developer Platform section and link this plan)
- Inspect: `apps/opensible-server/api/*_routes.py`, `apps/opensible-server/services/*`, `apps/radas-console/src/routes/*`

**Deliverable:** a current-state contract map, not aspirational architecture. Document exact ownership of projects, stacks, executions, workers, secrets, Git sources, environments, approvals, audit, and feature flags. Define these user-facing terms consistently: Project, Environment, Service, Stack, Deployment, Runtime, Endpoint, Secret, Revision, Operation.

- [ ] Inventory existing endpoints and identify which are project-scoped, org-scoped, global, or legacy.
- [ ] Document the compatibility boundary: existing `/api/cloud/stacks`, `/api/executions`, Ansible routes, worker routes, auth/org/project routes remain supported.
- [ ] Define status vocabularies and transition rules for service instances and operations.
- [ ] Add the roadmap section with explicit statuses `⬜` rather than marking future functionality complete.
- [ ] Verify links and terminology with `rg` and `git diff --check`.

**Acceptance criteria:** a new engineer can identify the canonical project/tenant scope, async operation contract, and provider boundary without reading implementation internals.

### Task 0.2: Establish an API error and operation envelope for new platform APIs

**Files:**
- Create: `apps/opensible-server/api/platform_contracts.py`
- Modify: `apps/opensible-server/api/misc_routes.py` or existing error registration location
- Create: `apps/opensible-server/tests/test_platform_contracts.py`

**Interfaces:**

```python
# New endpoints use these shapes; existing endpoints remain backward-compatible.
{"data": {...}, "request_id": "..."}
{"error": {"code": "SERVICE_OPERATION_CONFLICT", "message": "...", "details": {...}}, "request_id": "..."}
{"operation": {"id": "...", "kind": "service.deploy", "status": "queued", "poll_url": "..."}}
```

- [ ] Add helpers for success/error/operation responses and request ID extraction/generation.
- [ ] Ensure provider stderr is stored in operation logs but user-facing messages redact credentials and sensitive variables.
- [ ] Add tests for 400/401/403/404/409/422/429/500 envelope shape and request ID propagation.
- [ ] Do not retrofit every legacy route in this task; new service APIs must use the contract.

**Verification:** `.venv/bin/pytest -q tests/test_platform_contracts.py`; `.venv/bin/python -m compileall -q api`.

---

## Phase 1 — Service catalog and runtime adapter foundation

### Task 1.1: Add versioned service definition schema and simple recommended catalog

**Files:**
- Create: `apps/opensible-server/services/service_catalog.py`
- Create: `apps/opensible-server/schemas/service_definition.py`
- Create: `apps/opensible-server/api/service_catalog_routes.py`
- Modify: `apps/opensible-server/api/__init__.py` (register blueprint)
- Modify: `apps/opensible-server/storage/pg_schema.py` (migration for `service_definitions` and `service_definition_versions`)
- Create: `apps/opensible-server/tests/test_service_catalog.py`

**Interfaces:**

```python
list_definitions(org_id, *, include_disabled=False) -> list[dict]
get_definition(slug, version=None) -> dict | None
publish_definition(manifest, actor, org_id) -> dict
validate_manifest(manifest) -> list[dict]
```

Manifest v1 must support the recommended catalog entries (`n8n`, `activepieces`, `waha-plus`, `postgresql`, `redis`, `minio`, `uptime-kuma`, `grafana`, `wordpress`, `static-web`, and `custom-container`) and declare:

```yaml
slug: n8n
name: n8n
category: automation
summary: Workflow automation and integrations
version: 1.0.0
runtime: container
image: n8nio/n8n:latest
production_ready: false
persistence: required
inputs:
  - {name: hostname, type: domain, required: false}
  - {name: memory_mb, type: integer, default: 1024, min: 256}
secrets:
  - name: encryption_key
storage:
  - {name: data, size_gb: 10, required: true}
healthcheck: {path: /healthz, port: 5678, interval_seconds: 30}
outputs: [endpoint, admin_url]
```

- [ ] Validate slug/version/runtime/image, input types/ranges, secret names, storage, healthcheck, and output declarations server-side.
- [ ] Store immutable versions; publishing a new version must not mutate an existing deployed revision.
- [ ] Scope private definitions to organization; platform definitions may be globally readable but mutations require admin.
- [ ] Add GET list/detail routes first; add publish route only for authorized catalog publishers.
- [ ] Seed the recommended definitions through an explicit, versioned catalog seed/migration: n8n, Activepieces, WAHA Plus, PostgreSQL, Redis, MinIO, Uptime Kuma, Grafana, WordPress, Static web app, and Custom container.
- [ ] Keep catalog seed idempotent; never auto-deploy a service or create a runtime resource during server startup.
- [ ] Mark each entry with category, summary, persistence, minimum resources, production readiness, supported runtimes, required secrets, health check, and exposed endpoint metadata.
- [ ] Seed one harmless catalog definition in tests only when testing isolation; production catalog publication must be an explicit migration/administrative action.

**Acceptance criteria:** catalog definitions are versioned, validated, tenant-authorized, independent from provider-specific deployment code, and visible as a small recommended-card set inside an authorized project—not as an unexplained provider matrix.

### Task 1.2: Define the runtime provider interface and capability negotiation

**Files:**
- Create: `apps/opensible-server/services/runtime_provider.py`
- Create: `apps/opensible-server/services/runtime_registry.py`
- Create: `apps/opensible-server/services/runtime_providers/mock.py`
- Create: `apps/opensible-server/services/runtime_providers/local_container.py`
- Create: `apps/opensible-server/tests/test_runtime_registry.py`

**Interfaces:**

```python
class RuntimeProvider(Protocol):
    id: str
    def capabilities(self) -> dict: ...
    def validate(self, spec: dict) -> list[dict]: ...
    def deploy(self, operation_id: str, spec: dict) -> ProviderResult: ...
    def update(self, operation_id: str, spec: dict) -> ProviderResult: ...
    def start(self, operation_id: str, instance: dict) -> ProviderResult: ...
    def stop(self, operation_id: str, instance: dict) -> ProviderResult: ...
    def restart(self, operation_id: str, instance: dict) -> ProviderResult: ...
    def destroy(self, operation_id: str, instance: dict) -> ProviderResult: ...
    def status(self, instance: dict) -> ProviderResult: ...
    def logs(self, instance: dict, cursor: str | None = None) -> ProviderLogPage: ...
```

- [ ] Make provider operations accept a normalized `spec` and return redacted structured results, not provider-specific response objects.
- [ ] Add capability flags: `deploy`, `update`, `start`, `stop`, `restart`, `destroy`, `logs`, `healthcheck`, `public_endpoint`.
- [ ] Register a deterministic mock provider for tests and local container provider behind an explicit configuration flag.
- [ ] Do not invoke Docker/Podman in unit tests; use the mock provider and contract tests.
- [ ] Keep the runtime registry extensible for future first-party RADAS adapters; do not add third-party platform connectors.

**Verification:** runtime registry contract tests cover unsupported capability, timeout, provider error redaction, and idempotency key forwarding.

### Task 1.3: Add service and operation database models

**Files:**
- Modify: `apps/opensible-server/storage/pg_schema.py` (new migration)
- Create: `apps/opensible-server/services/service_instances.py`
- Create: `apps/opensible-server/services/service_operations.py`
- Create: `apps/opensible-server/tests/test_service_instances.py`

**Schema:**

```sql
service_instances(
  id text primary key,
  org_id text not null,
  project_id text not null,
  name text not null,
  definition_slug text not null,
  definition_version text not null,
  environment text not null,
  runtime_id text not null,
  status text not null,
  desired_revision_id text,
  provider_ref jsonb,
  endpoint_summary jsonb,
  archived boolean not null default false,
  created_by text,
  created_at double precision not null,
  updated_at double precision not null,
  unique(project_id, environment, name)
)

service_revisions(
  id text primary key,
  instance_id text not null,
  revision_number integer not null,
  spec jsonb not null,
  redacted_spec jsonb not null,
  created_by text,
  created_at double precision not null,
  unique(instance_id, revision_number)
)

service_operations(
  id text primary key,
  org_id text not null,
  project_id text not null,
  instance_id text,
  kind text not null,
  idempotency_key text not null,
  status text not null,
  requested_by text,
  error_code text,
  error_message text,
  started_at double precision,
  finished_at double precision,
  created_at double precision not null,
  unique(project_id, idempotency_key)
)
```

- [ ] Add indexes for `(project_id, environment, status)`, `(instance_id, created_at)`, and operation polling.
- [ ] Enforce allowed statuses in service code: `pending`, `queued`, `running`, `succeeded`, `failed`, `canceled` and instance states `draft`, `provisioning`, `running`, `degraded`, `stopped`, `updating`, `destroying`, `destroyed`, `failed`.
- [ ] Implement idempotent operation creation: same project + idempotency key returns the existing operation unless payload fingerprint conflicts.
- [ ] Store desired revision separately from provider state; never overwrite desired configuration with observed status.
- [ ] Add tenant/project access tests and conflict tests.

---

## Phase 2 — First vertical slice: catalog service to deployed instance

### Task 2.1: Add service-instance API and spec validation

**Files:**
- Create: `apps/opensible-server/api/service_instance_routes.py`
- Modify: `apps/opensible-server/api/__init__.py`
- Create: `apps/opensible-server/tests/test_service_instance_routes.py`

**Interfaces:**

```text
GET    /api/projects/<project_id>/services
POST   /api/projects/<project_id>/services
GET    /api/projects/<project_id>/services/<service_id>
PATCH  /api/projects/<project_id>/services/<service_id>
POST   /api/projects/<project_id>/services/<service_id>/operations/deploy
POST   /api/projects/<project_id>/services/<service_id>/operations/start
POST   /api/projects/<project_id>/services/<service_id>/operations/stop
POST   /api/projects/<project_id>/services/<service_id>/operations/restart
POST   /api/projects/<project_id>/services/<service_id>/operations/destroy
GET    /api/projects/<project_id>/services/<service_id>/operations
GET    /api/projects/<project_id>/services/<service_id>/impact
```

- [ ] Require `environment`, catalog slug/version, runtime ID, and validated input spec on create.
- [ ] Derive `org_id` from the authorized project; reject a body/header org mismatch.
- [ ] Create service instance in `draft`, create revision 1, and return a deploy operation only when explicitly requested.
- [ ] Every operation accepts `Idempotency-Key`; reject concurrent incompatible operations with `409 SERVICE_OPERATION_CONFLICT`.
- [ ] Return endpoint metadata only after provider reports it; return operation polling URL immediately.
- [ ] Add tests for tenant isolation, missing inputs, unsupported runtime capability, duplicate names, idempotent retry, and concurrent deploy conflict.

### Task 2.2: Execute service operations through the existing worker

**Files:**
- Create: `apps/opensible-server/services/service_operation_runner.py`
- Modify: `apps/opensible-server/api/worker_routes.py` or existing queue/claim route to carry service operation payloads
- Modify: `apps/opensible-worker/internal/claim/claim.go`
- Modify: `apps/opensible-worker/internal/execute/execute.go`
- Create: `apps/opensible-worker/internal/serviceops/runner.go`
- Create: `apps/opensible-worker/internal/serviceops/runner_test.go`
- Modify: `apps/opensible-server/tests/test_service_operation_runner.py`

**Interfaces:**

```text
queue operation → worker claim → provider adapter → append redacted logs/events
```

- [ ] Reuse existing queue/claim/heartbeat semantics; do not create a second worker protocol.
- [ ] Persist operation status transitions server-side with compare-and-set semantics.
- [ ] Emit progress events (`queued`, `running`, provider step, health check, `succeeded`/`failed`) and make retries resume or fail safely based on provider capability.
- [ ] Store provider reference, endpoint, health state, and redacted output on success.
- [ ] On failure, retain full operator-readable logs in the existing execution/log mechanism but redact secret values and mark instance `failed` without losing desired revision.
- [ ] Test worker claim exclusivity, cancellation, retry/idempotency, and provider failure.

### Task 2.3: Add a project-centric developer service workspace with one-click catalog cards

**Files:**
- Modify: `apps/radas-console/src/routes/projects/$projectId.tsx` (project overview cards and project-scoped navigation)
- Create: `apps/radas-console/src/routes/projects/$projectId/services/index.tsx`
- Create: `apps/radas-console/src/routes/projects/$projectId/services/new.tsx`
- Create: `apps/radas-console/src/routes/projects/$projectId/services/$serviceId.tsx`
- Create: `apps/radas-console/src/components/services/ServiceCatalogCard.tsx`
- Create: `apps/radas-console/src/components/services/ServiceSpecForm.tsx`
- Create: `apps/radas-console/src/components/services/ServiceOperationPanel.tsx`
- Modify: `apps/radas-console/src/components/app-shell/NavSections.tsx`
- Modify: `apps/radas-console/src/lib/query.ts`

**UX flow:**

```text
Organization → Project → Services → New service
→ Choose catalog template → Configure inputs/secrets/runtime
→ Review project/environment/impact → Deploy
→ Operation progress → endpoint/logs/health
→ Update revision, rollback, restart, stop, or destroy
```

The project route is the entry point for every action. The service list must not be a global catalog with an optional project dropdown: it is rendered inside `/projects/$projectId`, receives the project ID from the route, and scopes all queries/mutations to that project. The catalog is only the selection step inside the project service creation flow.

- [ ] Use existing `Card`, `StateView`, `Drawer`, `ConfirmDialog`, `Badge`, `Input`, and query conventions; do not add a UI dependency.
- [ ] Render simple recommended cards first: n8n, Activepieces, WAHA Plus, PostgreSQL, Redis, MinIO, Uptime Kuma, Grafana, WordPress, Static web app, and Custom container.
- [ ] Each card shows purpose, persistence, minimum resources, production-readiness badge, and a single `Deploy`/`Use template` action.
- [ ] Keep the first form short: service name, environment, runtime, catalog inputs, storage, and secret references; place advanced provider fields behind disclosure.
- [ ] Service-specific forms must only show relevant fields: n8n workflow URL/credentials/storage, PostgreSQL database/user/password/storage, Redis persistence/password, MinIO root credentials/storage, and web/container image/port/domain fields. Never show an undifferentiated form with dozens of provider variables.
- [ ] Always show a review summary before deploy: project/environment/runtime, resource estimate, secrets by name only, and irreversible effects.
- [ ] Show service status, desired version, observed health, endpoint copy action, latest operation, logs, and rollback/update controls.
- [ ] Distinguish “service unavailable,” “no services,” “operation running,” and “deployment failed” with retry/action guidance.
- [ ] Ensure mobile navigation exposes Services and all operation controls are keyboard accessible.
- [ ] Add a local mock API fixture or route-level test only if an existing console test harness exists; otherwise verify with typecheck/build and browser smoke.

**Acceptance criteria for the vertical slice:** a test user can sign in, open an authorized project, navigate to that project’s Services area, select a catalog service, configure it for an environment, deploy it through the mock runtime, see a running instance and endpoint, inspect operation logs, update a revision, retry a failed operation, and destroy it with explicit confirmation—all project/tenant-scoped and auditable. A second organization cannot read, operate, or infer the first organization’s service instances, endpoints, operations, logs, or secret metadata.

---

## Phase 3 — Make it an all-in-one developer workspace

### Task 3.1: Environments, configuration, and secret references

**Files:**
- Create/modify: `apps/opensible-server/services/environment_service.py`
- Create: `apps/opensible-server/api/environment_routes.py`
- Modify: `apps/opensible-server/storage/pg_schema.py`
- Reuse/extend: existing `storage/kv.py`, secret encryption/global/project secret services
- Create: `apps/opensible-server/tests/test_environment_routes.py`
- Modify: service form/detail console components

- [ ] Add environment records per project (`dev`, `staging`, `prod`, `preview`) with protected-production metadata.
- [ ] Service revisions reference secret IDs/names, never plaintext values in revision JSON.
- [ ] Add environment variable overlays with explicit precedence and redacted diff.
- [ ] Require approval/policy for production service operations using existing approval/policy primitives.
- [ ] Add environment selector to the service workspace and make status/endpoint/log queries environment-scoped.

### Task 3.2: Git sources and developer workflow integration

**Files:**
- Reuse: `apps/opensible-server/services/git_source_manager.py`, `api/sources_routes.py`, `api/github_oauth_routes.py`, existing GitHub Actions routes
- Create: `apps/opensible-server/services/service_source.py`
- Create: `apps/opensible-server/api/service_source_routes.py`
- Modify: `apps/radas-console/src/routes/projects/$projectId.tsx` and service detail UI
- Create: `apps/opensible-server/tests/test_service_source_routes.py`

- [ ] Connect a service instance to a repository/branch/path and record source revision.
- [ ] Support “deploy from commit” as an operation with immutable source metadata.
- [ ] Reuse GitHub connection tenancy; do not store PATs in service specs or logs.
- [ ] Expose source, commit, diff/plan summary, and deploy trigger in the service detail page.
- [ ] Keep provider deploy and GitHub workflow execution as separate operation kinds with a common timeline.

### Task 3.3: CI/CD pipelines and promotion

**Files:**
- Reuse: `apps/opensible-server/api/cicd_routes.py`, `api/github_actions_routes.py`, existing approval/promotion routes
- Create: `apps/opensible-server/services/service_pipeline.py`
- Create: `apps/opensible-server/api/service_pipeline_routes.py`
- Create: `apps/radas-console/src/components/services/ServicePipelinePanel.tsx`
- Create: `apps/opensible-server/tests/test_service_pipeline.py`

- [ ] Model pipeline stages as `validate → plan/build → approval → deploy → health check → promote`.
- [ ] Attach all stages to one service operation/deployment ID and audit timeline.
- [ ] Add promotion `dev → staging → prod` only when revision and policy checks pass.
- [ ] Support manual approval, retry failed stage, cancel, and rollback to last healthy revision.
- [ ] Do not make production auto-deploy the default; require explicit project policy.

### Task 3.4: Observability and operational UX

**Files:**
- Reuse: existing execution/log/SSE routes and worker heartbeat mechanisms
- Create: `apps/opensible-server/services/service_health.py`
- Create: `apps/opensible-server/api/service_observability_routes.py`
- Create: `apps/radas-console/src/components/services/ServiceHealthPanel.tsx`
- Create: `apps/radas-console/src/components/services/ServiceLogsPanel.tsx`
- Create: `apps/opensible-server/tests/test_service_observability.py`

- [ ] Add health checks from catalog manifest and persist current/last-known health with timestamps.
- [ ] Add service logs with cursor/SSE where runtime supports it; fallback to bounded polling.
- [ ] Show deployment timeline, current health, last failure, endpoint, resource summary, and provider reference.
- [ ] Redact secret-like patterns in streamed and stored logs.
- [ ] Add alerts/webhooks using existing dispatcher/notification infrastructure rather than a second notification system.

### Task 3.5: Resource governance, usage, and billing-ready records

**Files:**
- Create: `apps/opensible-server/services/usage_service.py`
- Create: `apps/opensible-server/api/usage_routes.py`
- Modify: `apps/opensible-server/storage/pg_schema.py`
- Create: `apps/opensible-server/tests/test_usage_service.py`
- Modify: console project overview/cost pages

- [ ] Record normalized usage snapshots: service instance, runtime, CPU/memory/storage requested, running seconds, provider cost metadata if available.
- [ ] Reuse existing quota routes/policy model for preflight checks before deploy.
- [ ] Make quotas fail closed before provider calls and explain the blocking resource/cost.
- [ ] Do not charge money or integrate payment processing in this phase; expose billing-ready usage export only.
- [ ] Add organization/project rollups without cross-tenant leakage.

---

## Phase 4 — Provider ecosystem and platform extensibility

### Task 4.1: Add provider connection management

**Files:**
- Create: `apps/opensible-server/services/runtime_connections.py`
- Create: `apps/opensible-server/api/runtime_connection_routes.py`
- Modify: `apps/opensible-server/storage/pg_schema.py`
- Create: `apps/opensible-server/tests/test_runtime_connections.py`
- Create/modify: console organization/provider settings pages

- [ ] Store encrypted runtime credentials and capabilities per organization.
- [ ] Separate “provider configured” from “provider healthy”; add test connection operation.
- [ ] Require owner/admin for connection mutations; never return credentials.
- [ ] Add audit and rotation metadata.

### Task 4.2: Implement existing-runtime adapters

**Files:**
- Create: `apps/opensible-server/services/runtime_providers/opentofu.py`
- Create: `apps/opensible-server/services/runtime_providers/ansible.py`
- Create: `apps/opensible-server/services/runtime_providers/kubernetes.py`
- Modify: `apps/opensible-server/services/runtime_registry.py`
- Create: provider contract tests under `apps/opensible-server/tests/providers/`

- [ ] Map service manifest specs to provider-specific plans/manifests without leaking provider details into the API.
- [ ] Reuse existing stack/playbook execution and locks where possible.
- [ ] Preserve plan-before-apply for infrastructure-backed services.
- [ ] Add provider capability matrices and clear unsupported-operation errors.

### Task 4.3: Harden first-party runtime adapters and provider independence

**Files:**
- Create: `apps/opensible-server/services/runtime_providers/container.py`
- Create: `apps/opensible-server/services/runtime_providers/kubernetes.py`
- Create: `apps/opensible-server/services/runtime_providers/opentofu.py`
- Create: `apps/opensible-server/services/runtime_providers/ansible.py`
- Modify: `apps/opensible-server/services/runtime_registry.py`
- Create: `apps/opensible-server/tests/providers/test_first_party_runtimes.py`
- Create: `docs/architecture/runtime-providers.md`

- [ ] Keep all runtime execution inside RADAS-managed infrastructure and the existing Go worker boundary.
- [ ] Map service manifests to Docker/Podman, Kubernetes, OpenTofu, or Ansible operations through the normalized runtime interface.
- [ ] Store provider references and capabilities using RADAS-owned adapters; never add a SumoPod endpoint or credential.
- [ ] Test provider capability negotiation, plan/apply separation, timeout, retry, log redaction, and destroy safeguards with mock runtimes.
- [ ] Document how organizations register their own first-party runtime connection without coupling the platform to a third-party PaaS.

---

## Phase 5 — Collaboration, marketplace, and commercial readiness

### Task 5.1: Developer workspace collaboration and change review

**Files:**
- Reuse: org membership/RBAC/audit/approval services
- Create: `apps/opensible-server/services/change_requests.py`
- Create: `apps/opensible-server/api/change_request_routes.py`
- Create: `apps/radas-console/src/components/services/ChangeReviewPanel.tsx`
- Create: `apps/opensible-server/tests/test_change_requests.py`

- [ ] Add reviewable service revision/change request with diff, risk, policy results, approvers, and immutable decision history.
- [ ] Enforce project/environment roles and production approval.
- [ ] Make “deploy” from a reviewed change request idempotent and linked to the approved revision.
- [ ] Notify existing in-app/webhook channels without creating a second event model.

### Task 5.2: Public/private service catalog publishing

**Files:**
- Modify: catalog service/routes/schema
- Create: `apps/radas-console/src/routes/system/catalog.tsx`
- Create: `apps/radas-console/src/components/catalog/DefinitionEditor.tsx`
- Create: `apps/opensible-server/tests/test_catalog_publishing.py`

- [ ] Support organization-private and platform-published definitions with ownership/version/deprecation metadata.
- [ ] Validate manifests in CI before publishing.
- [ ] Add safe deprecation: existing instances continue on pinned versions; new deployments cannot select deprecated versions unless explicitly allowed.
- [ ] Add security review metadata for images/scripts and allowed registries.

### Task 5.3: Quotas, plans, and billing integration boundary

**Files:**
- Reuse: usage/quota services and organization routes
- Create: `apps/opensible-server/services/billing_adapter.py`
- Create: `apps/opensible-server/api/billing_routes.py`
- Create: `apps/opensible-server/tests/test_billing_adapter.py`
- Modify: organization/cost console surfaces

- [ ] Define plan/quota interfaces and usage export before choosing a payment provider.
- [ ] Keep billing provider calls behind an adapter and make usage records authoritative.
- [ ] Handle quota exhaustion, grace period, suspension, and resume as explicit state transitions.
- [ ] Do not store payment secrets or card data in RADAS.

---

## Verification and delivery gates

Every task must run its focused tests before commit. The complete platform MVP gate is:

```bash
cd apps/opensible-server
.venv/bin/pytest -q
.venv/bin/python -m compileall -q services api app.py

cd ../radas-console
pnpm typecheck
pnpm build

cd ../..
git diff --check
./scripts/vulnerability-scan.sh
```

Before merging the vertical slice:

- Create two organizations and verify one cannot list/read/mutate the other’s service or operation.
- Create one project with `dev`, `staging`, and protected `prod` environments.
- Deploy the same catalog service twice with the same idempotency key and verify one operation/instance revision is created.
- Force provider failure and verify desired revision remains, operation is failed, secrets are absent from logs, and retry behavior is explicit.
- Verify service endpoint/health/logs are tenant-scoped and stop/destroy require appropriate confirmation.
- Verify production deploy requires approval and cannot bypass policy via a direct API call.
- Verify worker disconnect/restart does not lose or duplicate an operation.
- Verify catalog version pinning and update/rollback behavior.
- Verify runtime connection secrets are never returned by GET endpoints or audit output.
- Verify no third-party platform connector, credential, endpoint, or deployment dependency is present; all service operations use RADAS-owned adapters.

Deployment gate:

- Merge only after backend full suite, console typecheck/build, vulnerability scan, and provider mock contract tests pass.
- Deploy backend/worker and console through the existing GitHub Actions workflows only from `main`.
- Run a production smoke test for login, project isolation, catalog list, mock/non-destructive service read paths, and health/readiness before enabling any real provider runtime.
- Update `docs/ROADMAP.md` only after each acceptance criterion is verified in the corresponding phase; do not mark the whole platform complete from a demo deployment.

## Recommended execution order

1. Phase 0 contracts and glossary.
2. Phase 1 catalog, runtime interface, and database models.
3. Phase 2 vertical slice with mock runtime first, then one safe real runtime.
4. Phase 3 environments/secrets, Git source, pipelines, observability, usage.
5. Phase 4 RADAS-owned OpenTofu/Ansible/Kubernetes/Docker/Podman adapters and provider independence.
6. Phase 5 collaboration, catalog publishing, quotas/plans/billing boundary.

Each phase should be a separate pull request or a small sequence of reviewable pull requests. The vertical slice is the first product milestone; the later phases expand breadth without making the core service model provider-specific.
