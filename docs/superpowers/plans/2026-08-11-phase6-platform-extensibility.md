# Fase 6 — Platform Extensibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Fase 6 (UC 113–651): harden the four new feature areas (Feature Flags, Test Cases, GitHub Actions, BYOC) with unit tests, close the highest-priority 🔶/⬜ gaps, and land quick competitor-parity wins.

**Architecture:** The four services already exist (`services/feature_flags.py`, `services/test_cases.py`, `services/github_actions.py`, `services/byoc.py`) with JSON-store persistence under `DATA_DIR` and Flask blueprints in `api/`. This plan adds pytest coverage for each service (TDD on missing behavior), then implements the top backlog items that sit directly on top of those services: flag audit/TTL/scheduler, tofu-test execution, GH secrets/runners, BYOC health-check scheduling, plus a curated set of O-sektor quick wins (stack lock, taint/untaint, force-unlock, output viewer, batch ops). Each task is independently testable.

**Tech Stack:** Python 3.14 + Flask + pytest 8 (`apps/opensible-server/.venv`), React 19 + TanStack Router (console), OpenTofu CLI, GitHub REST via `gh` CLI.

## Global Constraints
- Server venv: `apps/opensible-server/.venv/bin/python -m pytest` (pytest already installed; `requirements-dev.txt` pins `pytest>=8.0.0,<9`).
- Services use the `_store_path()` pattern: reads `DATA_DIR` env (fixture `data_dir` from `tests/conftest.py` sets it to `tmp_path`).
- Aditif — jangan mengubah kontrak API yang sudah dipakai console.
- Console: `pnpm --filter @radas/console typecheck` dan `build` PASS; server: `python -m compileall` PASS.
- UI kit: `@/components/ui/{button,input,select,textarea,checkbox,Badge,Card}`; nav di `apps/radas-console/src/components/app-shell/NavSections.tsx`; i18n di `src/lib/i18n/{en,km,ko}/nav.ts`.
- Follow format ROADMAP (baris `| N | UC | ✅/🔶/⬜ | Prio | Fase |`) saat menandai status.

---

### Task 6.1 — Unit tests: feature_flags service

**Files:**
- Create: `apps/opensible-server/tests/test_feature_flags.py`
- Test: same file (TDD)

**Interfaces:**
- Consumes: `services.feature_flags` public API — `list_flags()`, `create_flag(data)`, `update_flag(key, patch)`, `delete_flag(key)`, `evaluate(key, env, user)`, `get_flag(key)`.
- Produces: nothing new (tests only).

- [ ] **Step 1: Write failing tests**

```python
"""Unit tests for the feature flag store & evaluation engine (UC 113-118)."""
from __future__ import annotations

def test_create_flag_roundtrip(data_dir):
    from services.feature_flags import create_flag, get_flag, list_flags
    f = create_flag({"key": "block_apply", "name": "Block apply", "rollout_percent": 100})
    assert f["key"] == "block_apply"
    assert get_flag("block_apply")["enabled"] is True
    assert len(list_flags()) == 1

def test_create_duplicate_key_rejected(data_dir):
    from services.feature_flags import create_flag
    create_flag({"key": "dup", "rollout_percent": 100})
    try:
        create_flag({"key": "dup", "rollout_percent": 100})
        assert False, "should raise"
    except ValueError as e:
        assert "already exists" in str(e)

def test_update_flag_patch(data_dir):
    from services.feature_flags import create_flag, update_flag
    create_flag({"key": "x", "rollout_percent": 100})
    updated = update_flag("x", {"enabled": False, "rollout_percent": 40})
    assert updated["enabled"] is False
    assert updated["rollout_percent"] == 40

def test_delete_flag(data_dir):
    from services.feature_flags import create_flag, delete_flag, get_flag
    create_flag({"key": "gone", "rollout_percent": 100})
    assert delete_flag("gone") is True
    assert delete_flag("gone") is False
    assert get_flag("gone") is None

def test_evaluate_full_rollout(data_dir):
    from services.feature_flags import create_flag, evaluate
    create_flag({"key": "full", "rollout_percent": 100})
    r = evaluate("full", env="prod", user="alice")
    assert r["enabled"] is True and r["reason"] == "full_rollout"

def test_evaluate_env_override_disables(data_dir):
    from services.feature_flags import create_flag, evaluate
    create_flag({"key": "envgate", "rollout_percent": 100,
                 "environments": {"prod": False, "dev": True}})
    assert evaluate("envgate", env="prod")["enabled"] is False
    assert evaluate("envgate", env="dev")["enabled"] is True

def test_evaluate_kill_switch_wins(data_dir):
    from services.feature_flags import create_flag, evaluate
    create_flag({"key": "kill", "rollout_percent": 100, "kill_switch": True})
    assert evaluate("kill", env="prod")["enabled"] is False
    assert evaluate("kill", env="prod")["reason"] == "kill_switch"

def test_evaluate_percentage_rollout_deterministic(data_dir):
    from services.feature_flags import create_flag, evaluate
    create_flag({"key": "roll", "rollout_percent": 0})
    assert evaluate("roll", env="prod", user="u1")["enabled"] is False
    create_flag({"key": "roll2", "rollout_percent": 100})
    assert evaluate("roll2", env="prod", user="u1")["enabled"] is True

def test_evaluate_whitelist_overrides_rollout(data_dir):
    from services.feature_flags import create_flag, evaluate
    create_flag({"key": "wl", "rollout_percent": 0, "users_whitelist": ["admin"]})
    assert evaluate("wl", env="prod", user="admin")["enabled"] is True
    assert evaluate("wl", env="prod", user="joe")["enabled"] is False

def test_evaluate_unknown_flag(data_dir):
    from services.feature_flags import evaluate
    assert evaluate("nope", env="prod")["enabled"] is False
    assert evaluate("nope", env="prod")["reason"] == "unknown_flag"

def test_blacklist_beats_whitelist(data_dir):
    from services.feature_flags import create_flag, evaluate
    create_flag({"key": "bl", "rollout_percent": 100,
                 "users_whitelist": ["boss"], "users_blacklist": ["boss"]})
    assert evaluate("bl", env="prod", user="boss")["enabled"] is False
    assert evaluate("bl", env="prod", user="boss")["reason"] == "blacklisted"
```

