# Fase 1 — Ops Quick Wins — Implementation Plan

> **For agentic workers:** implement this plan task-by-task; verify after each
> task. The console (`apps/radas-console`), server (`apps/opensible-server`),
> worker (`apps/opensible-worker`) are separate toolchains — run each task's
> checks from the relevant directory.

**Goal:** 5 use cases operasional berdampak cepat: live log streaming (SSE),
outbound webhooks, import stack eksisting, export data CSV/JSON, dan budget
alert threshold.

**Architecture:** Server Flask menambah endpoint SSE (`/api/executions/stream`)
dan webhook dispatcher + event store; budget checker terjadwal; endpoint
import/export. Console menambah UI: live log panel, webhook settings, import
wizard, export buttons, budget card.

**Tech Stack:** Flask (server), Go (worker), React 19 + TanStack (console),
SSE (Server-Sent Events), SQLite (data store).

## Global Constraints
- `pnpm --filter @radas/console typecheck` & `build` harus PASS (0 error).
- Terapkan design pillars (UX & Integration DX) — lihat `docs/ROADMAP.md` § Cross-cutting pillars.
- Terapkan P3 Error handling & reliability — lihat `docs/ROADMAP.md` § Cross-cutting pillars (error envelope, redaksi secret, `/healthz`, lock per-stack).
- Server: `.venv/bin/python -m compileall` PASS; restart via `pm2 restart radas-server`.
- Tidak mengubah kontrak API yang sudah dipakai provider lain (aditif saja).
- Semua endpoint baru memakai auth JWT (header `Authorization: Bearer`).
- `docs/ROADMAP.md` adalah sumber prioritas; tanda `✅` = selesai fase ini.

---

### Task 1.1 — SSE live log streaming

**Files:**
- Modify: `apps/opensible-server/app.py` (daftarkan blueprint/route)
- Create: `apps/opensible-server/api/execution_stream_routes.py`
- Modify: `apps/radas-console/src/routes/infrastructure/job.tsx` (panel log live)
- Modify: `apps/radas-console/src/lib/api.ts` (helper `openEventSource`)

**Interfaces:**
- Produces: `GET /api/executions/stream?execution_id=<id>` → `text/event-stream`
  dengan event `log` (baris log), `status` (state run), `end`.
- Consumes: worker menulis log run ke `DATA_DIR/executions/<id>.log` (sudah ada).

- [ ] **1.1.1** Buat `execution_stream_routes.py`: endpoint SSE yang membaca
  `DATA_DIR/executions/<id>.log`, stream baris baru (poll file tail tiap 500ms),
  tutup saat run selesai / client disconnect.
- [ ] **1.1.2** Daftarkan blueprint di `app.py` (pola `_register_cloud(app)`).
- [ ] **1.1.3** Console: di `job.tsx`, ganti polling log dengan `EventSource`
  (helper `openEventSource` di `lib/api.ts`); fallback polling jika SSE gagal.
- [ ] **1.1.4** Verify: `curl -N -H "Authorization: Bearer $TOKEN"
  http://localhost:5001/api/executions/stream?execution_id=<id>` → stream event;
  typecheck+build console PASS.

### Task 1.2 — Outbound webhooks (events)

**Files:**
- Create: `apps/opensible-server/services/webhook_dispatcher.py`
- Create: `apps/opensible-server/api/webhook_routes.py`
- Modify: `apps/opensible-server/app.py`
- Modify: `apps/radas-console/src/routes/settings.tsx` (tab Webhooks) + i18n

**Interfaces:**
- Produces: `GET/POST /api/webhooks` (CRUD), `POST /api/webhooks/test`;
  events: `run.finished`, `stack.applied`, `stack.drifted`, `budget.alert`.
- Consumes: dispatcher dipanggil dari execution finish & scheduler drift check.

