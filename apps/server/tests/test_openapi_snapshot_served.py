"""Served OpenAPI snapshot pin: the real app boot vs the committed contract.

Task 6.1 (2026-08-27 console-CLI integration plan), BINDING 1 of Task 2.1.

``test_openapi_contract.py`` asserts equivalence against a *test-constructed*
app. This module instead runs ``scripts/export_openapi.py`` — the canonical
mirror of the ``app.py`` boot sequence (route-inventory blueprints, the
cloud-provisioning service blueprint, then ``init_api_v2`` +
``finalize_api_v2``) — in a subprocess and byte-compares the served
``/api/v2/openapi.json`` document against the committed snapshot at
``contracts/radas-api-v2.openapi.json``.

A blueprint registered directly in ``app.py`` outside that mirrored boot
sequence must be added to the exporter (and the snapshot regenerated and
reviewed) or this test fails: the committed contract artifact must describe
exactly what production serves, never a test-only approximation.

Generated clients: none exist yet (console uses hand-written
``apps/console/src/lib/api.ts``; the CLI uses ``apps/cli/internal/client``),
so "stale generated client" freshness reduces to snapshot-vs-served drift
today. When a generated client lands, wire its regeneration + diff check
into ``scripts/check-openapi-contract.sh`` next to the exporter comparison.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVER_ROOT.parents[1]
EXPORTER_PATH = SERVER_ROOT / "scripts" / "export_openapi.py"
SNAPSHOT_PATH = REPO_ROOT / "contracts" / "radas-api-v2.openapi.json"

_PREVIEW_LIMIT = 200


def _preview(value) -> str:
    text = repr(value)
    if len(text) > _PREVIEW_LIMIT:
        text = text[: _PREVIEW_LIMIT - 3] + "..."
    return text


def _first_diff_path(old, new, path: str = "$") -> tuple[str, object, object] | None:
    """Return (path, snapshot value, served value) of the first divergence.

    ``old`` is the committed snapshot document, ``new`` the served one; the
    returned path is a JSONPath-ish dotted/indexed locator suitable for
    pointing a reviewer at the drift.
    """
    if type(old) is not type(new):
        return (path, old, new)
    if isinstance(old, dict):
        for key in sorted(set(old) | set(new), key=str):
            if key not in old:
                return (f"{path}.{key}", "<absent in snapshot>", new[key])
            if key not in new:
                return (f"{path}.{key}", old[key], "<absent in served doc>")
            found = _first_diff_path(old[key], new[key], f"{path}.{key}")
            if found:
                return found
        return None
    if isinstance(old, list):
        if len(old) != len(new):
            return (f"{path}[len]", len(old), len(new))
        for index, (o, n) in enumerate(zip(old, new)):
            found = _first_diff_path(o, n, f"{path}[{index}]")
            if found:
                return found
        return None
    if old != new:
        return (path, old, new)
    return None


def _export_served_document(tmp_path: Path):
    """Run the exporter subprocess; return (output path, completed process)."""
    out = tmp_path / "served-openapi.json"
    proc = subprocess.run(
        [sys.executable, str(EXPORTER_PATH), "--output", str(out)],
        capture_output=True,
        text=True,
        cwd=SERVER_ROOT,
        timeout=300,
    )
    return out, proc


def test_committed_snapshot_is_the_served_document(tmp_path):
    assert SNAPSHOT_PATH.exists(), (
        f"missing {SNAPSHOT_PATH}; run\n"
        f"  cd apps/server && .venv/bin/python scripts/export_openapi.py "
        f"--output {SNAPSHOT_PATH}"
    )
    served_path, proc = _export_served_document(tmp_path)
    assert proc.returncode == 0, (
        "scripts/export_openapi.py failed to mount the served surface "
        f"(exit {proc.returncode}):\n{proc.stderr[-2000:]}"
    )

    served_bytes = served_path.read_bytes()
    snapshot_bytes = SNAPSHOT_PATH.read_bytes()
    if served_bytes == snapshot_bytes:
        return  # the snapshot IS the served document

    # Drift: build an actionable failure naming the first differing path
    # instead of a bare byte-equality assert.
    details = ["the served /api/v2 OpenAPI document drifted from the committed snapshot."]
    if proc.stdout.strip():
        details.append(f"exporter: {proc.stdout.strip()}")
    try:
        served_doc = json.loads(served_bytes)
        snapshot_doc = json.loads(snapshot_bytes)
    except json.JSONDecodeError as exc:
        details.append(f"could not parse documents as JSON: {exc}")
    else:
        first = _first_diff_path(snapshot_doc, served_doc)
        if first:
            diff_path, expected, actual = first
            details.append(
                f"first differing path: {diff_path}\n"
                f"  snapshot: {_preview(expected)}\n"
                f"  served:   {_preview(actual)}"
            )
        else:
            details.append("documents are JSON-equal but bytes differ (serialization drift).")
    details.append(
        "If the surface change is intentional: update scripts/export_openapi.py "
        "to mirror the new app.py boot (if it changed), then regenerate and "
        f"review the snapshot with\n  cd apps/server && .venv/bin/python "
        f"scripts/export_openapi.py --output {SNAPSHOT_PATH}\n"
        "and commit it together with the surface change. Otherwise revert the "
        "change that altered the served surface."
    )
    pytest.fail("\n".join(details), pytrace=False)
