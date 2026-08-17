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

## All-in-One Developer Platform

Plan: [`2026-08-15-all-in-one-developer-platform.md`](superpowers/plans/2026-08-15-all-in-one-developer-platform.md)

- ⬜ Freeze current project/tenant, execution, worker, provider, secrets, source, environment, approval, audit, and feature-flag contracts (Phase 0.1).
- ⬜ Add a project-centric service glossary and current-state architecture map.
- ⬜ Build the RADAS-owned service catalog, runtime adapters, service instances, revisions, operations, and first vertical slice in later phases.

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
| 14 | Multi-region deploy dalam satu stack | ✅ | P2 | 5 |
| 15 | Template stack custom dari repo sendiri | ✅ | P1 | 5 |

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
| 24 | Proxy via bastion/jump host | ✅ | P2 | 5 |
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
| 49 | Preview environment per PR | ✅ | P2 | 5 |
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
| 59 | Antrian job dengan prioritas | ✅ | P2 | 5 |
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
| 79 | Auto-scale berdasarkan beban | ✅ | P2 | 5 |
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
| 91 | AI chat assistant di console | ✅ | P1 | 4 |
| 92 | Generate kode CLI dari intent | ✅ | P0 | 0 |
| 93 | Auto-dokumentasi infrastruktur dari state | ✅ | P2 | 4 |

## J. Integrasi & Ekstensibilitas (94–100)

| # | Use case | Status | Prio | Fase |
|---|---|---|---|---|
| 94 | API tokens untuk integrasi eksternal | ✅ | P0 | 0 |
| 95 | Outbound webhooks (events) | ✅ | P0 | 1 |
| 96 | Custom blueprint / plugin provider baru | ✅ | P1 | 5 |
| 97 | Import stack eksisting ke Radas | ✅ | P0 | 1 |
| 98 | SSO/IdP (OIDC/SAML) | ✅ | P1 | 2 |
| 99 | Mirror provider/module OpenTofu internal | ✅ | P2 | 5 |
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
| 102 | Pass aksesibilitas (a11y) seluruh view utama | ✅ | P1 | 1 |
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

## K. Feature Flags & Progressive Delivery (113–160)

| # | Use case | Status | Prio | Fase |
|---|---|---|---|---|
| 113 | Global feature flag store (CRUD), key unik | ✅ | P0 | 6 |
| 114 | Toggle flag global on/off (kill switch) | ✅ | P0 | 6 |
| 115 | Override flag per environment (dev/staging/prod/preview) | ✅ | P0 | 6 |
| 116 | Percentage rollout deterministik (0-100%) via hash konsisten | ✅ | P1 | 6 |
| 117 | Whitelist/blacklist user untuk targeting | ✅ | P1 | 6 |
| 118 | Evaluate flag via REST API (key, env, user) -> enabled+reason | ✅ | P0 | 6 |
| 119 | Enumerasi flag untuk seed default (block_apply, block_destroy, preview, auto_scale) | 🔶 | P1 | 6 |
| 120 | Kill-switch block_apply menahan semua apply stack (423) | ✅ | P1 | 6 |
| 121 | Flag per-stack stack.<name>.block_apply | ✅ | P1 | 6 |
| 122 | Audit trail perubahan flag (siapa, kapan, dari-ke) | ✅ | P1 | 6 |
| 123 | TTL/schedule auto-expire flag (maintenance window) | ✅ | P2 | 6 |
| 124 | Flag eksperimen untuk A/B testing safety | ✅ | P2 | 6 |
| 125 | Progressive rollout otomatis: 10%->25%->50%->100% dengan interval | ✅ | P2 | 6 |
| 126 | Rollback flag ke nilai sebelumnya (snapshot) | ⬜ | P2 | 6 |
| 127 | Flag digunakan oleh automation_rules (gate auto-scale/auto-stop) | 🔶 | P1 | 6 |
| 128 | Flag dipakai di approval flow (skip approval jika flag) | ⬜ | P2 | 6 |
| 129 | Seeder flag bawaan aktif otomatis saat inisialisasi workspace | 🔶 | P1 | 6 |
| 130 | Seeder flag bawaan aktif otomatis saat inisialisasi workspace | ⬜ | P1 | 6 |
| 131 | Deteksi flag mati/duplicate key pada saat create | ✅ | P1 | 6 |
| 132 | Deteksi flag mati/duplicate key pada saat create | ⬜ | P1 | 6 |
| 133 | Bulk import/export flag (JSON) untuk migrasi | ⬜ | P2 | 6 |
| 134 | Flag sebagai target aturan remediation (remediate only if flag) | ⬜ | P2 | 6 |
| 135 | Evaluasi flag di worker sebelum eksekusi apply/destroy | ⬜ | P1 | 6 |
| 136 | Flag per stack group / VPC / environment bundle | ⬜ | P2 | 6 |
| 137 | Penjadwalan flag: aktif saat jam kerja saja | ✅ | P2 | 6 |
| 138 | Perbandingan perilaku stack dengan flag on/off | ⬜ | P2 | 6 |
| 139 | Integrasi OpenFeature SDK untuk evaluasi konsisten | ⬜ | P2 | 6 |
| 140 | Flag untuk fitur UI (menampilkan/menyembunyikan modul) | ⬜ | P1 | 6 |
| 141 | Safety valve: auto-disable flag jika error rate stack naik | ✅ | P2 | 6 |
| 142 | Flag ber-budget: block apply bila cost flag region melebihi ambang | ⬜ | P2 | 6 |
| 143 | Halaman console Feature Flags dengan toggle real-time | ✅ | P0 | 6 |
| 144 | Badge status per flag (ON/OFF/KILLED/ROLLOUT) | ✅ | P1 | 6 |
| 145 | Daftar flag yang men-depend (referenced-by) sebuah stack | 🔶 | P2 | 6 |
| 146 | Copy flag (duplicate sebagai template) | ⬜ | P2 | 6 |
| 147 | Search/filter flag by tag, env, status | ✅ | P1 | 6 |
| 148 | Notifikasi saat flag diubah oleh user lain | ⬜ | P2 | 6 |
| 149 | Search/filter flag by tag, env, status | 🔶 | P1 | 6 |
| 150 | Export key flag ke environment untuk CI (evaluasi di pipeline) | ⬜ | P2 | 6 |
| 151 | Flag webhook: panggil URL saat flag berubah | ⬜ | P2 | 6 |
| 152 | Multi-tenant: flag per project dengan inherit global | ✅ | ⬜ | P1 | 6 |
| 153 | Graceful degradation: kegagalan evaluasi -> default safe (off) | ✅ | P1 | 6 |
| 154 | Caching hasil evaluasi (TTL) untuk performa | ✅ | P2 | 6 |
| 155 | Flag schedule override via cron (aktivasi libur) | ⬜ | P2 | 6 |
| 156 | Riwayat evaluasi per stack (log decision reason) | ✅ | P2 | 6 |
| 157 | Flag untuk mengontrol preview env (izinkan/tolak preview) | ⬜ | P1 | 6 |
| 158 | Perbaikan intest: flag expired auto-archive | ✅ | P2 | 6 |
| 159 | Diff audit: bandingkan konfigurasi flag antar project | ⬜ | P2 | 6 |
| 160 | Dokumentasi otomatis flag aktif di halaman stack | ⬜ | P2 | 6 |