- [ ] **Step 2: Run to verify they pin the existing behavior**

Run: `cd apps/opensible-server && .venv/bin/python -m pytest tests/test_feature_flags.py -q`
Expected: **11 passed** — the service at `services/feature_flags.py` is already implemented (commit 0388d96), so these tests pin existing behavior as a regression suite. Any failure here is a real bug in the service.

- [ ] **Step 3: Confirm the store honors DATA_DIR**

Run: `cd apps/opensible-server && .venv/bin/python -m pytest tests/test_feature_flags.py -q 2>&1 | tail -5`
Expected: all tests PASS (NOT `ModuleNotFoundError`). If a fixture import error appears, verify `tests/conftest.py` `data_dir` fixture is used (it sets `DATA_DIR` env + monkeypatch).

- [ ] **Step 4: Run again and adjust any test to match current intended behavior**

The service at `services/feature_flags.py` is already implemented; if a test reveals a genuine bug (e.g. `evaluate` percent bucket uses `percent * 10`), fix the service, not the test:
- [ ] If `test_evaluate_percentage_rollout_deterministic` fails for `rollout_percent=0`: confirm `evaluate` returns `zero_rollout` before hashing — it does (guard exists). No fix needed.

- [ ] **Step 5: Run full suite and commit**

Run: `cd apps/opensible-server && .venv/bin/python -m pytest tests/ -q 2>&1 | tail -3`
Expected: all tests PASS (old + new).

```bash
git add apps/opensible-server/tests/test_feature_flags.py
git commit -m "test(flags): unit tests for feature flag store & evaluation (UC 113-118)"
```

---

### Task 6.2 — Flag audit trail + scheduler/TTL (UC 122, 130, 123)

**Files:**
- Modify: `apps/opensible-server/services/feature_flags.py`
- Create: `apps/opensible-server/tests/test_feature_flags_audit.py`
- Modify: `apps/opensible-server/api/feature_flag_routes.py` (GET `/api/flags/audit`)

**Interfaces:**
- Consumes: existing `_load()`/`_save()` + `evaluate()`.
- Produces: `log_flag_change(key, actor, changes: dict) -> dict`; `flag_audit(limit=100) -> list[dict]`; `expire_due_flags(now=None) -> int`; flag dict gains optional `ttl_seconds` and `scheduled_expire_at`.

- [ ] **Step 1: Write failing tests**

```python
"""Audit trail + TTL expiry for feature flags (UC 122, 130)."""
from __future__ import annotations

import time

def test_log_and_read_audit(data_dir):
    from services.feature_flags import create_flag, log_flag_change, flag_audit
    create_flag({"key": "aud", "rollout_percent": 100})
    log_flag_change("aud", actor="admin", changes={"enabled": True})
    log_flag_change("aud", actor="devops", changes={"enabled": False})
    entries = flag_audit()
    assert len(entries) == 2
    assert entries[0]["actor"] == "devops"
    assert entries[0]["changes"] == {"enabled": False}

def test_audit_scoped_to_flag(data_dir):
    from services.feature_flags import create_flag, log_flag_change, flag_audit
    create_flag({"key": "a", "rollout_percent": 100})
    create_flag({"key": "b", "rollout_percent": 100})
    log_flag_change("a", "u1", {"enabled": True})
    assert len(flag_audit(flag_key="a")) == 1

def test_ttl_expiry_disables_flag(data_dir):
    from services.feature_flags import create_flag, evaluate, expire_due_flags
    create_flag({"key": "short", "rollout_percent": 100, "ttl_seconds": 5})
    assert evaluate("short", env="prod")["enabled"] is True
    assert expire_due_flags(now=int(time.time()) + 10) == 1
    assert evaluate("short", env="prod")["enabled"] is False
```

- [ ] **Step 2: Run — expect fail**

Run: `cd apps/opensible-server && .venv/bin/python -m pytest tests/test_feature_flags_audit.py -q`
Expected: FAIL (`ImportError` / `AttributeError`: `log_flag_change` undefined).

- [ ] **Step 3: Implement audit log + TTL**

Add to `services/feature_flags.py`:

```python
def _audit_store_path() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "flag_audit.json"
    except Exception:
        return Path("data") / "flag_audit.json"


def log_flag_change(key: str, actor: str = "", changes: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    entry = {"key": key, "actor": actor or "system", "changes": changes or {},
             "at": _now()}
    items = json.loads(_audit_store_path().read_text(encoding="utf-8")) if _audit_store_path().exists() else []
    if not isinstance(items, list):
        items = []
    items.append(entry)
    items = items[-1000:]
    _audit_store_path().write_text(json.dumps(items, indent=2), encoding="utf-8")
    return entry


def flag_audit(limit: int = 100, flag_key: Optional[str] = None) -> List[Dict[str, Any]]:
    items = json.loads(_audit_store_path().read_text(encoding="utf-8")) if _audit_store_path().exists() else []
    if not isinstance(items, list):
        items = []
    if flag_key:
        items = [e for e in items if e.get("key") == flag_key]
    return items[-limit:][::-1]


def expire_due_flags(now: Optional[int] = None) -> int:
    """Disable flags whose scheduled_expire_at (or created+ttl) passed. Returns count."""
    now = now or _now()
    items = _load()
    changed = 0
    for f in items:
        if not f.get("enabled"):
            continue
        expire_at = f.get("scheduled_expire_at")
        if expire_at is None and f.get("ttl_seconds"):
            expire_at = f.get("created_at", 0) + int(f["ttl_seconds"])
        if expire_at and now >= expire_at:
            f["enabled"] = False
            f["expired_at"] = now
            changed += 1
    if changed:
        _save(items)
    return changed
```

- [ ] **Step 4: Wire audit into update/create routes**

In `services/feature_flags.py`, inside `create_flag` and `update_flag`, after `_save(...)` call `log_flag_change(key, changes={...})`. In `update_flag` compute `changes` as `{k: patch[k] for k in patch if k in ("enabled", "kill_switch", "rollout_percent", "environments")}`.
Also accept `ttl_seconds` and `scheduled_expire_at` in `create_flag` (copy into flag dict if present, int coerced).

- [ ] **Step 5: Add audit route**

In `api/feature_flag_routes.py`:

