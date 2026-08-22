# UC393 Project Landing Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static project landing page with a tenant-scoped operational dashboard that states project health and directs a member to the next action.

**Architecture:** Add one read-only Flask aggregate endpoint, `GET /api/projects/<project_id>/dashboard`, guarded by the existing `require_project_access` decorator. A focused `project_dashboard` service builds a redacted, bounded, deterministic view model from existing project stack metadata, OpenTofu run files, service instances, and latest service-health observations. The existing TanStack Router project page makes one React Query request to that endpoint and maps resource identifiers to existing console destinations.

**Tech Stack:** Python 3.14, Flask, PostgreSQL/psycopg, existing file-backed OpenTofu execution history, React 19, TypeScript 5.8+, TanStack Router/React Query, Vite, existing RADAS UI components, pytest.

## Global Constraints

- Do not add tables, migrations, background jobs, schedulers, providers, or dependency packages.
- The endpoint is GET-only and must not execute health checks, OpenTofu/Terraform actions, provider calls, worker actions, scheduling, or database mutations.
- Protect the endpoint with `require_project_access`; authorization must occur before aggregate data reads.
- Every database query must be parameterized and scoped by `project_id`; do not fetch an organization-wide result set then filter it in Python.
- Return no logs, raw stack metadata, execution payloads, service `details`, endpoints, provider references, credentials, secrets, or audit metadata.
- Use `redact_sensitive` before serializing user-controlled display values.
- Return zero counts and empty arrays for a valid empty project. Lists are capped at five items and deterministically ordered.
- Preserve `unknown` health in summary/list output but never treat it as a confirmed attention item.
- Update `docs/ROADMAP.md` UC393 only after every focused test and verification gate in Task 6 is green.
- Do not hand-edit `apps/radas-console/src/routeTree.gen.ts`; Vite/TanStack Router owns generated routing output.

---

## File structure

| Path | Responsibility |
|---|---|
| `apps/opensible-server/services/project_dashboard.py` | Pure project-scoped read-model construction, normalization, redaction, deterministic ordering, and list limits. |
| `apps/opensible-server/api/project_dashboard_routes.py` | Minimal authenticated HTTP boundary for the aggregate response. |
| `apps/opensible-server/api/__init__.py` | Registers the dashboard blueprint exactly once. |
| `apps/opensible-server/tests/test_project_dashboard.py` | Route/service integration tests with isolated PostgreSQL and project execution files. |
| `apps/radas-console/src/routes/projects/$projectId.tsx` | One-query project landing dashboard and all UI states; replaces static navigation cards. |
| `apps/radas-console/src/lib/query.ts` | Adds a stable query-key factory entry for a project dashboard request. |
| `apps/radas-console/src/routes/projects/$projectId.dashboard.test.tsx` | Focused page-state and destination-link tests if the repository test harness is added; otherwise defer this file and record that console has no test runner in its manifest. |
| `docs/ROADMAP.md` | Marks UC393 complete only after final gates pass. |

## Contract shared by backend and console

The backend returns a standard platform envelope via `success_response`:

```python
ProjectDashboard = {
    "project": {"id": str, "name": str, "description": str},
    "summary": {
        "stacks": {"total": int, "drifted": int},
        "runs": {"active": int, "failed": int},
        "services": {
            "total": int,
            "healthy": int,
            "degraded": int,
            "unhealthy": int,
            "unknown": int,
        },
        "requires_attention": int,
    },
    "attention": list[AttentionItem],
    "recent_runs": list[RecentRun],
    "service_health": list[ServiceHealth],
}

AttentionItem = {
    "kind": Literal["service_health", "run", "drift"],
    "severity": Literal["critical", "warning"],
    "title": str,
    "occurred_at": float | None,
    "target": {"type": Literal["service", "run", "stack"], "id": str},
}

RecentRun = {
    "id": str,
    "stack": str,
    "action": str,
    "status": str,
    "started_at": int | None,
    "finished_at": int | None,
}

ServiceHealth = {
    "instance_id": str,
    "name": str,
    "environment": str,
    "status": Literal["healthy", "degraded", "unhealthy", "unknown"],
    "observed_at": float | None,
}
```

`attention` ordering: unhealthy service, failed run, drifted stack, degraded service; within a group sort descending by `occurred_at`, then descending by stable resource ID. A service appears at most once in `attention`; a stack/run identity is never exposed with fields beyond this contract. `requires_attention` is `len(attention)` before limiting the returned list only if the product wants the visible count; for this P0, set it to the exact capped list count so every displayed item is accounted for.

---

### Task 1: Dashboard read model and unit-level aggregation behavior