## L. Test Case Management & IaC Validation (161–215)

| # | Use case | Status | Prio | Fase |
|---|---|---|---|---|
| 161 | Registry test case: definisi test (nama, stack, assertion) CRUD | ✅ | P0 | 6 |
| 162 | Eksekusi test terhadap plan terakhir (tofu plan output) | ✅ | P0 | 6 |
| 163 | Support OpenTofu native test (.tftest.hcl run blocks) | ✅ | P1 | 6 |
| 164 | Assertion library bawaan: CIDR publik, volume unencrypted, tag wajib | ✅ | P0 | 6 |
| 165 | Assertion: IAM wildcard (Action * / Resource *) | ✅ | P1 | 6 |
| 166 | Assertion: S3 bucket public / ACL terbuka | ✅ | P1 | 6 |
| 167 | Assertion: security group port 22/3389 terbuka | ✅ | P1 | 6 |
| 168 | Assertion: versi image provider outdated | 🔶 | P2 | 6 |
| 169 | Assertion: belum ada tag environment/owner | 🔶 | P1 | 6 |
| 170 | Assertion: tfvars menyimpan secret plaintext | ✅ | P1 | 6 |
| 171 | Assertion: harga bulanan melebihi budget stack | 🔶 | P1 | 6 |
| 172 | Assertion: jumlah instance > ambang yang diizinkan | 🔶 | P2 | 6 |
| 173 | Test severity (blocker/warning/info) dan policy tentang blocker | ✅ | P1 | 6 |
| 174 | Gate: test gagal blocker -> tolak apply | ✅ | P0 | 6 |
| 175 | Gate: test warning -> izin tapi notifikasi | 🔶 | P2 | 6 |
| 176 | Jadwal eksekusi test berkala (cron) tanpa apply | 🔶 | P1 | 6 |
| 177 | Riwayat hasil test per stack (pass/fail/time) | ✅ | P0 | 6 |
| 178 | Dashboard Test: total, pass rate, tren 30 hari | ✅ | P1 | 6 |
| 179 | Filter test by tag: security, cost, compliance, drift | 🔶 | P1 | 6 |
| 180 | Test template dari katalog (prebuilt selain assertion) | 🔶 | P1 | 6 |
| 181 | Clone/edit test definisi dengan versi | 🔶 | P2 | 6 |
| 182 | Test berparameter: variabel per environment | 🔶 | P1 | 6 |
| 183 | Eksekusi test via CLI radas test | 🔶 | P2 | 6 |
| 184 | Integrasi tofu validate + tflint check otomatis pra-apply | 🔶 | P1 | 6 |
| 185 | Integrasi checkov/tfsec scan iaC (static security) | ⬜ | P1 | 6 |
| 186 | Report test menyatu dengan execution log (run id) | ⬜ | P1 | 6 |
| 187 | Test drift: bandingkan state vs config (drift as test) | ✅ | P1 | 6 |
| 188 | Test drift: bandingkan state vs config (drift as test) | ✅ | P1 | 6 |
| 189 | Retry test gagal dengan backoff (max N) | ✅ | P2 | 6 |
| 190 | Batch run: jalankan semua test untuk stack di environment | 🔶 | P1 | 6 |
| 191 | Approval yang men-trigger re-test otomatis | ⬜ | P2 | 6 |
| 192 | Test dijalankan pada preview env (CI pipeline) | ⬜ | P1 | 6 |
| 193 | Ekspor hasil test ke JSON untuk CI/artifacts | ✅ | P2 | 6 |
| 194 | Test yang menelurkan issue otomatis (create issue/webhook) | ⬜ | P2 | 6 |
| 195 | Ekspor hasil test ke JSON untuk CI/artifacts | ✅ | P2 | 6 |
| 196 | Test Hanya untuk stack tertentu (targeting) | ⬜ | P1 | 6 |
| 197 | Severity policy configurable per project | ✅ | P1 | 6 |
| 198 | Test Hanya untuk stack tertentu (targeting) | ✅ | P1 | 6 |
| 199 | Paralelisme test (concurrency configurable) | ✅ | P2 | 6 |
| 200 | Test per resource vs per stack | ⬜ | P2 | 6 |
| 201 | Batas waktu eksekusi test (timeout) | 🔶 | P1 | 6 |
| 202 | Score keamanan stack dari hasil test (0-100) | ⬜ | P2 | 6 |
| 203 | Baseline test: snaphot pass untuk deteksi regresi | ✅ | P2 | 6 |
| 204 | Notifikasi Discord/Slack saat test blocker gagal | ✅ | P1 | 6 |
| 205 | Test untuk Ansible (yaml lint + syntax check) | ✅ | P1 | 6 |
| 206 | Test idempotensi playbook (run 2x bandingkan) | ⬜ | P2 | 6 |
| 207 | Test untuk Ansible (yaml lint + syntax check) | ✅ | P1 | 6 |
| 208 | Only-run test pada perubahan (diff-based) | ⬜ | P2 | 6 |
| 209 | Versioning test definition dengan rollback | ✅ | P2 | 6 |
| 210 | Import test dari file .tftest.hcl ke registry | ⬜ | P1 | 6 |
| 211 | Validate ekspresi assertion sebelum simpan (dry-run) | ✅ | P1 | 6 |
| 212 | Test pada state kosong/inisial (terraform plan -refresh=false) | ⬜ | P2 | 6 |
| 213 | Mock provider offline test (tanpa cloud) | 🔶 | P1 | 6 |
| 214 | Ui halaman Test Cases: list, run, history, hasil | ✅ | P1 | 6 |
| 215 | Dokumentasi assertion katalog di halaman test | ✅ | P2 | 6 |

## M. GitHub Actions Management (216–270)