- [ ] **1.2.1** Model webhook (id, url, secret, events[], enabled) di SQLite + CRUD routes.
- [ ] **1.2.2** Dispatcher: POST JSON bertanda `X-Radas-Signature` (HMAC-SHA256
  secret), retry 3× dengan backoff, timeout 5s.
- [ ] **1.2.3** Hook `run.finished` di titik selesai eksekusi (server).
- [ ] **1.2.4** Console: halaman settings Webhooks (list, create, test, enable).
- [ ] **1.2.5** Verify: buat webhook ke `http://localhost:8080/api/...` (atau
  httpbin), jalankan run, cek event masuk; typecheck+build PASS.

### Task 1.3 — Import stack eksisting

**Files:**
- Create: `apps/opensible-server/api/stack_import_routes.py`
- Create: `apps/radas-console/src/routes/cloud/stacks/import.tsx`
- Modify: `apps/radas-console/src/routes/cloud/stacks/new.tsx` (link "Import stack")

**Interfaces:**
- Produces: `POST /api/cloud/stacks/import` body `{provider, name, tfvars,
  state_json, source}` → membuat stack + menyimpan state; UI wizard import.

- [ ] **1.3.1** Endpoint import: validasi provider dikenal, simpan `state.json`
  + `terraform.tfvars`, inisialisasi workspace, `tofu init` + `tofu refresh`
  (opsional) → status `imported`.
- [ ] **1.3.2** UI: wizard import (pilih provider, upload tfvars + state JSON,
  nama stack) — klon pola wizard schema.
- [ ] **1.3.3** Verify: import state sample (provider bytedc) → stack muncul di
  list, detail menampilkan resource dari state.

### Task 1.4 — Export data CSV/JSON

**Files:**
- Modify: `apps/opensible-server/api/export_routes.py` (baru)
- Modify: `apps/radas-console/src/routes/cloud/summary.tsx` & `cost.tsx`
  (tombol export)

**Interfaces:**
- Produces: `GET /api/export/stacks?format=csv|json`,
  `GET /api/export/executions?format=...`, `GET /api/export/cost?...`.

- [ ] **1.4.1** Endpoint export generik (stacks/executions/cost) dalam CSV/JSON.
- [ ] **1.4.2** UI: tombol Download (CSV/JSON) di halaman Stack list, Cost,
  dan Run history.
- [ ] **1.4.3** Verify: curl export → file valid; typecheck+build PASS.

### Task 1.5 — Budget alert threshold

**Files:**
- Create: `apps/opensible-server/services/budget_service.py`
- Modify: `apps/opensible-server/app.py` (scheduler harian)
- Create: `apps/opensible-server/api/budget_routes.py`
- Modify: `apps/radas-console/src/routes/cloud/cost.tsx` (card budget)

**Interfaces:**
- Produces: `GET/PUT /api/budget/<project>` `{amount, currency, alert_at_pct}`;
  event `budget.alert` (ke webhook + notifikasi in-app).

- [ ] **1.5.1** Model budget + CRUD.
- [ ] **1.5.2** Scheduler: setiap hari hitung cost aktual (dari `/api/cost/estimates`
  aggregate), bandingkan threshold, kirim alert via dispatcher + simpan notif.
- [ ] **1.5.3** UI: card budget di halaman Cost (set amount, progress bar, alert%).
- [ ] **1.5.4** Verify: set budget kecil → scheduler trigger → alert webhook + UI.

---

## Definisi selesai fase
- Semua endpoint baru terverifikasi via curl dengan token.
- Console typecheck + build PASS.
- PM2 stack jalan; tidak ada regresi pada provider/stack yang ada.
- Update `docs/ROADMAP.md`: tandai UC 30, 57, 95, 97, 100 → ✅.

## Risiko
- SSE di belakang proxy nginx perlu `proxy_buffering off` (catat di nginx-docker.conf).
- Webhook ke target eksternal membutuhkan koneksi keluar — dev gunakan
  httpbin/echo endpoint lokal.
- Import state besar: batasi ukuran upload (MAX_CONTENT_LENGTH sudah ada).
