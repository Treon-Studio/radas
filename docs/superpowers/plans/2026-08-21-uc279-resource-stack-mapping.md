# UC279 Resource-to-Stack Import Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BYOC resource import mapping explicitly project/stack scoped, tenant-safe, deterministic, and side-effect-free with focused backend coverage.

**Architecture:** Keep the existing BYOC inventory and import-block generator as the source of resource facts, but introduce a small mapping service boundary that validates project/stack/account scope, canonicalizes resource mappings, persists only a redacted mapping intent, and returns import blocks without invoking OpenTofu. Extend the existing BYOC route rather than adding a second import API; preserve legacy account/inventory behavior outside the explicit UC279 contract.

**Tech Stack:** Python 3.14, Flask, PostgreSQL/`storage.pg`, existing `kv_store` BYOC account data, existing cloud-provisioning `stack_meta`, pytest, compileall.

## Global Constraints

- The import endpoint requires explicit `project_id` and `stack`; it must not silently fall back to a default scope.
- Do not run `tofu import`, `plan`, `apply`, provider APIs, subprocesses, or worker queue operations.
- Reject cross-tenant project/stack/account access without revealing resource existence, filesystem paths, credentials, or provider responses.
- Validate every selected resource against the account’s latest inventory; reject duplicate and stale IDs.
- Validate override addresses as safe OpenTofu resource addresses; reject traversal, shell syntax, whitespace, slashes, quotes, and duplicate target addresses.
- Preserve canonical sorted resource order and deterministic import block output.
- Persist only `{resource_id, type, address, source, mapped_at}` mapping fields; never persist credentials, state, raw inventory responses, or filesystem paths.
- Do not redesign the global BYOC account store or implement UC302 account-access auditing in this slice.
- Change `docs/ROADMAP.md` UC279 only after all focused tests and compileall gates pass; do not change unrelated roadmap rows.

---

## File structure

| Path | Responsibility |
|---|---|
| `apps/opensible-server/services/byoc_import_mapping.py` | Normalize/validate project-stack mapping input, derive deterministic mappings, and persist/read redacted mapping intent. |
| `apps/opensible-server/api/byoc_routes.py` | Add the explicit project-scoped import request boundary and map service errors to existing JSON responses. |
| `apps/opensible-server/services/byoc.py` | Reuse latest inventory and account lookup; no provider execution changes. |
| `apps/opensible-server/tests/test_byoc_mapping.py` | Service and route coverage for mapping, tenant isolation, address validation, persistence, and side-effect absence. |
| `apps/radas-console/src/routes/cloud/byoc.tsx` | Only if the existing UI needs the new required fields; preserve current inventory/import UI and add project/stack selection wiring. |
| `docs/ROADMAP.md` | Update UC279 status only after acceptance evidence. |

## Shared interfaces

```python
MappingRequest = {
    "project_id": str,
    "stack": str,
    "resource_ids": list[str],
    "address_overrides": dict[str, str],
}

ResourceMapping = {
    "resource_id": str,
    "type": str,
    "address": str,
    "source": Literal["inventory", "override"],
    "mapped_at": int,
}

MappingResult = {
    "account_id": str,
    "project_id": str,
    "stack": str,
    "provider": str,
    "resource_count": int,
    "mappings": list[ResourceMapping],
    "import_block": str,
}
```

The service API created in Task 1 is:

```python
prepare_import_mapping(
    account_id: str,
    *,
    project_id: str,
    stack: str,
    resource_ids: list[str],
    address_overrides: Mapping[str, str] | None = None,
    actor_id: str | None = None,
) -> MappingResult
```

---

### Task 1: Deterministic mapping service and redacted persistence

**Files:**
- Create: `apps/opensible-server/services/byoc_import_mapping.py`
- Modify only if needed for test seams: `apps/opensible-server/services/byoc.py`
- Test: `apps/opensible-server/tests/test_byoc_mapping.py`

**Interfaces:**
- Consumes: `byoc.get_account`, `byoc.get_inventory`, `services.org_service.member_role/is_member`, `storage.pg.query_one`, `services.cloud_provisioning._load_meta/_save_meta` or a project-scoped metadata helper.
- Produces: `prepare_import_mapping(...) -> MappingResult`, `validate_resource_address(address: str) -> str`, and `mapping_storage_key(project_id: str, stack: str) -> str`.
- Used by: Task 2 route and Task 3 console wiring.

