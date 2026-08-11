# Radas — Product Roadmap & Use-Case Backlog

> Radas is a GitOps control plane for OpenTofu & Ansible: a web console
> (`apps/radas-console`), Flask API server (`apps/opensible-server`), Go
> worker (`apps/opensible-worker`) and Go CLI (`apps/cli`), with multi-cloud
> provisioning, configuration management, cost, secrets, RBAC, CI/CD and AI
> assist. This document is the single backlog: every use case, its priority,
> its phase and its current status.

## How to read this

- **Status:** ✅ already supported in the codebase · 🔶 partially supported
  (needs finishing/verification) · ⬜ backlog.
- **Priority:** P0 (foundational / quick win / security), P1 (high value,
  moderate effort), P2 (nice-to-have / exploratory).
- **Phase:** which implementation phase owns the work. Phase plans live in
  `docs/superpowers/plans/` and are expanded into executable tasks when a
  phase starts.

## Phase overview

| Fase | Name | Fokus | Plan doc |
|---|---|---|---|
| Fase 0 | Foundation | Yang sudah ada (✅/🔶) — verifikasi & polish | — |
| Fase 1 | Ops quick wins | Live logs, outbound webhooks, import stack, export, budget alert | `2026-08-11-phase1-ops-quickwins.md` |
| Fase 2 | Governance & Security | Approval, quota, policy gate, service accounts, SSO, compliance | `2026-08-11-phase2-governance.md` |
| Fase 3 | Cost & FinOps | Forecast, tag breakdown, rightsizing, rollup | `2026-08-11-phase3-cost-finops.md` |
| Fase 4 | AI & DevX | AI chat, cost/security suggestions, playbook draft, auto-doc | `2026-08-11-phase4-ai-devx.md` |
| Fase 5 | Integration & Resilience | Remote state, rollback, multi-region, CI/CD lanjutan, otomasi, extensibility | `2026-08-11-phase5-integration-resilience.md` |

---

## A. Provisioning & IaC (1–15)

| # | Use case | Status | Prio | Fase |
|---|---|---|---|---|
| 1 | Provision VM pool App/Platform/Extras dari wizard | ✅ | P0 | 0 |
| 2 | Provision cluster GKE/EKS managed | ✅ | P0 | 0 |
| 3 | Provision server Hetzner Cloud | ✅ | P0 | 0 |
| 4 | Provision VM Biznet Gio (OpenStack) | ✅ | P0 | 0 |
| 5 | Provision VPS IDCloudHost | ✅ | P0 | 0 |
| 6 | Provision ByteDC (HCS) | ✅ | P0 | 0 |
| 7 | Manage DNS/R2/Workers di Cloudflare | ✅ | P0 | 0 |
| 8 | Bring-your-own Kubernetes | ✅ | P0 | 0 |
| 9 | Bootstrap dari blueprint (docker/observability/db/cicd) | ✅ | P0 | 0 |
| 10 | Plan preview (dry-run) sebelum apply | ✅ | P0 | 0 |
| 11 | Deteksi drift & refresh stack | ✅ | P0 | 0 |
| 12 | Remote state management (S3/OBS) | ✅ | P1 | 5 |
| 13 | Rollback & strip stack | ✅ | P1 | 5 |
| 14 | Multi-region deploy dalam satu stack | ⬜ | P2 | 5 |
| 15 | Template stack custom dari repo sendiri | 🔶 | P1 | 5 |

## B. Configuration Management / Ansible (16–25)

| # | Use case | Status | Prio | Fase |
|---|---|---|---|---|
| 16 | Execute playbook ke inventory | ✅ | P0 | 0 |
| 17 | Run inline playbook | ✅ | P0 | 0 |
| 18 | Kelola host & group inventory | ✅ | P0 | 0 |
| 19 | Host vars & group vars | ✅ | P0 | 0 |
| 20 | Check konektivitas SSH massal | ✅ | P0 | 0 |
| 21 | Konfigurasi post-provision via platform roles | ✅ | P0 | 0 |
| 22 | Jadwalkan playbook berkala (cron) | ✅ | P0 | 0 |
| 23 | Remediasi konfigurasi saat drift | ✅ | P1 | 5 |
| 24 | Proxy via bastion/jump host | ⬜ | P2 | 5 |
| 25 | Inject vault secrets ke playbook | ✅ | P0 | 0 |

