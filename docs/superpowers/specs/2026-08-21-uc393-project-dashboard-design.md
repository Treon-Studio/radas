# UC393 Project Landing Dashboard — Design

**Date:** 2026-08-21

## Goal

Implement UC393, a project landing dashboard that answers one operational question:

> Is this project healthy, and what action needs attention now?

The dashboard replaces the static project-area cards at `/projects/$projectId`. It gives an authenticated project member a small, current, tenant-scoped view of infrastructure and service health, then directs them to the existing area where they can investigate or act.

## Scope

### Included

- A read-only, tenant- and project-scoped aggregation endpoint:
  `GET /api/projects/<project_id>/dashboard`.
- A project overview console page that displays:
  - project identity;
  - stack, drift, execution, and service-health counts;
  - a bounded prioritized attention list;
  - recent infrastructure runs;
  - service-health status;
  - deterministic empty, loading, and error states.
- Focused backend and console tests.
- A roadmap status update only after the implementation acceptance criteria and verification gates pass.

### Excluded

- New database tables, migrations, jobs, background workers, schedulers, or materialized views.
- Health-check execution, Terraform/OpenTofu operations, scheduling, refreshes, or any mutation from the dashboard endpoint.
- Cost, billing, quota, analytics/history charts, widget customization, alert configuration, or global cross-project aggregation.
- A new authorization model. The endpoint uses the established project-access guard.

## Alternatives considered

### 1. Console composition of existing endpoints

The console would independently fetch stacks, runs, services, and health information.

**Advantages:** minimal backend change and direct reuse of existing routes.

**Rejected because:** the page would own several loading and failure states, make more round trips, and need to reproduce filters and data-shaping decisions across the UI. Existing routes do not expose a single stable project-health contract, so authorization and error handling would be easier to drift over time.

### 2. One tenant-scoped aggregation endpoint — selected

The backend builds a small view model from data already owned by the project, enforces access once, redacts data once, and supplies a stable contract for the landing page.

**Advantages:** one authorization boundary, one console query, bounded payloads, deterministic ordering, and an API contract that can be tested without browser behavior.

**Trade-off:** the endpoint must carefully retain existing data semantics and avoid becoming a second operational system. Its scope is therefore read-only aggregation of current persisted state.

### 3. Materialized project-dashboard read model

A table and worker would precompute dashboard snapshots.

**Rejected because:** snapshot invalidation, job failure, eventual consistency, and a new schema are disproportionate for the P0 scope. This can be reconsidered only if the live bounded aggregation proves too slow under production data.

## Architecture

### API boundary

Add a dedicated dashboard blueprint or route module and register it in the Flask app with the existing API blueprints.

```
GET /api/projects/<project_id>/dashboard
```

The handler must use:

1. `require_auth` to authenticate the caller;
2. `require_project_access` to ensure the caller has access to `project_id`;
3. a dashboard service/function that receives the already-authorized `project_id` and returns a redacted read model.

The route must not accept an organization ID, alternate project ID, stack name, or pagination input. The URL project ID is the only scope selector. This prevents callers from broadening the aggregation outside the access check.

Errors follow the existing project/platform response convention:

- unauthenticated: existing `401` behavior;
- inaccessible or unknown project: existing project-access `403`/`404` behavior without exposing resources from another tenant;
- database or unexpected internal error: correlated standard error envelope, with no raw SQL or sensitive details.

### Data sources

The aggregate reads only persisted project-scoped data. It does not call providers, invoke workers, read execution logs, or return endpoint/provider-secret metadata.

| Dashboard area | Source | Rules |
|---|---|---|
| Project identity | established project record/config | Return only ID, name, and description. |
| Stack summary | `stack_meta` for the requested project | Count all stacks and count those with stored drift state that requires attention. |
| Infrastructure execution summary and recent runs | existing project-scoped cloud execution/run records | Count active (`queued`/`running`) and failed runs. Return at most five latest runs, ordered deterministically by effective activity timestamp descending, then ID descending. |
| Service summary and health list | `service_instances` plus latest `service_health_observations` per instance | Count services by current health: healthy, degraded, unhealthy, unknown. Return at most five attention-relevant/latest services using only redacted identifiers and presentation fields. |
| Attention list | derived from the three sources above | Combine drifted stacks, failed infrastructure runs, and unhealthy/degraded services. Do not persist this derived list. |

The implementation must use parameterized SQL and project IDs in every query. Each source query is scoped by `project_id`; no organization-wide query may be filtered in application code after fetching data.

### Response contract

The endpoint returns a fixed JSON object. Empty collections are arrays, absent counts are zero, and unknown health is represented explicitly as `unknown`, not `null`.

```json
{
  "project": {
    "id": "project-id",
    "name": "Production",
    "description": "Production workloads"
  },
  "summary": {
    "stacks": {
      "total": 4,
      "drifted": 1
    },
    "runs": {
      "active": 1,
      "failed": 1
    },
    "services": {
      "total": 3,
      "healthy": 1,
      "degraded": 1,
      "unhealthy": 0,
      "unknown": 1
    },
    "requires_attention": 3
  },
  "attention": [
    {
      "kind": "drift",
      "severity": "warning",
      "title": "network-prod has drift",
      "occurred_at": 1780000000,
      "target": {
        "type": "stack",
        "id": "network-prod"
      }
    }
  ],
  "recent_runs": [
    {
      "id": "run-id",
      "stack": "network-prod",
      "action": "plan",
      "status": "failed",
      "started_at": 1780000000,
      "finished_at": 1780000040
    }
  ],
  "service_health": [
    {
      "instance_id": "service-id",
      "name": "api",
      "environment": "production",
      "status": "degraded",
      "observed_at": 1780000000
    }
  ]
}
```

