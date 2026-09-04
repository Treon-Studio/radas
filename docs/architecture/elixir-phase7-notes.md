# Elixir Migration — Phase 7 Progress Ledger

Status of the cloud-provisioning port (Phase 7) as of 2026-09-04.
Branch `feat/elixir-migration-phase0`, suite 305 ExUnit green, gates
(smoke / path-guards / OpenAPI+route-parity) pass at commit `ffe11e48`.

## Done (Phase 7 milestones)

| Commit | Milestone |
|---|---|
| `2b007ad7` | 7-a: `RadasAI.CloudState` (audit JSONL, locks, versions cap-50, backend.hcl) |
| `c02de524` | 7-b: stacks CRUD, bytedc HCL render, `stack_secrets` AES-GCM, credentials materialization, `:v2_auth` pipeline + `OrgAccess.ensure_project_access` (require_project_access port) |
| `0b1e5327` | 7-c: `POST /stacks/:name/actions` (tofu lifecycle gates → TOFU_RUN enqueue 202), `ProjectLock`/`RemoteStateLock`/`LockLifecycle`, `StackOps`, `EnvRoles`, `StackSnapshots`, `AuditEvents`, `Flags.evaluate_scoped` |
| `d998b6b6` | 7-d: provider catalog/schemas data-driven from `priv/provider_schemas/providers.json` (exported from the Python adapters — all 10 IaC providers), drift, runs list/get/SSE stream, state inspect, force-unlock (UC523), version get/rollback (Python `{ok,...}` shapes) |
| `ffe11e48` | 7-e: governance slice — protection, comments, dependencies DAG, TTL, circuit breaker, scan-plan, config export/import, timeouts, pinning, bulk-tags, archive/restore, cooldown + `CloudInventory` (bytedc tfstate parser full port) |

## Remaining for Phase 7

1. **BYOC** (`services/byoc.py` 910 LOC + `api/byoc_routes.py` 27 routes +
   `byoc_import_mapping.py` 232 LOC): account CRUD (JSON file store with
   encrypted creds — reuse `RadasAI.SecretEncryption`), provider probes
   (Req HTTP to Hetzner/OpenStack/IDCH/AWS/GCP APIs — `services/byoc.py::_probe`),
   inventory discovery/drift/snapshots, import snippet generation,
   budget/quota, clash-check, adopt-only, backup export/restore.
2. **cloud_policy** (`services/cloud_policy.py` 534 LOC): policy-as-code
   gate; `create_execution` already leaves the `runParams["policy"]`
   hook point (disabled by default — same default behavior).
3. **Other inventory builders**: 9 adapters besides bytedc have
   `build_inventory`; `RadasAI.CloudInventory` returns the empty shape
   for them. Dump sources live in `apps/server/services/cloud_providers/<id>.py`.
4. **All-runs aggregate** `GET /api/v2/cloud/runs` (cloud_provisioning.py:734)
   — TOFU_RUN list across stacks with stack info join.
5. **Deferred action gates** (documented in `CloudStacksController.run_action/5`):
   maintenance windows (`automation_rules`), test-case blockers
   (`test_cases.latest_failed_blocker` — fails closed in Python),
   approvals (`approval_service`), preview-env flag policy
   (`can_create_preview_env`). Port these with their Phase 8 bundles.

## Gotchas learned (Phase 7)

- `in` on an Elixir MAP checks `{key, value}` pairs, NOT keys — use
  `Map.has_key?/2`. (This silently emptied credentials materialization.)
- Phoenix `json/2` renders resp_body as IO-data → the PlatformContract
  plug must `IO.iodata_to_binary/1` before `Jason.decode`.
- Never re-dispatch a response conn in ExUnit: the test adapter drops
  custom headers (`x-project-id`), silently re-routing to the legacy
  default workspace. Always dispatch from the setup conn.
- Nested Phoenix scopes accumulate pipelines: routes declared directly
  in the outer `/api` scope only get `:api` (no auth) — every
  authenticated route must sit in a `pipe_through :v2_auth` scope.
- Python's platform layer normalizes ALL ≥400 v2 responses: flat
  `{"error": "..."}` becomes envelope `{error:{code,message:"Request
  failed"}}` UNLESS the body has a string `message` key (then that
  message passes through). 423 has no named code → `HTTP_423`.
- Locks (`acquire_lock`/`release_lock`/`rollback_state`) return
  Python-shaped maps, not tagged tuples — keep them that way.
- Provider definitions are exported from Python to
  `apps/server_elixir/priv/provider_schemas/providers.json` (adapters
  + catalog + secret keys). Re-export if `services/cloud_providers/*.py`
  changes: run the dump snippet from `docs/architecture/elixir-phase7-notes.md` git history.
- Test DB (`postgresql://localhost/radas_test`) already contains the
  full Python schema (project_locks, remote_state_locks, stack_meta,
  stack_secrets, snapshots, audit_log, kv_store, executions).
