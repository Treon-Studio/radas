"""Repository path integrity (Task 6.4 of the 2026-08-27 integration plan).

Guards against the stale-path failure mode this repo has hit repeatedly
(apps/opensible-server -> apps/server, apps/radas-console -> apps/console,
apps/chrome-ext removal, contract discovery pointing at nonexistent files):

  1. the required app trees and contract artifacts exist;
  2. active scripts, workflows, and docs contain no retired path references
     (MIGRATION_GUIDE.md is exempt: it carries an explicit retirement banner);
  3. every literal `working-directory:` in .github/workflows resolves to a
     real directory;
  4. package / module identities match the documented convention.

Stdlib-only so it runs under any Python with pytest (server venv or system).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

REQUIRED_APP_DIRS = ("cli", "console", "server", "worker", "desktop-app")

REQUIRED_CONTRACT_FILES = (
    "contracts/radas-api-v2.openapi.json",
    "contracts/radas-api-v2-violations-baseline.json",
    "contracts/cli-route-manifest.json",
    "contracts/cross-client-fixtures.json",
)

# Paths that no longer exist and must not be referenced by active files.
RETIRED_PATH_PREFIXES = (
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
