# API Contract Inventory

Status: active · Introduced by Phase 0 Task 0.2
(`docs/superpowers/plans/2026-08-27-radas-console-cli-full-integration.md`) ·
2026-08-27

This document records the runtime route inventory policy for the RADAS
Flask server (`apps/server`): which blueprints are required to serve the
documented contract, how failures surface through `/readyz`, and how every
mounted route is classified for consumers and later parity tooling.

The inventory is generated from the **running** `url_map`, never from
grepping source files. Route presence claims elsewhere in the repository must
match it (plan constraint: no ✅ based on files alone).

## Contract namespaces

| Namespace | Paths | Status |
| --- | --- | --- |
| `legacy` | `/api/*` | Compatibility surface. Existing response shapes are preserved; consumers migrate toward v2. |
| `openapi-v2` | `/api/v2/*` | Forward contract (`API_CONTRACT_VERSION = "v2"`). Additive today; becomes the canonical contract after Task 2.x freezes the OpenAPI snapshot. |
| `platform` | `/api/platform/*` | Envelope/contract namespace (request IDs, structured errors, idempotent mutations). Legacy-only exceptions: `/api/platform/idempotency`. |
| `ops` | `/healthz`, `/healthz/details`, `/readyz` | Probes consumed by orchestrators. Must stay reachable even during degraded boots. |
| `non-api` | everything else | Static files and app-level conveniences; not part of any HTTP contract. |

Namespace classification lives in `api/route_inventory.py`
(`_contract_namespace`) and is applied per route path.

## Required vs optional blueprint modules

Registration is centralized in `api.route_inventory.register_blueprints`.
Every module in `apps/server/api/` that exposes a blueprint appears in one of
two explicit sets:

### Required (12) — failure fails closed

Covering auth, projects, executions, worker, platform contracts (+ the probes
themselves), project dashboards, and the core services domain:

| Module | Domain |
| --- | --- |
| `api.auth_routes` | Auth (login/refresh/logout/me, MFA verify, org switch) |
| `api.executions_routes` | Executions lifecycle |
| `api.platform_routes` | Platform contracts: `/healthz*`, `/readyz`, idempotency status |
| `api.project_dashboard_routes` | Project dashboard reads |
| `api.projects_routes` | Projects CRUD + tenant anchors |
| `api.service_catalog_routes` | Services catalog |
| `api.service_instance_routes` | Service instances |
| `api.service_observability_routes` | Service observability |
| `api.service_pipeline_routes` | Service pipelines |
| `api.service_plan_routes` | Service plans |
| `api.service_source_routes` | Service sources |
| `api.worker_routes` | Worker register/claim/heartbeat/finish |

Policy:

1. **Strict mode (default).** Any import/registration failure inside a
   required module raises `RuntimeError("Required API blueprints failed to
   register: …")` listing the offending modules by name.
2. **Readiness-failure mode** (`strict_required=False`, or after `app.py`
   catches the strict error): the server keeps booting far enough to answer
   probes honestly. The outcome is stored on
   `app.extensions["radas_blueprint_registry"]` with
   `failed_required=[{module, error_type}, …]`, and `/readyz` returns
   **503** with `required_blueprints_ok=false`.
3. Exception details are reduced to the exception *type* plus module name in
   logs — there is no credential-bearing message channel; correlation uses
   the module name.

### Optional (77) — failure is a logged skip

All remaining product/integration modules (OAuth providers, AI routing,
cloud/BYOC, notifications, secrets management UIs, …). A broken optional
module:

- never aborts startup,
- never marks readiness unhealthy (`required_blueprints_ok` stays `true`),
- is recorded under `skipped_optional` in the registration report and logged
  at WARNING level with `module=` and `error_type=` only.

Rationale: losing an integration must degrade visibly but must never remove
the required API surface or fake a healthy state.

## Readiness contract

`GET /readyz` (implemented via `services.health.readiness()`) reports:

