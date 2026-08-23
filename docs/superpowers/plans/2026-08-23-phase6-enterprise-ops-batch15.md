# Phase 6 Enterprise Compliance, Stack Operations, Crypto & System Initialization Implementation Plan (Batch 15)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement compliance report export, stack cloning and renaming with state key migration, org password complexity policies, HashiCorp Vault read integration, KMS key rotation, seed/demo data generator, startup dependency health checks, and versioned system configuration migrations (UC608, UC610, UC613, UC626, UC631, UC632, UC645, UC647, UC649).

**Architecture:**
- `services/compliance_report.py` & `api/compliance_routes.py`:
  - UC608: HTML & structured compliance report export for SOC2/ISO audit trails.
- `services/stack_lifecycle.py` & `api/stack_lifecycle_routes.py`:
  - UC610: Stack duplication/cloning (`clone_stack`).
  - UC613: Stack rename with state key migration (`rename_stack`).
- `services/password_policy.py`:
  - UC626: Org-level password complexity policy validator.
- `services/vault_integration.py` & `services/kms_rotation.py`:
  - UC631: HashiCorp Vault read client integration.
  - UC632: Key Management Service (KMS) master key rotation.
- `services/seed_service.py` & `api/system_seed_routes.py`:
  - UC645 / UC646: Development seed data and demo workspace generator.
- `services/dependency_check.py` & `storage/system_migrations.py`:
  - UC647: Startup dependency health check (PostgreSQL, disk storage, optional Redis).
  - UC649: Versioned system configuration migration manager.

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC608 — Compliance Report Export

**Files:**
- Create: `apps/opensible-server/services/compliance_report.py`
- Modify: `apps/opensible-server/api/compliance_routes.py`
- Test: `apps/opensible-server/tests/test_enterprise_ops_batch15_fase6.py`

**Interfaces:**
- Produces: `generate_compliance_report(project_id: Optional[str] = None, format_type: str = "html") -> Dict[str, Any]`
- Endpoint: `GET /api/compliance/report/export`

- [x] **Step 1: Write failing test in `test_enterprise_ops_batch15_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement compliance report generator**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: UC610 & UC613 — Stack Duplication & Rename with State Key Migration

**Files:**
- Create: `apps/opensible-server/services/stack_lifecycle.py`
- Modify: `apps/opensible-server/api/cloud_provisioning_routes.py`
- Test: `apps/opensible-server/tests/test_enterprise_ops_batch15_fase6.py`

**Interfaces:**
- Produces: `clone_stack(project_id: Optional[str], source_stack: str, target_stack: str, copy_tfvars: bool = True) -> Dict[str, Any]`
- Produces: `rename_stack(project_id: Optional[str], old_name: str, new_name: str, migrate_state: bool = True) -> Dict[str, Any]`
- Endpoints:
  - `POST /api/cloud-provisioning/stacks/<stack>/clone`
  - `POST /api/cloud-provisioning/stacks/<stack>/rename`

- [x] **Step 1: Write failing test in `test_enterprise_ops_batch15_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement stack clone and rename logic**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: UC626 — Password Complexity Policy per Org

**Files:**
- Create: `apps/opensible-server/services/password_policy.py`
- Modify: `apps/opensible-server/auth/validators.py`
- Test: `apps/opensible-server/tests/test_enterprise_ops_batch15_fase6.py`

**Interfaces:**
- Produces: `set_org_password_policy(org_id: str, min_length: int = 8, require_uppercase: bool = True, require_numbers: bool = True, require_special: bool = True) -> None`
- Produces: `get_org_password_policy(org_id: str) -> Dict[str, Any]`
- Produces: `validate_password_for_org(password: str, org_id: Optional[str] = None) -> Tuple[bool, Optional[str]]`

- [x] **Step 1: Write failing test in `test_enterprise_ops_batch15_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement org password policy service**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: UC631 & UC632 — HashiCorp Vault Read Integration & KMS Key Rotation

**Files:**
- Create: `apps/opensible-server/services/vault_integration.py`
- Create: `apps/opensible-server/services/kms_rotation.py`
- Test: `apps/opensible-server/tests/test_enterprise_ops_batch15_fase6.py`

**Interfaces:**
- Produces: `read_vault_secret(vault_addr: str, token: str, secret_path: str) -> Dict[str, Any]`
- Produces: `rotate_kms_master_key(new_key_alias: str) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_enterprise_ops_batch15_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement Vault read client and KMS key rotation**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: UC645, UC647 & UC649 — Seed Generator, Dependency Check & System Migrations

**Files:**
- Create: `apps/opensible-server/services/seed_service.py`
- Create: `apps/opensible-server/services/dependency_check.py`
- Create: `apps/opensible-server/storage/system_migrations.py`
- Test: `apps/opensible-server/tests/test_enterprise_ops_batch15_fase6.py`

**Interfaces:**
- Produces: `seed_development_data(data_dir: Path) -> Dict[str, Any]`
- Produces: `check_system_dependencies() -> Dict[str, Any]`
- Produces: `run_system_migrations() -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_enterprise_ops_batch15_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement seed, dependency checks, and migrations**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 6: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC608, UC610, UC613, UC626, UC631, UC632, UC645, UC647, UC649 as ✅)
- Run complete pytest test suite across server.

- [x] **Step 1: Update `docs/ROADMAP.md`**
- [x] **Step 2: Run pytest full suite**
- [x] **Step 3: Commit and finalize**