| # | Use case | Status | Prio | Fase |
|---|---|---|---|---|
| 216 | Konfigurasi koneksi GitHub (token PAT/Installation app) di settings | ✅ | P0 | 6 |
| 217 | List repositories terhubung (dari koneksi) | ✅ | P0 | 6 |
| 218 | List workflows per repository (API workflows) | ✅ | P0 | 6 |
| 219 | Detail workflow (path, state, created/updated) | ✅ | P1 | 6 |
| 220 | Enable/disable workflow via API | 🔶 | P1 | 6 |
| 221 | Trigger workflow_dispatch dengan input dari console | ✅ | P0 | 6 |
| 222 | List workflow runs (status, conclusion, head_branch, event) | ✅ | P0 | 6 |
| 223 | Detail run: jobs, steps, duration, attempt | 🔶 | P1 | 6 |
| 224 | Logs per job: download/stream ke console | 🔶 | P1 | 6 |
| 225 | Retry/re-run run yang gagal (re-run-failed-jobs) | ✅ | P1 | 6 |
| 226 | Cancel run yang sedang berjalan | ✅ | P1 | 6 |
| 227 | Approve/reject deployment (environment protection) | ✅ | P1 | 6 |
| 228 | Watch real-time status run (polling SSE) | ✅ | P1 | 6 |
| 229 | Aggregasi runs lintas repo (dashboard) | 🔶 | P1 | 6 |
| 230 | Filter runs by repo/status/event/since | ✅ | P1 | 6 |
| 231 | Statistik: success rate per repo/workflow 7d/30d | ✅ | P1 | 6 |
| 232 | Durasi rata-rata workflow & p95 | ✅ | P2 | 6 |
| 233 | Deteksi flaky: workflow sukses setelah retry | ✅ | P2 | 6 |
| 234 | Buat workflow baru dari template (scaffold tofu/ansible) | ✅ | P0 | 6 |
| 235 | Template workflow: tofu-plan.yaml, tofu-apply.yaml, ansible-run.yaml | ✅ | P0 | 6 |
| 236 | Commit workflow file via Contents API (create/update) | ⬜ | P0 | 6 |
| 237 | PR plan comment integration (komentar hasil plan di PR) | ✅ | P1 | 6 |
| 238 | Required check enforcement: workflow harus sukses sebelum merge | ✅ | P1 | 6 |
| 239 | Atur environment protection rules (require approval) | ✅ | P1 | 6 |
| 240 | List self-hosted runner groups & runners | 🔶 | P1 | 6 |
| 241 | Registrasi runner token + instruksi setup runner | ✅ | P1 | 6 |
| 242 | Provision runner sebagai stack OpenTofu (ephemeral) | ⬜ | P2 | 6 |
| 243 | Hapus runner offline (remove runner) | ⬜ | P1 | 6 |
| 244 | Label runner management (add/remove labels) | ⬜ | P2 | 6 |
| 245 | Secrets per repo/environment via API (CRUD) | ✅ | P1 | 6 |
| 246 | Workflow template: scaffold tofu/ansible workflow files di console | ✅ | P0 | 6 |
| 247 | Template workflow: tofu-plan.yaml, tofu-apply.yaml, ansible-run.yaml | ✅ | P0 | 6 |
| 248 | Commit workflow file via Contents API (create/update) | ✅ | P0 | 6 |
| 249 | Auto-retry policy untuk run gagal (configurable) | ⬜ | P2 | 6 |
| 250 | Webhook peristiwa run masuk ke audit log | ⬜ | P1 | 6 |
| 251 | Notifikasi Slack/Discord untuk run gagal | ⬜ | P1 | 6 |
| 252 | Search runs by commit SHA | ⬜ | P1 | 6 |
| 253 | Manage multiple org/repo (multi-koneksi) | ⬜ | P2 | 6 |
| 254 | Rate limit handling & backoff untuk GitHub API | ⬜ | P1 | 6 |
| 255 | Repository metadata: default branch, visibility, language | ⬜ | P2 | 6 |
| 256 | Scan secrets exposure di workflow file (dump env) | ⬜ | P2 | 6 |
| 257 | Pin action ke SHA check (supply-chain) | ⬜ | P2 | 6 |
| 258 | Permission berlebih check (permissions: contents: write dll) | ⬜ | P2 | 6 |
| 259 | Workflow schedule (cron) list & next run prediction | ⬜ | P2 | 6 |
| 260 | Test workflow: dry-run dispatch tanpa perubahan | ⬜ | P2 | 6 |
| 261 | Konfigurasi runner auto-scaling (scale set) | ⬜ | P2 | 6 |
| 262 | Run cost attribution: runner minutes per project | ⬜ | P2 | 6 |
| 263 | GitHub API token rotasi & health check koneksi | ⬜ | P1 | 6 |
| 264 | Koneksi OAuth App / GitHub App (installation webhook) | ⬜ | P2 | 6 |
| 265 | UI halaman GitHub Actions: rilis dashboard | ⬜ | P1 | 6 |
| 266 | UI detail run dengan log viewer | ⬜ | P1 | 6 |
| 267 | Deployment summary: environment, ref, status | ⬜ | P2 | 6 |
| 268 | Event push/PR-based pipeline di mapped ke stack | ⬜ | P1 | 6 |
| 269 | UI halaman GitHub Actions: rilis dashboard | ✅ | P1 | 6 |
| 270 | UI detail run dengan log viewer | 🔶 | P1 | 6 |

## N. BYOC & Multi-Cloud Resource Import (271–330)