**Files:**
- Create: `apps/opensible-server/services/project_dashboard.py`
- Test: `apps/opensible-server/tests/test_project_dashboard.py`

**Interfaces:**
- Consumes: `storage.pg.query_one/query_all`, `api.platform_contracts.redact_sensitive`, `services.cloud_provisioning._list_stacks(project_id)`, `services.cloud_provisioning.all_runs_list()` only through a narrow helper that supplies the project ID in request context or an extracted project-ID-capable helper.
- Produces: `build_dashboard(project_id: str) -> dict[str, Any]`, containing exactly the shared `ProjectDashboard` schema.
- Used by: `api/project_dashboard_routes.py` in Task 2.

- [ ] **Step 1: Write failing tests for empty and populated aggregate contracts**

Create `apps/opensible-server/tests/test_project_dashboard.py` with common seed helpers. Use a real `data_dir` fixture and insert project, org membership, service instances, and health observations. Create minimal OpenTofu run JSON under `<data_dir>/projects/<project_id>/history/executions/` in the same shape accepted by `cloud_provisioning._exec_to_run`.

```python
from __future__ import annotations

import json
import time
from pathlib import Path

from psycopg.types.json import Jsonb
from storage import pg
from services import project_dashboard

ORG = "dashboard-org"
PROJECT = "dashboard-project"
USER = "dashboard-user"


def seed_project(now: float) -> None:
    pg.execute("INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)", (ORG, ORG, USER, now))
    pg.execute(
        "INSERT INTO projects (id,org_id,owner_id,name,description,is_archived,created_at,updated_at) "
        "VALUES (%s,%s,%s,%s,%s,FALSE,%s,%s)",
        (PROJECT, ORG, USER, "Dashboard project", "Operational view", now, now),
    )
    pg.execute("INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)", (ORG, USER, "owner", now))


def write_tofu_run(data_dir: Path, *, run_id: str, stack: str, status: str, created_at: int, return_code: int | None = None) -> None:
    directory = data_dir / "projects" / PROJECT / "history" / "executions"
    directory.mkdir(parents=True, exist_ok=True)
    payload = {
        "id": run_id,
        "status": status,
        "createdAt": created_at,
        "finishedAt": created_at + 5,
        "returnCode": return_code,
        "runParams": {"execution_type": "TOFU_RUN", "stack_name": stack, "tofu_action": "plan"},
    }
    (directory / f"{run_id}.json").write_text(json.dumps(payload), encoding="utf-8")


def test_build_dashboard_returns_stable_empty_contract(data_dir):
    seed_project(time.time())

    result = project_dashboard.build_dashboard(PROJECT)

    assert result["project"] == {"id": PROJECT, "name": "Dashboard project", "description": "Operational view"}
    assert result["summary"] == {
        "stacks": {"total": 0, "drifted": 0},
        "runs": {"active": 0, "failed": 0},
        "services": {"total": 0, "healthy": 0, "degraded": 0, "unhealthy": 0, "unknown": 0},
        "requires_attention": 0,
    }
    assert result["attention"] == []
    assert result["recent_runs"] == []
    assert result["service_health"] == []


def test_build_dashboard_counts_health_and_orders_attention(data_dir, monkeypatch):
    seed_project(time.time())
    # Stack/run fixtures and two health observations are added in the test body.
    # The assertions define the contract before implementation.
    monkeypatch.setattr(project_dashboard, "_list_stacks", lambda project_id: [
        {"name": "stack-drift", "drift_status": "drifted"},
        {"name": "stack-sync", "drift_status": "in_sync"},
    ])
    write_tofu_run(data_dir, run_id="run-failed", stack="stack-drift", status="FAILED", created_at=200, return_code=1)
    write_tofu_run(data_dir, run_id="run-active", stack="stack-sync", status="RUNNING", created_at=300)
    # Insert `api` unhealthy and `worker` unknown service observations here.

    result = project_dashboard.build_dashboard(PROJECT)

    assert result["summary"]["stacks"] == {"total": 2, "drifted": 1}
    assert result["summary"]["runs"] == {"active": 1, "failed": 1}
    assert result["summary"]["services"]["unhealthy"] == 1
    assert result["summary"]["services"]["unknown"] == 1
    assert [item["kind"] for item in result["attention"]] == ["service_health", "run", "drift"]
    assert result["attention"][0]["target"] == {"type": "service", "id": "service-api"}
    assert result["recent_runs"][0]["id"] == "run-active"
```

- [ ] **Step 2: Run the new focused tests and verify the expected failure**

Run:

```bash
cd apps/opensible-server && pytest tests/test_project_dashboard.py -q
```

Expected: collection fails because `services.project_dashboard` does not exist.

