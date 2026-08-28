"""Route parity between the RADAS CLI manifest and the served Flask routes.

Task 2.4 of the 2026-08-27 console-CLI integration plan:

* the server route set is generated from ``app.url_map`` (full paths, blueprint
  prefixes already resolved);
* every ``kind=remote`` manifest entry must match a registered server route and
  method (Flask ``<param>`` segments match the CLI's literal segments);
* known mismatches from the initial manifest must be fixed or explicitly
  reclassified — never waived silently;
* console ``/_current/`` rewriting is accounted for by documentation and a
  dedicated diagnostic, never compared literally against the url_map;
* commands with no server route must be classified ``local`` with an explicit
  decision note (the "unclassified local-only" case fails the checker).

The checker itself lives in ``scripts/check_route_parity.py`` and is exercised
both as a library (``evaluate``) and through its exit-code contract.
"""
from __future__ import annotations

import copy
import sys
from pathlib import Path

import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVER_ROOT.parents[1]
MANIFEST_PATH = REPO_ROOT / "contracts" / "cli-route-manifest.json"

if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from scripts import check_route_parity as parity  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def app():
    """The same fully-mounted Flask surface the production app serves."""
    from scripts.export_openapi import build_contract_app

    return build_contract_app()


@pytest.fixture(scope="session")
def manifest() -> dict:
    return parity.load_manifest(MANIFEST_PATH)


@pytest.fixture(scope="session")
def result(app, manifest):
    return parity.evaluate(app, manifest)


# ---------------------------------------------------------------------------
# (a) Every kind=remote manifest entry matches a registered route + method
# ---------------------------------------------------------------------------


def test_server_route_set_is_generated_from_url_map(app):
    routes = parity.extract_server_routes(app)
    assert routes, "expected a non-empty /api route set from app.url_map"
    # Blueprint prefixes are part of the served path (cloud_provisioning -> /api/cloud).
    methods = routes.get("/api/cloud/stacks/<name>")
    assert methods is not None and "GET" in methods
    assert "GET" in routes["/api/approvals"]
    assert "GET" in routes["/api/audit-log"]
    assert "POST" in routes["/api/users/invites"]
    assert "DELETE" in routes["/api/cloud/stacks/<name>/state/lock"]


def test_every_remote_manifest_entry_matches_a_server_route(result):
    assert result.failures == [], "\n".join(result.failures)


def test_manifest_remote_entries_are_flask_param_compatible(app, manifest):
    """%s segments in the manifest match Flask <param> segments, not literals."""
    entries = [e for e in manifest["commands"] if e["kind"] == "remote"]
    assert entries, "manifest must contain remote entries"
    for entry in entries:
        matched, detail = parity.match_route(
            parity.extract_server_routes(app), entry["method"], entry["path"]
        )
        assert matched, f"{entry['command']}: {detail}"


# ---------------------------------------------------------------------------
# (b) Known mismatches from the initial manifest are fixed or reclassified
# ---------------------------------------------------------------------------

# The initial Task 2.4 manifest marked these as failing entries (kind
# remote-broken where applicable). The committed manifest must resolve every
# one of them: either a kind=remote entry that now matches a real route, or a
# kind=local entry with an explicit decision note.
INITIAL_KNOWN_MISMATCHES = {
    "approval list": "remote-broken",  # GET /api/approvals/pending
    "audit list": "remote-broken",  # GET /api/audit?action=&user=
    "user invite <email>": "remote-broken",  # POST /api/users/invite
    "cost estimate <stack>": "remote-broken",  # GET /api/finops/estimate/<id>
    "policy exempt <rule> <stack>": "remote-broken",  # POST /api/policies/exemptions
    "org rules": "remote-broken",  # GET/POST /api/orgs/<id>/rules
    "org set-rules": "remote-broken",
    "worker drain <id>": "remote-broken",  # POST /api/workers/<id>/drain
    "registry publish [dir]": "remote-broken",
    "cloud probe <provider>": "remote-broken",
    "cloud inventory": "remote-broken",
    "flags get <key>": "remote-broken",  # GET /api/flags/<key> never registered (found by this checker)
    # Fabricated-output commands found during the Task 2.4 fake-success sweep
    # (all printed invented results with zero server calls before the fix).
    "drift scan <stack>": "remote-broken",
    "drift remediate <stack>": "remote-broken",
    "drift schedule <stack>": "remote-broken",
    "drift schedule <stack> <cron>": "remote-broken",
    "test list": "remote-broken",
    "test show <test-id>": "remote-broken",
    "test run <test-id>": "remote-broken",
    "test score <stack>": "remote-broken",
    "test idempotency <playbook>": "remote-broken",
    "secret scan [dir]": "remote-broken",
    "secret rotate <key-id>": "remote-broken",
    "secret encrypt <file> / secret decrypt <file>": "remote-broken",
    "approval approve <id>": "remote",  # path matched; fake success removed
    "approval reject <id>": "remote",
    "state unlock <stack> --lock-id": "remote-broken",  # fake success, no call
}


def test_no_manifest_entry_is_still_marked_remote_broken(manifest):
    broken = [e["command"] for e in manifest["commands"] if e["kind"] == "remote-broken"]
    assert broken == [], (
        f"known-mismatch entries still marked remote-broken (the gate must fail, "
        f"not waive silently): {broken}"
    )


def test_each_initial_mismatch_is_fixed_or_reclassified(app, manifest):
    by_command = {e["command"]: e for e in manifest["commands"]}
    routes = parity.extract_server_routes(app)
    for command, initial_kind in INITIAL_KNOWN_MISMATCHES.items():
        entry = by_command.get(command)
        assert entry is not None, f"initial mismatch {command!r} vanished from the manifest"
        if entry["kind"] == "remote":
            matched, detail = parity.match_route(routes, entry["method"], entry["path"])
            assert matched, f"{command}: fixed route still does not match: {detail}"
        elif entry["kind"] == "local":
            assert entry.get("note"), f"{command}: reclassified local without a decision note"
        else:
            pytest.fail(f"{command}: unexpected kind {entry['kind']!r}")


