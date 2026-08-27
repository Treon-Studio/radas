# RADAS All-in-One Developer Platform: Current-State Contract Map

This document freezes the repository contracts that Phase 0.1 must preserve. It is an inventory of the current RADAS implementation, not a description of functionality that has not been built.

The target product remains **project-centric**: `Organization → Project → Service → Environment → Deployment`. Today, RADAS is primarily a GitOps control plane for OpenTofu and Ansible. The existing platform already provides the organization/project boundary and execution machinery that a future service workspace can reuse, but it does not yet provide the service catalog or service-instance lifecycle described in the plan.

## Scope and source of truth

- **RADAS is self-contained.** It owns its Flask control plane, console, Go worker, OpenTofu/Ansible workflows, storage, authorization, and provider adapters.
- **RADAS does not connect to SumoPod.** There is no SumoPod client, runtime adapter, credential, endpoint, or operational dependency in this platform contract. Future service deployment must use RADAS-owned Docker/Podman, Kubernetes, OpenTofu, Ansible, or other first-party adapters.
- **PostgreSQL is the required server database.** `apps/opensible-server/storage/pg_schema.py` defines versioned migrations for users/RBAC, projects, executions, stack data, workers, key-value services, and organizations. Some compatibility and legacy services still retain file-backed or KV-backed stores; those boundaries are recorded below rather than presented as a clean-room design.
- **The repository toolchain and API shapes are compatibility constraints.** Existing routes under `/api/cloud/stacks`, `/api/executions`, Ansible routes, and worker routes remain supported while new platform APIs are added.

## Current ownership and scope map

Scope labels used here:

- **Project-scoped:** access and data are selected by a project and must be checked against the project's organization.
- **Organization-scoped:** shared by members of an organization, independent of one project.
- **Global:** platform-wide or administrator-controlled.
- **Legacy/global boundary:** a compatibility path or store that predates the canonical tenant model, has a default fallback, or is broader than the project contract.

