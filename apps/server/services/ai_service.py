"""AI service (Fase 4 — UC 89/90/91/93).

Pluggable: if AI_API_KEY/AI_BASE_URL/AI_MODEL are set, chat/review call an
OpenAI-compatible endpoint. Without a key, review/playbook/docs fall back to
deterministic rules/templates so the features still work.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List


def is_configured() -> bool:
    return bool(os.environ.get("AI_API_KEY"))


def _llm_chat(system: str, user: str) -> str:
    import requests
    base = (os.environ.get("AI_BASE_URL") or "https://api.openai.com/v1").rstrip("/")
    model = os.environ.get("AI_MODEL") or "gpt-4o-mini"
    r = requests.post(
        f"{base}/chat/completions",
        headers={"Authorization": f"Bearer {os.environ.get('AI_API_KEY')}"},
        json={"model": model, "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ], "temperature": 0.3},
        timeout=60,
    )
    r.raise_for_status()
    return (r.json()["choices"][0]["message"]["content"] or "").strip()


def _rule_chat(message: str, stack_context: str = "") -> str:
    """Deterministic assistant (UC 91) — answers common ops questions without
    an external LLM so the chat feature always works."""
    msg = message.strip().lower()
    if any(w in msg for w in ("halo", "hai", "hello", "hi ", "selamat")):
        return ("Halo! Saya asisten Radas. Saya bisa bantu soal: status stack, "
                "rencana biaya/keamanan, draft playbook, dan dokumentasi. "
                "Ketikan 'bantuan' untuk daftar perintah.")
    if any(w in msg for w in ("bantuan", "help", "perintah")):
        return ("Perintah yang tersedia:\n"
                "- status stack / state stack → ringkasan stack\n"
                "- biaya / cost → saran penghematan biaya\n"
                "- keamanan / security → cek risiko umum\n"
                "- review plan → jalankan review plan di tab AI Tools\n"
                "- draft playbook → buat draft playbook dari prompt\n"
                "- dokumentasi / docs → generate README stack\n"
                "- setup / konfigurasi → panduan AI_API_KEY untuk LLM penuh")
    if any(w in msg for w in ("biaya", "cost", "hemat", "harga")):
        return ("Saran penghematan biaya:\n"
                "1. Matikan resource non-prod di luar jam kerja (auto_stop).\n"
                "2. Gunakan instance/plan yang lebih kecil untuk dev/staging.\n"
                "3. Aktifkan rightsizing & cost aggregator di dashboard Cost.\n"
                "4. Pakai snapshot + destroy untuk environment preview.\n"
                "(Untuk analisis per-plan, jalankan 'Review' di AI Tools.)")
    if any(w in msg for w in ("keamanan", "security", "aman", "ssh", "firewall")):
        return ("Cek keamanan umum:\n"
                "1. Hindari CIDR 0.0.0.0/0 di security group.\n"
                "2. Simpan kredensial sebagai secrets (terenkripsi), bukan tfvars.\n"
                "3. Aktifkan policy gate sebelum apply (plan review).\n"
                "4. Rotasi secret berkala (secret rotation) & aktifkan MFA.\n"
                "5. Gunakan service account ber-scope kecil untuk otomasi.")
    if any(w in msg for w in ("status", "state", "stack", "execution", "run")):
        if stack_context:
            head = stack_context.splitlines()[:14]
            ctx = "\n".join(line for line in head if not line.startswith("```"))
            return (f"Ringkasan stack:\n{ctx}\n\n"
                    "Lihat halaman Cloud Stacks untuk detail executions, drift, dan history.")
        return ("Stack belum dipilih. Buka halaman stack lalu kirim ulang pertanyaan, "
                "atau pakai AI Tools di halaman stack untuk review/dokumentasi.")
    if any(w in msg for w in ("review", "plan", "tfvars")):
        return ("Gunakan tab AI Tools → 'Plan review' untuk analisis biaya/keamanan "
                "per plan. Tempel cuplikan `tofu plan` dan tekan Review.")
    if any(w in msg for w in ("playbook", "ansible", "draft")):
        return ("Gunakan AI Tools → 'Playbook draft': tulis deskripsi singkat, "
                "contoh 'install nginx on web hosts', lalu tekan Draft.")
    if any(w in msg for w in ("dokumentasi", "docs", "readme")):
        return ("Gunakan AI Tools → 'Generate README' untuk membuat dokumentasi "
                "infrastruktur dari state stack secara otomatis (UC 93).")
    if any(w in msg for w in ("setup", "api_key", "konfigurasi", "llm")):
        return ("Mode rule-based aktif (tanpa API key). Untuk percakapan LLM penuh, "
                "set AI_API_KEY (dan AI_BASE_URL/AI_MODEL) di env server, lalu restart "
                "radas-server.")
    return ("Saya berjalan dalam mode rule-based (AI_API_KEY belum diset). "
            "Saya bisa bantu: status stack, biaya, keamanan, review plan, draft "
            "playbook, dan dokumentasi. Ketik 'bantuan' untuk daftar perintah.")


def chat(message: str, stack_context: str = "") -> Dict[str, Any]:
    if not is_configured():
        return {"configured": False, "reply": _rule_chat(message, stack_context)}
    system = ("You are Radas, a GitOps control-plane assistant for OpenTofu & Ansible. "
              "Answer concisely. Use the stack context if provided.")
    user = f"Stack context:\n{stack_context or '(none)'}\n\nQuestion: {message}"
    try:
        return {"configured": True, "reply": _llm_chat(system, user)}
    except Exception as e:
        return {"configured": True, "reply": _rule_chat(message, stack_context),
                "error": str(e)}


def review_plan(plan_text: str, context: str = "") -> Dict[str, Any]:
    findings: List[Dict[str, Any]] = []
    if re.search(r"0\.0\.0\.0/0", plan_text):
        findings.append({"severity": "high", "risk": "Public CIDR 0.0.0.0/0 detected",
                         "suggestion": "Restrict ingress to office/VPN CIDRs."})
    if re.search(r"(?i)tags?\s*=\s*\{\s*\}", plan_text):
        findings.append({"severity": "medium", "risk": "Resource created without tags",
                         "suggestion": "Enforce mandatory tags (environment, owner)."})
    if re.search(r"(?i)(encryption|kms_key|encrypted)\s*=\s*false", plan_text):
        findings.append({"severity": "high", "risk": "Encryption disabled",
                         "suggestion": "Enable encryption at rest where supported."})
    if not findings:
        findings.append({"severity": "info", "risk": "No obvious issues in plan",
                         "suggestion": "Proceed with review."})

    # LLM pass when configured (adds a narrative assessment).
    narrative = None
    if is_configured():
        try:
            narrative = _llm_chat(
                "You are a FinOps/Security reviewer for infrastructure plans. Be brief.",
                f"Plan excerpt:\n{plan_text[:4000]}\nContext: {context[:1000]}",
            )
        except Exception:
            narrative = None
    return {"findings": findings, "narrative": narrative, "configured": is_configured()}


def playbook_draft(prompt: str) -> Dict[str, Any]:
    if is_configured():
        try:
            yaml = _llm_chat(
                "You write Ansible playbooks in YAML only. Output raw YAML.",
                f"Write a playbook for: {prompt}",
            )
            return {"playbook": yaml, "source": "ai"}
        except Exception:
            pass
    # Template fallback (always works).
    slug = re.sub(r"[^a-z0-9-]+", "-", prompt.lower()).strip("-")[:40] or "task"
    yaml = f"""---