- [ ] **Step 3: Implement the smallest read-model module**

Create `apps/opensible-server/services/project_dashboard.py`. Use these exact helpers and boundaries:

```python
from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Any

from api.platform_contracts import redact_sensitive
from storage import pg
from services import cloud_provisioning

_MAX_ITEMS = 5
_HEALTH_STATUSES = ("healthy", "degraded", "unhealthy", "unknown")
_ATTENTION_PRIORITY = {"unhealthy": 0, "failed": 1, "drifted": 2, "degraded": 3}


def _project(project_id: str) -> dict[str, str]:
    row = pg.query_one(
        "SELECT id, name, COALESCE(description, '') AS description FROM projects WHERE id = %s",
        (project_id,),
    )
    if not row:
        raise ValueError("project not found")
    return {"id": str(row["id"]), "name": str(row["name"]), "description": str(row["description"])}


def _service_health(project_id: str) -> tuple[dict[str, int], list[dict[str, Any]]]:
    rows = pg.query_all(
        "SELECT i.id, i.name, i.environment, COALESCE(h.status, 'unknown') AS status, h.observed_at "
        "FROM service_instances i "
        "LEFT JOIN LATERAL ("
        "  SELECT status, observed_at FROM service_health_observations "
        "  WHERE instance_id = i.id AND project_id = %s "
        "  ORDER BY observed_at DESC, id DESC LIMIT 1"
        ") h ON TRUE "
        "WHERE i.project_id = %s AND i.archived = FALSE "
        "ORDER BY h.observed_at DESC NULLS LAST, i.id DESC",
        (project_id, project_id),
    )
    counts = {status: 0 for status in _HEALTH_STATUSES}
    items = []
    for row in rows:
        status = str(row["status"])
        status = status if status in counts else "unknown"
        counts[status] += 1
        safe = redact_sensitive({
            "instance_id": str(row["id"]), "name": str(row["name"]),
            "environment": str(row["environment"]), "status": status,
            "observed_at": row["observed_at"],
        })
        items.append(safe)
    return counts, items[:_MAX_ITEMS]


def _stack_summary(project_id: str) -> tuple[int, int, list[dict[str, Any]]]:
    stacks = _list_stacks(project_id)
    drifted = [stack for stack in stacks if stack.get("drift_status") == "drifted"]
    return len(stacks), len(drifted), drifted


_list_stacks = cloud_provisioning._list_stacks
```

Then implement a private `_runs(project_id)` that reads at most 200 execution JSON files from `cloud_provisioning._project_executions_dir(project_id)`, accepts only `runParams.execution_type == "TOFU_RUN"`, calls `cloud_provisioning._exec_to_run`, sorts by `(started_at or finished_at or 0, id)` descending, and returns a redacted five-entry `RecentRun` list plus active/failed counts. Do not use `all_runs_list()` because it relies on request-scoped project resolution.

Implement `build_dashboard(project_id)` to compose project, stack, runs, services, and attention items. Preserve the fixed schema. Build attention item titles from redacted stack/service names and generic static words; never use raw details, endpoints, provider refs, payloads, or logs.

- [ ] **Step 4: Complete populated test fixture and make all Task 1 tests pass**

Add explicit insert statements for service instances and health observations to the populated test. Use two service IDs (`service-api`, `service-worker`) and include an `endpoint_summary` or `provider_ref` value containing `secret-value` to prove the service projection excludes it.

Add assertions:

```python
assert "secret-value" not in str(result)
assert result["service_health"] == [
    {"instance_id": "service-api", "name": "api", "environment": "production", "status": "unhealthy", "observed_at": 400.0},
    {"instance_id": "service-worker", "name": "worker", "environment": "production", "status": "unknown", "observed_at": None},
]
```

Run:

```bash
cd apps/opensible-server && pytest tests/test_project_dashboard.py -q
```

Expected: all current dashboard aggregation tests pass.

- [ ] **Step 5: Commit the self-contained read-model work**

```bash
git add apps/opensible-server/services/project_dashboard.py apps/opensible-server/tests/test_project_dashboard.py
git commit -m "feat(dashboard): add project operational read model"
```

---

### Task 2: Tenant-scoped dashboard HTTP endpoint and authorization tests

**Files:**
- Create: `apps/opensible-server/api/project_dashboard_routes.py`
- Modify: `apps/opensible-server/api/__init__.py:34-117`
- Modify: `apps/opensible-server/tests/test_project_dashboard.py`

**Interfaces:**
- Consumes: `project_dashboard.build_dashboard(project_id: str) -> ProjectDashboard`, `require_project_access`, `success_response`, `error_response`.
- Produces: `GET /api/projects/<project_id>/dashboard` returning `{ "data": ProjectDashboard, "request_id": str }` under the existing platform contract.
- Used by: console query in Task 4.

