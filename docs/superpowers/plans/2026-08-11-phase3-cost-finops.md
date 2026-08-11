# Fase 3 — Cost & FinOps — Implementation Plan

> **For agentic workers:** expand each task into executable steps when the
> phase starts. Reuse the export infra from Fase 1 and the budget service.

**Goal:** Forecast & trending lanjutan, breakdown biaya per tag/role,
rekomendasi rightsizing VM idle, dan rollup biaya multi-project/org.

**Architecture:** Cost pipeline: estimator (sudah ada) → monthly aggregation
ke tabel `cost_monthly` (project/provider/tag) → forecast (regresi linier
sederhana) → rightsizing engine (analisis usage dari worker) → rollup.

**Tech Stack:** Flask + SQLite, math/statistics stdlib, recharts (console).

## Global Constraints
- Semua angka cost memakai satuan konsisten (USD) + kurs tetap terkonfigurasi.
- Terapkan design pillars (UX & Integration DX) — lihat `docs/ROADMAP.md` § Cross-cutting pillars.
- Terapkan P3 Error handling & reliability — lihat `docs/ROADMAP.md` § Cross-cutting pillars (error envelope, redaksi secret, `/healthz`, lock per-stack).
- Tidak mengubah kontrak `/api/cost/*` yang sudah dipakai UI (aditif).
- Typecheck/build console PASS; server compile PASS.

---

### Task 3.1 — Monthly cost aggregation & forecast (UC 29)
**Files:** server `services/cost_aggregator.py`, `api/cost_forecast_routes.py`;
console `routes/cloud/cost.tsx` (tab Forecast).

- [ ] Job harian: agregasi estimator → `cost_monthly(project, provider, tag, amount)`.
- [ ] Forecast 30/90 hari: regresi linier atas 3 bulan terakhir.
- [ ] UI: chart forecast + confidence band; indikasi tren naik/turun.
- [ ] Verify: seed data sample → forecast tampil; angka konsisten dengan report.

### Task 3.2 — Breakdown biaya per tag/role (UC 31)
**Files:** server extend aggregator (breakdown), `api/cost_breakdown_routes.py`;
console cost.tsx (pie per tag).

- [ ] Breakdown by tag (role, env, project) dari state stack + harga estimator.
- [ ] UI: pie/bar breakdown; drill-down per stack.
- [ ] Verify: stack dengan role labels → breakdown benar per role.

### Task 3.3 — Rightsizing recommendation (UC 32)
**Files:** server `services/rightsizing.py`, `api/rightsizing_routes.py`;
console cost.tsx (tab Recommendations).

- [ ] Sumber data: worker mencatat CPU/RAM utilization per VM (agent opsional)
  atau estimasi dari tipe flavor.
- [ ] Heuristik: VM idle (util < 5% 7 hari) → suggest stop/downsize.
- [ ] UI: daftar rekomendasi (resource, utilisasi, potensi hemat, aksi).
- [ ] Verify: data sample idle → rekomendasi muncul + estimasi hemat.

### Task 3.4 — Multi-project rollup (UC 33)
**Files:** server `api/cost_rollup_routes.py`; console cost.tsx (filter org).

- [ ] Endpoint rollup: total per project/org + share per provider.
- [ ] UI: ringkasan org (jumlah project, total, top provider, trend).
- [ ] Verify: dua project dengan data → rollup benar.

---

## Definisi selesai fase
- Forecast, breakdown, rightsizing, rollup tampil di UI Cost.
- Update `docs/ROADMAP.md`: UC 29, 31, 32, 33 → ✅.

## Risiko
- Akurasi harga bergantung pada estimator per provider — tandai angka sebagai
  estimasi; rightsizing butuh data utilisasi (agent) — mulai dengan heuristik.
