"""Served OpenAPI semantic pin: the real app boot vs the committed contract.

Task 6.1 (2026-08-27 console-CLI integration plan), BINDING 1 of Task 2.1.
Relaxed in the Elixir migration (Phase 0.1, 2026-09): this module still runs
``scripts/export_openapi.py`` — the canonical mirror of the ``app.py`` boot
sequence — in a subprocess and requires the served ``/api/v2/openapi.json``
document to serve the identical ``(path, method, operationId)`` surface as the
committed snapshot (see ``tests/openapi_semantic.py``). Byte identity and JSON
serialization drift are explicitly allowed: no client depends on them, and the
cross-client fixtures assert semantic equivalence.

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

from tests.openapi_semantic import assert_semantic_equivalence

SERVER_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVER_ROOT.parents[1]
EXPORTER_PATH = SERVER_ROOT / "scripts" / "export_openapi.py"
SNAPSHOT_PATH = REPO_ROOT / "contracts" / "radas-api-v2.openapi.json"


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


def test_committed_snapshot_serves_the_same_surface(tmp_path):
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

    snapshot_doc = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    served_doc = json.loads(served_path.read_text(encoding="utf-8"))
    assert_semantic_equivalence(snapshot_doc, served_doc, label="served")