- [ ] **Step 1: Write failing route authorization and isolation tests**

Extend `test_project_dashboard.py` with a Flask client modeled on `tests/test_service_observability.py`:

```python
import flask
from api import register_blueprints
from auth.service import generate_token


def dashboard_client(data_dir):
    from auth import middleware
    middleware.set_data_dir(data_dir)
    app = flask.Flask("project-dashboard-tests")
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    register_blueprints(app)
    return app.test_client()


def auth_headers(data_dir, user_id=USER):
    return {"Authorization": f"Bearer {generate_token(user_id, user_id, [], data_dir, token_type='access')}"}


def test_dashboard_route_returns_platform_data_envelope(data_dir):
    seed_project(time.time())
    response = dashboard_client(data_dir).get(
        f"/api/projects/{PROJECT}/dashboard", headers=auth_headers(data_dir),
    )
    assert response.status_code == 200
    body = response.get_json()
    assert body["data"]["project"]["id"] == PROJECT
    assert "request_id" in body


def test_dashboard_route_denies_non_member_and_does_not_leak(data_dir):
    seed_project(time.time())
    response = dashboard_client(data_dir).get(
        f"/api/projects/{PROJECT}/dashboard", headers=auth_headers(data_dir, "outside-user"),
    )
    assert response.status_code == 403
    assert PROJECT not in str(response.get_json())
```

- [ ] **Step 2: Run the route tests and verify the expected failure**

Run:

```bash
cd apps/opensible-server && pytest tests/test_project_dashboard.py -q
```

Expected: route tests fail with `404` because the dashboard blueprint is not registered.

- [ ] **Step 3: Implement the thin route and register it**

Create `apps/opensible-server/api/project_dashboard_routes.py`:

```python
from __future__ import annotations

from flask import Blueprint

from api.platform_contracts import error_response, success_response
from auth.middleware import require_project_access
from services import project_dashboard

bp = Blueprint("project_dashboard_api", __name__)


@bp.get("/api/projects/<project_id>/dashboard")
@require_project_access
def get_project_dashboard(project_id: str):
    try:
        return success_response(project_dashboard.build_dashboard(project_id))
    except ValueError:
        return error_response("PROJECT_NOT_FOUND", "Project not found", 404)
```

In `apps/opensible-server/api/__init__.py`, append this exact module name after `"api.projects_routes"` in the `modules` list:

```python
"api.project_dashboard_routes",
```

Do not add a second `require_auth`; `require_project_access` already applies it. Do not accept request parameters and do not return a raw Flask `jsonify` response, because console callers expect the existing platform `data` envelope.

- [ ] **Step 4: Make route tests pass and add cross-project isolation coverage**

Seed a second accessible project in the same organization with a stack/service/run fixture. Request the first project and assert that the second project’s stack/service/run identifier does not appear anywhere in the response:

```python
assert "other-project-stack" not in str(response.get_json())
assert "other-project-service" not in str(response.get_json())
```

Run:

```bash
cd apps/opensible-server && pytest tests/test_project_dashboard.py -q
```

Expected: all route, aggregation, authorization, empty-contract, redaction, ordering, and bounded-list tests pass.

- [ ] **Step 5: Commit the endpoint boundary**

```bash
git add apps/opensible-server/api/project_dashboard_routes.py apps/opensible-server/api/__init__.py apps/opensible-server/tests/test_project_dashboard.py
git commit -m "feat(dashboard): expose project dashboard endpoint"
```

---

### Task 3: Expand backend regression coverage for limits, ties, and data exclusion

**Files:**
- Modify: `apps/opensible-server/tests/test_project_dashboard.py`

**Interfaces:**
- Consumes: the completed public endpoint and `build_dashboard` contract from Tasks 1–2.
- Produces: regression proof for all backend acceptance requirements.
- Used by: final verification in Task 6.

- [ ] **Step 1: Write failing tests for five-item cap, stable ties, and unknown semantics**

Add fixtures for six unhealthy/degraded services, six failed runs, and six drifted stacks. Use equal timestamps for two resources with lexically ordered IDs that prove the secondary `id DESC` ordering.

```python
def test_dashboard_attention_is_capped_and_stably_sorted(data_dir, monkeypatch):
    seed_project(time.time())
    # Seed more than five attention candidates with two equal-timestamp failed runs.
    result = project_dashboard.build_dashboard(PROJECT)

    assert len(result["attention"]) == 5
    assert result["summary"]["requires_attention"] == 5
    assert [item["target"]["id"] for item in result["attention"][:2]] == ["service-z", "service-a"]


def test_unknown_health_is_visible_but_not_attention(data_dir):
    seed_project(time.time())
    # Seed one service without an observation or with `unknown` observation.
    result = project_dashboard.build_dashboard(PROJECT)

    assert result["summary"]["services"]["unknown"] == 1
    assert result["summary"]["requires_attention"] == 0
    assert result["attention"] == []
```

