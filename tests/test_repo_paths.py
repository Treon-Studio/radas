"""Repository path integrity (Task 6.4 of the 2026-08-27 integration plan;
Phase 8 update: the Flask server apps/server has been REMOVED).

Guards against the stale-path failure mode this repo has hit repeatedly
(apps/opensible-server -> apps/server -> apps/server_elixir,
apps/radas-console -> apps/console, apps/chrome-ext removal, contract
discovery pointing at nonexistent files):

  1. the required app trees and contract artifacts exist;
  2. active scripts, workflows, and docs contain no retired path references
     (MIGRATION_GUIDE.md is exempt: it carries an explicit retirement banner);
  3. every literal `working-directory:` in .github/workflows resolves to a
     real directory;
  4. package / module identities match the documented convention.

Stdlib-only: runs under pytest when available, or standalone via
`python3 tests/test_repo_paths.py` (no venv needed — the Flask venv is gone
with apps/server).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

REQUIRED_APP_DIRS = ("cli", "console", "server_elixir", "worker", "desktop-app")

REQUIRED_CONTRACT_FILES = (
    "contracts/radas-api-v2.openapi.json",
    "contracts/radas-api-v2-violations-baseline.json",
    "contracts/cli-route-manifest.json",
    "contracts/cross-client-fixtures.json",
)

# Paths that no longer exist and must not be referenced by active files.
# `apps/server` (Flask) was physically removed in the Phase 8 final cutover —
# active files must reference apps/server_elixir instead.
RETIRED_PATH_PREFIXES = (
    "apps/server/",
    "apps/opensible-server",
    "apps/radas-console",
    "apps/chrome-ext",
    "apps/extension",
    "contracts/investrack",
    "contracts/bungas",
)

# Files checked for retired references. MIGRATION_GUIDE.md is excluded on
# purpose: it is retired-in-place with a banner explaining why.
ACTIVE_PATH_FILES = (
    "apps/cli/radas.yml",
    "docs/postgres-neon.md",
    "docs/cloudflare-deploy.md",
    "scripts/verify-repo-layout.sh",
    "scripts/run-cli-server-contract-test.sh",
    "scripts/run-cross-client-contracts.sh",
    "scripts/vulnerability-scan.sh",
)

EXPECTED_MODULE_IDS = {
    "apps/cli/go.mod": "github.com/raizora/radas/v4",
    "apps/worker/go.mod": "github.com/opensible/worker-go",
}

EXPECTED_PACKAGE_NAMES = {
    "apps/console/package.json": "@radas/console",
    "apps/desktop-app/package.json": "@radas/desktop-app",
}


def test_required_app_directories_exist():
    for name in REQUIRED_APP_DIRS:
        assert (ROOT / "apps" / name).is_dir(), f"missing app directory: apps/{name}"


def test_required_contract_artifacts_exist():
    for rel in REQUIRED_CONTRACT_FILES:
        assert (ROOT / rel).is_file(), f"missing contract artifact: {rel}"


def test_openapi_snapshot_is_valid_json_with_paths():
    snapshot = json.loads((ROOT / "contracts/radas-api-v2.openapi.json").read_text(encoding="utf-8"))
    assert snapshot.get("openapi", "").startswith("3."), "served snapshot must be OpenAPI 3.x"
    assert len(snapshot.get("paths", {})) > 0, "served snapshot must document at least one path"


@pytest.mark.parametrize("rel", ACTIVE_PATH_FILES)
def test_active_files_have_no_retired_path_references(rel):
    path = ROOT / rel
    if not path.is_file():
        pytest.skip(f"{rel} not present on this checkout")
    text = path.read_text(encoding="utf-8", errors="replace")
    for prefix in RETIRED_PATH_PREFIXES:
        assert prefix not in text, (
            f"{rel} references retired path '{prefix}'; update it to the current tree"
        )


def test_migration_guide_is_retired_with_banner():
    guide = ROOT / "MIGRATION_GUIDE.md"
    if not guide.is_file():
        pytest.skip("MIGRATION_GUIDE.md not present on this checkout")
    assert "RETIRED" in guide.read_text(encoding="utf-8"), (
        "MIGRATION_GUIDE.md still references removed apps without a retirement banner"
    )


def test_active_workflows_do_not_target_retired_flask_server():
    """Phase 8: CI must run the Phoenix suite (apps/server_elixir), not the
    retired Flask tree. apps/server itself stays as a deprecated reference —
    only NEW workflow targets are banned."""
    import re as _re

    workflows = sorted((ROOT / ".github/workflows").glob("*.yml"))
    for workflow in workflows:
        text = workflow.read_text(encoding="utf-8", errors="replace")
        for match in _re.finditer(r"working-directory:\s*(\S+)", text):
            target = match.group(1).strip("'\"").rstrip("/")
            assert target != "apps/server", (
                f"{workflow.name}: working-directory targets the retired Flask "
                "tree; point it at apps/server_elixir"
            )


def test_pm2_does_not_launch_the_retired_flask_server():
    eco = (ROOT / "ecosystem.config.cjs").read_text(encoding="utf-8", errors="replace")
    assert 'name: "radas-server"' not in eco, (
        "ecosystem.config.cjs still launches the retired Flask server; "
        "radas-phoenix is the backend entry"
    )


def test_workflow_working_directories_resolve():
    workflows = sorted((ROOT / ".github/workflows").glob("*.yml"))
    assert workflows, "no GitHub workflows found"
    for workflow in workflows:
        text = workflow.read_text(encoding="utf-8", errors="replace")
        for match in re.finditer(r"working-directory:\s*(\S+)", text):
            target = match.group(1).strip("'\"")
            if "${{" in target or "$" in target:
                continue  # expression / env-based, not statically resolvable
            assert (ROOT / target).is_dir(), (
                f"{workflow.name}: working-directory '{target}' does not exist"
            )


@pytest.mark.parametrize("rel, expected", sorted(EXPECTED_MODULE_IDS.items()))
def test_go_module_identities(rel, expected):
    first_line = (ROOT / rel).read_text(encoding="utf-8").splitlines()[0].strip()
    assert first_line == f"module {expected}"


@pytest.mark.parametrize("rel, expected", sorted(EXPECTED_PACKAGE_NAMES.items()))
def test_package_names(rel, expected):
    manifest = json.loads((ROOT / rel).read_text(encoding="utf-8"))
    assert manifest.get("name") == expected


if __name__ == "__main__":
    import sys

    failures = 0

    def _run(name, fn, args=()):
        global failures
        try:
            fn(*args)
        except AssertionError as exc:
            failures += 1
            print(f"FAIL {name}: {exc}")
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"ERROR {name}: {exc}")

    for name, fn in sorted(globals().items()):
        if not (name.startswith("test_") and callable(fn)):
            continue
        if name == "test_active_files_have_no_retired_path_references":
            for rel in ACTIVE_PATH_FILES:
                _run(f"{name}[{rel}]", fn, (rel,))
        elif name == "test_go_module_identities":
            for rel, expected in EXPECTED_MODULE_IDS.items():
                _run(f"{name}[{rel}]", fn, (rel, expected))
        elif name == "test_package_names":
            for rel, expected in EXPECTED_PACKAGE_NAMES.items():
                _run(f"{name}[{rel}]", fn, (rel, expected))
        else:
            _run(name, fn)

    print("path-integrity checks " + ("FAILED" if failures else "passed"))
    sys.exit(1 if failures else 0)