- [ ] **Step 1: Write the failing service tests**

Create `tests/test_byoc_mapping.py` with isolated account, inventory, org, project, and stack fixtures. Use monkeypatches for `byoc.get_account` and `byoc.get_inventory` so the test does not call a provider.

```python
from __future__ import annotations

import time
import pytest

from storage import pg
from services import byoc_import_mapping


ACCOUNT = "account-279"
PROJECT = "project-279"
ORG = "org-279"
USER = "user-279"


def seed_project_stack():
    now = time.time()
    pg.execute("INSERT INTO users (id,username,password_hash) VALUES (%s,%s,%s)", (USER, USER, "x"))
    pg.execute("INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)", (ORG, ORG, USER, now))
    pg.execute("INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)", (ORG, USER, "owner", now))
    pg.execute("INSERT INTO projects (id,org_id,owner_id,name,description,is_archived,updated_at) VALUES (%s,%s,%s,%s,%s,0,%s)", (PROJECT, ORG, USER, PROJECT, "", now))
    pg.execute("INSERT INTO stack_meta (project_id,stack,data) VALUES (%s,%s,%s)", (PROJECT, "network-prod", '{}'))


def test_prepare_mapping_is_sorted_and_uses_safe_override(monkeypatch, pg_db):
    seed_project_stack()
    monkeypatch.setattr(byoc_import_mapping.byoc, "get_account", lambda account_id: {"id": ACCOUNT, "provider": "hetzner", "org_id": ORG, "project_id": PROJECT})
    monkeypatch.setattr(byoc_import_mapping.byoc, "get_inventory", lambda account_id: {"resources": [
        {"id": "r-z", "type": "hcloud_server", "address": "hcloud_server.z"},
        {"id": "r-a", "type": "hcloud_server", "address": "hcloud_server.a"},
    ]})

    result = byoc_import_mapping.prepare_import_mapping(
        ACCOUNT,
        project_id=PROJECT,
        stack="network-prod",
        resource_ids=["r-z", "r-a"],
        address_overrides={"r-z": "hcloud_server.web"},
        actor_id=USER,
    )

    assert [item["resource_id"] for item in result["mappings"]] == ["r-a", "r-z"]
    assert result["mappings"][1]["address"] == "hcloud_server.web"
    assert result["mappings"][1]["source"] == "override"
    assert result["import_block"].index("hcloud_server.a") < result["import_block"].index("hcloud_server.web")


def test_mapping_rejects_invalid_or_duplicate_addresses(monkeypatch, pg_db):
    seed_project_stack()
    monkeypatch.setattr(byoc_import_mapping.byoc, "get_account", lambda _: {"id": ACCOUNT, "provider": "hetzner", "org_id": ORG, "project_id": PROJECT})
    monkeypatch.setattr(byoc_import_mapping.byoc, "get_inventory", lambda _: {"resources": [
        {"id": "r-1", "type": "hcloud_server", "address": "hcloud_server.one"},
        {"id": "r-2", "type": "hcloud_server", "address": "hcloud_server.two"},
    ]})
    with pytest.raises(ValueError, match="address"):
        byoc_import_mapping.prepare_import_mapping(ACCOUNT, project_id=PROJECT, stack="network-prod", resource_ids=["r-1"], address_overrides={"r-1": "../../escape"}, actor_id=USER)
    with pytest.raises(ValueError, match="duplicate address"):
        byoc_import_mapping.prepare_import_mapping(ACCOUNT, project_id=PROJECT, stack="network-prod", resource_ids=["r-1", "r-2"], address_overrides={"r-1": "hcloud_server.same", "r-2": "hcloud_server.same"}, actor_id=USER)


def test_mapping_requires_explicit_scope_and_rejects_cross_tenant(monkeypatch, pg_db):
    seed_project_stack()
    monkeypatch.setattr(byoc_import_mapping.byoc, "get_account", lambda _: {"id": ACCOUNT, "provider": "hetzner", "org_id": "other-org", "project_id": "other-project"})
    monkeypatch.setattr(byoc_import_mapping.byoc, "get_inventory", lambda _: {"resources": [{"id": "r-1", "type": "hcloud_server", "address": "hcloud_server.one"}]})
    with pytest.raises(ValueError, match="tenant|access"):
        byoc_import_mapping.prepare_import_mapping(ACCOUNT, project_id=PROJECT, stack="network-prod", resource_ids=["r-1"], actor_id=USER)
    with pytest.raises(ValueError, match="required"):
        byoc_import_mapping.prepare_import_mapping(ACCOUNT, project_id="", stack="network-prod", resource_ids=["r-1"], actor_id=USER)


def test_mapping_persists_only_redacted_intent_and_does_not_queue_execution(monkeypatch, pg_db):
    seed_project_stack()
    monkeypatch.setattr(byoc_import_mapping.byoc, "get_account", lambda _: {"id": ACCOUNT, "provider": "hetzner", "org_id": ORG, "project_id": PROJECT, "credentials": {"secret": "never-return"}})
    monkeypatch.setattr(byoc_import_mapping.byoc, "get_inventory", lambda _: {"resources": [{"id": "r-1", "type": "hcloud_server", "address": "hcloud_server.one"}]})
    result = byoc_import_mapping.prepare_import_mapping(ACCOUNT, project_id=PROJECT, stack="network-prod", resource_ids=["r-1"], actor_id=USER)
    assert result["resource_count"] == 1
    stored = pg.query_one("SELECT data FROM stack_meta WHERE project_id=%s AND stack=%s", (PROJECT, "network-prod"))
    assert stored["data"]["byoc_import_mapping"]["account_id"] == ACCOUNT
    assert stored["data"]["byoc_import_mapping"]["mappings"][0]["address"] == "hcloud_server.one"
    assert "never-return" not in str(stored)
    assert pg.query_one("SELECT COUNT(*) AS count FROM executions WHERE project_id=%s", (PROJECT,))["count"] == 0
```

