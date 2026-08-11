# Fase 2 — Governance & Security — Implementation Plan

> **For agentic workers:** expand each task into executable steps when the
> phase starts; verify with typecheck/build (console) + compileall/pm2
> (server). Aditif terhadap API yang ada.

**Goal:** Approval workflow prod, quota per project, policy gate lanjutan,
service accounts, SSO OIDC, compliance report & scorecard, rotasi secret,
isolasi kredensial environment, sync secrets ke CI.

**Architecture:** Layer governance di server (approval state machine, quota
validator, policy engine), model service_account & oidc_config di SQLite,
report generator; UI console: tab Governance/SSO/Compliance.

**Tech Stack:** Flask + SQLite, PyJWT (sudah ada), `authlib` untuk OIDC (dep
baru), React console.

## Global Constraints
- Tidak memutus flow provisioning yang ada; governance adalah gate tambahan.
- Terapkan design pillars (UX & Integration DX) — lihat `docs/ROADMAP.md` § Cross-cutting pillars.
- Terapkan P3 Error handling & reliability — lihat `docs/ROADMAP.md` § Cross-cutting pillars (error envelope, redaksi secret, `/healthz`, lock per-stack).
- Semua perubahan mempertahankan `pnpm typecheck`/`build` PASS dan server
  compile PASS.

---

### Task 2.1 — Approval workflow (UC 50, 68, 72)
**Files:** server `services/approval_service.py`, `api/approval_routes.py`;
console `routes/cloud/stacks/$stackId.tsx` (panel "Request change") + i18n.

- [ ] Model `approval` (stack_id, action, requested_by, status, reviewers, decided_at).
- [ ] Gate: run yang menyentuh env `prod` (via project config) memerlukan
  approval sebelum apply; worker menunggu status `approved`.
- [ ] UI: request/approve/reject + audit trail per stack.
- [ ] Verify: run prod tanpa approval → queued; setelah approve → apply.

### Task 2.2 — Quota & limit per project (UC 69)
**Files:** server `services/quota_service.py`, `api/quota_routes.py`;
console settings project + i18n.

- [ ] Model quota (project_id, max_stacks, max_vms, max_cost_monthly).
- [ ] Validator dipanggil sebelum create stack / run apply.
- [ ] UI: set quota per project; tampil usage vs limit.
- [ ] Verify: set max_stacks=1 → create kedua ditolak dengan pesan jelas.

### Task 2.3 — Policy gate lanjutan (UC 71, 70)
**Files:** server extend `services/policy_gate.py`; console
`components/cloud/PolicyGateCard.tsx`.

- [ ] Rules tambahan: mandatory tags, region allowlist, forbidden
  `0.0.0.0/0` pada port non-22, image/version pinned.
- [ ] Gate berjalan saat plan review (dry-run) dan sebelum apply.
- [ ] UI: tampilkan rule yang dilanggar + tombol override (dengan approval).
- [ ] Verify: stack dengan CIDR publik → diblokir/kuning.

### Task 2.4 — Service account & guest user (UC 74, 75)
**Files:** server `services/service_accounts.py`, `api/service_account_routes.py`;
console system/users + i18n.

- [ ] Model service_account (name, token hash, roles, expires_at, scopes).
- [ ] Endpoint login service account (grant_type=client_credentials).
- [ ] Role `readonly` built-in untuk user tamu.
- [ ] Verify: SA token bisa panggil API read; user readonly tidak bisa POST.

### Task 2.5 — SSO OIDC (UC 98)
**Files:** server `auth/oidc.py`, `api/oidc_routes.py`; console settings/SSO.

- [ ] Config OIDC (issuer, client_id, client_secret, scopes) tersimpan.
- [ ] Login flow: redirect ke IdP, callback → buat/link user Radas.
- [ ] UI: form setup SSO + tombol "Login with SSO".
- [ ] Verify: flow dengan IdP test (e.g. Keycloak/Dex) berhasil.

### Task 2.6 — Compliance report & scorecard (UC 44, 73, 45)
**Files:** server `services/compliance_service.py`, `api/compliance_routes.py`;
console system/compliance + i18n.

- [ ] Report: siapa akses apa kapan (dari audit_log + sessions), environment
  isolation check (kredensial prod ≠ dev).
- [ ] Scorecard per project (skor dari policy gate + audit + quota usage).
- [ ] Export report PDF/CSV (reuse export infra fase 1).
- [ ] Verify: endpoint report mengembalikan JSON lengkap; UI menampilkan skor.

### Task 2.7 — Secret rotation & CI sync (UC 36, 43)
**Files:** server `services/secret_rotation.py`, `api/secrets/*` extend.

- [ ] Scheduler rotasi untuk secret bertanda `rotate: true` (TLS, API key).
- [ ] Sync secret ke pipeline: endpoint `GET /api/ci/secrets` (SA-only) +
  template env output.
- [ ] Verify: secret ber-rotasi otomatis sesuai interval; CI fetch sukses.

---

## Definisi selesai fase
- Approval/quota/policy gate aktif di semua jalur provisioning.
- SSO OIDC & service account terverifikasi end-to-end.
- Compliance report + scorecard tampil di UI.
- Update `docs/ROADMAP.md`: UC 36, 43, 44, 45, 50, 67, 68, 69, 70, 71, 72,
  73, 74, 75, 98 → ✅.

## Risiko
- OIDC membutuhkan IdP eksternal untuk uji penuh (gunakan Dex/Keycloak lokal).
- Approval gate dapat memperlambat run dev — default nonaktif kecuali env
  prod / kebijakan project mengaktifkannya.