def test_checker_fails_on_the_initial_unfixed_manifest(app):
    """A manifest pinned to the pre-fix CLI paths must FAIL the gate."""
    initial = {
        "commands": [
            {
                "command": "approval list",
                "method": "GET",
                "path": "/api/approvals/pending",
                "kind": "remote",
                "source_file": "apps/cli/cmd/approval/approval.go",
            },
            {
                "command": "user invite <email>",
                "method": "POST",
                "path": "/api/users/invite",
                "kind": "remote",
                "source_file": "apps/cli/cmd/user/user.go",
            },
            {
                "command": "audit list",
                "method": "GET",
                "path": "/api/audit?action=&user=",
                "kind": "remote",
                "source_file": "apps/cli/cmd/audit/audit.go",
            },
        ]
    }
    result = parity.evaluate(app, initial)
    assert result.failures, "the pre-fix manifest must fail the parity gate"
    joined = "\n".join(result.failures)
    assert "/api/approvals/pending" in joined
    assert "/api/users/invite" in joined
    assert "/api/audit" in joined


# ---------------------------------------------------------------------------
# (c) The checker fails when the manifest is wrong
# ---------------------------------------------------------------------------


def test_checker_fails_on_bogus_route(app, manifest):
    mutated = copy.deepcopy(manifest)
    mutated["commands"].append(
        {
            "command": "does not exist",
            "method": "GET",
            "path": "/api/definitely/not/registered",
            "kind": "remote",
            "source_file": "apps/cli/cmd/bogus/bogus.go",
        }
    )
    result = parity.evaluate(app, mutated)
    assert any("/api/definitely/not/registered" in f for f in result.failures)
    assert any("missing server route" in f for f in result.failures)


def test_checker_fails_on_method_mismatch(app, manifest):
    mutated = copy.deepcopy(manifest)
    mutated["commands"].append(
        {
            "command": "registry list wrong method",
            "method": "POST",
            "path": "/api/registry",
            "kind": "remote",
            "source_file": "apps/cli/cmd/registry/registry.go",
        }
    )
    result = parity.evaluate(app, mutated)
    assert any("method mismatch" in f and "/api/registry" in f for f in result.failures)


def test_checker_fails_on_unclassified_local_command(app):
    mutated = {
        "commands": [
            {"command": "mystery op", "method": "", "path": "", "kind": "local", "source_file": "x.go"}
        ]
    }
    result = parity.evaluate(app, mutated)
    assert any("unclassified local-only" in f and "mystery op" in f for f in result.failures)


def test_checker_fails_on_local_command_that_declares_a_request_path(app):
    mutated = {
        "commands": [
            {
                "command": "org switch <org>",
                "method": "GET",
                "path": "/api/orgs",
                "kind": "local",
                "source_file": "apps/cli/cmd/org/org.go",
            }
        ]
    }
    result = parity.evaluate(app, mutated)
    assert any("classified local" in f and "org switch" in f for f in result.failures)


# ---------------------------------------------------------------------------
# (d) Console /_current/ rewriting is documented, never compared literally
# ---------------------------------------------------------------------------


def test_console_current_path_gets_a_dedicated_diagnostic(app):
    mutated = {
        "commands": [
            {
                "command": "console-only stacks",
                "method": "GET",
                "path": "/api/projects/_current/stacks",
                "kind": "remote",
                "source_file": "apps/console/src/lib/api.ts",
            }
        ]
    }
    result = parity.evaluate(app, mutated)
    assert result.failures, "a literal /_current/ manifest path must fail"
    failure = "\n".join(result.failures)
    assert "/_current/" in failure
    assert "console" in failure.lower()
    # It must NOT fall through to the generic "missing server route" wording.
    assert "missing server route" not in failure


def test_checker_output_documents_console_current_rewriting(result):
    text = result.render()
    assert "/_current/" in text
    assert "apps/console/src/lib/api.ts" in text


def test_server_never_registers_a_current_route(app):
    routes = parity.extract_server_routes(app)
    assert not any("/_current/" in path for path in routes), (
        "the server must never see a literal /_current/ segment: it is rewritten "
        "client-side by the console (apps/console/src/lib/api.ts)"
    )


# ---------------------------------------------------------------------------
# Server-route coverage is informational, not fatal
# ---------------------------------------------------------------------------


def test_uncovered_server_routes_are_informational_only(result):
    assert result.failures == []
    assert any("uncovered server route" in line for line in result.info)


def test_rendered_report_contains_counts_and_notes(result):
    text = result.render()
    assert "blueprint prefix" in text.lower()
    assert "remote" in text and "local" in text


# ---------------------------------------------------------------------------
# Exit-code contract
# ---------------------------------------------------------------------------


def test_main_exit_codes(tmp_path, app, manifest, monkeypatch):
    good = tmp_path / "good.json"
    good.write_text(parity.canonical_json(manifest), encoding="utf-8")
    assert parity.main(["--client-manifest", str(good)]) == 0

    bad = tmp_path / "bad.json"
    bad_manifest = copy.deepcopy(manifest)
    bad_manifest["commands"].append(
        {
            "command": "bogus",
            "method": "GET",
            "path": "/api/nope",
            "kind": "remote",
            "source_file": "x.go",
        }
    )
    bad.write_text(parity.canonical_json(bad_manifest), encoding="utf-8")
    assert parity.main(["--client-manifest", str(bad)]) == 1
