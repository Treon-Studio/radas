# Phase 6 Advanced Code Registry & Bring-Your-Own-Code Implementation Plan (Batch 13)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement advanced Code Registry capabilities including remote registry item export/import, version pinning & changelogs, automatic dependency resolution, publishing from stack workspace, update with dry-run diff, and external Git repository registry sync (UC661, UC662, UC663, UC664, UC665, UC666).

**Architecture:**
- `services/code_registry.py` & `api/code_registry_routes.py`:
  - UC661: Export & import registry item bundles (JSON/zip package) with metadata validation.
  - UC662: Version pinning (`version: "x.y.z"`) & item changelog tracking.
  - UC663: Dependency tree resolution (e.g. `monitoring` requires `vpc` auto-installed).
  - UC664: Publish reusable module directly from stack workspace to registry (`publish_from_stack`).
  - UC665: Dry-run diff and version update for installed registry items (`diff_installed_item`, `update_installed_item`).
  - UC666: External Git repository synchronization (`sync_git_registry`).

**Tech Stack:** Python 3.14, Flask, Pytest.

---

### Task 1: UC661 — Export & Import Registry Item Packages

**Files:**
- Modify: `apps/opensible-server/services/code_registry.py`
- Modify: `apps/opensible-server/api/code_registry_routes.py`
- Test: `apps/opensible-server/tests/test_code_registry_batch13_fase6.py`

**Interfaces:**
- Produces: `export_item_bundle(name: str) -> Dict[str, Any]`
- Produces: `import_item_bundle(bundle_data: Dict[str, Any]) -> Dict[str, Any]`
- Endpoints:
  - `GET /api/registry/items/<name>/export`
  - `POST /api/registry/items/import`

- [x] **Step 1: Write failing test in `test_code_registry_batch13_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement export and import logic**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: UC662 — Version Pinning & Item Changelog

**Files:**
- Modify: `apps/opensible-server/services/code_registry.py`
- Test: `apps/opensible-server/tests/test_code_registry_batch13_fase6.py`

**Interfaces:**
- Produces: `get_item_changelog(name: str) -> List[Dict[str, Any]]`
- Produces: `install(..., version: Optional[str] = None)`
- Supports: `changelog` list and `versions` map in `radas.json`.

- [x] **Step 1: Write failing test in `test_code_registry_batch13_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement version pinning and changelog support**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: UC663 — Automatic Item Dependency Resolution

**Files:**
- Modify: `apps/opensible-server/services/code_registry.py`
- Test: `apps/opensible-server/tests/test_code_registry_batch13_fase6.py`

**Interfaces:**
- Produces: `resolve_dependencies(name: str) -> List[str]`
- In `install(..., install_dependencies: bool = True)` installs dependencies in topological order.

- [x] **Step 1: Write failing test in `test_code_registry_batch13_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement dependency resolution logic**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: UC664 — Publish Item from Stack Workspace to Registry

**Files:**
- Modify: `apps/opensible-server/services/code_registry.py`
- Modify: `apps/opensible-server/api/code_registry_routes.py`
- Test: `apps/opensible-server/tests/test_code_registry_batch13_fase6.py`

**Interfaces:**
- Produces: `publish_from_stack(project_id: Optional[str], stack: str, name: str, item_type: str, file_patterns: List[str], version: str = "1.0.0", description: str = "", tags: Optional[List[str]] = None, dependencies: Optional[List[str]] = None) -> Dict[str, Any]`
- Endpoint: `POST /api/registry/publish`

- [x] **Step 1: Write failing test in `test_code_registry_batch13_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement publishing from stack workspace**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: UC665 — Update Installed Item with Diff Dry-Run

**Files:**
- Modify: `apps/opensible-server/services/code_registry.py`
- Modify: `apps/opensible-server/api/code_registry_routes.py`
- Test: `apps/opensible-server/tests/test_code_registry_batch13_fase6.py`

**Interfaces:**
- Produces: `diff_installed_item(project_id: Optional[str], stack: str, name: str) -> Dict[str, Any]`
- Produces: `update_installed_item(project_id: Optional[str], stack: str, name: str) -> Dict[str, Any]`
- Endpoints:
  - `GET /api/registry/stacks/<stack>/items/<name>/diff`
  - `POST /api/registry/stacks/<stack>/items/<name>/update`

- [x] **Step 1: Write failing test in `test_code_registry_batch13_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement diff and update logic**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 6: UC666 — Remote Git Repository Registry Sync

**Files:**
- Modify: `apps/opensible-server/services/code_registry.py`
- Modify: `apps/opensible-server/api/code_registry_routes.py`
- Test: `apps/opensible-server/tests/test_code_registry_batch13_fase6.py`

**Interfaces:**
- Produces: `sync_git_registry(git_url: str, branch: str = "main", dest_subdir: Optional[str] = None) -> Dict[str, Any]`
- Endpoint: `POST /api/registry/sync-git`

- [x] **Step 1: Write failing test in `test_code_registry_batch13_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement Git registry synchronization**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 7: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC661, UC662, UC663, UC664, UC665, UC666 as ✅)
- Run complete pytest test suite across server.

- [x] **Step 1: Update `docs/ROADMAP.md`**
- [x] **Step 2: Run pytest full suite**
- [x] **Step 3: Commit and finalize**