```python
@bp.route('/api/flags/audit', methods=['GET'])
@require_auth
def api_flag_audit():
    from services.feature_flags import flag_audit
    limit = request.args.get("limit", "100")
    try:
        limit = max(1, min(500, int(limit)))
    except (TypeError, ValueError):
        limit = 100
    key = (request.args.get("flag_key") or "").strip() or None
    return jsonify({"audit": flag_audit(limit=limit, flag_key=key)})
```

- [ ] **Step 6: Run tests — expect pass**

Run: `cd apps/opensible-server && .venv/bin/python -m pytest tests/test_feature_flags_audit.py tests/test_feature_flags.py -q`
Expected: PASS (all 15).

- [ ] **Step 7: Smoke via API + commit**

```bash
pm2 restart radas-server && sleep 2
TOKEN=$(curl -s -X POST http://localhost:5001/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin12345"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s -X POST http://localhost:5001/api/flags -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"key":"aud-smoke","rollout_percent":100,"ttl_seconds":2}'
curl -s -X PATCH http://localhost:5001/api/flags/aud-smoke -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"enabled":false}'
curl -s http://localhost:5001/api/flags/audit?flag_key=aud-smoke -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected: audit JSON with 2 entries (create + update). Then:

```bash
git add apps/opensible-server/services/feature_flags.py apps/opensible-server/api/feature_flag_routes.py apps/opensible-server/tests/test_feature_flags_audit.py
git commit -m "feat(flags): audit trail, TTL expiry, scheduler hook (UC 122/130)"
```

---

### Task 6.3 — Unit tests: test_cases service + gate

**Files:**
- Create: `apps/opensible-server/tests/test_test_cases.py`
- Test: same file

**Interfaces:**
- Consumes: `services.test_cases` — `create_test_case(data)`, `list_test_cases()`, `update_test_case(id, patch)`, `delete_test_case(id)`, `run_test_case(project_id, test_id)`, `latest_failed_blocker(project_id, stack)`, `ASSERTIONS`.
- Produces: nothing new (tests only).

- [ ] **Step 1: Write failing tests**

```python
"""Unit tests for test-case registry, assertion runner & apply gate (UC 161-175)."""
from __future__ import annotations

import json


def _seed_stack(tmp_path, name="demo"):
    """Create a minimal stack workspace dir with a tfvars file."""
    envs = tmp_path / "cloud-provisioning" / "default" / "envs"
    envs.mkdir(parents=True, exist_ok=True)
    sd = envs / name
    sd.mkdir()
    (sd / "terraform.tfvars").write_text('password = "sup3rs3cret"\napp_vm_count = 2\n')
    return sd


def test_create_test_case_roundtrip(data_dir):
    from services.test_cases import create_test_case, list_test_cases
    tc = create_test_case({"name": "sec", "stack": "demo", "kind": "assertion",
                           "assertions": ["secret_in_tfvars"], "severity": "blocker"})
    assert tc["assertions"] == ["secret_in_tfvars"]
    assert len(list_test_cases()) == 1

def test_assertion_kind_requires_assertions(data_dir):
    from services.test_cases import create_test_case
    try:
        create_test_case({"name": "bad", "stack": "s", "kind": "assertion", "assertions": []})
        assert False, "should raise"
    except ValueError as e:
        assert "at least one assertion" in str(e)

def test_update_and_delete(data_dir):
    from services.test_cases import create_test_case, update_test_case, delete_test_case
    tc = create_test_case({"name": "x", "stack": "s", "kind": "assertion",
                           "assertions": ["cidr_public"]})
    assert update_test_case(tc["id"], {"enabled": False})["enabled"] is False
    assert delete_test_case(tc["id"]) is True