- [ ] **Step 2: Run those tests and verify they fail before completing implementation**

Run:

```bash
cd apps/opensible-server && pytest tests/test_project_dashboard.py -q
```

Expected: at least one limit/order assertion fails until the implementation’s sort key and cap are complete.

- [ ] **Step 3: Correct only the read-model ordering and projection code required by the failures**

In `project_dashboard.py`, use a single normalization function for timestamp/id ordering:

```python
def _descending_key(item: Mapping[str, Any], identifier: str) -> tuple[float, str]:
    occurred_at = item.get("occurred_at") or item.get("observed_at") or item.get("finished_at") or item.get("started_at") or 0
    return (float(occurred_at), str(item[identifier]))
```

Sort priority groups using `reverse=True` only for timestamp/identifier within each already-prioritized group. Never use Python object ordering or provider payload fields. Apply `_MAX_ITEMS` after sort. Keep `requires_attention == len(attention)` after cap, as established by the shared contract at the top of this plan.

- [ ] **Step 4: Run complete dashboard backend tests**

Run:

```bash
cd apps/opensible-server && pytest tests/test_project_dashboard.py -q
```

Expected: all dashboard tests pass, including tenant isolation, redaction, empty contract, limits, ties, and unknown-health semantics.

- [ ] **Step 5: Commit regression coverage**

```bash
git add apps/opensible-server/services/project_dashboard.py apps/opensible-server/tests/test_project_dashboard.py
git commit -m "test(dashboard): cover tenant-safe dashboard limits"
```

---

### Task 4: Console query contract and operational dashboard page

**Files:**
- Modify: `apps/radas-console/src/lib/query.ts`
- Modify: `apps/radas-console/src/routes/projects/$projectId.tsx`

**Interfaces:**
- Consumes: `api<T>()`, `unwrapData<T>()`, `ApiError`, `isForbidden`, `qk.projectDashboard(projectId)`, and the response types stated at the top of this plan.
- Produces: a one-query dashboard rendering at `/projects/$projectId` with loading, denied/error, populated, no-attention, and empty-project states.
- Used by: dashboard route visitors; no route tree change is required because the file path is unchanged.

- [ ] **Step 1: Add the stable query key before changing UI behavior**

Inspect the current export shape in `apps/radas-console/src/lib/query.ts`, then add a key factory member consistent with surrounding keys:

```ts
projectDashboard: (projectId: string) => ['projects', projectId, 'dashboard'] as const,
```

- [ ] **Step 2: Compile the current console and capture the pre-change baseline**

Run with the local Node binary if `node` is absent from `PATH`:

```bash
cd apps/radas-console && /Users/ridho/.local/bin/node ../../node_modules/typescript/bin/tsc --noEmit
```

Expected: exit code 0 before modifying the route.

- [ ] **Step 3: Replace static area cards with typed one-query dashboard composition**

In `apps/radas-console/src/routes/projects/$projectId.tsx`:

1. Retain project selection/access behavior at the top of `ProjectOverview`.
2. Add imports for `useQuery`, `Link`, refresh/status icons, `Button`, `Badge`, `statusToVariant`, `StateView`, `api`, `unwrapData`, `isForbidden`, and `qk`.
3. Define local TypeScript types exactly matching the shared contract. Treat `occurred_at`, `started_at`, `finished_at`, and `observed_at` as `number | null`.
4. Start one query only after the route has resolved a `project`:

```tsx
const dashboardQuery = useQuery({
  queryKey: qk.projectDashboard(projectId),
  queryFn: async () => unwrapData<ProjectDashboard>(
    await api<{ data: ProjectDashboard }>('GET', `/api/projects/${encodeURIComponent(projectId)}/dashboard`),
  ),
  enabled: Boolean(project),
})
```

5. Preserve the existing project-not-found `StateView` before requesting the dashboard. For a dashboard request error, render `StateView` with retry:

```tsx
<StateView
  state="error"
  title={isForbidden(dashboardQuery.error) ? "Project access denied" : "Unable to load project dashboard"}
  message={dashboardQuery.error instanceof Error ? dashboardQuery.error.message : undefined}
  onRetry={() => void dashboardQuery.refetch()}
/>
```