## C. Cost & FinOps (26–33)

| # | Use case | Status | Prio | Fase |
|---|---|---|---|---|
| 26 | Estimasi biaya stack sebelum apply | ✅ | P0 | 0 |
| 27 | Ekstrak biaya dari terraform plan | ✅ | P0 | 0 |
| 28 | Report biaya per provider | ✅ | P0 | 0 |
| 29 | Trending & forecast biaya | ✅ | P1 | 3 |
| 30 | Budget & alert threshold per project | ✅ | P0 | 1 |
| 31 | Breakdown biaya per tag/role | ✅ | P1 | 3 |
| 32 | Rekomendasi rightsizing VM idle | ✅ | P2 | 3 |
| 33 | Rollup biaya multi-project/org | ✅ | P1 | 3 |

## D. Secrets & Keamanan (34–45)

| # | Use case | Status | Prio | Fase |
|---|---|---|---|---|
| 34 | Enkripsi secret global at rest | ✅ | P0 | 0 |
| 35 | Vault & vault-keys per project | ✅ | P0 | 0 |
| 36 | Rotasi secret terjadwal | ✅ | P1 | 2 |
| 37 | API token management | ✅ | P0 | 0 |
| 38 | Audit trail semua aksi admin | ✅ | P0 | 0 |
| 39 | RBAC roles & permissions granular | ✅ | P0 | 0 |
| 40 | MFA untuk user admin | ✅ | P1 | 2 |
| 41 | Password policy + rate-limit login | ✅ | P0 | 0 |
| 42 | Kelola SSH key per stack | ✅ | P0 | 0 |
| 43 | Sync secrets ke pipeline CI | ✅ | P1 | 2 |
| 44 | Compliance report (siapa akses apa, kapan) | ✅ | P1 | 2 |
| 45 | Isolasi kredensial antar environment | ✅ | P1 | 2 |

## E. CI/CD & GitOps (46–55)

| # | Use case | Status | Prio | Fase |
|---|---|---|---|---|
| 46 | Pipeline multi-stage (provision→configure→deploy) | ✅ | P0 | 0 |
| 47 | Git sync stack (push/pull) | ✅ | P0 | 0 |
| 48 | Push-to-deploy: commit → auto apply | ✅ | P0 | 0 |
| 49 | Preview environment per PR | ⬜ | P2 | 5 |
| 50 | Manual approval gate sebelum apply prod | ✅ | P0 | 2 |
| 51 | Auto-apply setelah review | ✅ | P1 | 5 |
| 52 | Promosi environment via branch | ✅ | P1 | 5 |
| 53 | Trigger pipeline via webhook (GitHub/GitLab) | ✅ | P1 | 5 |
| 54 | Rollback release ke tag | ✅ | P1 | 5 |
| 55 | Notifikasi pipeline ke Slack/Discord | ✅ | P1 | 5 |

## F. Operasi & Observability (56–65)

| # | Use case | Status | Prio | Fase |
|---|---|---|---|---|
| 56 | Riwayat run & log lengkap | ✅ | P0 | 0 |
| 57 | Live stream log eksekusi (SSE/WebSocket) | ✅ | P0 | 1 |
| 58 | Status worker & concurrency | ✅ | P0 | 0 |
| 59 | Antrian job dengan prioritas | ⬜ | P2 | 5 |
| 60 | Health check infrastruktur | ✅ | P0 | 0 |
| 61 | Alert saat run gagal / drift | ✅ | P1 | 5 |
| 62 | Export metrics ke Prometheus | ✅ | P2 | 5 |
| 63 | Backup & restore data server | ✅ | P0 | 0 |
| 64 | Disaster recovery: redeploy dari backup | ✅ | P1 | 5 |
| 65 | Live log streaming (SSE) | ✅ | P0 | 1 |

