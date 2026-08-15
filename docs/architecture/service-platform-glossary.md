# RADAS Service Platform Glossary

This glossary fixes the user-facing vocabulary for the all-in-one developer platform. Definitions describe how a term should be used in product and API discussions, while the status column distinguishes current repository concepts from future service-platform concepts.

## Scope terms

| Term | Definition | Current RADAS status |
|---|---|---|
| **Organization** | A tenant boundary containing members, roles, and projects. An organization is identified by `org_id`; membership roles are `owner`, `admin`, `member`, and `readonly`. | **Current.** PostgreSQL `orgs`/`org_members`, `apps/opensible-server/services/org_service.py`, and `/api/orgs*`. |
| **Project** | The canonical operational boundary inside an organization. A project owns or scopes source configuration, inventories, playbooks, stacks, executions, logs, secrets, environments, approvals, feature-flag overrides, and future service instances. | **Current.** PostgreSQL `projects`, `/api/projects*`, project storage, and `require_project_access`. RADAS is project-centric. |
| **Environment** | A named deployment context within a project, such as `dev`, `staging`, `prod`, or `preview`, with its own configuration, approval policy, secrets references, and service instances. | **Partial/legacy.** Current stacks carry an `env` metadata value; promotion, preview, and environment-role routes exist, but there is no canonical environment entity shared by all subsystems. |
| **Tenant scope** | The authorization context formed by an organization and its projects. A request is tenant-safe only when the server derives the project's organization and verifies membership or an equivalent authorized role. | **Current rule.** `require_project_access` enforces the project → organization check; new service APIs must follow it. |

## Platform terms

| Term | Definition | Current RADAS status |
|---|---|---|
| **Service** | A user-facing deployable workload selected from a RADAS-owned catalog, such as an automation app, database, cache, storage service, web app, or observability tool. “Service” is a product concept, not a synonym for a provider or a raw container command. | **Future.** No service catalog or service-instance API exists yet. RADAS does not connect to SumoPod. |
| **Service definition** | A versioned catalog manifest describing a service's purpose, runtime compatibility, inputs, persistence, resources, secrets, health check, endpoints, and lifecycle capabilities. | **Future.** Planned `service_definitions`; do not infer it from existing stack/provider schemas. |
| **Service instance** | One named deployment of one service definition in one project and environment. It has desired configuration, observed provider state, runtime identity, status, endpoint metadata, and lifecycle history. | **Future.** Planned `service_instances`; current stacks are not service instances. |
| **Stack** | RADAS's current OpenTofu workspace: provider-specific IaC files and metadata representing an infrastructure unit, with stack actions and state. | **Current.** `/api/cloud/stacks*`, `apps/opensible-server/services/cloud_provisioning.py`, PostgreSQL `stack_meta`, and project stack storage. A stack can support a service but is not inherently a service. |
| **Deployment** | A user-visible attempt to apply a revision of a service or infrastructure configuration to an environment. It includes the requested change, review/approval context, execution/operation progress, logs, result, and audit trail. | **Partial/legacy.** Current UI and APIs expose OpenTofu/Ansible runs and approvals; a unified service deployment model is future work. |
| **Runtime** | The execution target and adapter chosen to operate a service, such as a RADAS-owned Docker/Podman runtime, Kubernetes runtime, OpenTofu-managed infrastructure, or Ansible-managed host. | **Partial.** OpenTofu provider adapters, Ansible execution, and worker capabilities exist; the planned normalized runtime registry/capability contract does not. |
| **Provider** | A RADAS adapter for infrastructure or runtime capabilities, including current cloud provider catalog entries and future first-party runtime adapters. | **Current/expanding.** Existing cloud providers are registered in `apps/opensible-server/services/cloud_providers`; provider integrations are additive. SumoPod is not a provider boundary for RADAS. |
| **Endpoint** | A service's reachable address plus port/protocol and health/TLS metadata, shown only after the runtime reports it. Internal and public endpoints are distinct metadata, not secrets. | **Future for services.** Current OpenTofu stacks expose outputs and state-derived information; no service endpoint entity exists. |
| **Health** | A runtime/provider observation indicating whether a service is reachable and operating as expected, including the health check result and timestamp. | **Partial.** Existing host checks, stack drift/state signals, and execution results exist; service health reporting is future. |

## Change and execution terms