| Field | Meaning |
| --- | --- |
| `ok` | Aggregate health gate for orchestrators. |
| `checks.postgres` | Live PostgreSQL connectivity probe. |
| `checks.data_dir` | Writable data directory probe. |
| `database_ok` | Mirror of `checks.postgres` for contract consumers. |
| `required_blueprints_ok` | `true` unless a required blueprint failed to register in this process. Unknown/no report ⇒ healthy default (no observed failure). |
| `contract_version` | `"v2"` when the route-inventory module is importable; `"legacy"` fallback implies an environment so broken that readiness already fails. |

`200` requires all checks true AND `required_blueprints_ok=true`; anything
else yields `503`. Readiness payloads never contain stack traces, database
URLs, or secret values.

## Route inventory output

`collect_routes(app) -> list[dict]` renders the mounted `url_map`
deterministically (sorted by path, then methods). One entry per rule:

```json
{
  "path": "/api/projects/<project_id>/executions/<execution_id>/cancel",
  "methods": ["POST"],
  "endpoint": "executions_api.api_cancel_execution",
  "blueprint": "executions_api",
  "auth_class": "authenticated",
  "scope_class": "project-scoped",
  "contract_namespace": "legacy"
}
```

- `methods`: excludes implicit `HEAD`/`OPTIONS`.
- `blueprint`: `None` for app-level rules (e.g. static files).
- Classification heuristics are **descriptive metadata**, not enforcement:
  - `auth_class`: `public` only for the ops probes and token-issuance
    endpoints plus OpenAPI documents (`/healthz`, `/healthz/details`,
    `/readyz`, `/api/auth/login`, `/api/auth/refresh`,
    `/api/v2/openapi.json`, `/api/v2/docs`); everything else is inventoried
    as `authenticated`.
  - `scope_class`: `project-scoped` when the path embeds a concrete or
    templated identifier below `/projects/`; otherwise `global`.
  - These heuristics intentionally do not parse decorators or permissions;
    request-time authorization remains the server's authority.

## Duplicate ownership and expected-surface gates

`find_duplicate_routes(routes)` lists every `(method, path)` pair owned by
more than one endpoint. Werkzeug tolerates overlapping rules silently and
dispatches by sort order, so collisions only surface through inspection;
a duplicate means ambiguous ownership and blocks contract freeze.

`find_missing_expected_routes(routes)` checks the minimum verified core
surface (`EXPECTED_CORE_ROUTES`): both ops probes, login/refresh/me,
projects collection, executions collection, service instance paths, and
worker register/claim/heartbeat.

Snapshot at introduction (bare Flask app + full default registration):

- 12 required / 77 optional blueprint modules
- 610 mounted route rules → namespaces: 596 legacy, 5 platform, 3 ops,
  6 non-api
- auth classes: 605 authenticated / 5 public (v2 docs routes unmounted
  without flask-smorest)
- scope classes: 499 global / 111 project-scoped
- duplicates: none; missing expected routes: none

## Regenerating / verifying

```bash
cd apps/server
.venv/bin/pytest -q tests/test_route_inventory.py tests/test_platform_contracts.py

# Live dump of path, methods and namespace for every mounted route:
.venv/bin/python scripts/dump_route_inventory.py | head
```

(Add `scripts/dump_route_inventory.py` ad hoc as a three-line script that calls
`api.register_blueprints(Flask(__name__))` then prints `collect_routes(app)`
entries; keep it uncommitted or promote it in Task 2.4's parity tooling.)

## Limitations / next steps

- Classifications are path-derived metadata; decorator-level permission
  introspection is out of scope until Task 2.4 builds the route parity
  checker against `app.url_map` plus client manifests.
- `/api/openapi.json` remains on its historical access-controlled docs flow
  until the separately reviewed migration decided in Task 2.1.
- The expected-core-route set deliberately includes only paths verifiable in
  this checkout; extend it when domains stabilize rather than guessing.