| Area | Current owner | Current contract and evidence | Scope / boundary |
|---|---|---|---|
| Authentication | Flask auth middleware and `apps/opensible-server/auth/*`; `/api/auth/*` | JWT access tokens are verified by `require_auth`; API tokens and worker tokens are also recognized in the middleware. Login, refresh, logout, current-user, MFA, and organization switching are routed in `api/auth_routes.py`. | User/session identity is global to the server; organization/project authorization is a separate check. |
| Organizations | `apps/opensible-server/services/org_service.py`, `api/org_routes.py` | PostgreSQL `orgs` and `org_members` tables. Membership roles are `owner`, `admin`, `member`, and `readonly`; organization routes list/create orgs, inspect membership, and manage members. | Organization-scoped. Membership is the tenant gate for project access. |
| Projects | `api/projects_routes.py`, app project helpers, PostgreSQL `projects` table | `/api/projects` lists projects visible through the user's organizations; create assigns an organization when possible. Project creation initializes project storage (`repo`, inventories, roles/playbooks, runtime/history, and secrets directories). | Canonical operational boundary. `require_project_access` resolves the project from path/header/query/body, reads `projects.org_id`, and checks organization membership. |
| RBAC and permissions | `apps/opensible-server/auth/middleware.py`, `apps/opensible-server/services/permission_service.py`, `apps/opensible-server/services/user_service.py`, `apps/opensible-server/services/role_service.py`, `apps/opensible-server/storage/auth_db.py` | PostgreSQL-backed users/roles/permissions and role relationships are exposed through the access-control service. Permission checks include named permissions such as `workers.create`; organization membership checks separately enforce tenant access. | Global identity/RBAC tables plus organization membership. Do not treat a JWT role list alone as project authorization. |
| OpenTofu/cloud stacks | `apps/opensible-server/services/cloud_provisioning.py`, provider registry under `apps/opensible-server/services/cloud_providers/`, stack lifecycle routes | `/api/cloud` exposes provider/schema discovery, stack CRUD, actions, runs, logs/SSE, state, drift, inventory, and provider-specific operations. Stack metadata is in PostgreSQL `stack_meta`; stack files are under `DATA_DIR/projects/<project>/stacks`; stack secrets/state/snapshots have project+stack keys. | Project-scoped when a project is supplied. Provider stacks still expose a legacy `default` fallback (`DATA_DIR/cloud-provisioning/default`) for pre-organization workspaces; new contracts must not use that fallback for tenant requests. |
| OpenTofu executions | `cloud_provisioning._create_execution`, app execution helpers, `apps/opensible-server/storage/executions_store.py`, `api/executions_routes.py` | Stack actions enqueue an execution with status `QUEUED`, execution type `TOFU_RUN`, stack/action parameters, optional worker requirements, and an execution ID. `/api/executions` and `/api/cloud/.../runs` expose history, logs, cancellation/stop/retry, and stream endpoints. | Project-scoped in canonical storage (`executions.project_id` and project history). Legacy lookup helpers can search by ID when project context is absent; this is a compatibility boundary, not a safe new API pattern. |
| Ansible executions | `api/ansible_run_routes.py`, app execution helpers, existing playbook/inventory services | `/api/run_ansible` requires project context, selected hosts/roles/inventory/config, creates a project execution record, and dispatches an Ansible playbook. `/api/ansible_status`, `/api/stop_ansible`, host-facts, inventory, role, and playbook routes preserve the existing console contract. | Project-scoped for storage and authorization. `ansible_output` is process/app state and therefore a legacy singleton boundary; it is not a durable per-project operation model. |
| Worker registry and execution protocol | `api/worker_routes.py`, `apps/opensible-server/services/worker_registry.py`, `apps/opensible-worker/internal/*` | Workers register, authenticate with bearer tokens, claim queued executions, send logs, finish executions, heartbeat, and report system information. The Go worker runs Ansible or OpenTofu from `runParams`, then reports `SUCCESS`, `FAILED`, or `CANCELED`. Claiming enforces worker ownership, project selection, requirements/tags, and concurrency. | Worker fleet is global infrastructure; each claimed execution carries a project ID. Worker JSON files and an index are compatibility storage, while execution state remains project-associated. The existing protocol is the async boundary for future operations; do not create a second worker protocol. |
| Project secrets | `api/secrets_routes.py`, project path helpers, cloud provisioning secret helpers | `/api/secrets` lists metadata only and creates/updates/deletes project SSH-key and login/password secrets. Cloud stack secret material is stored separately under project/stack data and is injected into execution payloads only as needed. | Project-scoped. API responses intentionally expose presence/metadata rather than secret material. |
| Global secrets | `apps/opensible-server/services/global_secrets_manager.py`, `api/global_secrets_routes.py` | Organization/platform integration credentials (Git, registry, Vault) are encrypted under `DATA_DIR/global/secrets`; the API requires global-secret predicates and returns metadata for reads. Git source resolution may use a global secret first, then project secrets for compatibility. | Global/administrator boundary. This is not a project-owned secret and must never be silently copied into a project service spec. |
| Git sources | `api/sources_routes.py`, `apps/opensible-server/services/git_source_manager.py`, `apps/opensible-server/services/sources_service.py`, project config | `/api/projects/<project_id>/sources` manages normalized project source definitions and health/test/sync/resolve operations. A project is initialized with a local `repo`; Git mode uses a per-project/repository cache, ref/subdirectory support, URL validation, and `authSecretId`. | Project-scoped. Authentication may resolve through global secrets, but repository configuration and cache identity are project-bound. |
| Environments and promotion | Stack metadata `env`, `api/env_promotion_routes.py`, `apps/opensible-server/services/env_promotion.py`, preview/env-role services | Stacks carry an `env` metadata value (commonly `dev`, `staging`, `prod`, or similar). Promotion is currently stack-to-stack (`/api/cloud/stacks/promote`); preview environments and environment roles have separate routes/services. There is no canonical `environments` table or service-environment model yet. | Project-scoped but legacy-shaped. Environment is currently metadata and workflow convention, not a first-class universal boundary. Do not infer stronger isolation than the code provides. |
| Approvals and policy | `api/approval_routes.py`, `apps/opensible-server/services/approval_service.py`, cloud policy/quota services | `/api/approvals` records project+stack+action approvals for `apply`, `destroy`, and `plan`; approving an `apply` can enqueue a stack execution. Approval records are currently persisted in `DATA_DIR/approvals.json`. Stack policy/quota gates are separate services. | Intended project-scoped; current JSON store is a legacy persistence boundary. Approval decisions must remain project/stack/action-specific. |
| Audit | `apps/opensible-server/storage/auth_db.py`, `api/audit_log_routes.py`, role/user services; stack state and flag-specific audit helpers | User/RBAC mutations append to PostgreSQL `audit_log`, readable through `/api/audit-log`. Cloud state writes project/stack `state-audit.jsonl`; feature flags write scoped history in KV storage. These are related but not one unified event stream. | Global auth audit plus project/stack and flag-scope trails. New service lifecycle events must add explicit actor, tenant/project, instance, operation, status, and redacted metadata without claiming the current stores already provide that unified shape. |
| Feature flags | `api/feature_flag_routes.py`, `apps/opensible-server/services/feature_flag_registry.py`, legacy `apps/opensible-server/services/feature_flags.py` | `/api/flags` supports global, organization, and project scopes, effective inheritance, audit, impact, evaluation, import/export, archive/restore, and rollback. The registry uses KV storage and retains legacy global flags for compatibility. | Global → organization → project inheritance. Project flags are tenant-aware when a project resolves to an organization; the global legacy store remains a compatibility boundary. |
| Console project entry point | `apps/radas-console/src/routes/projects/$projectId.tsx`, project/query helpers | The project route selects an authorized project and currently links to Cloud (OpenTofu stacks/runs/providers/costs) and Infrastructure (Ansible/playbooks/hosts/secrets/templates). Services are not yet a console route or catalog. | Project-centric shell exists, but the all-in-one service workspace is future work. |