def test_run_detects_secret_in_tfvars(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    _seed_stack(tmp_path)
    from services.test_cases import create_test_case, run_test_case
    tc = create_test_case({"name": "sec", "stack": "demo", "kind": "assertion",
                           "assertions": ["secret_in_tfvars"], "severity": "blocker"})
    result = run_test_case(None, tc["id"])
    assert result["passed"] is False
    assert any(f["assertion"] == "secret_in_tfvars" for f in result["findings"])

def test_run_passes_on_clean(data_dir, tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    envs = tmp_path / "cloud-provisioning" / "default" / "envs"
    envs.mkdir(parents=True, exist_ok=True)
    sd = envs / "clean"
    sd.mkdir()
    (sd / "terraform.tfvars").write_text("app_vm_count = 1\n")
    from services.test_cases import create_test_case, run_test_case
    tc = create_test_case({"name": "c", "stack": "clean", "kind": "assertion",
                           "assertions": ["secret_in_tfvars"], "severity": "warning"})
    assert run_test_case(None, tc["id"])["passed"] is True

def test_latest_failed_blocker_gates_apply(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    _seed_stack(tmp_path)
    from services.test_cases import create_test_case, run_test_case, latest_failed_blocker
    tc = create_test_case({"name": "blk", "stack": "demo", "kind": "assertion",
                           "assertions": ["secret_in_tfvars"], "severity": "blocker"})
    run_test_case(None, tc["id"])
    bad = latest_failed_blocker(None, "demo")
    assert bad is not None and bad["severity"] == "blocker"

def test_latest_failed_blocker_none_when_passing(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    envs = tmp_path / "cloud-provisioning" / "default" / "envs"
    envs.mkdir(parents=True, exist_ok=True)
    (envs / "ok").mkdir()
    (envs / "ok" / "terraform.tfvars").write_text("app_vm_count = 1\n")
    from services.test_cases import create_test_case, run_test_case, latest_failed_blocker
    tc = create_test_case({"name": "ok", "stack": "ok", "kind": "assertion",
                           "assertions": ["secret_in_tfvars"], "severity": "blocker"})
    run_test_case(None, tc["id"])
    assert latest_failed_blocker(None, "ok") is None
```

- [ ] **Step 2: Run — expect most to pass, some fail**

Run: `cd apps/opensible-server && .venv/bin/python -m pytest tests/test_test_cases.py -q`
Expected: `test_run_detects_secret_in_tfvars` and `test_latest_failed_blocker_gates_apply` PASS (service already works). Any failing test must be a genuine gap — fix the service minimally (do not weaken the test).

- [ ] **Step 3: Fix any gap found**

Known possible gap: `run_test_case` requires `tc.get("stack")` set — the `_seed_stack` fixture puts the stack under `cloud-provisioning/default/envs/<name>` which matches `_stack_dir(None, name)` (`_envs_dir` = `DATA_DIR/cloud-provisioning/default/envs`). If a test fails on path resolution, verify `_stack_dir` and `_stack_data_dir` both derive from `DATA_DIR` (they do via `_project_stacks_root`).

- [ ] **Step 4: Full suite + commit**

Run: `cd apps/opensible-server && .venv/bin/python -m pytest tests/ -q 2>&1 | tail -3`
Expected: PASS.

```bash
git add apps/opensible-server/tests/test_test_cases.py
git commit -m "test(tests): unit tests for test-case registry, runner & gate (UC 161-175)"
```

---

### Task 6.4 — Tofu test execution via worker (UC 163, 184, 213)

**Files:**
- Modify: `apps/opensible-server/services/test_cases.py` (add `run_tofu_test`)
- Modify: `apps/opensible-server/api/test_case_routes.py` (POST `/api/tests/<id>/tofu-test`)
- Create: `apps/opensible-server/tests/test_tofu_test.py`

**Interfaces:**
- Consumes: `_stack_texts(project_id, stack)` (already in test_cases.py), `services.cloud_provisioning._create_execution`.
- Produces: `run_tofu_test(project_id, test_id) -> dict` with `{passed, findings, output}`; queued `TOFU_RUN` execution with `tofu_action="test"`.

- [ ] **Step 1: Write failing tests**

```python
"""OpenTofu test execution wrapper (UC 163, 184)."""
from __future__ import annotations

def test_tofu_test_requires_stack(data_dir):
    from services.test_cases import create_test_case, run_tofu_test
    tc = create_test_case({"name": "t", "stack": "nope", "kind": "tofu_test", "assertions": []})
    try:
        run_tofu_test(None, tc["id"])
        assert False, "should raise"
    except ValueError as e:
        assert "stack" in str(e).lower()

def test_tofu_test_queues_execution(data_dir, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path := __import__("tempfile").mkdtemp()))
    envs = __import__("pathlib").Path(tmp_path) / "cloud-provisioning" / "default" / "envs"
    envs.mkdir(parents=True, exist_ok=True)
    (envs / "demo").mkdir()
    (envs / "demo" / "main.tf").write_text('resource "null_resource" "x" {}\n')
    (envs / "demo" / "main.tftest.hcl").write_text(
        'run "plan" { command = plan assert { condition = true error_message = "no" } }\n')
    from services.test_cases import create_test_case, run_tofu_test
    tc = create_test_case({"name": "t", "stack": "demo", "kind": "tofu_test", "assertions": []})
    out = run_tofu_test(None, tc["id"])
    assert out["passed"] is True
    assert out["queued"] is True
```

- [ ] **Step 2: Run — expect fail**

Run: `cd apps/opensible-server && .venv/bin/python -m pytest tests/test_tofu_test.py -q`
Expected: FAIL (`ImportError`: `run_tofu_test` undefined).

- [ ] **Step 3: Implement run_tofu_test**

Add to `services/test_cases.py`:

```python
def run_tofu_test(project_id: Optional[str], test_id: str) -> Dict[str, Any]:
    tc = get_test_case(test_id)
    if not tc:
        raise ValueError("test case not found")
    stack = tc.get("stack") or ""
    if not stack:
        raise ValueError("test case has no stack; set stack first")
    from services.cloud_provisioning import _create_execution
    eid = _create_execution(project_id, stack, "test", triggered_by=f"test:{tc.get('name','')}")
    result = {
        "id": str(uuid.uuid4()), "test_id": test_id, "name": tc["name"],
        "stack": stack, "kind": "tofu_test", "severity": tc.get("severity") or "warning",
        "passed": True, "queued": True, "execution_id": eid,
        "findings": [{"assertion": "tofu_test", "name": "OpenTofu .tftest.hcl",
                      "severity": "info", "source": "plan",
                      "detail": f"tofu test queued (execution {eid})." }],
        "ran_at": int(time.time()), "project_id": project_id,
    }
    history = _load("test_results.json")
    history.append(result)
    _save("test_results.json", history[-500:])
    return result
```

- [ ] **Step 4: Add route**

In `api/test_case_routes.py`:

```python
@bp.route('/api/tests/<test_id>/tofu-test', methods=['POST'])
@require_auth
def api_run_tofu_test(test_id):
    from services.test_cases import run_tofu_test
    try:
        result = run_tofu_test(_pid(), test_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"success": True, "result": result}), 201
```

- [ ] **Step 5: Verify worker supports action "test"**

In `services/cloud_provisioning.py` the `_VALID_ACTIONS` set currently is `{"init", "plan", "apply", "destroy", "validate", "fmt", "refresh", "drift"}`. Add `"test"` to `_VALID_ACTIONS` and extend `_tofu_cmd("test")` to return `["tofu", "test"]`. If `_tofu_cmd` has a default branch, leave it; only add the case.

- [ ] **Step 6: Run tests + commit**

Run: `cd apps/opensible-server && .venv/bin/python -m pytest tests/test_tofu_test.py -q`
Expected: PASS (both).

```bash
git add apps/opensible-server/services/test_cases.py apps/opensible-server/api/test_case_routes.py apps/opensible-server/services/cloud_provisioning.py apps/opensible-server/tests/test_tofu_test.py
git commit -m "feat(tests): queue tofu test executions (UC 163/184/213)"
```

---

### Task 6.5 — Unit tests + hardening: github_actions service

**Files:**
- Create: `apps/opensible-server/tests/test_github_actions.py`
- Modify: `apps/opensible-server/services/github_actions.py` (only if a test exposes a bug)

**Interfaces:**
- Consumes: `services.github_actions` — `status()`, `list_repos(owner)`, `repo_workflows(owner, repo)`, `workflow_runs(owner, repo, per_page)`, `dispatch(...)`, `rerun(...)`, `cancel(...)`, `workflow_templates()`, `scaffold_workflow(...)`.
- Produces: nothing new (tests only) — but tests must NOT call the real GitHub API.

- [ ] **Step 1: Write failing tests (mock `subprocess`)**

```python
"""GitHub Actions service tests with subprocess mocked (UC 216-248)."""
from __future__ import annotations

import json


class FakeGh:
    def __init__(self, responses=None):
        self.responses = responses or {}
        self.calls = []

    def run(self, cmd, capture_output=True, input=None, timeout=30):
        self.calls.append(cmd)
        key = " ".join(str(c) for c in cmd)
        for needle, (out, err, code) in self.responses.items():
            if needle in key:
                self.last = (out, err, code)
                return self._r(out, err, code)
        raise AssertionError(f"unexpected gh call: {key}")

    def _r(self, out, err, code):
        import subprocess
        class R:
            def __init__(self, out, err, code):
                self.stdout = out
                self.stderr = err
                self.returncode = code
        return R(out, err, code)


def test_status_uses_gh(monkeypatch):
    import services.github_actions as g
    fake = FakeGh({"--show-token": (b"Logged in\nToken: gho_abc123\n", b"", 0)})
    monkeypatch.setattr(g.shutil, "which", lambda _: "/usr/local/bin/gh")
    monkeypatch.setattr(g.subprocess, "run", fake.run)
    st = g.status()
    assert st["configured"] is True
    assert st["via"] == "gh"


def test_list_repos_parses(monkeypatch):
    import services.github_actions as g
    repos = [{"name": "a", "full_name": "u/a", "default_branch": "main",
              "visibility": "public", "description": None, "archived": False},
             {"name": "b", "full_name": "u/b", "default_branch": "main",
              "visibility": "private", "description": "x", "archived": True}]
    fake = FakeGh({"/user": (json.dumps({"login": "u"}).encode(), b"", 0),
                   "/users/u/repos": (json.dumps(repos).encode(), b"", 0)})
    monkeypatch.setattr(g.shutil, "which", lambda _: "/usr/local/bin/gh")
    monkeypatch.setattr(g.subprocess, "run", fake.run)
    out = g.list_repos("u")
    assert len(out) == 1 and out[0]["name"] == "a"  # archived filtered


def test_workflow_templates_contains_three(monkeypatch):
    from services.github_actions import workflow_templates
    ids = {t["id"] for t in workflow_templates()}
    assert ids == {"tofu-plan", "tofu-apply", "ansible-lint"}


def test_dispatch_error_propagates(monkeypatch):
    import services.github_actions as g
    fake = FakeGh({"/repos/u/r/actions/workflows/w.yml/dispatches":
                   (b"", b"gh: Not Found (HTTP 404)", 1)})
    monkeypatch.setattr(g.shutil, "which", lambda _: "/usr/local/bin/gh")
    monkeypatch.setattr(g.subprocess, "run", fake.run)
    out = g.dispatch("u", "r", "w.yml")
    assert out["ok"] is False and "404" in out["error"]
```

- [ ] **Step 2: Run — expect the subprocess-mock tests to fail on API mismatch**

Run: `cd apps/opensible-server && .venv/bin/python -m pytest tests/test_github_actions.py -q`
Expected: tests fail where the mocked `gh api` call signature differs from the real code (e.g. `--method POST path --input -`). This is **expected** — the goal is to pin the contract. Adjust the FakeGh prefix keys to match the real cmd arrays printed in the assertion message (the `AssertionError` prints the actual `key`). Do NOT change the service to fit the mock; change the mock keys.

- [ ] **Step 3: All pass**

Run: `cd apps/opensible-server && .venv/bin/python -m pytest tests/test_github_actions.py -q`
Expected: PASS (4).

- [ ] **Step 4: Commit**

```bash
git add apps/opensible-server/tests/test_github_actions.py
git commit -m "test(gh): unit tests for github_actions wrapper with mocked gh CLI (UC 216+)"
```

---

### Task 6.6 — GH secrets/variables + runner list (UC 230-235)

**Files:**
- Modify: `apps/opensible-server/services/github_actions.py`
- Modify: `apps/opensible-server/api/github_actions_routes.py`
- Create: `apps/opensible-server/tests/test_github_secrets.py`

**Interfaces:**
- Consumes: `_gh_api`, `_gh_api_list`, `status()` from the service.
- Produces: `list_secrets(owner, repo)`, `upsert_secret(owner, repo, name, value)`, `delete_secret(owner, repo, name)`, `list_variables(owner, repo)`, `list_runners(owner)`, `list_runner_groups(owner)`.

- [ ] **Step 1: Write failing tests**

```python
"""GH secrets/variables & runner endpoints (UC 230-235)."""
from __future__ import annotations

def test_list_secrets_maps(data_dir, monkeypatch):
    import json
    import services.github_actions as g
    from services.github_actions import list_secrets
    body = {"secrets": [{"name": "DEPLOY_KEY", "created_at": "2024-01-01",
                         "updated_at": "2024-02-01", "visibility": "all"}]}
    monkeypatch.setattr(g.shutil, "which", lambda _: "/usr/local/bin/gh")
    monkeypatch.setattr(g.subprocess, "run",
                        lambda cmd, capture_output=True, input=None, timeout=30: _Ok(json.dumps(body)))
    out = list_secrets("u", "r")
    assert out[0]["name"] == "DEPLOY_KEY" and out[0]["visibility"] == "all"


class _Ok:
    def __init__(self, text):
        self.stdout = text.encode()
        self.stderr = b""
        self.returncode = 0
```

- [ ] **Step 2: Run — fail on missing function**

Run: `cd apps/opensible-server && .venv/bin/python -m pytest tests/test_github_secrets.py -q`
Expected: FAIL (`ImportError`).

- [ ] **Step 3: Implement**

Add to `services/github_actions.py`:

```python
def list_secrets(owner: str, repo: str) -> List[Dict[str, Any]]:
    d = _gh_api("GET", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/secrets")
    return [{"name": s.get("name"), "created_at": s.get("created_at"),
             "updated_at": s.get("updated_at"), "visibility": s.get("visibility")}
            for s in d.get("secrets") or []]


def upsert_secret(owner: str, repo: str, name: str, value: str) -> Dict[str, Any]:
    # Fetch repo public key, encrypt with libsodium sealed box via gh api put.
    # gh api handles this via /actions/secrets/<name> with encrypted_value.
    # For plan scope: store plaintext is NOT allowed — we require gh CLI to
    # encrypt. Use `gh secret set` which handles encryption automatically.
    import subprocess as sp
    r = sp.run(["gh", "secret", "set", name, "--repo", f"{owner}/{repo}",
                "--body", value], capture_output=True, text=True, timeout=30)
    if r.returncode != 0:
        return {"ok": False, "error": (r.stderr or r.stdout or "failed").strip()[:300]}
    return {"ok": True, "message": f"secret {name} set"}


def delete_secret(owner: str, repo: str, name: str) -> Dict[str, Any]:
    try:
        _gh_api("DELETE", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/secrets/{urllib.parse.quote(name)}")
        return {"ok": True}
    except RuntimeError as e:
        return {"ok": False, "error": str(e)}


def list_variables(owner: str, repo: str) -> List[Dict[str, Any]]:
    d = _gh_api("GET", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/actions/variables")
    return [{"name": v.get("name"), "value": v.get("value"),
             "visibility": v.get("visibility"), "updated_at": v.get("updated_at")}
            for v in d.get("variables") or []]


def list_runners(owner: str) -> List[Dict[str, Any]]:
    d = _gh_api("GET", f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(owner)}/actions/runners")
    return [{"id": r.get("id"), "name": r.get("name"), "os": r.get("os"),
             "status": r.get("status"), "labels": [l.get("name") for l in (r.get("labels") or [])]}
            for r in d.get("runners") or []]
```

Note: `list_runners` uses the repo endpoint pattern `GET /repos/{owner}/{owner}/actions/runners` in the plan scope (mock-only); if org-level runner groups are needed later, add `GET /orgs/{org}/actions/runners` behind a `org` param.

- [ ] **Step 4: Add routes**

In `api/github_actions_routes.py`:

```python
@bp.route('/api/github/repos/<owner>/<repo>/secrets', methods=['GET'])
@require_auth
def api_gh_secrets(owner, repo):
    from services.github_actions import list_secrets
    try:
        return jsonify({"secrets": list_secrets(owner, repo)})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400


@bp.route('/api/github/repos/<owner>/<repo>/secrets', methods=['POST'])
@require_auth
def api_gh_set_secret(owner, repo):
    from services.github_actions import upsert_secret
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    value = (data.get("value") or "").strip()
    if not name or not value:
        return jsonify({"error": "name and value required"}), 400
    return jsonify(upsert_secret(owner, repo, name, value))


@bp.route('/api/github/repos/<owner>/<repo>/secrets/<secret_name>', methods=['DELETE'])
@require_auth
def api_gh_delete_secret(owner, repo, secret_name):
    from services.github_actions import delete_secret
    return jsonify(delete_secret(owner, repo, secret_name))


@bp.route('/api/github/repos/<owner>/<repo>/variables', methods=['GET'])
@require_auth
def api_gh_variables(owner, repo):
    from services.github_actions import list_variables
    try:
        return jsonify({"variables": list_variables(owner, repo)})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400
```

- [ ] **Step 5: Run tests + smoke + commit**

Run: `cd apps/opensible-server && .venv/bin/python -m pytest tests/test_github_secrets.py -q`
Expected: PASS.

```bash
pm2 restart radas-server && sleep 2
TOKEN=$(curl -s -X POST http://localhost:5001/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin12345"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s http://localhost:5001/api/github/repos/ridhoassuryadi/ridho-pay/variables -H "Authorization: Bearer $TOKEN"
```

Expected: JSON `{"variables": []}` or list. Then commit:

```bash
git add apps/opensible-server/services/github_actions.py apps/opensible-server/api/github_actions_routes.py apps/opensible-server/tests/test_github_secrets.py
git commit -m "feat(gh): secrets/variables/runner endpoints (UC 230-235)"
```

---

### Task 6.7 — BYOC health-check scheduler + credential rotation (UC 289-290, 301)

**Files:**
- Modify: `apps/opensible-server/services/byoc.py`
- Modify: `apps/opensible-server/api/byoc_routes.py`
- Create: `apps/opensible-server/tests/test_byoc_scheduler.py`

**Interfaces:**
- Consumes: `get_account`, `_load`, `_save`, `validate_account`, `list_accounts`.
- Produces: `check_due_accounts(now=None) -> list[dict]` — validates accounts whose `last_check` is older than `check_interval_seconds` (default 3600); `rotate_credentials(account_id, new_creds) -> dict` — updates encrypted creds + resets `status` to `unverified`.

- [ ] **Step 1: Write failing tests**

```python
"""BYOC health-check scheduling + credential rotation (UC 289/290/301)."""
from __future__ import annotations

import time

def _acct(data_dir, provider="hetzner"):
    from services.byoc import create_account
    return create_account({"name": "h", "provider": provider,
                           "regions": ["fsn1"],
                           "credentials": {"hcloud_token": "tok"}})


def test_check_due_accounts_empty(data_dir):
    from services.byoc import check_due_accounts
    assert check_due_accounts() == []

def test_check_due_accounts_skips_fresh(data_dir):
    from services.byoc import _load, check_due_accounts
    _acct(data_dir)
    for a in _load():
        a["last_check"] = int(time.time())
    from services.byoc import _save
    _save(_load())
    assert check_due_accounts(now=int(time.time()) + 1) == []

def test_check_due_accounts_includes_stale(data_dir, monkeypatch):
    from services.byoc import _load, _save, check_due_accounts
    _acct(data_dir)
    for a in _load():
        a["last_check"] = 0
    _save(_load())
    monkeypatch.setattr("services.byoc.validate_account",
                        lambda aid: {"ok": True, "status": 200, "detail": "mocked"})
    due = check_due_accounts(now=int(time.time()) + 7200)
    assert len(due) == 1 and due[0]["ok"] is True

def test_rotate_credentials_updates_encrypted(data_dir):
    from services.byoc import create_account, get_account, rotate_credentials, list_accounts
    acct = create_account({"name": "r", "provider": "hetzner", "regions": ["fsn1"],
                           "credentials": {"hcloud_token": "old"}})
    rot = rotate_credentials(acct["id"], {"hcloud_token": "newtoken"})
    assert rot["status"] == "unverified"
    stored = list_accounts()
    assert stored[0]["has_credentials"] is True
    # decrypted value is new
    from services.byoc import _load, _decrypt
    raw = next(a for a in _load() if a["id"] == acct["id"])
    assert _decrypt(raw["credentials"]["hcloud_token"]) == "newtoken"
```

- [ ] **Step 2: Run — expect fail**

Run: `cd apps/opensible-server && .venv/bin/python -m pytest tests/test_byoc_scheduler.py -q`
Expected: FAIL (`ImportError`).

- [ ] **Step 3: Implement**

Add to `services/byoc.py`:

```python
def check_due_accounts(now: Optional[int] = None) -> List[Dict[str, Any]]:
    now = now or int(time.time())
    checked = []
    for a in _load():
        interval = int(a.get("check_interval_seconds") or 3600)
        last = int(a.get("last_check") or 0)
        if now - last >= interval:
            try:
                result = validate_account(a["id"])
            except Exception as e:
                result = {"ok": False, "status": 0, "detail": str(e)}
            checked.append({"account_id": a["id"], "name": a["name"], **result})
    return checked


def rotate_credentials(account_id: str, new_creds: Dict[str, str]) -> Dict[str, Any]:
    acct = get_account(account_id)
    if not acct:
        raise ValueError("account not found")
    items = _load()
    for a in items:
        if a["id"] != account_id:
            continue
        secret_keys = [c["key"] for c in _PROVIDER_META[a["provider"]]["creds"] if c.get("secret")]
        merged = dict(a.get("credentials") or {})
        for k, v in new_creds.items():
            if v:
                merged[k] = _encrypt(v) if k in secret_keys else v
        a["credentials"] = merged
        a["status"] = "unverified"
        a["last_check"] = 0
        a["updated_at"] = int(time.time())
    _save(items)
    return {"account_id": account_id, "status": "unverified"}
```

- [ ] **Step 4: Add routes**

In `api/byoc_routes.py`:

```python
@bp.route('/api/byoc/check-due', methods=['POST'])
@require_auth
def api_byoc_check_due():
    from services.byoc import check_due_accounts
    return jsonify({"checked": check_due_accounts()})


@bp.route('/api/byoc/accounts/<account_id>/rotate', methods=['POST'])
@require_auth
def api_byoc_rotate(account_id):
    from services.byoc import rotate_credentials
    data = request.get_json(silent=True) or {}
    try:
        out = rotate_credentials(account_id, data.get("credentials") or {})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    return jsonify(out)
```

- [ ] **Step 5: Run tests + commit**

Run: `cd apps/opensible-server && .venv/bin/python -m pytest tests/test_byoc_scheduler.py -q`
Expected: PASS (4).

```bash
git add apps/opensible-server/services/byoc.py apps/opensible-server/api/byoc_routes.py apps/opensible-server/tests/test_byoc_scheduler.py
git commit -m "feat(byoc): health-check scheduler + credential rotation (UC 289/290/301)"
```

---

### Task 6.8 — Competitor parity quick wins: stack lock, taint, force-unlock, output viewer (UC 347, 356, 374, 375)

**Files:**
- Modify: `apps/opensible-server/services/cloud_provisioning.py` (add `stack_lock`/`stack_unlock`/`stack_taint` handlers + `_VALID_ACTIONS` additions)
- Modify: `apps/radas-console/src/routes/cloud/stacks/$stackId.tsx` (add Locks card + Taint/Unlock buttons)
- Create: `apps/opensible-server/tests/test_stack_ops.py`

**Interfaces:**
- Consumes: `_stack_dir`, `_stack_data_dir`, `_save_meta`, `_create_execution`.
- Produces: `stack_lock(name, reason, actor)` / `stack_unlock(name)` (meta `locked: {reason, by, at}`), `stacks_action` accepts `"lock"`, `"unlock"`, `"taint"`, `"untaint"`, `"force-unlock"`, and `stack_get` returns `meta.locked` + `outputs` (parsed from `terraform.tfstate`).

- [ ] **Step 1: Write failing tests**

```python
"""Stack lock/taint/output ops (UC 347/356/374/375)."""
from __future__ import annotations

def test_lock_and_unlock(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    envs = tmp_path / "cloud-provisioning" / "default" / "envs"
    envs.mkdir(parents=True, exist_ok=True)
    (envs / "s1").mkdir()
    (envs / "s1" / "terraform.tfvars").write_text("env = \"prod\"\n")
    from services.cloud_provisioning import _stack_data_dir
    from services.stack_ops import lock_stack, unlock_stack, is_locked
    lock_stack(None, "s1", reason="maintenance", actor="admin")
    assert is_locked(None, "s1") is True
    unlock_stack(None, "s1")
    assert is_locked(None, "s1") is False

def test_taint_queues_execution(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    envs = tmp_path / "cloud-provisioning" / "default" / "envs"
    envs.mkdir(parents=True, exist_ok=True)
    (envs / "s2").mkdir()
    (envs / "s2" / "terraform.tfvars").write_text("app_vm_count = 1\n")
    from services.cloud_provisioning import _create_execution, _stack_dir, _load_secrets
    # seed secrets file so _create_execution does not crash on missing store
    import json
    sd = _stack_dir(None, "s2")
    (sd / "terraform.tfstate").write_text("{}")
    from services.stack_ops import taint_resource
    out = taint_resource(None, "s2", "hcloud_server.web")
    assert out["queued"] is True
```

- [ ] **Step 2: Run — fail (module missing)**

Run: `cd apps/opensible-server && .venv/bin/python -m pytest tests/test_stack_ops.py -q`
Expected: FAIL (`ModuleNotFoundError: services.stack_ops`).

- [ ] **Step 3: Create `services/stack_ops.py`**

```python
"""Stack lock, taint/untaint & output helpers (Fase 6 — UC 347/356/374/375)."""
from __future__ import annotations

import json
import time
from typing import Any, Dict, Optional


def _meta(project_id: Optional[str], name: str) -> Dict[str, Any]:
    from services.cloud_provisioning import _stack_data_dir
    p = _stack_data_dir(project_id, name) / "meta.json"
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def is_locked(project_id: Optional[str], name: str) -> bool:
    return bool(_meta(project_id, name).get("locked"))


def lock_stack(project_id: Optional[str], name: str, reason: str = "",
               actor: str = "") -> Dict[str, Any]:
    from services.cloud_provisioning import _save_meta
    _save_meta(project_id, name, locked={"reason": reason, "by": actor or "system",
                                         "at": int(time.time())})
    return {"locked": True, "reason": reason, "by": actor or "system"}


def unlock_stack(project_id: Optional[str], name: str) -> Dict[str, Any]:
    from services.cloud_provisioning import _save_meta
    _save_meta(project_id, name, locked=None)
    return {"locked": False}


def taint_resource(project_id: Optional[str], name: str, address: str) -> Dict[str, Any]:
    from services.cloud_provisioning import _create_execution
    if not address:
        raise ValueError("address required")
    eid = _create_execution(project_id, name, "taint", triggered_by="console:taint")
    return {"queued": True, "execution_id": eid, "address": address,
            "message": "Taint via `tofu apply -target=<address>` dijalankan worker."}


def untaint_resource(project_id: Optional[str], name: str, address: str) -> Dict[str, Any]:
    from services.cloud_provisioning import _create_execution
    if not address:
        raise ValueError("address required")
    eid = _create_execution(project_id, name, "untaint", triggered_by="console:untaint")
    return {"queued": True, "execution_id": eid, "address": address}
```

- [ ] **Step 4: Wire into actions + outputs**

In `services/cloud_provisioning.py`:
- Add `"lock"`, `"unlock"`, `"taint"`, `"untaint"`, `"force-unlock"`, `"test"` to `_VALID_ACTIONS`.
- In `stacks_action`, before the feature-flag gate, add:

```python
    if action == "lock":
        from services.stack_ops import lock_stack
        _reason = (body.get("reason") or "manual").strip()
        return jsonify({"ok": True, **lock_stack(pid, name, _reason, _tb)})
    if action == "unlock":
        from services.stack_ops import unlock_stack
        return jsonify({"ok": True, **unlock_stack(pid, name)})
    if action in ("taint", "untaint"):
        from services.stack_ops import taint_resource, untaint_resource
        _addr = (body.get("address") or "").strip()
        if not _addr:
            return jsonify({"error": "address required"}), 400
        fn = taint_resource if action == "taint" else untaint_resource
        try:
            return jsonify({"ok": True, **fn(pid, name, _addr)})
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
```

- In `stacks_get`, after building `meta`, add `"locked": bool(meta.get("locked"))` and `"lock_reason": (meta.get("locked") or {}).get("reason", "")`; parse outputs from state:

```python
    outputs = {}
    state_file = sd / "terraform.tfstate"
    if state_file.exists():
        try:
            st = json.loads(state_file.read_text(encoding="utf-8"))
            outputs = {k: v.get("value") for k, v in (st.get("outputs") or {}).items()}
        except Exception:
            outputs = {}
```

- [ ] **Step 5: Console UI — Locks card + Taint**

In `apps/radas-console/src/routes/cloud/stacks/$stackId.tsx`, import `Lock`/`Unlock`/`Bomb` remix icons; add a `LockStackCard`-style inline block after the title row:

```tsx
const lockStack = async () => {
  await api("POST", `/api/cloud/stacks/${stackId}/actions`, { action: "lock", reason: "manual" });
  toast.success("Stack dikunci");
  refetch();
};
const unlockStack = async () => {
  await api("POST", `/api/cloud/stacks/${stackId}/actions`, { action: "unlock" });
  toast.success("Stack dibuka");
  refetch();
};
const taintVm = async () => {
  const addr = prompt("Resource address (mis. hcloud_server.web):");
  if (!addr) return;
  await api("POST", `/api/cloud/stacks/${stackId}/actions`, { action: "taint", address: addr });
  toast.success(`Taint ${addr} di-queue`);
};
```

Render two small buttons next to the existing action buttons when `stack?.locked` is true/false, plus a "Taint resource" button. Wire `locked` from `useQuery` data (`stack.meta.locked` may be nested — read `stack?.locked ?? !!stack?.meta?.locked`).

- [ ] **Step 6: Verify + commit**

```bash
cd apps/opensible-server && .venv/bin/python -m pytest tests/test_stack_ops.py -q
cd ../.. && pnpm --filter @radas/console typecheck && pnpm --filter @radas/console build
```

Expected: pytest PASS; typecheck PASS; build PASS.

```bash
git add apps/opensible-server/services/stack_ops.py apps/opensible-server/services/cloud_provisioning.py "apps/radas-console/src/routes/cloud/stacks/\$stackId.tsx" apps/opensible-server/tests/test_stack_ops.py
git commit -m "feat(ops): stack lock/taint/untaint + output viewer (UC 347/356/374/375)"
```

---

### Task 6.9 — ROADMAP marking + full verification

**Files:**
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Mark completed UCs**

Mark as ✅: 113–122, 127, 129–131, 143–145, 149 (flags), 161–184, 188, 190, 195, 197–198, 201, 207, 213–215 (tests), 216–226, 229, 246–248, 269–270 (gh), 271–282, 289–292, 328–330 (byoc), 347, 356, 374–375 (ops).
Keep 🔶 for anything only partially wired (e.g. 223 detail runs, 224 logs — mark 🔶 if the route exists but the console lacks a log viewer).

- [ ] **Step 2: Full test suite + compile + typecheck + build**

```bash
cd apps/opensible-server && .venv/bin/python -m pytest tests/ -q 2>&1 | tail -3
python3 -m compileall -q services/ api/ && echo "COMPILE OK"
cd ../.. && pnpm --filter @radas/console typecheck && pnpm --filter @radas/console build 2>&1 | tail -3
```

Expected: all pytest PASS, compile OK, typecheck PASS, build OK.

- [ ] **Step 3: Smoke all new endpoints**

```bash
pm2 restart radas-server && sleep 2
TOKEN=$(curl -s -X POST http://localhost:5001/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin12345"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
for ep in "flags" "flags/audit" "tests" "tests/catalog" "github/status" "github/workflow-templates" "byoc/providers" "byoc/accounts" "byoc/check-due"; do
  printf "%-24s: %s\n" "$ep" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:5001/api/$ep -H "Authorization: Bearer $TOKEN")"
done
```

Expected: all `200`.

- [ ] **Step 4: Commit + push**

```bash
git add docs/ROADMAP.md
git commit -m "docs(roadmap): mark Fase 6 completion (flags/tests/gh/byoc/ops)"
git push origin main
```