6. While loading, render `<StateView state="loading" title="Loading project dashboard…" />`; do not render zero-valued cards until data exists.
7. Add `formatRelativeTime(value)` that returns `"—"` for `null`, safely computes a relative label for seconds, minutes, hours, or days, and never throws on a malformed timestamp.
8. Render the four summary metrics from `dashboard.summary`: total stacks, drifted stacks, a combined active/failed run label, and services requiring attention.
9. Render `attention` with local destination mapping:

```tsx
function attentionDestination(projectId: string, item: AttentionItem) {
  if (item.target.type === 'service') {
    return { to: '/projects/$projectId/services/$serviceId' as const, params: { projectId, serviceId: item.target.id } }
  }
  if (item.target.type === 'stack') return { to: '/cloud/stacks/$stackId' as const, params: { stackId: item.target.id } }
  return { to: '/cloud/summary' as const, params: undefined }
}
```

Use existing route types rather than interpolating untyped `href` strings. If the generated route accepts a different stack param name, use the one declared by `routeTree.gen.ts`; never change the generated file manually.

10. Render `recent_runs` as links to `/cloud/summary`; render `service_health` links to service detail. Each item uses `Badge` with `statusToVariant`; translate `unhealthy` to destructive styling only through existing supported Badge variants.
11. If the project has zero stacks and zero services, show one `StateView state="empty"` with two existing `Link` CTAs: Cloud Summary and project Services. If it has resources but no attention, retain a small "No action required" attention-card state.

- [ ] **Step 4: Run TypeScript typecheck, repair only genuine route/type mismatches, and rerun**

Run:

```bash
cd apps/radas-console && /Users/ridho/.local/bin/node ../../node_modules/typescript/bin/tsc --noEmit
```

Expected: exit code 0. If TanStack Router rejects a destination type, inspect `apps/radas-console/src/routeTree.gen.ts` only to obtain the actual param key, change the source route component, and rerun. Do not edit generated output.

- [ ] **Step 5: Commit console dashboard composition**

```bash
git add apps/radas-console/src/lib/query.ts 'apps/radas-console/src/routes/projects/$projectId.tsx'
git commit -m "feat(console): add project operational dashboard"
```

---

### Task 5: Console behavior coverage or explicit test-harness boundary

**Files:**
- Create when a test runner is intentionally introduced: `apps/radas-console/src/routes/projects/$projectId.dashboard.test.tsx`
- Modify only if adding an established-compatible runner is approved: `apps/radas-console/package.json`
- Otherwise modify: `docs/superpowers/plans/2026-08-21-uc393-project-dashboard.md` only to record the verified limitation in the execution checklist; do not claim automated console tests ran.

**Interfaces:**
- Consumes: dashboard route types and mock HTTP responses from Task 4.
- Produces: explicit evidence of the console loading, error, populated, link, and empty states—or a documented limitation if no console test harness exists.
- Used by: Task 6 final verification.

- [x] **Step 1: Inspect existing console test infrastructure before adding dependencies**

Verified on 2026-08-21:

- `apps/radas-console/package.json` defines only `dev`, `build`, `build:dev`, `preview`, and `typecheck` scripts.
- The console package has no test/spec files, Vitest/Jest/Testing Library dependencies, or test binaries under `apps/radas-console/node_modules/.bin`.
- The repository root has a Playwright config and `e2e/console-flows.spec.ts`, but that is a cross-application smoke/E2E harness, not an isolated console component test runner.

Therefore UC393 does not add a console test runner or dependency. The verified coverage boundary is: backend tests cover aggregation/authorization/redaction; console behavior is verified by TypeScript, production build, and the existing E2E harness only if its environment is available.

Run:

```bash
cd apps/radas-console
find . -maxdepth 3 -type f \( -name '*test.*' -o -name '*spec.*' -o -name 'vitest.config.*' \) -print
node -e "const p=require('./package.json'); console.log(JSON.stringify(p.scripts, null, 2))"
```

Expected in the current repository: no console test script or test runner. Record the actual output in the task execution notes; do not infer test tooling from the root Playwright dependency.

- [ ] **Step 2: If a compatible runner is already present, write failing state tests**

Only if Step 1 reveals a configured console test runner, create tests that mock `api` and assert each state:

```tsx
it('renders loading without zero-valued metrics', () => {
  render(<ProjectOverview />)
  expect(screen.getByText('Loading project dashboard…')).toBeInTheDocument()
  expect(screen.queryByText('Total stacks')).not.toBeInTheDocument()
})

it('links an unhealthy service to its project-scoped detail route', async () => {
  render(<ProjectOverview />)
  const link = await screen.findByRole('link', { name: /api/i })
  expect(link).toHaveAttribute('href', `/projects/${projectId}/services/service-api`)
})

it('renders empty-project Cloud and Services CTAs', async () => {
  render(<ProjectOverview />)
  expect(await screen.findByRole('link', { name: /cloud/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /services/i })).toBeInTheDocument()
})
```