- name: {prompt.strip()[:80]}
  hosts: all
  become: true
  tasks:
    - name: TODO — implement steps for: {prompt.strip()[:80]}
      ansible.builtin.debug:
        msg: "Draft generated by Radas (rule-based). Replace with real tasks."
    # Generated by Radas AI draft (Fase 4). Refine before running.
"""
    return {"playbook": yaml, "source": "template"}


def stack_docs(pid: str, name: str) -> Dict[str, Any]:
    """Deterministic README from stack meta + tfvars (UC 93)."""
    try:
        from services.cloud_provisioning import _stack_data_dir, _read_stack_provider
    except Exception:
        _stack_data_dir = None
    provider = ""
    meta: Dict[str, Any] = {}
    tfvars = ""
    try:
        sd = _stack_data_dir(pid, name)
        if sd.exists():
            mp = sd / "meta.json"
            if mp.exists():
                meta = json.loads(mp.read_text(encoding="utf-8"))
            tf = sd / "terraform.tfvars"
            if tf.exists():
                tfvars = tf.read_text(encoding="utf-8")[:2000]
        provider = _read_stack_provider(pid, name) or meta.get("provider") or "unknown"
    except Exception:
        pass
    doc = f"""# {name}

Managed by **Radas** (OpenTofu/Ansible control plane).

- **Provider:** {provider}
- **Status:** {meta.get('status', 'unknown')}
- **Environment:** {meta.get('env', '-')}
- **Region:** {meta.get('region', '-')}
- **Created:** {meta.get('created_at', '-')}
- **Last updated:** {meta.get('updated_at', '-')}
- **Approval required:** {meta.get('approval_required', False)}
- **Secret rotation:** {meta.get('secret_rotation', False)}

## Variables

```hcl
{tvars or '# (none)'}
```

## Operations

- Plan / Apply / Destroy: via the Radas console Cloud Stacks page.
- Policy gate: {meta.get('policy_enabled', False)}.
- _Auto-generated by Radas (UC 93) — keep in sync with the stack._
"""
    return {"markdown": doc}