- [ ] **Step 2: Run the new tests and verify the expected failure**

Run:

```bash
cd apps/opensible-server
.venv/bin/pytest tests/test_byoc_mapping.py -q
```

Expected: collection fails with `ModuleNotFoundError: services.byoc_import_mapping`.

- [ ] **Step 3: Implement the minimal service**

Create `services/byoc_import_mapping.py` with these exact safety primitives:

```python
from __future__ import annotations

import re
import time
from collections.abc import Mapping
from typing import Any

from storage import pg
from services import byoc, org_service
from services.cloud_provisioning import _load_meta, _save_meta

_ADDRESS_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[(?:\"[A-Za-z0-9_-]+\"|[0-9]+)\])*$")


def validate_resource_address(address: str) -> str:
    value = str(address or "").strip()
    if not value or not _ADDRESS_RE.fullmatch(value) or any(token in value for token in ("..", "/", "\\", ";", "&", "|", "$", "`", "'", '"', " ")):
        raise ValueError("invalid resource address")
    return value


def _project_org(project_id: str) -> str:
    row = pg.query_one("SELECT org_id FROM projects WHERE id=%s", (project_id,))
    if not row or not row.get("org_id"):
        raise ValueError("project access denied")
    return str(row["org_id"])


def _authorize(account: Mapping[str, Any], project_id: str, actor_id: str | None) -> None:
    project_org = _project_org(project_id)
    account_org = str(account.get("org_id") or "")
    account_project = str(account.get("project_id") or "")
    if account_org and account_org != project_org:
        raise ValueError("tenant access denied")
    if account_project and account_project != project_id:
        raise ValueError("project access denied")
    if actor_id != "__internal__" and not org_service.is_member(project_org, actor_id):
        raise ValueError("project access denied")


def _stack_exists(project_id: str, stack: str) -> None:
    row = pg.query_one("SELECT 1 AS present FROM stack_meta WHERE project_id=%s AND stack=%s", (project_id, stack))
    if not row:
        raise ValueError("stack not found")