## Existing endpoint compatibility boundary

These route families are supported contracts for Phase 0.1 and must not be silently renamed or reshaped:

| Existing contract | Current routes | Notes |
|---|---|---|
| Auth and org/project access | `/api/auth/*`, `/api/orgs*`, `/api/projects*` | JWT/API-token auth is required; project routes use organization membership checks. |
| Cloud stacks and runs | `/api/cloud/providers`, `/api/cloud/*`, `/api/cloud/stacks*`, `/api/cloud/runs`, `/api/cloud/.../runs*` | The cloud blueprint is registered from `apps/opensible-server/services/cloud_provisioning.py` with `/api/cloud`; stack actions enqueue existing executions. |
| Generic executions | `/api/executions*`, `/api/projects/<project_id>/executions/*` | Existing response shapes and uppercase execution states are retained. |
| Ansible | `/api/run_ansible`, `/api/ansible_status`, `/api/stop_ansible`, `/api/hosts/*/facts` | Existing process/status behavior remains compatible while future service operations reuse the queue contract. |
| Worker | `/api/worker/register`, `/api/worker/claim`, `/api/worker/executions/*`, `/api/worker/heartbeat`, `/api/worker/system-info` | Worker bearer-token auth and claim/log/finish/heartbeat semantics are the existing execution protocol. |
| Sources and secrets | `/api/projects/<project_id>/sources*`, `/api/secrets*`, `/api/global/secrets*` | Project metadata/material separation and global-secret authorization remain in force. |
| Governance and controls | `/api/approvals*`, `/api/audit-log`, `/api/flags*`, `/api/cloud/stacks/promote`, `/api/env-roles/*` | These are separate current subsystems with different persistence and scope semantics. |

New platform service APIs must be additive, JWT-authenticated, project-authorized, asynchronous for infrastructure work, idempotent, redacted, and audited. Existing APIs are not retrofitted in this documentation task.

### Contract surfaces: `/api/v2` (forward) and `/api/*` (compatibility)

`/api/v2` is the forward shared contract surface: it is mounted by the flask-smorest `Api` in `apps/server/app.py` (`api_v2.init_api_v2` and `finalize_api_v2`) and publishes an OpenAPI 3.0.3 document at `/api/v2/openapi.json` with Swagger UI at `/api/v2/docs`. It combines hand-converted blueprints (`yaml`, `roles_usage`, `api_tokens`, `queue_search`) with auto-proxies that mirror every registered `/api/*` route and delegate execution to the same v1 view functions. The legacy `/api/*` surface remains the compatibility contract: it is unchanged by the v2 mount, and when `flask-smorest` is unavailable the `/api/v2` pilot is skipped and `/api/*` serves all traffic. New cross-client contracts shared by the console and CLI should be specified against `/api/v2`, while existing `/api/*` routes keep their current shapes and behavior.