## G. Multi-tenancy & Governance (66–75)

| # | Use case | Status | Prio | Fase |
|---|---|---|---|---|
| 66 | Isolasi antar project | ✅ | P0 | 0 |
| 67 | Role per environment (dev/sit/prod) | ✅ | P1 | 2 |
| 68 | Approval workflow untuk perubahan prod | ✅ | P0 | 2 |
| 69 | Kuota & limit resource per project | ✅ | P1 | 2 |
| 70 | Tagging wajib pada semua resource | ✅ | P1 | 2 |
| 71 | Policy gate sebelum apply | ✅ | P0 | 2 |
| 72 | Change management + audit trail | ✅ | P1 | 2 |
| 73 | Compliance scorecard per project | ✅ | P2 | 2 |
| 74 | User read-only / guest | ✅ | P1 | 2 |
| 75 | Service account untuk integrasi CI | ✅ | P1 | 2 |

## H. Otomasi & Scheduler (76–85)

| # | Use case | Status | Prio | Fase |
|---|---|---|---|---|
| 76 | Scheduled stack refresh | ✅ | P0 | 0 |
| 77 | Scheduled backup berkala | ✅ | P0 | 0 |
| 78 | Auto-stop VM idle di luar jam kerja | ✅ | P2 | 5 |
| 79 | Auto-scale berdasarkan beban | ⬜ | P2 | 5 |
| 80 | Maintenance window | ✅ | P2 | 5 |
| 81 | Event-driven provisioning via webhook | ✅ | P1 | 5 |
| 82 | Retry policy & exponential backoff | ✅ | P1 | 5 |
| 83 | Cron playbook berkala | ✅ | P0 | 0 |
| 84 | Preferensi notifikasi per user | ✅ | P1 | 5 |
| 85 | Roadmap otomasi terencana (AI planner) | ✅ | P2 | 4 |

## I. AI & Developer Experience (86–93)

| # | Use case | Status | Prio | Fase |
|---|---|---|---|---|
| 86 | Generate stack dari bahasa natural (CLI) | ✅ | P0 | 0 |
| 87 | Generate test otomatis (CLI) | ✅ | P0 | 0 |
| 88 | TUI offline command interpreter | ✅ | P0 | 0 |
| 89 | Saran biaya/keamanan dari AI per plan | ✅ | P1 | 4 |
| 90 | Draft playbook dari prompt AI | ✅ | P1 | 4 |
| 91 | AI chat assistant di console | 🔶 | P1 | 4 |
| 92 | Generate kode CLI dari intent | ✅ | P0 | 0 |
| 93 | Auto-dokumentasi infrastruktur dari state | ✅ | P2 | 4 |

## J. Integrasi & Ekstensibilitas (94–100)

| # | Use case | Status | Prio | Fase |
|---|---|---|---|---|
| 94 | API tokens untuk integrasi eksternal | ✅ | P0 | 0 |
| 95 | Outbound webhooks (events) | ✅ | P0 | 1 |
| 96 | Custom blueprint / plugin provider baru | 🔶 | P1 | 5 |
| 97 | Import stack eksisting ke Radas | ✅ | P0 | 1 |
| 98 | SSO/IdP (OIDC/SAML) | ⬜ | P1 | 2 |
| 99 | Mirror provider/module OpenTofu internal | ⬜ | P2 | 5 |
| 100 | Export data (CSV/JSON) & interop CLI | ✅ | P0 | 1 |

---

## Cross-cutting pillars (UX & Integration DX)

Dua prinsip lintas-fase yang wajib diterapkan di **setiap** fase — bukan
fitur terpisah:

**P1. UX & Design System**
- Pakai token tema yang ada (`src/styles.css` `@theme`: Vercel-inspired,
  Geist Pixel/Geist Mono) — tidak ada warna/radius/font hardcoded baru.