def prepare_import_mapping(account_id: str, *, project_id: str, stack: str, resource_ids: list[str], address_overrides: Mapping[str, str] | None = None, actor_id: str | None = None) -> dict[str, Any]:
    project_id = str(project_id or "").strip()
    stack = str(stack or "").strip()
    if not project_id or not stack:
        raise ValueError("project_id and stack are required")
    _stack_exists(project_id, stack)
    account = byoc.get_account(account_id)
    if not account:
        raise ValueError("account not found")
    _authorize(account, project_id, actor_id)
    inventory = byoc.get_inventory(account_id)
    available = {str(item.get("id")): item for item in inventory.get("resources") or []}
    ids = [str(value).strip() for value in resource_ids or []]
    if not ids or len(ids) != len(set(ids)):
        raise ValueError("resource_ids must be non-empty and unique")
    if any(resource_id not in available for resource_id in ids):
        raise ValueError("resource ids are not in the latest inventory")
    overrides = dict(address_overrides or {})
    mappings = []
    seen_addresses: set[str] = set()
    now = int(time.time())
    for resource_id in sorted(ids):
        item = available[resource_id]
        raw_address = overrides.get(resource_id) or item.get("address") or f"resource.{item.get('type')}.{resource_id}"
        address = validate_resource_address(str(raw_address))
        if address in seen_addresses:
            raise ValueError("duplicate address")
        seen_addresses.add(address)
        mappings.append({"resource_id": resource_id, "type": str(item.get("type") or "resource"), "address": address, "source": "override" if resource_id in overrides else "inventory", "mapped_at": now})
    metadata = dict(_load_meta(project_id, stack))
    metadata["byoc_import_mapping"] = {"account_id": str(account_id), "project_id": project_id, "stack": stack, "mappings": mappings, "updated_at": now}
    _save_meta(project_id, stack, **metadata)
    import_block = "\n\n".join(f'import {{\n  to = {item["address"]}\n  id = "{item["resource_id"]}"\n}}' for item in mappings)
    return {"account_id": str(account_id), "project_id": project_id, "stack": stack, "provider": str(account.get("provider") or ""), "resource_count": len(mappings), "mappings": mappings, "import_block": import_block}
```

The implementer must adapt `_save_meta` invocation if its signature accepts only patch fields; do not write files directly. Keep the output and stored mapping projection exactly free of credentials.

- [ ] **Step 4: Run service tests and verify they pass**

Run:

```bash
cd apps/opensible-server
.venv/bin/pytest tests/test_byoc_mapping.py -q
```

Expected: all four mapping service tests pass.

- [ ] **Step 5: Commit the service and tests**

```bash
git add apps/opensible-server/services/byoc_import_mapping.py apps/opensible-server/tests/test_byoc_mapping.py
git commit -m "feat(byoc): add project-scoped import mapping service"
```

---

### Task 2: Project/stack-scoped BYOC import route

**Files:**
- Modify: `apps/opensible-server/api/byoc_routes.py:173-184`
- Modify: `apps/opensible-server/tests/test_byoc_mapping.py`

**Interfaces:**
- Consumes: `prepare_import_mapping(...)` from Task 1 and existing `require_auth`.
- Produces: `POST /api/byoc/accounts/<account_id>/import` with explicit body scope and safe JSON result.
- Used by: existing BYOC console import action and Task 3 UI wiring.

- [ ] **Step 1: Write failing route tests**

Add a Flask app fixture modeled on `tests/test_byoc_routes.py` when present, otherwise create it locally with `register_blueprints`. Test that a valid request forwards all fields and that missing scope/cross-tenant/invalid address returns `400`/`403`/`404` without stack paths.

```python
def test_import_route_requires_explicit_scope(data_dir):
    client = byoc_client(data_dir)
    response = client.post(
        "/api/byoc/accounts/account-279/import",
        json={"resource_ids": ["r-1"]},
        headers=auth_headers(data_dir, "project-279"),
    )
    assert response.status_code == 400
    assert "stack" in str(response.get_json())


