# Fase 5 — Integration & Resilience — Implementation Plan

> **For agentic workers:** expand each task into executable steps when the
> phase starts. Fase ini paling luas — dikerjakan per-subdomain, tidak
> perlu berurutan.

**Goal:** Remote state management, rollback/strip stack, multi-region,
CI/CD lanjutan (preview, env promotion, inbound webhooks, rollback release),
otomasi lanjutan (auto-stop, auto-scale, maintenance window, retry policy),
template custom, provider mirror, alert & metrics, dan DR.

**Architecture:** Mayoritas adalah ekstensi server + console; remote state &
rollback sebagian sudah ada di server (verifikasi & expose di UI).

## Global Constraints
- Sub-domain independen: boleh dikerjakan paralel dalam PR terpisah.
- Terapkan design pillars (UX & Integration DX) — lihat `docs/ROADMAP.md` § Cross-cutting pillars.
- Terapkan P3 Error handling & reliability — lihat `docs/ROADMAP.md` § Cross-cutting pillars (error envelope, redaksi secret, `/healthz`, lock per-stack).
- Tetap aditif; tidak mengubah kontrak API yang sudah dipakai.
- Typecheck/build console PASS; server compile PASS.

---

### Task 5.1 — Remote state & rollback/strip (UC 12, 13)
**Files:** server `services/remote_state.py` + extend run actions; console
stack detail (tombol Rollback / Strip + config remote state).

- [ ] Verifikasi & lengkapi remote state (S3/OBS backend.hcl) yang sudah ada.
- [ ] UI: pilih backend remote per stack; tombol Rollback (ke state/commit
  sebelumnya) dan Strip (hapus resource + state).
- [ ] Verify: stack test → rollback mengembalikan versi sebelumnya.

### Task 5.2 — Multi-region & template custom (UC 14, 15, 96)
**Files:** server extend schema/adapter (region list), `api/stack_templates_routes.py`;
console.

- [ ] Wizard: pilih multiple region (per pool) untuk provider pendukung.
- [ ] Custom template: import repo OpenTofu sebagai template stack baru.
- [ ] Verify: template custom muncul di picker & bisa provisioning.

### Task 5.3 — CI/CD lanjutan (UC 49, 51, 52, 53, 54)
**Files:** server `api/pipeline_routes.py` extend; console pipeline editor.

- [ ] Inbound webhook trigger (GitHub/GitLab push → pipeline) + secret verify.
- [ ] Env promotion: branch → env mapping; auto-apply setelah approval.
- [ ] Preview environment per PR (stack ephemeral + auto-destroy).
- [ ] Rollback release: re-deploy tag/commit sebelumnya.
- [ ] Verify: webhook push → pipeline jalan; preview auto-destroy.

### Task 5.4 — Remediasi & otomasi lanjutan (UC 23, 78, 79, 80, 81, 82)
**Files:** server `services/automation_rules.py`, scheduler extend; console
automation settings.

- [ ] Maintenance window (pause runs dalam rentang waktu).
- [ ] Auto-stop VM idle (jam non-kerja) & auto-scale rule (berbasis metric).
- [ ] Retry policy & backoff per run; event-driven provisioning (webhook).
- [ ] Drift remediation: playbook otomatis saat drift terdeteksi.
- [ ] Verify: rule auto-stop menjadwalkan stop; retry pada run gagal.

### Task 5.5 — Alert, metrics, notifikasi (UC 55, 61, 62, 84)
**Files:** server `services/alert_service.py`, `api/metrics_routes.py`;
console preferences + notifications.

- [ ] Alert run gagal / drift → notifikasi in-app + webhook (reuse fase 1).
- [ ] Export metrics Prometheus (`/metrics`) dari run stats.
- [ ] Preferensi notifikasi per user (email/Slack/console).
- [ ] Verify: run gagal → alert masuk; `/metrics` ter-scrape.

### Task 5.6 — Proxy, DR, provider mirror (UC 24, 64, 99)
**Files:** server config; console settings.

- [ ] Bastion/jump-host proxy untuk SSH playbook.
- [ ] DR: backup → restore stack (reuse backup-settings + import).
- [ ] Internal OpenTofu registry mirror (filesystem mirror config).
- [ ] Verify: restore dari backup mengembalikan stack; mirror digunakan.

---

## Definisi selesai fase
- Remote state/rollback/strip terverifikasi di UI.
- Webhook trigger, env promotion, preview, rollback release aktif.
- Auto-stop/auto-scale/maintenance/retry berjalan via scheduler.
- Alert + metrics + notifikasi preferences aktif.
- Update `docs/ROADMAP.md`: seluruh UC fase 5 → ✅.

## Risiko
- Preview environment butuh kuota & lifecycle yang ketat (auto-destroy wajib).
- Auto-scale butuh sumber metric yang andal — mulai dari rule berbasis
  waktu/schedule, lalu metric-driven.
- Proxy bastion menambah kompleksitas SSH config — dokumentasi menyusul.
