# Phase 6 Module Publisher, Multi-Org Guard, Stack tfvars, Resource DAG & Run Timeline Implementation Plan (Batch 28)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement module registry publish packager, multi-org isolation guard, stack custom tfvars manager, console resource import syntax validator, interactive resource DAG synthesizer, step-by-step tofu run timeline generator, worker local module cache indexer, and multi-stack cost trend overlay series analyzer (UC511, UC517, UC521, UC525, UC527, UC529, UC531, UC561).

**Architecture:**
- `services/module_publisher.py` & `services/multi_org_guard.py`:
  - UC511: Validates module tarball manifests, computes sha256 checksums, and publishes version metadata to the registry.
  - UC517: Validates cross-org boundary isolation ensuring projects and credentials are only accessible within the target tenant org.
- `services/stack_tfvars_manager.py` & `services/resource_importer.py`:
  - UC521: Parses, validates, and serializes HCL-formatted `terraform.tfvars` stored directly on stack pages.
  - UC525: Validates resource import commands and maps existing cloud provider IDs into OpenTofu state addresses.
- `services/resource_dag_synthesizer.py` & `services/run_timeline_builder.py`:
  - UC527: Synthesizes directed acyclic graph (DAG) node-and-edge structures from resource dependencies for canvas visualization.
  - UC529: Builds unified chronological execution milestones (`init`, `validate`, `plan`, `apply`, `cleanup`) with duration metrics.
- `services/worker_module_cache.py` & `services/cost_trend_overlay.py`:
  - UC531: Tracks local worker cached modules to avoid redundant remote git downloads.
  - UC561: Computes multi-series cost overlays across multiple stacks for comparative visual charting.

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC511 & UC517 — Module Publisher & Multi-Org Guard

**Files:**
- Create: `apps/opensible-server/services/module_publisher.py`
- Create: `apps/opensible-server/services/multi_org_guard.py`
- Test: `apps/opensible-server/tests/test_module_pub_dag_timeline_batch28_fase6.py`

**Interfaces:**
- Produces: `publish_module_tarball(org_id: str, slug: str, version: str, manifest: Dict[str, Any], archive_bytes: bytes, publisher: str) -> Dict[str, Any]`
- Produces: `validate_org_project_access(user_id: str, org_id: str, project_id: str) -> bool`

- [x] **Step 1: Write failing test in `test_module_pub_dag_timeline_batch28_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement module publisher and multi-org access guard**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: UC521 & UC525 — Stack tfvars Manager & Resource Importer

**Files:**
- Create: `apps/opensible-server/services/stack_tfvars_manager.py`
- Create: `apps/opensible-server/services/resource_importer.py`
- Test: `apps/opensible-server/tests/test_module_pub_dag_timeline_batch28_fase6.py`

**Interfaces:**
- Produces: `save_stack_tfvars(project_id: str, stack: str, tfvars_content: str) -> Dict[str, Any]`
- Produces: `get_stack_tfvars(project_id: str, stack: str) -> str`
- Produces: `generate_import_command(resource_address: str, cloud_id: str, provider: str = "aws") -> Dict[str, str]`

- [x] **Step 1: Write failing test in `test_module_pub_dag_timeline_batch28_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement tfvars manager and resource importer generator**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: UC527 & UC529 — Resource DAG Synthesizer & Run Timeline Builder

**Files:**
- Create: `apps/opensible-server/services/resource_dag_synthesizer.py`
- Create: `apps/opensible-server/services/run_timeline_builder.py`
- Test: `apps/opensible-server/tests/test_module_pub_dag_timeline_batch28_fase6.py`

**Interfaces:**
- Produces: `build_resource_dag(resources: List[Dict[str, Any]]) -> Dict[str, Any]`
- Produces: `build_run_timeline(steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]`

- [x] **Step 1: Write failing test in `test_module_pub_dag_timeline_batch28_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement resource DAG synthesizer and run timeline builder**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: UC531 & UC561 — Worker Module Cache & Cost Trend Overlay

**Files:**
- Create: `apps/opensible-server/services/worker_module_cache.py`
- Create: `apps/opensible-server/services/cost_trend_overlay.py`
- Test: `apps/opensible-server/tests/test_module_pub_dag_timeline_batch28_fase6.py`

**Interfaces:**
- Produces: `register_worker_cached_module(worker_id: str, module_source: str, version: str, local_path: str) -> Dict[str, Any]`
- Produces: `get_worker_cached_module(worker_id: str, module_source: str, version: str) -> Optional[Dict[str, Any]]`
- Produces: `generate_multi_stack_cost_overlay(stack_histories: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_module_pub_dag_timeline_batch28_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement worker module cache and cost trend overlay calculator**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC511, UC517, UC521, UC525, UC527, UC529, UC531, UC561 as ✅)
- Run complete pytest test suite across server.

- [x] **Step 1: Update `docs/ROADMAP.md`**
- [x] **Step 2: Run pytest full suite**
- [x] **Step 3: Commit and finalize**