def test_import_route_returns_project_scoped_mapping(data_dir, monkeypatch):
    client = byoc_client(data_dir)
    monkeypatch.setattr("services.byoc_import_mapping.prepare_import_mapping", lambda *args, **kwargs: {
        "account_id": "account-279", "project_id": "project-279", "stack": "network-prod",
        "provider": "hetzner", "resource_count": 1,
        "mappings": [{"resource_id": "r-1", "type": "hcloud_server", "address": "hcloud_server.web", "source": "inventory", "mapped_at": 1}],
        "import_block": 'import {\n  to = hcloud_server.web\n  id = "r-1"\n}',
    })
    response = client.post(
        "/api/byoc/accounts/account-279/import",
        json={"project_id": "project-279", "stack": "network-prod", "resource_ids": ["r-1"], "address_overrides": {}},
        headers=auth_headers(data_dir, "project-279"),
    )
    assert response.status_code == 200
    assert response.get_json()["project_id"] == "project-279"
    assert response.get_json()["stack"] == "network-prod"
```

- [ ] **Step 2: Run route tests and verify expected failure**

```bash
cd apps/opensible-server
.venv/bin/pytest tests/test_byoc_mapping.py -q
```

Expected: the route forwarding test fails because the existing route calls `generate_import` and ignores `project_id`, `stack`, and overrides.

- [ ] **Step 3: Implement the narrow route adapter**

Replace only the `api_byoc_import` body with:

```python
@bp.route('/api/byoc/accounts/<account_id>/import', methods=['POST'])
@require_auth
def api_byoc_import(account_id):
    from services.byoc_import_mapping import prepare_import_mapping
    data = request.get_json(silent=True) or {}
    try:
        result = prepare_import_mapping(
            account_id,
            project_id=data.get("project_id"),
            stack=data.get("stack"),
            resource_ids=data.get("resource_ids") or [],
            address_overrides=data.get("address_overrides") or {},
            actor_id=(getattr(request, "current_user", {}) or {}).get("user_id"),
        )
    except ValueError as exc:
        message = str(exc)
        status = 403 if "access" in message or "tenant" in message else 404 if "not found" in message or "latest inventory" in message else 400
        return jsonify({"error": message}), status
    return jsonify(result)
```

Do not call `generate_import` after this change; the new service owns deterministic mapping and persistence.

- [ ] **Step 4: Run all route/service mapping tests**

```bash
cd apps/opensible-server
.venv/bin/pytest -q tests/test_byoc_mapping.py tests/test_byoc_hardening.py tests/test_byoc_scheduler.py
```

Expected: all mapping, hardening, and scheduler tests pass.

- [ ] **Step 5: Commit the route boundary**

```bash
git add apps/opensible-server/api/byoc_routes.py apps/opensible-server/tests/test_byoc_mapping.py
 git commit -m "feat(byoc): scope imports to project stacks"
