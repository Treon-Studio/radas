# Fase 4 — AI & DevX — Implementation Plan

> **For agentic workers:** expand each task into executable steps when the
> phase starts. Reuse pola AI generator yang sudah ada di CLI
> (`apps/cli`, intents `generate_code` / `generate_test`).

**Goal:** AI chat assistant di console, saran biaya/keamanan per plan, draft
playbook dari prompt, dan auto-dokumentasi infrastruktur dari state.

**Architecture:** Service AI server-side (`services/ai_service.py`) dengan
provider pluggable (OpenAI-compatible / local Ollama), dibatasi konteks
(stack schema + tfvars + plan diff). CLI sudah punya executor — console
memanggil endpoint AI yang sama.

**Tech Stack:** Flask + `requests` (SSE streaming dari LLM), React console,
CLI (Go) sebagai sumber pola prompt.

## Global Constraints
- API key AI via env (`AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`) — tidak
- Terapkan design pillars (UX & Integration DX) — lihat `docs/ROADMAP.md` § Cross-cutting pillars.
- Terapkan P3 Error handling & reliability — lihat `docs/ROADMAP.md` § Cross-cutting pillars (error envelope, redaksi secret, `/healthz`, lock per-stack).
  pernah masuk DB/UI.
- Semua output AI ditandai "AI-generated — review sebelum apply".
- Typecheck/build console PASS; server compile PASS.

---

### Task 4.1 — AI service inti (UC 91)
**Files:** server `services/ai_service.py`, `api/ai_routes.py`; console
`components/ai/AiChat.tsx` + route settings/ai.

- [ ] Endpoint `POST /api/ai/chat` (streaming SSE) dengan konteks opsional
  (stack/project id) + sistem prompt Radas.
- [ ] UI: floating chat di console; riwayat chat per sesi (localStorage).
- [ ] Verify: chat sederhana ("jelaskan status stack X") menjawab dengan
  konteks stack.

### Task 4.2 — Saran cost/security per plan (UC 89)
**Files:** server `services/ai_plan_review.py`; console
`routes/cloud/stacks/$stackId.tsx` (tombol "AI Review").

- [ ] Endpoint `POST /api/ai/review-plan` (payload: plan diff JSON + stack).
- [ ] Prompt: deteksi risiko (CIDR publik, flavor mahal, tanpa encryption,
  tanpa tagging) + estimasi biaya bulanan.
- [ ] UI: panel hasil review (daftar risiko + saran).
- [ ] Verify: plan dengan `0.0.0.0/0` → saran muncul.

### Task 4.3 — Draft playbook dari prompt (UC 90)
**Files:** server `api/ai_playbook_routes.py`; console infrastructure/playbooks
(tombol "AI Draft").

- [ ] Endpoint `POST /api/ai/playbook-draft` (prompt → YAML playbook).
- [ ] Output divalidasi YAML; user bisa edit sebelum save (reuse form playbook).
- [ ] Verify: prompt "install nginx di hosts web" → draft playbook valid.

### Task 4.4 — Auto-dokumentasi infra (UC 93)
**Files:** server `services/ai_docs.py`, `api/ai_docs_routes.py`; console
stack detail (tombol "Generate README").

- [ ] Endpoint `POST /api/ai/stack-docs` (state stack → markdown README).
- [ ] Simpan sebagai file `README.md` di stack dir + tampil di UI.
- [ ] Verify: stack bytedc sample → README lengkap (topologi, var, cara run).

---

## Definisi selesai fase
- AI chat, review plan, draft playbook, auto-doc berfungsi dengan model lokal
  atau OpenAI-compatible.
- Update `docs/ROADMAP.md`: UC 89, 90, 91, 93 → ✅.

## Risiko
- Ketergantungan LLM eksternal: fallback ke Ollama lokal didokumentasikan.
- Konteks plan besar: batasi ukuran payload, ringkas diff sebelum kirim.