| # | Use case | Status | Prio | Fase |
|---|---|---|---|---|
| 271 | Koneksi akun cloud (AWS/GCP/Azure/Hetzner/Biznet/IDCH) dengan kredensial | ✅ | P0 | 6 |
| 272 | Validasi kredensial: test koneksi sebelum simpan | ✅ | P0 | 6 |
| 273 | IAM role-based (assume-role) untuk AWS/GCP service account | ⬜ | P1 | 6 |
| 274 | Simpan secret koneksi terenkripsi (bukan plaintext) | ✅ | P0 | 6 |
| 275 | Deteksi provider dari kredensial (auto-detect region/endpoint) | 🔶 | P1 | 6 |
| 276 | Multi-account: list akun terhubung dengan status health | ✅ | P1 | 6 |
| 277 | Resource discovery: list VM/network/storage di akun | ✅ | P1 | 6 |
| 278 | Inventory snapshot berkala (sync jobs) | ✅ | P2 | 6 |
| 279 | Import resource ke stack: mapping id -> resource address | ⬜ | P0 | 6 |
| 280 | Generate import block OpenTofu (tofu import block) | ✅ | P1 | 6 |
| 281 | Wizard import: pilih resource dari inventory -> buat stack impor | 🔶 | P1 | 6 |
| 282 | Import beberapa resource sekaligus (batch) | ✅ | P1 | 6 |
| 283 | Import beberapa resource sekaligus (batch) | ⬜ | P1 | 6 |
| 284 | Managed-imported tracking: tandai resource yang dikelola radas | ✅ | P1 | 6 |
| 285 | Exclude resource dari manajemen (release) | ✅ | P1 | 6 |
| 286 | Drift detection untuk resource imported | ✅ | P1 | 6 |
| 287 | Cost access: read billing API per akun | ✅ | P2 | 6 |
| 288 | Budget alert bergabung dengan BYOC akun | ✅ | P2 | 6 |
| 289 | Health check berkala koneksi (cron ping) | ✅ | P1 | 6 |
| 290 | Notifikasi saat credential expired/rejected | 🔶 | P1 | 6 |
| 291 | Provider Biznet Gio: OpenStack API import (Keystone/Neutron/Nova) | ✅ | P1 | 6 |
| 292 | Provider IDCloudHost: REST API import | ✅ | P1 | 6 |
| 293 | Sync state dari existing terraform state (import state) | ✅ | P1 | 6 |
| 294 | Multiple state file: remote vs local detect | ⬜ | P1 | 6 |
| 295 | Kredensial per stack (bukan hanya per akun) | ⬜ | P1 | 6 |
| 296 | Rotasi kredensial otomatis (schedule) | 🔶 | P2 | 6 |
| 297 | Health check berkala koneksi (cron ping) | 🔶 | P1 | 6 |
| 298 | Notifikasi saat credential expired/rejected | ⬜ | P1 | 6 |
| 299 | Provider Biznet Gio: OpenStack API import (Keystone/Neutron/Nova) | ⬜ | P1 | 6 |
| 300 | Provider IDCloudHost: REST API import | ⬜ | P1 | 6 |
| 301 | Deteksi provider lain via OpenStack/通用 endpoint | ⬜ | P2 | 6 |
| 302 | Audit: daftar akun diakses siapa kapan | ⬜ | P1 | 6 |
| 303 | Perbandingan harga antar akun/provider (multi-cloud cost) | ⬜ | P2 | 6 |
| 304 | Reuse VPC/network resource dari akun untuk stack | ⬜ | P1 | 6 |
| 305 | Tag grouping untuk resource org (cost center) | ⬜ | P2 | 6 |
| 306 | Ekspor inventory ke CSV | ⬜ | P2 | 6 |
| 307 | Import-only mode (tanpa apply, hanya adopt) | ⬜ | P1 | 6 |
| 308 | Clash detection: resource sudah di stack lain | ⬜ | P2 | 6 |
| 309 | Resource graph: visualisasi dependency akun | ⬜ | P2 | 6 |
| 310 | Threshold quota per akun (max VM/NAT/network) | ⬜ | P1 | 6 |
| 311 | SLA monitoring: uptime resource via provider API | ⬜ | P2 | 6 |
| 312 | Backup config akun (export koneksi JSON encrypted) | ⬜ | P2 | 6 |
| 313 | Permission set minimal (least privilege) otomatis | ⬜ | P2 | 6 |
| 314 | Onboarding checklist multi-akun (wizard) | ⬜ | P1 | 6 |
| 315 | Owner per akun (pemilik bertanggung jawab) | ⬜ | P2 | 6 |
| 316 | Account-level policy gate (sebelum apply) | ⬜ | P1 | 6 |
| 317 | Integrasi provider mirror untuk akun offline | ⬜ | P2 | 6 |
| 318 | Resource type coverage: VM, LB, DNS, storage, K8s | ⬜ | P1 | 6 |
| 319 | Bulk import via terraformer-style (resource scanning) | ⬜ | P2 | 6 |
| 320 | Diff antara inventory vs stack (unmanaged resources) | ⬜ | P1 | 6 |
| 321 | Unmanaged resource notification (sisa tak terkelola) | ⬜ | P2 | 6 |
| 322 | Destroy imported stack -> lepaskan saja (force destroy off) | ⬜ | P1 | 6 |
| 323 | Protect resource penting (delete protection) | ⬜ | P1 | 6 |
| 324 | Multi-session credential parkir (variabel env per eksekusi) | ⬜ | P2 | 6 |
| 325 | UI halaman BYOC: koneksi + inventory + import | ⬜ | P0 | 6 |
| 326 | Wizard tambah akun dengan pilihan provider | ⬜ | P1 | 6 |
| 327 | Badge status akun (ok/warn/error/last-check) | ⬜ | P1 | 6 |
| 328 | UI halaman BYOC: koneksi + inventory + import | ✅ | P0 | 6 |
| 329 | Wizard tambah akun dengan pilihan provider | ✅ | P1 | 6 |
| 330 | Badge status akun (ok/warn/error/last-check) | ✅ | P1 | 6 |

## O. Competitor Parity (331–433)