The API does **not** return console URLs. The console maps an item `target` to an established internal route. This keeps the API transport-neutral and prevents a backend response from becoming coupled to UI routing.

### Attention semantics and ordering

`requires_attention` equals the number of attention items after deduplication, not a sum of all summary counters.

An item is included when one of these conditions holds:

1. a stack has persisted drift that requires review;
2. an infrastructure run has `failed` status;
3. a service has current `unhealthy` or `degraded` health.

Priority order is deterministic:

1. unhealthy service;
2. failed infrastructure run;
3. drifted stack;
4. degraded service.

Within a priority, newer `occurred_at` sorts first; ties sort by stable resource ID descending. Return at most five entries. A resource appearing in multiple source records creates one attention item for its highest-priority condition.

`unknown` service health is visible in summary and the service list, but does not increase `requires_attention`. This makes a lack of observations visible without presenting it as a confirmed incident.

### Console composition

Update `apps/radas-console/src/routes/projects/$projectId.tsx` to request the endpoint through the existing API/query conventions after the current project selection/access resolution succeeds.

The route renders these sections in this order:

1. **Project header** — project name, description, and a refresh control.
2. **Operational summary** — four compact metrics:
   - total stacks;
   - drifted stacks;
   - active/failed infrastructure runs;
   - services requiring attention.
3. **Needs attention** — up to five priority-sorted items, each with severity, timestamp, and a destination link.
4. **Recent runs** — up to five entries with stack, action, status, and time; entries route to the existing cloud run investigation surface.
5. **Service health** — up to five entries with service, environment, current health, and observed time; entries route to the established service detail route.

The console derives destinations locally:

- stack/drift item: established cloud stack route;
- run item: established cloud summary/run-detail flow;
- service item: `/projects/$projectId/services/$serviceId`.

The UI uses existing `Card`, `Badge`, `Button`, `StateView`, React Query, and status-color patterns. It must not introduce a new state-management library, a bespoke component framework, or a full dashboard framework.

### UI states

- **Loading:** preserve project identity when available and render lightweight dashboard loading state; do not present stale zeroes as data.
- **Error/denied:** use `StateView` and preserve the established project-access wording. Do not render partial data from a failed aggregate.
- **Populated:** render each section only with returned items; summaries remain visible even when individual lists are empty.
- **Empty project:** when total stacks and services are zero, render a clear first-use message and links to the existing Cloud and Service Catalog/service creation surfaces. It is not an error state.
- **No current attention:** render a positive, neutral empty state within the attention section, not a missing section.

## Security and privacy

- Access is checked before any aggregate query runs.
- Every SQL query is parameterized and scoped by `project_id`.
- The response excludes logs, service `details`, endpoint summaries, provider references, credentials, secrets, raw stack metadata, execution payloads, and audit metadata.
- The service applies the repository redaction helper to any user-controlled presentation value before serializing it.
- Resource names shown in lists are existing user-visible names only; inaccessible project data must never affect counts, ordering, or payload shape.
- The endpoint is GET-only and has no provider, worker, scheduler, or database mutation side effect.

## Testing

### Backend

Add a focused test module for the dashboard route/service using the existing PostgreSQL test fixture and authenticated project fixtures.

Required cases:

1. An authorized project member receives a complete stable response for a populated project.
2. The response counts stack drift, active/failed runs, and service health correctly.
3. Attention order and five-item limits are deterministic.
4. A second project in the same organization and a project in another organization do not affect the response.
5. A caller without project access is denied and receives no aggregate data.
6. An empty project returns all required fields, zero counts, and empty arrays.
7. Sensitive values placed in source metadata/details/provider fields do not appear in the response.

### Console

Add focused console tests using the repository's existing test approach, or introduce the smallest established-compatible test harness if none covers routes. Required coverage:

1. loading state;
2. error/denied state;
3. populated metrics and priority item rendering;
4. attention/service destination links;
5. empty-project CTA.

## Acceptance criteria

UC393 is complete only when all conditions below are demonstrated:

- An authorized member can open `/projects/$projectId` and see an operational project dashboard.
- The dashboard obtains project data from exactly one tenant-scoped aggregate endpoint.
- The endpoint enforces existing project access before reading all data sources.
- The endpoint returns stable empty arrays/zero counts and bounded deterministic lists.
- Drift, failed runs, and unhealthy/degraded services become prioritized actionable items.
- Unknown health is visible but is not treated as a confirmed incident.
- Console links resolve to existing stack, run, and service operational surfaces.
- The empty project state provides useful next actions.
- Backend tests cover authorization/isolation, aggregation, ordering/limits, empty response, and sensitive-data exclusion.
- Console tests cover all required UX states.
- Backend focused tests pass; `python3 -m compileall -q apps/opensible-server` passes; console `tsc --noEmit` passes; and the console build is run when the local Node toolchain is available.
- `docs/ROADMAP.md` marks UC393 complete only after the preceding acceptance criteria and verification evidence are met.

## Follow-up triggers

This design intentionally avoids snapshot storage. Reconsider a materialized read model only after measurement shows that the bounded aggregate cannot meet production latency needs, or if product requirements add historical/trend widgets that need durable rollups.
