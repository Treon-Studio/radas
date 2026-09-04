# Elixir Migration — Phase 4 Notes (Execution & Worker Protocol)

Branch: `feat/elixir-migration-phase0` (2026-09-04)

## Ported in this milestone

- `RadasAI.WorkerRegistry` (`apps/server_elixir/lib/radas_ai/worker_registry.ex`)
  — port of `services/worker_registry.py`: worker profiles as JSON files under
  `DATA_DIR/workers/<id>.json` (**shared files with Flask**), token index in
  the PostgreSQL `worker_tokens (token_hash, worker_id, salt)` table with the
  identical hash scheme (`sha256(token <> salt)` hex), ETS token cache for the
  heartbeat storm.
- `RadasWeb.WorkerController` + routes: `POST /api/worker/register`
  (`X-Worker-Registration-Secret` or admin JWT; `{success, workerId,
  workerToken}`), `POST /api/worker/heartbeat`
  (`{success, workerId, requestSystemInfo}`), `POST /api/worker/system-info`.

**Interop proven by tests:** a token minted by the Elixir registry verifies
through the same index Flask reads (same table, same hash scheme), so worker
registration is safe to cut over to Elixir while Flask keeps serving the rest.

## Coexistence boundary (deliberate)

`/api/worker/claim`, `/api/worker/executions/<id>/log`,
`/api/worker/executions/<id>/finish`, and `/api/executions/*` stay on **Flask
via nginx** for now: `server_claim_next_execution` walks the per-project
filesystem (`DATA_DIR/projects/<id>/history/executions/*.json`) with the
`index_db` accelerator — porting it requires the execution pipeline
(creation, leases, log files, cancellation) to move as one unit. Cutting
claim over early would split the queue across two runtimes.

Cutover plan for the remaining worker surface (later in Phase 4):

1. Port `executions_store` + `execution_history` (execution JSON files, log
   files, SSE log streaming) — file layouts must stay byte-compatible so
   Flask and Elixir can coexist during the switchover window.
2. Port `server_claim_next_execution` semantics (QUEUED scan + lease +
   stale-running self-heal) on top of that store.
3. Switch nginx `/api/worker/*` and `/api/executions/*` to Phoenix.
4. Port `execution_retry` / `cicd_engine` last (they depend on the
   dispatcher).

Worker-token auth for log/finish (`verify_token` + ownership/lease checks)
is already reusable from `RadasAI.WorkerRegistry`.