```

---

### Task 3: Existing console import flow carries explicit project and stack

**Files:**
- Modify: `apps/radas-console/src/routes/cloud/byoc.tsx`
- Inspect: `apps/radas-console/src/lib/project.ts`

**Interfaces:**
- Consumes: current project ID from local storage/project context, selected stack from existing stack selector, and route result from Task 2.
- Produces: import request with `{project_id, stack, resource_ids, address_overrides}` and displays returned mapping addresses/import block.
- Used by: BYOC operators selecting resources in the existing console.

- [ ] **Step 1: Add a failing source-level/UI test or request assertion**

If the console package still has no component test runner, add a focused source-level assertion in the implementation review checklist rather than a new test dependency. The assertion must find these fields in the import mutation:

```text
project_id: currentProjectId
stack: selectedStack
resource_ids: selectedIds
address_overrides: explicit override map or {}
```

- [ ] **Step 2: Update the import mutation request**

Change the existing mutation currently sending only `{ resource_ids: selectedIds }` to:

```ts
mutationFn: () => api<{ import_block: string; mappings: ResourceMapping[] }>(
  "POST",
  `/api/byoc/accounts/${selectedAccount}/import`,
  {
    project_id: currentProjectId,
    stack: selectedStack,
    resource_ids: selectedIds,
    address_overrides: addressOverrides,
  },
)
```

Use the existing project/stack selectors; do not add a second project picker or a new state-management dependency. Disable the import action until both current project and selected stack are present.

- [ ] **Step 3: Run console typecheck/build**

```bash
cd apps/radas-console
/Users/ridho/.local/bin/node ../../node_modules/typescript/bin/tsc --noEmit
/Users/ridho/.local/bin/node ../../node_modules/vite/bin/vite.js build
```

Expected: both exit code 0.

- [ ] **Step 4: Commit console wiring**

```bash
git add apps/radas-console/src/routes/cloud/byoc.tsx
git commit -m "feat(console): send scoped BYOC import mappings"
```

---

### Task 4: UC279 acceptance verification and roadmap audit

**Files:**
- Verify: `apps/opensible-server/services/byoc_import_mapping.py`
- Verify: `apps/opensible-server/api/byoc_routes.py`
- Verify: `apps/opensible-server/tests/test_byoc_mapping.py`
- Verify: `apps/opensible-server/tests/test_byoc_hardening.py`
- Verify: `apps/opensible-server/tests/test_byoc_scheduler.py`
- Verify: `apps/radas-console/src/routes/cloud/byoc.tsx`
- Modify only after all gates: `docs/ROADMAP.md:440`

- [ ] **Step 1: Run focused UC279 tests**

```bash
cd apps/opensible-server
.venv/bin/pytest -q tests/test_byoc_mapping.py tests/test_byoc_hardening.py tests/test_byoc_scheduler.py
```

Expected: all tests pass with no failures.

- [ ] **Step 2: Compile backend**

```bash
cd apps/opensible-server
.venv/bin/python -m compileall -q services api storage
```

Expected: exit code 0.

- [ ] **Step 3: Run console gates**

```bash
cd apps/radas-console
/Users/ridho/.local/bin/node ../../node_modules/typescript/bin/tsc --noEmit
/Users/ridho/.local/bin/node ../../node_modules/vite/bin/vite.js build
```

Expected: both exit code 0.

- [ ] **Step 4: Audit side effects and tenant boundaries**

Confirm from source and tests:

```text
[ ] project_id and stack are required; no default fallback.
[ ] account/project/org mismatch is rejected.
[ ] stack belongs to requested project.
[ ] latest inventory is the only resource source.
[ ] duplicate/stale IDs are rejected.
[ ] addresses are validated and unique.
[ ] mappings are canonical sorted output.
[ ] only redacted mapping intent is persisted.
[ ] no execution record, state file, provider call, subprocess, or worker job is created.
[ ] console sends explicit project_id and stack.
```

- [ ] **Step 5: Update UC279 roadmap status only if every checkbox is evidenced**

```diff
-| 279 | Import resource ke stack: mapping id -> resource address | ⬜ | P0 | 6 |
+| 279 | Import resource ke stack: mapping id -> resource address | ✅ | P0 | 6 |
```

Do not update UC281, UC302, or unrelated BYOC rows in this slice.

- [ ] **Step 6: Final diff check and truthful report**

```bash
cd /Users/ridho/Documents/go/github.com/raizora/radas
git diff --check
git status --short
git diff -- docs/ROADMAP.md apps/opensible-server/services/byoc_import_mapping.py apps/opensible-server/api/byoc_routes.py apps/opensible-server/tests/test_byoc_mapping.py apps/radas-console/src/routes/cloud/byoc.tsx
```

Keep `.zcode` and `graphify-out` artifacts out of the commit. Report any unavailable console component harness or E2E credentials without claiming those gates passed.

## Plan self-review

### Specification coverage

| Specification requirement | Plan task |
|---|---|
| Explicit project/stack request contract | Tasks 1–2 |
| Tenant and project authorization | Tasks 1–2 |
| Latest inventory validation | Task 1 |
| Safe address override validation | Task 1 |
| Deterministic sorted mappings/import blocks | Task 1 |
| Redacted mapping persistence/no execution | Task 1 and Task 4 |
| Route response/error contract | Task 2 |
| Console project/stack wiring | Task 3 |
| Focused service/route tests and compileall | Task 4 |
| Truthful roadmap update | Task 4 |

### Placeholder scan

The plan contains no `TODO`, `TBD`, or unspecified test command. The only conditional is the existing console test-harness boundary; it explicitly prohibits adding a new runner in this slice.

### Type consistency

- `prepare_import_mapping` is defined once and called by the route with `project_id`, `stack`, `resource_ids`, `address_overrides`, and `actor_id`.
- `MappingResult.mappings` uses `resource_id`, `type`, `address`, `source`, and `mapped_at` in both backend tests and console response types.
- The route returns the same `MappingResult` fields that the console mutation consumes.
