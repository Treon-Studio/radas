# Phase 6 Security Hardening, SAML/OIDC, PR Plan Comments & Pre-apply Hooks Implementation Plan (Batch 26)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement CSP instance cost estimator, at-rest config cipher, automatic session JWT rotation, SAML 2.0 assertion handler, resource/flag audit dispatcher, dedicated preview env quotas, pre-apply lint hook validator, and Atlantis-style GitHub PR plan commenter (UC485, UC489, UC490, UC493, UC496, UC501, UC503, UC504).

**Architecture:**
- `services/csp_cost_estimator.py` & `utils/config_cipher.py`:
  - UC485: Estimates total compute cost across CSP instance configurations (AWS, GCP, Azure, ByteDC).
  - UC489: Encrypts and decrypts sensitive configuration fields at rest using AES-GCM / HMAC envelopes.
- `services/session_rotator.py` & `services/saml_auth.py`:
  - UC490: Implements automatic JWT token rolling and sliding window refresh session rotation.
  - UC493: Validates SAML 2.0 XML assertion payloads for enterprise SSO integration.
- `services/resource_audit.py` & `services/preview_quota.py`:
  - UC496: Emits structured audit events whenever feature flags change or cloud resources are imported.
  - UC501: Enforces separate isolated quota thresholds specifically for ephemeral preview environments.
- `services/git_preapply_hook.py` & `services/pr_plan_commenter.py`:
  - UC503: Runs automated pre-apply lint and compliance policy checks prior to executing destructive Terraform changes.
  - UC504: Generates Atlantis-style markdown comments for GitHub pull requests showing plan diffs and output changes.

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC485 & UC489 — CSP Cost Estimator & At-Rest Config Cipher

**Files:**
- Create: `apps/opensible-server/services/csp_cost_estimator.py`
- Create: `apps/opensible-server/utils/config_cipher.py`
- Test: `apps/opensible-server/tests/test_security_saml_pr_hooks_batch26_fase6.py`

**Interfaces:**
- Produces: `estimate_csp_instance_cost(provider: str, instance_type: str, hours_per_month: float = 730.0) -> Dict[str, Any]`
- Produces: `encrypt_config_value(plain_text: str, secret_key: Optional[str] = None) -> str`
- Produces: `decrypt_config_value(cipher_text: str, secret_key: Optional[str] = None) -> str`

- [x] **Step 1: Write failing test in `test_security_saml_pr_hooks_batch26_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement CSP cost estimator and config cipher**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: UC490 & UC493 — Session JWT Rotator & SAML 2.0 Auth Handler

**Files:**
- Create: `apps/opensible-server/services/session_rotator.py`
- Create: `apps/opensible-server/services/saml_auth.py`
- Test: `apps/opensible-server/tests/test_security_saml_pr_hooks_batch26_fase6.py`

**Interfaces:**
- Produces: `rotate_session_token(current_refresh_token: str, user_id: str) -> Dict[str, Any]`
- Produces: `process_saml_assertion(saml_response_xml: str, idp_cert: Optional[str] = None) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_security_saml_pr_hooks_batch26_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement session rotator and SAML auth processor**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: UC496 & UC501 — Resource Audit Dispatcher & Dedicated Preview Quotas

**Files:**
- Create: `apps/opensible-server/services/resource_audit.py`
- Create: `apps/opensible-server/services/preview_quota.py`
- Test: `apps/opensible-server/tests/test_security_saml_pr_hooks_batch26_fase6.py`

**Interfaces:**
- Produces: `audit_resource_action(action: str, resource_type: str, resource_id: str, actor: str, details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]`
- Produces: `evaluate_preview_quota(project_id: str, requested_previews: int = 1) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_security_saml_pr_hooks_batch26_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement resource audit and preview quota evaluator**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: UC503 & UC504 — Git Pre-Apply Hook Validator & Atlantis PR Plan Commenter

**Files:**
- Create: `apps/opensible-server/services/git_preapply_hook.py`
- Create: `apps/opensible-server/services/pr_plan_commenter.py`
- Test: `apps/opensible-server/tests/test_security_saml_pr_hooks_batch26_fase6.py`

**Interfaces:**
- Produces: `run_preapply_validation(code_dir: str, checks: Optional[List[str]] = None) -> Dict[str, Any]`
- Produces: `generate_pr_plan_comment(stack_name: str, plan_summary: Dict[str, Any], commit_sha: str) -> str`

- [x] **Step 1: Write failing test in `test_security_saml_pr_hooks_batch26_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement pre-apply hook runner and PR plan commenter**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC485, UC489, UC490, UC493, UC496, UC501, UC503, UC504 as ✅)
- Run complete pytest test suite across server.

- [x] **Step 1: Update `docs/ROADMAP.md`**
- [x] **Step 2: Run pytest full suite**
- [x] **Step 3: Commit and finalize**
