# Phase 6 GitOps Review Apps, PR Commands, Drift Auto-Fix & Unmanaged Resources Implementation Plan (Batch 20)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement GitOps review apps approval comments, environment variable attribute mapping templates, automated drift auto-remediation (drift auto-fix), tag/provider/branch cost analytics, PR markdown plan differential comments, GitHub PR slash commands parser (`/plan`, `/apply`, `/lock`), unmanaged cloud resources detector, and dynamic playbook surveys (UC345, UC353, UC355, UC358, UC368, UC371, UC375, UC380).

**Architecture:**
- `services/review_apps.py`:
  - UC345: Ephemeral review app lifecycle manager with threaded review comments and approve/reject decision gating.
- `services/attribute_mapper.py`:
  - UC353: Dynamic attribute substitution engine expanding `${env.VAR}`, `${stack.output}`, and template variables into stack configs.
- `services/drift_autofix.py`:
  - UC355: Automated drift remediation agent triggering targeted apply when configuration drifts beyond acceptable threshold.
- `services/cost_tag_analytics.py`:
  - UC358: Multidimensional cost slice aggregator grouping spend across custom tags, providers, and VCS branches.
- `services/pr_plan_diff.py`:
  - UC368: Formats OpenTofu/Terraform plan JSON into clean, readable GitHub pull request markdown comments showing additions, modifications, and destructions.
- `services/pr_slash_commands.py`:
  - UC371: PR comment parser identifying and dispatching slash commands (`/plan`, `/apply`, `/lock`, `/unlock`).
- `services/unmanaged_resources.py`:
  - UC375: Unmanaged cloud resource scanner comparing actual cloud inventory against managed OpenTofu state.
- `services/playbook_survey.py`:
  - UC380: Interactive playbook survey schema validator generating dynamic input prompts for playbook execution.

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC345 & UC353 — Review Apps Approval Comments & Attribute Mapper

**Files:**
- Create: `apps/opensible-server/services/review_apps.py`
- Create: `apps/opensible-server/services/attribute_mapper.py`
- Test: `apps/opensible-server/tests/test_gitops_drift_survey_batch20_fase6.py`

**Interfaces:**
- Produces: `create_review_app(project_id: str, pr_number: int, branch: str) -> Dict[str, Any]`
- Produces: `add_review_app_comment(app_id: str, author: str, comment: str, decision: Optional[str] = None) -> Dict[str, Any]`
- Produces: `expand_template_attributes(template_str: str, context: Dict[str, Any]) -> str`

- [x] **Step 1: Write failing test in `test_gitops_drift_survey_batch20_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement review apps and attribute mapper**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: UC355 & UC358 — Drift Auto-Fix & Cost Tag/Branch Analytics

**Files:**
- Create: `apps/opensible-server/services/drift_autofix.py`
- Create: `apps/opensible-server/services/cost_tag_analytics.py`
- Test: `apps/opensible-server/tests/test_gitops_drift_survey_batch20_fase6.py`

**Interfaces:**
- Produces: `evaluate_and_autofix_drift(project_id: str, stack: str, auto_apply: bool = False) -> Dict[str, Any]`
- Produces: `get_cost_analytics_by_dimension(project_id: str, dimension: str) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_gitops_drift_survey_batch20_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement drift auto-fix and tag/branch cost analytics**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: UC368 & UC371 — PR Plan Diff Comment & Slash Commands Parser

**Files:**
- Create: `apps/opensible-server/services/pr_plan_diff.py`
- Create: `apps/opensible-server/services/pr_slash_commands.py`
- Test: `apps/opensible-server/tests/test_gitops_drift_survey_batch20_fase6.py`

**Interfaces:**
- Produces: `format_pr_plan_comment(plan_summary: Dict[str, Any], stack: str) -> str`
- Produces: `parse_and_handle_slash_command(comment_body: str, project_id: str, pr_number: int, author: str) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_gitops_drift_survey_batch20_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement PR plan diff commenter and slash commands parser**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: UC375 & UC380 — Unmanaged Resources Scanner & Playbook Survey

**Files:**
- Create: `apps/opensible-server/services/unmanaged_resources.py`
- Create: `apps/opensible-server/services/playbook_survey.py`
- Test: `apps/opensible-server/tests/test_gitops_drift_survey_batch20_fase6.py`

**Interfaces:**
- Produces: `scan_unmanaged_resources(project_id: str, cloud_resources: List[Dict[str, Any]], managed_state_resources: List[str]) -> Dict[str, Any]`
- Produces: `validate_playbook_survey_inputs(survey_spec: Dict[str, Any], user_inputs: Dict[str, Any]) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_gitops_drift_survey_batch20_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement unmanaged resources scanner and playbook survey validator**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC345, UC353, UC355, UC358, UC368, UC371, UC375, UC380 as ✅)
- Run complete pytest test suite across server.

- [x] **Step 1: Update `docs/ROADMAP.md`**
- [x] **Step 2: Run pytest full suite**
- [x] **Step 3: Commit and finalize**
