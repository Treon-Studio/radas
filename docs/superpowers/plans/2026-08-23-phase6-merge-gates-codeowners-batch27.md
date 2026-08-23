# Phase 6 PR Merge Gates, Branch Policies, Code Owners, Offline Init & Compliance Evidence Implementation Plan (Batch 27)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement PR multi-check merge gates, branch protection synchronizer, infra pull request template generator, CODEOWNERS rule parser, offline init package resolver, project log retention manager, project default template binder, and secret rotation compliance evidence generator (UC505, UC508, UC509, UC510, UC516, UC519, UC520, UC544).

**Architecture:**
- `services/merge_gate.py` & `services/branch_protection.py`:
  - UC505: Evaluates whether all required check suites (lint, unit tests, plan success, security approval) have passed before merge/apply.
  - UC508: Synchronizes GitHub/GitLab branch protection rules with stack deployment security policies.
- `services/pr_template_generator.py` & `services/code_owners.py`:
  - UC509: Generates standardized PR markdown descriptions containing checklists, blast radius estimates, and testing steps.
  - UC510: Parses CODEOWNERS file syntax to map file paths to required reviewing teams and enforce approver counts.
- `services/offline_init.py` & `services/log_retention_policy.py`:
  - UC516: Configures local filesystem mirror directories for air-gapped/offline OpenTofu provider initialization.
  - UC519: Manages project log retention policies (e.g. 30 days, 90 days, 365 days) and schedules log cleanup.
- `services/project_default_template.py` & `services/secret_rotation_evidence.py`:
  - UC520: Binds default scaffolding templates to specific projects for streamlined stack initialization.
  - UC544: Generates compliance audit evidence reports documenting secret rotation frequency, history, and key status.

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC505 & UC508 — Multi-Check Merge Gate & Branch Protection Policy

**Files:**
- Create: `apps/opensible-server/services/merge_gate.py`
- Create: `apps/opensible-server/services/branch_protection.py`
- Test: `apps/opensible-server/tests/test_merge_gates_codeowners_batch27_fase6.py`

**Interfaces:**
- Produces: `evaluate_merge_gate(required_checks: List[str], check_results: Dict[str, str]) -> Dict[str, Any]`
- Produces: `sync_branch_protection_policy(repo_name: str, branch: str, enforce_linear_history: bool = True, require_approvals: int = 1) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_merge_gates_codeowners_batch27_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement merge gate and branch protection synchronizer**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: UC509 & UC510 — Infra PR Template & CODEOWNERS Parser

**Files:**
- Create: `apps/opensible-server/services/pr_template_generator.py`
- Create: `apps/opensible-server/services/code_owners.py`
- Test: `apps/opensible-server/tests/test_merge_gates_codeowners_batch27_fase6.py`

**Interfaces:**
- Produces: `generate_infra_pr_template(stack_name: str, environment: str, changes_summary: str) -> str`
- Produces: `find_code_owners(codeowners_content: str, file_path: str) -> List[str]`

- [x] **Step 1: Write failing test in `test_merge_gates_codeowners_batch27_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement PR template generator and CODEOWNERS parser**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: UC516 & UC519 — Offline Init Resolver & Project Log Retention

**Files:**
- Create: `apps/opensible-server/services/offline_init.py`
- Create: `apps/opensible-server/services/log_retention_policy.py`
- Test: `apps/opensible-server/tests/test_merge_gates_codeowners_batch27_fase6.py`

**Interfaces:**
- Produces: `configure_offline_init_env(plugin_cache_dir: str, mirror_dir: Optional[str] = None) -> Dict[str, str]`
- Produces: `set_project_log_retention(project_id: str, retention_days: int) -> Dict[str, Any]`
- Produces: `get_project_log_retention(project_id: str) -> int`

- [x] **Step 1: Write failing test in `test_merge_gates_codeowners_batch27_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement offline init configuration and log retention policy**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: UC520 & UC544 — Default Project Template & Secret Rotation Compliance

**Files:**
- Create: `apps/opensible-server/services/project_default_template.py`
- Create: `apps/opensible-server/services/secret_rotation_evidence.py`
- Test: `apps/opensible-server/tests/test_merge_gates_codeowners_batch27_fase6.py`

**Interfaces:**
- Produces: `set_project_default_template(project_id: str, template_id: str) -> Dict[str, Any]`
- Produces: `get_project_default_template(project_id: str) -> Optional[str]`
- Produces: `generate_secret_rotation_evidence(project_id: str, stack: str) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_merge_gates_codeowners_batch27_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement project default template binder and secret rotation compliance evidence**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC505, UC508, UC509, UC510, UC516, UC519, UC520, UC544 as ✅)
- Run complete pytest test suite across server.

- [x] **Step 1: Update `docs/ROADMAP.md`**
- [x] **Step 2: Run pytest full suite**
- [x] **Step 3: Commit and finalize**