| # | Use case | Status | Prio | Fase |
|---|---|---|---|---|
| 331 | Remote state lock global (anti race apply) | ✅ | P0 | 6 |
| 332 | State versions browsing & rollback (sudah partial, per stack) | 🔶 | P1 | 6 |
| 333 | Run history dengan comments (diskusi per run) | ⬜ | P2 | 6 |
| 334 | Private module registry (publish modul internal) | ⬜ | P0 | 6 |
| 335 | Budget alert per workspace (sudah ada) -> per project agg | 🔶 | P1 | 6 |
| 336 | Sentinel/OPA policy set versioned | ⬜ | P1 | 6 |
| 337 | Policy yang menilai plan JSON (intermediate representation) | ⬜ | P2 | 6 |
| 338 | Cost estimation per plan (sudah parse plan) -> angka eksplisit | 🔶 | P1 | 6 |
| 339 | VCS-driven workspaces with branch mapping | ⬜ | P0 | 6 |
| 340 | API-driven runs (sudah ada execution) | 🔶 | P1 | 6 |
| 341 | Audit trail full event (action, actor, resource) | ⬜ | P0 | 6 |
| 342 | Drift detection scheduling dengan alert | ⬜ | P0 | 6 |
| 343 | Rollback ke state versi mana pun (sudah ada snapshot) | 🔶 | P0 | 6 |
| 344 | Multi-cloud provider pluggable (sudah ada) | 🔶 | P1 | 6 |
| 345 | Review apps: approve/reject flow dengan comment | ⬜ | P1 | 6 |
| 346 | Policy as code multi-format (OPA, custom) | ⬜ | P1 | 6 |
| 347 | Context policy: tug context (PR, stack, env) | ⬜ | P2 | 6 |
| 348 | Stack dependencies: graph antar stack (korelasi) | ⬜ | P1 | 6 |
| 349 | Notification hook ke Slack/Discord/Teams/Webhook | ⬜ | P1 | 6 |
| 350 | Self-hosted agent (worker) dengan label & constraint | 🔶 | P1 | 6 |
| 351 | Terragrunt support (run Terragrunt) | ⬜ | P2 | 6 |
| 352 | Serverless/Pulumi integration überhaupt | ⬜ | P2 | 6 |
| 353 | Attribute mapping templates (substitusi env var) | ⬜ | P2 | 6 |
| 354 | Rollout envelopes (gradual rollout per env) | ⬜ | P2 | 6 |
| 355 | Drift auto-fix (apply config saat drift) | ⬜ | P2 | 6 |
| 356 | Custom IAM role switching di environment | ⬜ | P2 | 6 |
| 357 | TTL environment (auto-destroy setelah durasi) | ⬜ | P1 | 6 |
| 358 | Cost analytics per tag/provider/branch | ⬜ | P1 | 6 |
| 359 | Policy custom (Cryo) untuk env | ⬜ | P2 | 6 |
| 360 | Audit log export (JSONL) ke SIEM | ⬜ | P2 | 6 |
| 361 | SSO SAML + SCIM provisioning | ⬜ | P2 | 6 |
| 362 | Approval workflow multi-step (chain) | ⬜ | P1 | 6 |
| 363 | Parallel workload isolation | ⬜ | P2 | 6 |
| 364 | Import dari state remote (webhook-style) | ⬜ | P1 | 6 |
| 365 | Agent per environment group | ⬜ | P2 | 6 |
| 366 | Policy yang reusable lintas project | ⬜ | P1 | 6 |
| 367 | Multi-branch runner parallel (preview per branch) | ⬜ | P1 | 6 |
| 368 | PR comment plan differential | ⬜ | P1 | 6 |
| 369 | Drift analysis per branch (bandingkan plan) | ⬜ | P2 | 6 |
| 370 | Job with team attribution (siapa request) | ⬜ | P1 | 6 |
| 371 | Slash commands di PR: /plan, /apply, /lock | ⬜ | P1 | 6 |
| 372 | Apply requirement: approval di PR (review) | ⬜ | P1 | 6 |
| 373 | Project locking (anti konflik apply) | ⬜ | P1 | 6 |
| 374 | Atlantis.yaml support (workflow per dir) | ⬜ | P2 | 6 |
| 375 | Cloud resilience: deteksi resource tak terkelola | ⬜ | P1 | 6 |
| 376 | Sweep: resource tak terkelola -> warning/import | ⬜ | P2 | 6 |
| 377 | Policy drift visual dashboard | ⬜ | P2 | 6 |
| 378 | PR-based scan combine (scan + plan dalam PR) | ⬜ | P1 | 6 |
| 379 | Policy check otomatis saat PR (gate) | ⬜ | P1 | 6 |
| 380 | Playbook survey: form input saat run | ⬜ | P1 | 6 |
| 381 | Job templates dengan credentials mapping | ⬜ | P1 | 6 |
| 382 | Job history aggregation (sudah ada) | 🔶 | P1 | 6 |
| 383 | Credentials vault per environment | 🔶 | P1 | 6 |
| 384 | Execution environments (containerized runs) | ⬜ | P2 | 6 |
| 385 | Smart inventory: dynamic host groups | ⬜ | P1 | 6 |
| 386 | Workflow templates multi-playbook (chain) | ⬜ | P1 | 6 |
| 387 | Callback/webhook untuk job launch | ⬜ | P2 | 6 |
| 388 | RBAC granular: role per resource type (stack, secret, key) | ✅ | ⬜ | P0 | 6 |
| 389 | Project hierarchy: org -> project -> env | ✅ | ⬜ | P1 | 6 |
| 390 | Delegated admin (project admin) | ✅ | ⬜ | P2 | 6 |
| 391 | Read-only kls semua (sudah ada role) | 🔶 | P1 | 6 |
| 392 | Audit retention & export policy | ⬜ | P2 | 6 |
| 393 | Landing dashboard per project (widget stack) | ⬜ | P0 | 6 |
| 394 | Dark mode konsisten (sudah) | 🔶 | P1 | 6 |
| 395 | Keyboard shortcuts (g untuk go, / untuk search) | ⬜ | P2 | 6 |
| 396 | Global search resources (stack, run, secret) | ⬜ | P1 | 6 |
| 397 | Onboarding wizard pertama kali | ⬜ | P1 | 6 |
| 398 | Empty states dengan CTA yang jelas | ⬜ | P1 | 6 |
| 399 | Responsive mobile (sudah) | 🔶 | P2 | 6 |
| 400 | OpenAPI spec lengkap (sudah partial) | 🔶 | P1 | 6 |
| 401 | REST client SDK (JS/Python) | ⬜ | P2 | 6 |
| 402 | CLI parity full (radas <-> console) | ⬜ | P1 | 6 |
| 403 | WebSocket realtime per stack (sudah SSE) | 🔶 | P2 | 6 |
| 404 | Webhook outbound retry dengan DLQ | ⬜ | P1 | 6 |
| 405 | Idempotent API keys (idempotency header) | ⬜ | P2 | 6 |
| 406 | Failover: multiple server instance | ⬜ | P2 | 6 |
| 407 | State backup S3/GCS (remote state sync) | ⬜ | P1 | 6 |
| 408 | Plan-only lint sebelum apply otomatis | ⬜ | P1 | 6 |
| 409 | Circuit breaker: stop apply setelah N kegagalan | ⬜ | P2 | 6 |
| 410 | Dead-letter queue untuk execution gagal | ⬜ | P1 | 6 |
| 411 | Forecast bulanan per project (sudah) | 🔶 | P2 | 6 |
| 412 | Anomaly detection cost (tiba-tiba naik) | ⬜ | P2 | 6 |
| 413 | Saran hak-as-right (rightsizing sudah) | 🔶 | P1 | 6 |
| 414 | Cost per stack vs per env breakdown | ⬜ | P1 | 6 |
| 415 | Chargeback export ke spreadsheet | ⬜ | P2 | 6 |
| 416 | Compliance report PDF export | ⬜ | P1 | 6 |
| 417 | Evidence collection otomatis (screenshot config) | ⬜ | P2 | 6 |
| 418 | Framework templates (SOC2, HIPAA, PCI) | ⬜ | P1 | 6 |
| 419 | Failing control -> ticket otomatis | ⬜ | P2 | 6 |
| 420 | Secret scanning di plan output | ⬜ | P1 | 6 |
| 421 | Container registry scan untuk worker image | ⬜ | P2 | 6 |
| 422 | IP allowlist untuk UI/API | ⬜ | P1 | 6 |
| 423 | Session timeout & inactivity lock | ⬜ | P1 | 6 |
| 424 | Password policy configurable | ⬜ | P1 | 6 |
| 425 | Audit log user actions (sudah ada) -> enrich search | 🔶 | P1 | 6 |
| 426 | Scheduled plan (daily plan, diff report) | ⬜ | P1 | 6 |
| 427 | Stack health score (drift+test+age) | ⬜ | P2 | 6 |
| 428 | Bulk actions: apply banyak stack sekaligus | ⬜ | P2 | 6 |
| 429 | Clone stack antar project | ⬜ | P2 | 6 |
| 430 | Import/export stack config JSON | ⬜ | P1 | 6 |
| 431 | Tagging stack untuk filter & automation | ⬜ | P1 | 6 |
| 432 | Git sync dua arah (sudah pull -> add push) | 🔶 | P1 | 6 |
| 433 | Commit message convention enforcement | ⬜ | P2 | 6 |

## P. Cross-cutting Reliability, UX & Integration (434–651)