- Empat state wajib untuk tiap view: **loading** (skeleton/spinner),
  **empty** (CTA jelas), **error** (pesan + retry), **success** (konfirmasi).
- A11y: aria-label pada semua kontrol ikon, keyboard navigation & focus ring,
  kontras teks ≥ WCAG AA, `prefers-reduced-motion`.
- Responsive: sidebar collapse → top nav pada mobile (pola yang sudah ada).
- Micro-copy & tooltip konsisten via i18n (en/km/ko).

**P2. Integration DX**
- API versi: semua endpoint baru masuk namespace `/api/v2/*` bila mengubah
  kontrak; `openapi.json` (sudah ada di `/api/v2/openapi.json`) selalu
  diperbarui dan **diverifikasi generate ulang**.
- Webhook: payload schema versioned (`v1`), signature HMAC, retry & dead-letter
  (Fase 1), sample payload di docs.
- Idempotency: POST yang memicu eksekusi menerima header `Idempotency-Key`.
- Rate limit & pagination konsisten (sudah ada rate-limiter di server).
- Error format konsisten `{ error, message, details? }` (sudah dipakai).
- CLI interop: endpoint yang dipakai CLI `apps/cli` tidak direname tanpa
  migrasi.

| # | Use case (baru) | Status | Prio | Fase |
|---|---|---|---|---|
| 101 | Audit design system & token (hapus warna hardcoded) | ✅ | P1 | 1 |
| 102 | Pass aksesibilitas (a11y) seluruh view utama | 🔶 | P1 | 1 |
| 103 | Standarisasi empty/loading/error states semua halaman | ✅ | P1 | 1 |
| 104 | OpenAPI lengkap & auto-generated untuk semua endpoint | ✅ | P0 | 1 |
| 105 | Webhook payload schema + sample docs | ✅ | P1 | 1 |
| 106 | Idempotency key + rate-limit terstandar di API | ✅ | P1 | 2 |

**P3. Error Handling & Reliability**
- **Error envelope konsisten** di semua API: `{ error, message, code, details?, request_id? }`
  dengan HTTP status yang benar (400/401/403/404/409/422/429/500/502/504).
- **Server**: semua exception → JSON envelope; log error menyertakan
  `request_id` + konteks (user, stack) — **tanpa secret** (redaksi
  token/password/tfvars sensitive di logger).
- **Provider errors**: stderr OpenTofu/Ansible di-capture → pesan
  user-friendly di UI + log lengkap di detail run.
- **UI**: ErrorBoundary global; tiap view punya state error + tombol retry;
  toast error konsisten (sonner); 429 → pesan "coba lagi nanti".
- **Lock per stack**: satu eksekusi per stack pada satu waktu (409 bila
  masih berjalan) — cegah race apply bersamaan.
- **Health/readiness** endpoint (`/healthz`, `/readyz`) untuk deployment
  & graceful shutdown (server + worker).

| # | Use case (baru) | Status | Prio | Fase |
|---|---|---|---|---|
| 107 | Error envelope & kode error konsisten seluruh API | ✅ | P0 | 1 |
| 108 | Global ErrorBoundary + error UI per halaman | ✅ | P0 | 1 |
| 109 | `/healthz` & `/readyz` + graceful shutdown | ✅ | P1 | 2 |
| 110 | Lock per-stack (cegah race apply) | ✅ | P0 | 2 |
| 111 | Redaksi secret di semua log | ✅ | P0 | 2 |
| 112 | Verifikasi restore backup (test pemulihan) | ✅ | P2 | 5 |

---

## Ringkasan

- ✅ Sudah ada: **35** · 🔶 Parsial: **8** · ⬜ Backlog: **57**
- P0 backlog (fase 1–2): live logs (57), webhooks (95), import stack (97),
  export (100), budget alert (30), notifikasi (55/84), approval (50),
  policy gate lanjutan (71) — **fase 1 = operasional, fase 2 = governance**.
- Setiap fase dibuka dengan memperluas plan fase menjadi task yang
  executable (sesuai konvensi `docs/superpowers/plans/`).