- [ ] **Step 3: Run the console state tests and make the smallest UI correction needed**

Run the exact package test script identified in Step 1, for example:

```bash
pnpm --filter @radas/console test -- projects/$projectId.dashboard.test.tsx
```

Expected: initial failure before the state implementation matches tests; final exit code 0 after correcting only dashboard code.

- [x] **Step 4: If no compatible runner exists, do not add one in UC393**

No Vitest, Testing Library, Jest, or new configuration was added. Console automated component tests are **not available in the current package**. Backend endpoint tests remain the automated acceptance proof for aggregation/authorization; console typecheck and production build remain the static/build evidence. The repository-level Playwright smoke harness is a separate E2E gate and is not claimed as passed by this task.

- [x] **Step 5: Commit only actual source/test changes**

No console test source, package manifest, or test dependency changed because no compatible package runner exists. There is no Task 5 tooling-only commit.

If a runner existed and tests were added:

```bash
git add apps/radas-console/package.json 'apps/radas-console/src/routes/projects/$projectId.dashboard.test.tsx'
git commit -m "test(console): cover project dashboard states"
```

If no runner exists, make no tooling-only commit.

---

### Task 6: Acceptance verification, roadmap status, and delivery audit

**Files:**
- Modify: `docs/ROADMAP.md:559` only after all gate commands pass
- Verify: `apps/opensible-server/tests/test_project_dashboard.py`
- Verify: `apps/opensible-server/`
- Verify: `apps/radas-console/`

**Interfaces:**
- Consumes: completed backend route/read model and console page.
- Produces: concrete evidence that UC393’s bounded P0 acceptance criteria are satisfied and a roadmap status that does not overstate verification.

- [x] **Step 1: Run the full focused backend dashboard suite**

Verified on 2026-08-21:

```text
.venv/bin/pytest tests/test_project_dashboard.py -q
8 passed
```

The run emitted only existing `datetime.utcnow()` deprecation warnings from `auth/service.py`; no dashboard test failed.

Run:

```bash
cd apps/opensible-server && pytest tests/test_project_dashboard.py -q
```

Expected: all tests pass, covering authorized access, non-member denial, same-org cross-project isolation, empty schema, summary counts, deterministic priority/order, five-item bounds, unknown-health semantics, and sensitive-data exclusion.

- [x] **Step 2: Run backend syntax compilation**

Verified on 2026-08-21:

```text
python3 -m compileall -q /Users/ridho/Documents/go/github.com/raizora/radas/apps/opensible-server
exit 0
```

Run:

```bash
python3 -m compileall -q /Users/ridho/Documents/go/github.com/raizora/radas/apps/opensible-server
```

Expected: exit code 0 with no compiler errors.

- [x] **Step 3: Run console typecheck and production build**

Verified on 2026-08-21:

```text
/Users/ridho/.local/bin/node ../../node_modules/typescript/bin/tsc --noEmit
exit 0

/Users/ridho/.local/bin/node ../../node_modules/vite/bin/vite.js build
exit 0
```

Vite emitted its existing warning about a minified chunk larger than 500 kB; the production build completed successfully.

Run:

```bash
cd /Users/ridho/Documents/go/github.com/raizora/radas/apps/radas-console
/Users/ridho/.local/bin/node ../../node_modules/typescript/bin/tsc --noEmit
/Users/ridho/.local/bin/node ../../node_modules/vite/bin/vite.js build
```

Expected: both commands exit 0. If the local Node path is unavailable in the execution environment, use the system `node`/`pnpm` equivalent and report the exact blocker rather than claiming this gate passed.

- [x] **Step 4: Perform a source-level acceptance checklist before touching the roadmap**

Verified on 2026-08-21:

```text
[PASS] Route is GET-only and decorated with require_project_access.
[PASS] Exactly one dashboard aggregate request is made by the project landing page.
[PASS] No migration/table/job/provider mutation was added by UC393.
[PASS] Aggregate SQL queries are parameterized and project-scoped.
[PASS] Response projection excludes logs, payloads, details, endpoints, provider refs, and secrets.
[PASS] Empty project returns stable zero/empty values and console shows Cloud/Services CTAs.
[PASS] Attention includes unhealthy, failed, drifted, and degraded conditions in priority order.
[PASS] Unknown health appears but is not attention.
[PASS] Recent runs/service health/attention lists are bounded to five.
[PASS] Backend focused tests, compileall, console typecheck, and console build are green.
[BOUNDARY] Console component-test automation is unavailable; root Playwright smoke tests are separate and were not run in this task.
```