| Term | Definition | Current RADAS status |
|---|---|---|
| **Revision** | An immutable desired-configuration snapshot for a service instance. A new update creates a new revision; rollback selects a prior known revision rather than mutating history. | **Future.** Existing stack snapshots and Git revisions are related mechanisms, but there is no service revision entity. |
| **Operation** | An asynchronous, project-scoped request to change or inspect a service instance, such as deploy, update, start, stop, restart, rollback, or destroy. It has a stable ID, kind, idempotency key, status, logs, and result. | **Future as a service term.** Current equivalent is the durable execution record and worker queue. New service operations should reuse that worker protocol rather than creating a second queue. |
| **Execution** | The current RADAS durable worker job record. It is created for OpenTofu or Ansible work, queued, claimed by a worker, logged, and completed with a terminal status. | **Current.** `/api/executions*`, `apps/opensible-server/storage/executions_store.py`, and worker routes. Do not rename or change existing response shapes. |
| **Run** | A UI/API projection of an execution, especially an OpenTofu stack action. Runs expose action, stack, status, worker, timestamps, return code, logs, and streaming. | **Current.** `/api/cloud/runs`, `/api/cloud/stacks/<name>/runs*`; status is normalized to lowercase for the cloud UI. |
| **Async operation ID** | The stable identifier returned immediately after an infrastructure-affecting request so the caller can poll status and logs without waiting for provider execution. | **Current for executions; future for service operations.** Existing routes return execution IDs; planned service APIs will expose an operation envelope without breaking legacy routes. |
| **Idempotency key** | A client-provided key that makes retries of the same mutating request return the original operation instead of starting duplicate infrastructure work. A conflicting payload under the same key is rejected. | **Required for new service APIs; not a universal legacy contract.** Do not retrofit or silently change existing stack/Ansible response shapes in Phase 0.1. |
| **Desired state** | The configuration RADAS intends to apply, represented by a service revision or current stack/source configuration. | **Partial.** Stack files, tfvars, source config, and snapshots represent desired state; service desired revisions are future. |
| **Observed state** | What the provider/runtime reports after or during execution: status, health, provider reference, endpoint, resource data, and logs. | **Partial.** Current execution/state/output paths provide observations for infrastructure; service-specific observations are future. |

## Security and governance terms

| Term | Definition | Current RADAS status |
|---|---|---|
| **Secret** | Sensitive material or a reference to it, such as an SSH key, password, Git token, registry token, or Vault credential. A secret is never ordinary configuration and is never returned as plaintext in normal API responses. | **Current.** Project secrets (`/api/secrets*`) and encrypted global secrets (`/api/global/secrets*`) have different scopes. |
| **Secret reference** | A stable name/ID and metadata pointer used by a service revision or execution to request secret material at runtime without embedding the value in the spec, logs, URLs, query keys, or audit diffs. | **Partial/current rule.** Existing source and worker payload paths support secret IDs/material transfer; a service-specific reference model is future. |
| **Project secret** | A credential stored for one project, including project SSH keys, login/password records, vault material, and stack-specific secret data. | **Current.** Project-authorized routes and project/stack storage. |
| **Global secret** | An encrypted integration credential stored outside project storage for platform-wide use, such as Git, container registry, or Vault access. | **Current, deliberately broader scope.** Access is administrator/predicate controlled; it is not automatically a project secret. |
| **Approval** | An explicit review decision that gates a project/stack/action change, currently for `apply`, `destroy`, or `plan`. | **Current but legacy-shaped.** `/api/approvals*` and `apps/opensible-server/services/approval_service.py`; persisted in `DATA_DIR/approvals.json`. Future service approvals must carry service, environment, revision, and operation identity. |
| **Audit event** | An append-only record of actor, action, target, scope, operation/change ID, and redacted metadata used to explain who changed what and when. | **Partial.** Auth/RBAC audit is in PostgreSQL; stack state, feature flags, and other domains have separate trails. Service lifecycle audit is future and must be explicit. |
| **Feature flag** | A named, evaluated control that can be global, organization-scoped, or project-scoped, with inheritance and audit history. | **Current.** `/api/flags*`, `apps/opensible-server/services/feature_flag_registry.py`, KV-backed registry plus legacy global compatibility. |
| **Policy gate** | A server-side rule that can reject or require review before a mutating operation, such as stack policy, quota, production approval, or a feature-flag safety switch. | **Partial/current.** Cloud policy, quota, approvals, environment roles, and flags exist as separate controls. |

## Status vocabularies

### Current execution vocabulary

Persisted execution values are uppercase and transitions are validated by `apps/opensible-server/storage/executions_store.py`:

```text
QUEUED → RUNNING → SUCCESS
QUEUED → RUNNING → FAILED
QUEUED → CANCELED
RUNNING → CANCELING → CANCELED
RUNNING → FAILED
```

`SUCCESS`, `FAILED`, and `CANCELED` are terminal. The cloud UI projection maps them to `succeeded`, `failed`, and `canceled`; active values become `queued`, `running`, and `canceling`. Ansible's app-level `running`, `error`, and `stopped` values are process status and are not interchangeable with the durable execution state machine.

### Planned service vocabulary

The following vocabulary is reserved for new service APIs and is not a claim that these states exist today:

- **Service instance:** `draft`, `provisioning`, `running`, `degraded`, `stopped`, `updating`, `destroying`, `destroyed`, `failed`.
- **Service operation:** `pending`, `queued`, `running`, `succeeded`, `failed`, `canceled`.

A transition must be authorized in the owning organization/project, must preserve the desired revision, must not leak secrets, and must be audited with the operation ID. Provider failure should update observed status and operation result without deleting the desired configuration.

## Naming rules for future product and API work

1. Say **project** for the operational boundary; do not say “workspace” when the authorization boundary is a project.
2. Say **service instance** for a deployed workload; say **stack** for the existing OpenTofu workspace.
3. Say **deployment** for the user-visible change; say **execution** for the current worker job; say **operation** for the future service lifecycle request that may be backed by an execution.
4. Say **environment** only when referring to an explicit project deployment context. Current stack `env` metadata is not proof of a universal environment record.
5. Say **secret reference** or **secret metadata** in UI/API contracts; never describe plaintext secret material as configuration.
6. Say **runtime/provider adapter** for RADAS-owned execution targets. Do not describe RADAS as connecting to SumoPod; it does not.
7. Derive `org_id` from the authorized project server-side. A browser-supplied org ID is an assertion to validate, never the source of truth.