## Async operation contract as it exists today

The current durable execution contract is an execution record, not yet a service operation record:

1. A project-authorized route creates an execution record with a stable execution ID.
2. OpenTofu stack actions use `runParams.execution_type = TOFU_RUN`, `stack_name`, and `tofu_action`; Ansible uses project/inventory/playbook parameters.
3. Initial status is `QUEUED`.
4. A worker claims one eligible queued execution and marks it `RUNNING`, recording worker ownership and heartbeat state.
5. The worker appends logs and finishes with `SUCCESS`, `FAILED`, or `CANCELED`; cancellation from a running execution uses `CANCELING → CANCELED`.
6. API/UI projections normalize these to `queued`, `running`, `succeeded`, `failed`, `canceled` (and `canceling` where exposed).

The future service operation envelope should wrap or map to this contract rather than bypass it. It must introduce stable operation IDs and idempotency for new service mutations without changing existing execution response shapes.

## Status vocabularies and transition rules

### Existing executions

Canonical persisted values are uppercase:

```text
QUEUED → RUNNING → SUCCESS
QUEUED → RUNNING → FAILED
QUEUED → CANCELED
RUNNING → CANCELING → CANCELED
RUNNING → FAILED
```

`SUCCESS`, `FAILED`, and `CANCELED` are terminal. `apps/opensible-server/storage/executions_store.py` validates these transitions. The cloud UI projection maps `SUCCESS` to `succeeded` and the other active/terminal values to lowercase equivalents.

Ansible's app-level status additionally uses `running`, `error`, and `stopped` in `ansible_output`; this is a legacy process-status vocabulary and must not be treated as the durable service-operation state machine.

### Future service-instance and operation vocabulary

These values are defined by the approved plan for new service APIs; they are not current repository entities:

- **Service instance:** `draft → provisioning → running | degraded | failed`; `running → updating | stopped | destroying`; `updating → running | degraded | failed`; `stopped → running | destroying`; `destroying → destroyed | failed`.
- **Service operation:** `pending → queued → running → succeeded | failed | canceled`.

A service operation may be backed by an existing execution, but its service status and desired revision must not be overwritten by an observed provider status. Every future transition must be project-authorized, idempotent, and audited.

## Legacy and global boundaries to preserve honestly

1. **Default workspace:** cloud provisioning still resolves missing project context to `DATA_DIR/cloud-provisioning/default` in some helpers. This keeps older workspaces working but is not a tenant-safe scope for new APIs.
2. **Mixed persistence:** PostgreSQL is mandatory and canonical for the main schema, but approvals, worker registry files, some feature-flag history/KV records, project files, and cloud state audit remain file/KV-backed compatibility surfaces.
3. **Process singleton:** Ansible status is held in app-level `ansible_output`, so it is not a durable multi-project operation ledger.
4. **Global secrets:** Global integration secrets are intentionally broader than projects and guarded by administrator predicates; project services should reference them by metadata/ID only where an explicit contract permits it.
5. **Separate audit trails:** Auth/RBAC, stack state, feature flags, and approvals do not currently share one event schema. Future service lifecycle audit must be explicit and redacted.
6. **No service model yet:** There are no current `service_definitions`, `service_instances`, `service_revisions`, `service_operations`, or service endpoints tables/routes. The glossary names these concepts for future work without implying implementation.

## Phase 0.1 guardrails for the next engineer

- Derive `org_id` from the authorized project on the server; reject mismatched browser-supplied organization identifiers.
- Require JWT/API authentication and project authorization for new project-scoped endpoints.
- Reuse the existing worker claim/heartbeat/log/finish protocol for infrastructure work.
- Keep secrets encrypted or referenced by metadata; never put plaintext into logs, audit diffs, URLs, query keys, or ordinary responses.
- Add service entities with `org_id`, `project_id`, and environment (or an immutable derivation from the owning instance); never use the legacy global fallback for tenant-scoped requests.
- Treat provider integrations as RADAS-owned adapters. SumoPod is outside the boundary.