The roadmap must not claim an automated console component-test suite exists. The bounded P0 dashboard implementation is source/build/backend-test verified; E2E remains a separate gate.

Confirm each item against the implementation and command outputs:

```text
[ ] Route is GET-only and decorated with require_project_access.
[ ] Exactly one dashboard aggregate request is made by the project landing page.
[ ] No migration/table/job/provider mutation was added.
[ ] All aggregate queries are project-scoped and parameterized.
[ ] Response contains only the documented safe fields.
[ ] Empty project returns stable zero/empty values and console shows CTAs.
[ ] Attention includes only unhealthy, failed, drifted, and degraded conditions in priority order.
[ ] Unknown health appears but is not attention.
[ ] Recent runs/service health/attention lists are bounded to five.
[ ] Backend focused tests, compileall, console typecheck, and console build are green.
```

If any checkbox is not evidenced, do not update the roadmap; fix the uncovered requirement first and rerun its specific tests and all gates.

- [ ] **Step 5: Update the UC393 roadmap row only after all checklist items are checked**

**Not performed:** the console component-test coverage criterion remains unavailable in the current package, and the root Playwright smoke gate was not run. The roadmap row remains ⬜ rather than overstating completion.

Change only the UC393 status marker in `docs/ROADMAP.md`:

```diff
-| 393 | Landing dashboard per project (widget stack) | ⬜ | P0 | 6 |
+| 393 | Landing dashboard per project (widget stack) | ✅ | P0 | 6 |
```

Do not update unrelated roadmap rows, including known incomplete UC334/UC341/Phase 4–5 work.

- [x] **Step 6: Run final diff and status checks**

Verified during Task 6 audit:

```text
git diff --check
exit 0

git status --short
pre-existing changes remain in .zcode/plans/ and graphify-out/; UC393 changes are isolated in the files listed below.
```

Run:

```bash
cd /Users/ridho/Documents/go/github.com/raizora/radas
git diff --check
git status --short
git diff -- docs/ROADMAP.md apps/opensible-server/api/project_dashboard_routes.py apps/opensible-server/services/project_dashboard.py apps/opensible-server/tests/test_project_dashboard.py apps/radas-console/src/lib/query.ts 'apps/radas-console/src/routes/projects/$projectId.tsx'
```

Expected: `git diff --check` emits no whitespace errors. Inspect `git status` and distinguish the UC393 changes from pre-existing session plan and Graphify modifications; do not delete or overwrite pre-existing user changes.

- [ ] **Step 7: Commit the verified delivery state**

```bash
git add docs/ROADMAP.md
git commit -m "docs(roadmap): mark UC393 dashboard complete"
```

Do not push unless explicitly requested. Final reporting must include each command’s actual output/exit status, list the concrete tests run, state whether console automated UI tests were unavailable or passed, and mention pre-existing working-tree changes separately.

---

## Plan self-review

### Specification coverage

| Specification requirement | Plan task(s) |
|---|---|
| One GET tenant-scoped aggregate endpoint | Tasks 1–2 |
| Existing access guard before reads | Task 2, Task 6 checklist |
| No migrations/mutations/background work | Global Constraints, Task 6 checklist |
| Stack/run/service aggregate data | Task 1 |
| Redaction and no sensitive fields | Tasks 1 and 3 |
| Deterministic capped attention/recent/service lists | Tasks 1 and 3 |
| Unknown health visible but non-incident | Task 3 |
| Project dashboard UI with summary, attention, runs, services | Task 4 |
| Loading/error/empty/no-attention states | Task 4 and Task 5 |
| Backend authorization/isolation tests | Tasks 2–3 |
| Console state tests or explicit test-harness limitation | Task 5 |
| Compile/typecheck/build and truthful roadmap update | Task 6 |

### Placeholder scan

This plan contains no `TODO`, `TBD`, “implement later”, or implicit test instructions. Every task names exact files, public interfaces, assertions, commands, and expected outcomes. The only conditional branch is explicitly based on whether an existing console test harness is found; it prohibits adding unrelated new tooling when none exists.

### Type consistency

- Backend creates `build_dashboard(project_id: str) -> dict[str, Any]` and Task 2 calls exactly that function.
- The route uses the platform `{data: ...}` envelope, and Task 4 uses `unwrapData<ProjectDashboard>`.
- The backend uses `kind` values `service_health`, `run`, and `drift`; Task 4 maps the corresponding `target.type` values `service`, `run`, and `stack`.
- Both backend and TypeScript types use `instance_id`, `observed_at`, `started_at`, `finished_at`, `requires_attention`, and the same four health states.