| # | Use case | Status | Prio | Fase |
|---|---|---|---|---|
| 434 | i18n penuh (EN/KM/KO) untuk semua halaman baru (flags, tests, gh, byoc) | ⬜ | P1 | 6 |
| 435 | Empty state tiap seksi baru dengan CTA | ⬜ | P1 | 6 |
| 436 | A11y kontras pada badge status | ⬜ | P2 | 6 |
| 437 | Membatasi panjang key/nama dengan pesan jelas | ✅ | P1 | 6 |
| 438 | Konfirmasi destruktif (delete flag/accepted) dengan typing | ⬜ | P1 | 6 |
| 439 | Debounce pencarian di list panjang | ⬜ | P2 | 6 |
| 440 | Skeleton loading untuk halaman baru | ⬜ | P1 | 6 |
| 441 | Error toast konsisten (sudah sonner) | 🔶 | P1 | 6 |
| 442 | Pagination API untuk daftar besar (runs, tests, resources) | ✅ | P1 | 6 |
| 443 | Realtime sheet: status run streaming di dashboard GH | ⬜ | P1 | 6 |
| 444 | Filter kombinasi (status+tag+env) di tests | ⬜ | P1 | 6 |
| 445 | Export CSV/JSON dari tiap tabel | ⬜ | P2 | 6 |
| 446 | Copy-to-clipboard untuk ID/token | ⬜ | P1 | 6 |
| 447 | Time format konsisten (relative + absolute) | ⬜ | P1 | 6 |
| 448 | Tema terang juga dujikan (bukan hanya dark) | ⬜ | P2 | 6 |
| 449 | Loading state per tombol aksi | ⬜ | P1 | 6 |
| 450 | Tooltip dokumentasi field | ⬜ | P2 | 6 |
| 451 | Route fallback 404 yang baik | ⬜ | P2 | 6 |
| 452 | Breadcrumb dinamis untuk sub-halaman baru | ⬜ | P1 | 6 |
| 453 | Guard role sebelum aksi mutasi (readonly sudah) | 🔶 | P1 | 6 |
| 454 | Rate limit API endpoint publik (webhook preview) | ✅ | P1 | 6 |
| 455 | Body size limit untuk payload besar | ✅ | P1 | 6 |
| 456 | CORS restrict ke origin console | ⬜ | P1 | 6 |
| 457 | Validate JSON schema request (semua route baru) | ⬜ | P1 | 6 |
| 458 | Idempotency untuk create flag/preview | ⬜ | P2 | 6 |
| 459 | Conflict detection 409 untuk duplicate key | ⬜ | P1 | 6 |
| 460 | Not found 404 semantik | ⬜ | P1 | 6 |
| 461 | Error envelope seragam (error/message) | ⬜ | P1 | 6 |
| 462 | Logging terstruktur JSON untuk action baru | ⬜ | P1 | 6 |
| 463 | Trace id lintas log (request/execution) | ⬜ | P2 | 6 |
| 464 | Metrics Prometheus untuk API (request rate, latency) | ⬜ | P2 | 6 |
| 465 | Health endpoint mencover service baru | ✅ | P1 | 6 |
| 466 | Snapshot data flags/tests untuk backup | ⬜ | P1 | 6 |
| 467 | Migrasi store JSON ke SQLite opsional | ⬜ | P2 | 6 |
| 468 | Test untuk service baru (unit test python) | ⬜ | P1 | 6 |
| 469 | CI pipeline commit: lint + typecheck + test | ⬜ | P1 | 6 |
| 470 | Standardisasi code style (oxfmt/ruff) | ⬜ | P1 | 6 |
| 471 | Dokumentasi API routes di openapi spec | ⬜ | P2 | 6 |
| 472 | CLI command untuk tiap fitur baru (radas flags/tests/gh/byoc) | ⬜ | P2 | 6 |
| 473 | Al to-actions: rekomendasi flag dari safety heuristic | ⬜ | P2 | 6 |
| 474 | Notifikasi push (sudah) diperluas untuk test/gh events | ⬜ | P1 | 6 |
| 475 | Email digest harian: test fail + drift | ⬜ | P2 | 6 |
| 476 | Webhook outbound untuk test result event | ⬜ | P1 | 6 |
| 477 | Recovery: restart worker tidak kehilangan queue | ⬜ | P1 | 6 |
| 478 | Backoff execution claim conflict | ⬜ | P1 | 6 |
| 479 | Worker fairness (round-robin stack) | ⬜ | P2 | 6 |
| 480 | Worker drain: selesaikan run sebelum restart | ⬜ | P2 | 6 |
| 481 | Timeout eksekusi per action (default) | ⬜ | P1 | 6 |
| 482 | Retry policy per stack (sudah ada retry_policy) | 🔶 | P1 | 6 |
| 483 | Concurrency limit per project | ⬜ | P1 | 6 |
| 484 | Quota worker (sudah quota stacks/vms) | 🔶 | P1 | 6 |
| 485 | Harga: estimasi instance per provider CSP | ⬜ | P2 | 6 |
| 486 | Cost guard: cek biaya sebelum apply (sudah budget) | 🔶 | P1 | 6 |
| 487 | Secrets tidak pernah di log | ⬜ | P0 | 6 |
| 488 | Redaction otomatis (sudah health.py partial) | 🔶 | P1 | 6 |
| 489 | Enkripsi at rest untuk store baru (flags/tests config) | ⬜ | P2 | 6 |
| 490 | Rotasi session JWT otomatis | ⬜ | P1 | 6 |
| 491 | 2FA enforce untuk admin (sudah TOTP) | 🔶 | P2 | 6 |
| 492 | Password reset flow secure | ⬜ | P1 | 6 |
| 493 | OIDC login (sudah) ditambah SAML | ⬜ | P2 | 6 |
| 494 | RBAC: role flags_admin, tests_admin, byoc_admin | ⬜ | P1 | 6 |
| 495 | Policy: hanya admin boleh kill-switch | ⬜ | P1 | 6 |
| 496 | Audit untuk change flag / import resource | ⬜ | P1 | 6 |
| 497 | Read-only tidak bisa eval tulis | 🔶 | P1 | 6 |
| 498 | API token scope per fitur (sudah roles) | 🔶 | P2 | 6 |
| 499 | Preview env auto-expire (TTL) default | ⬜ | P1 | 6 |
| 500 | Preview env label pada resource (tag preview=true) | ⬜ | P1 | 6 |
| 501 | Preview env quota terpisah | ⬜ | P2 | 6 |
| 502 | Promosi preview -> prod dengan approval | ⬜ | P1 | 6 |
| 503 | Git hook pre-apply (lint test) | ⬜ | P2 | 6 |
| 504 | Plan comment di GitHub PR (kompat Atlantis style) | ⬜ | P1 | 6 |
| 505 | Merge gate: required checks multiple | ⬜ | P1 | 6 |
| 506 | PR status badge dari radas | ⬜ | P2 | 6 |
| 507 | Auto-apply setelah approval (sudah) | 🔶 | P1 | 6 |
| 508 | Branch protection sync dengan stack policy | ⬜ | P2 | 6 |
| 509 | Pull request template radas untuk infra | ⬜ | P2 | 6 |
| 510 | Code owners enforcement | ⬜ | P2 | 6 |
| 511 | Module registry publish CLI | ⬜ | P1 | 6 |
| 512 | Module semver + constraint resolution | ⬜ | P1 | 6 |
| 513 | Provider mirror sudah -> extend per version | 🔶 | P1 | 6 |
| 514 | Lockfile .terraform.lock.hcl untuk ensure version | ⬜ | P1 | 6 |
| 515 | Checksum verifikasi module download | ⬜ | P1 | 6 |
| 516 | Init offline mode (mirror packages) | ⬜ | P1 | 6 |
| 517 | Tenancy org (multi-org) dasar | ⬜ | P2 | 6 |
| 518 | Project switcher cepat di header | ⬜ | P1 | 6 |
| 519 | Project settings duration (retensi log) | ⬜ | P2 | 6 |
| 520 | Default template per project | ⬜ | P2 | 6 |
| 521 | Custom terraform.tfvars penyimpanan di stack page (edit langsung) | ⬜ | P1 | 6 |
| 522 | Backend.hcl edit guard (jangan rusak state key) | ⬜ | P1 | 6 |
| 523 | Force-unlock state (tofu force-unlock wrapper) | ⬜ | P1 | 6 |
| 524 | Taint/unt-aint resource dari console | ✅ | P1 | 6 |
| 525 | Import via console ke stack existing | ⬜ | P1 | 6 |
| 526 | Output values viewer (state outputs) | ✅ | P1 | 6 |
| 527 | Resource graph canvas (interaktif) | ⬜ | P2 | 6 |
| 528 | Plan diff viewer sudah -> attach test hasil | 🔶 | P1 | 6 |
| 529 | Run timeline: semua langkah tofu (init/validate/plan/apply) | ⬜ | P1 | 6 |
| 530 | Skip init jika module belum berubah | ⬜ | P2 | 6 |
| 531 | Cache module lokal per worker | ⬜ | P1 | 6 |
| 532 | Agent tags: region/cloud (sudah worker tags) | 🔶 | P1 | 6 |
| 533 | Stack yang harus jalan di worker tertentu (pinning) | ⬜ | P1 | 6 |
| 534 | Worker resource usage monitoring | ⬜ | P2 | 6 |
| 535 | Worker online/offline status di dasbor | ⬜ | P1 | 6 |
| 536 | Cooldown after failed apply (anti-spam) | ⬜ | P1 | 6 |
| 537 | Lock stack manual (mode maintenance) | ✅ | P1 | 6 |
| 538 | Lock reason & who (viewable) | ✅ | P2 | 6 |
| 539 | DR: restore stack dari snapshot (sudah) | 🔶 | P1 | 6 |
| 540 | Snapshots: komentar/penamaan | ⬜ | P2 | 6 |
| 541 | Schedule snapshot berkala | ⬜ | P2 | 6 |
| 542 | Retention valid for snapshots (max N) | ⬜ | P2 | 6 |
| 543 | Secret rotation schedule (sudah) -> auto-apply UI | 🔶 | P1 | 6 |
| 544 | Compliance evidence untuk secret rotation | ⬜ | P2 | 6 |
| 545 | Policy gate plan parse (sudah) -> extend severity | 🔶 | P1 | 6 |
| 546 | Policy violations list permanent | ⬜ | P1 | 6 |
| 547 | Policy exemptions dengan approval | ⬜ | P2 | 6 |
| 548 | Quota soft warning vs hard block | ⬜ | P1 | 6 |
| 549 | Request quota increase workflow | ⬜ | P2 | 6 |
| 550 | Cost anomaly alert threshold config | ⬜ | P1 | 6 |
| 551 | Cost forecast akurasi (MAE metric) | ⬜ | P2 | 6 |
| 552 | Charge by env (dev free tier) | ⬜ | P2 | 6 |
| 553 | Budgets rollup ke heap (parent + child) | ⬜ | P2 | 6 |
| 554 | Bill spike protection (auto-stop VM) | ⬜ | P1 | 6 |
| 555 | Right-sizing rekomendasi dengan confidence | ⬜ | P1 | 6 |
| 556 | Scheduled snapshot sebelum rightsizing | ⬜ | P2 | 6 |
| 557 | Usage-based cost attribution (per run) | ⬜ | P2 | 6 |
| 558 | Provider pricing table update otomatis | ⬜ | P2 | 6 |
| 559 | Currency & locale support | ⬜ | P2 | 6 |
| 560 | Cost export ke CSV bulanan | ⬜ | P1 | 6 |
| 561 | Trend grafik multi-stack line overlay | ⬜ | P1 | 6 |
| 562 | Stack cost breakdown per resource | ⬜ | P2 | 6 |
| 563 | Untagged resource cost detection | ⬜ | P2 | 6 |
| 564 | Performance: daftar stack > 500 lancar | ⬜ | P1 | 6 |
| 565 | Indexing store untuk pencarian | ⬜ | P2 | 6 |
| 566 | SSE stream reconnect dengan backoff (sudah) | 🔶 | P1 | 6 |
| 567 | Optimistik UI update untuk toggle flag | ⬜ | P2 | 6 |
| 568 | Batch ops UI (select banyak run -> retry) | ⬜ | P2 | 6 |
| 569 | Sari/draft plan dari template JSON | ⬜ | P2 | 6 |
| 570 | Satu klik deploy template (sudah wizard) | 🔶 | P1 | 6 |
| 571 | Template versioning (custom templates) | ⬜ | P1 | 6 |
| 572 | Template market share (shareable URL) | ⬜ | P2 | 6 |
| 573 | Stack dari template dengan init data (sudah) | 🔶 | P1 | 6 |
| 574 | ATS: integration tests untuk UI E2E | ⬜ | P2 | 6 |
| 575 | Playwright selectors stabil (data-testid) | ⬜ | P2 | 6 |
| 576 | Snapshot visual komponen | ⬜ | P2 | 6 |
| 577 | Bundle size budget (chunk split) | ⬜ | P2 | 6 |
| 578 | Lazy load halaman berat (charts) | ⬜ | P1 | 6 |
| 579 | SWR stale-while-revalidate untuk dashboard | ⬜ | P1 | 6 |
| 580 | Prefetch hover nav | ⬜ | P3 | 6 |
| 581 | Error boundary per seksi (sudah ada) | 🔶 | P1 | 6 |
| 582 | Fallback UI saat API down (offline badge) | ⬜ | P1 | 6 |
| 583 | Retry query otomatis with jitter | ⬜ | P1 | 6 |
| 584 | Konsistensi: semua halaman pakai Card+Button (sudah bulk) | 🔶 | P1 | 6 |
| 585 | Warna semantik var CSS di halaman baru | ⬜ | P1 | 6 |
| 586 | Typografi font-mono untuk data (sudah) | 🔶 | P1 | 6 |
| 587 | Icon set konsisten remix (sudah) | 🔶 | P1 | 6 |
| 588 | Accessibility: focus ring konsisten | ⬜ | P1 | 6 |
| 589 | Kontras teks di card (AAA untuk teks kecil) | ⬜ | P2 | 6 |
| 590 | Animasi ringan untuk status change | ⬜ | P3 | 6 |
| 591 | Reduced-motion respect | ⬜ | P2 | 6 |
| 592 | Loading skeleton di tiap card data | ⬜ | P1 | 6 |
| 593 | Tooltip untuk status kode (sukses/gagal) | ⬜ | P2 | 6 |
| 594 | Shortcut '/' fokus global search | ⬜ | P3 | 6 |
| 595 | Cmd+K command palette | ⬜ | P3 | 6 |
| 596 | Dedupe: toast seragam (sudah) | 🔶 | P1 | 6 |
| 597 | Undo untuk aksi non-destruktif (toggle flag) | ⬜ | P3 | 6 |
| 598 | Confirm dialog untuk delete (sudah) | 🔶 | P1 | 6 |
| 599 | Docs in-app: help drawer per halaman | ⬜ | P2 | 6 |
| 600 | Changelog produk di console | ⬜ | P3 | 6 |
| 601 | Status page kecil (komponen health) | ⬜ | P2 | 6 |
| 602 | Usage metrik produk (DAU stacks) | ⬜ | P3 | 6 |
| 603 | Feedback pengguna (rate this) | ⬜ | P3 | 6 |
| 604 | Telemetry opt-in (anonymized) | ⬜ | P3 | 6 |
| 605 | Localization: tanggal & angka per locale | ⬜ | P2 | 6 |
| 606 | RTL layout readiness | ⬜ | P3 | 6 |
| 607 | Print-friendly report halaman cost | ⬜ | P2 | 6 |
| 608 | PDF export laporan compliance | ⬜ | P1 | 6 |
| 609 | Bulk tag edit stack | ⬜ | P2 | 6 |
| 610 | Duplicate stack (clone) action | ⬜ | P2 | 6 |
| 611 | Arsipkan stack (soft delete) | ⬜ | P2 | 6 |
| 612 | Restore dari arsip | ⬜ | P2 | 6 |
| 613 | Stack rename dengan migrasi state key | ⬜ | P2 | 6 |
| 614 | Persetujuan multi-pihak (quorum) | ⬜ | P1 | 6 |
| 615 | Approval expiry (TTL) | ⬜ | P1 | 6 |
| 616 | Reject reason wajib saat tolak | ⬜ | P1 | 6 |
| 617 | Approval via Slack button (inbound) | ⬜ | P3 | 6 |
| 618 | Rate limit per key login (brute force) | ⬜ | P1 | 6 |
| 619 | Audit export CSV | ⬜ | P2 | 6 |
| 620 | Search audit log lengkap | ⬜ | P1 | 6 |
| 621 | Retensi audit configurable | ⬜ | P2 | 6 |
| 622 | User roles matrix viewer | ✅ | ⬜ | P2 | 6 |
| 623 | Deactivate user (bukan delete) | ⬜ | P1 | 6 |
| 624 | Welcome email onboarding | ⬜ | P3 | 6 |
| 625 | Invite link user dengan role | ⬜ | P1 | 6 |
| 626 | Password complexity policy per org | ⬜ | P2 | 6 |
| 627 | OAuth login (Google/GitHub) opsional | ⬜ | P2 | 6 |
| 628 | SSO discovery URL setting | ⬜ | P2 | 6 |
| 629 | JWT issuer verification di toutes (sudah) | 🔶 | P1 | 6 |
| 630 | Secret leak scanner di tfvars | ⬜ | P1 | 6 |
| 631 | Vault integration (HashiCorp) read | ⬜ | P2 | 6 |
| 632 | KMS key rotation | ⬜ | P2 | 6 |
| 633 | Service account scoped token per feature | ⬜ | P1 | 6 |
| 634 | Token list dengan last-used | ⬜ | P1 | 6 |
| 635 | Revoke all sessions user | ⬜ | P2 | 6 |
| 636 | Admin impersonate (audited) | ⬜ | P3 | 6 |
| 637 | Full-text search stacks/runs | ⬜ | P2 | 6 |
| 638 | API pagination cursor | ⬜ | P2 | 6 |
| 639 | GraphQL gateway (opsional) | ⬜ | P3 | 6 |
| 640 | Schema versioning API | ⬜ | P3 | 6 |
| 641 | Rate limit header standar | ⬜ | P2 | 6 |
| 642 | OpenAPI operationId konsisten | ⬜ | P2 | 6 |
| 643 | Client timeout configurable | ⬜ | P2 | 6 |
| 644 | Retry-After header support | ⬜ | P2 | 6 |
| 645 | Local dev seed data script | ⬜ | P2 | 6 |
| 646 | Demo mode (sample data) | ⬜ | P2 | 6 |
| 647 | Startup check dependencies (redis) | ⬜ | P2 | 6 |
| 648 | Graceful shutdown server (drain) | ⬜ | P2 | 6 |
| 649 | Sistem config migration versioned | ⬜ | P2 | 6 |
| 650 | Backup DATA_DIR tooling | ⬜ | P1 | 6 |
| 651 | Restore from backup test (sudah UC 112) | 🔶 | P1 | 6 |


