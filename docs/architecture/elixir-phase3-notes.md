# Elixir Migration — Phase 3 Notes (Cost & Billing)

Branch: `feat/elixir-migration-phase0` (2026-09-04)

## What was ported

The **live** cost surface — `storage/cost_store.py` (472 LOC) + the 13
`/api/cost/*` routes in `api/cost_routes.py`:

- `RadasAI.CostStore` (`apps/server_elixir/lib/radas_ai/cost_store.ex`)
  - Pricing catalogs: file-based JSON under `DATA_DIR/cost/pricing/`
    (**shared files with Flask** — both runtimes read/write the same
    catalogs), default seeds with per-provider overrides (bytedc, hetzner,
    aws, eks, gcp, gke, azure, cloudflare, kubernetes), versioned saves with
    capped history (50 entries).
  - Estimate engine: 16 resource kinds, overprovisioning warnings, HA /
    single-point-of-failure / egress-topology insights.
  - Estimates: kv-scoped per project (`cost_estimates:<project>`), newest
    first, capped at 100.
  - Reports: kv-scoped per project (`cost_reports:<project>`), slim list view,
    stack filter.
  - Flavor specs (Huawei/OpenStack-style map + `<gen>.<size>.<ratio>`
    heuristic), inventory → resources converter, and the
    OpenTofu/Terraform plan extractor (`extract_from_plan`).
- `RadasWeb.CostController` + 13 routes (`apps/server_elixir/lib/radas_web/`).
- `RadasAI.KV` — the shared `kv_store(scope, key, value jsonb)` store port
  (kv_load/kv_save semantics preserved) — reused by OAuth flow state.

## Deliberately NOT ported (dead code → Phase 8 candidates)

The following 11 modules have **zero importers** anywhere in the server tree
(verified via `git grep` on `feat/console-v4-ai-router-clean`: only
`api/cost_routes.py → storage.cost_store` crosses module boundaries, and the
console never calls `/api/cost/*`). Porting dead code would only multiply
surface area; they are slated for deletion in the Phase 8 decommission
instead:

- `cost_aggregator`, `cost_anomaly`, `cost_breakdown`, `cost_trend_overlay`,
  `cost_tag_analytics`, `cost_export`, `cost_accuracy`
- `budget_service`, `bill_spike_protection`, `budget_rollup`,
  `bundle_budget_validator`

If any of these are revived on the Python side before Phase 8, they must be
re-assessed (they would need both a caller and tests before porting).

## Security follow-up (deliberate, non-blocking)

`/api/cost/*` ships **without authentication decorators** in the Python
blueprint; the Elixir port mirrors that for wire parity. Hardening (JWT +
project access) is a deliberate follow-up and must be applied to BOTH
runtimes at the same time to avoid breaking either during coexistence.