## Q. Code Registry / Bring-Your-Own-Code (652+)

| # | Use case | Status | Prio | Fase |
|---|---|---|---|---|
| 652 | Registry berisi modul OpenTofu (tofu-block) dengan metadata (version, desc, tags) | ✅ | P0 | 6 |
| 653 | Registry berisi role Ansible (ansible-role) dengan metadata | ✅ | P0 | 6 |
| 654 | Catalog API: daftar semua item registry | ✅ | P0 | 6 |
| 655 | Install item: copy kode ke stack workspace (shadcn-style, bukan referensi) | ✅ | P0 | 6 |
| 656 | tofu-block di-copy flat dengan prefix nama (anti-kolisi, kebaca OpenTofu) | ✅ | P1 | 6 |
| 657 | ansible-role di-copy ke roles/<name>/ (layout role standar) | ✅ | P1 | 6 |
| 658 | Uninstall: hapus persis file yang di-copy (manifest per stack) | ✅ | P1 | 6 |
| 659 | Installed list per stack (registry manifest) | ✅ | P1 | 6 |
| 660 | Registry storage swappable (filesystem sekarang, DB nanti — env REGISTRY_DIR) | ✅ | P2 | 6 |
| 661 | Shareable registry URL / import item dari registry eksternal | ⬜ | P2 | 6 |
| 662 | Version pinning: install versi tertentu, changelog per item | ⬜ | P2 | 6 |
| 663 | Dependensi antar item (vpc → monitoring) resolusi otomatis | ⬜ | P2 | 6 |
| 664 | Publish item dari stack ke registry (extract code jadi reusable) | ⬜ | P2 | 6 |
| 665 | Update item ke versi baru + diff dry-run sebelum overwrite | ⬜ | P2 | 6 |
| 666 | Adopsi repository Git eksternal sebagai registry remote (BYOC code) | ⬜ | P2 | 6 |


## Ringkasan

- ✅ Sudah ada: **35** · 🔶 Parsial: **8** · ⬜ Backlog: **57**
- P0 backlog (fase 1–2): live logs (57), webhooks (95), import stack (97),
  export (100), budget alert (30), notifikasi (55/84), approval (50),
  policy gate lanjutan (71) — **fase 1 = operasional, fase 2 = governance**.
- Setiap fase dibuka dengan memperluas plan fase menjadi task yang
  executable (sesuai konvensi `docs/superpowers/plans/`).
