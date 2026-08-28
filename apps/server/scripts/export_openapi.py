#!/usr/bin/env python3
"""Export the served ``/api/v2`` OpenAPI document to a deterministic file.

The exporter mounts the contract surface exactly the way ``app.py`` does —
``api.route_inventory.register_blueprints`` (required/optional policy), the
cloud-provisioning service blueprint, then ``init_api_v2`` +
``finalize_api_v2`` — fetches ``GET /api/v2/openapi.json`` and serializes it
canonically: sorted keys, 2-space indent, UTF-8, trailing newline. Repeated
exports of the same code state are byte-stable, so the committed snapshot at
``contracts/radas-api-v2.openapi.json`` doubles as a reviewable contract
artifact (Task 2.1 of the 2026-08-27 console–CLI integration plan).

Usage (from ``apps/server`` or anywhere):

    .venv/bin/python scripts/export_openapi.py \
        --output contracts/radas-api-v2.openapi.json

Exit code is non-zero if the surface cannot be mounted completely (missing
dependency, failed blueprint registration, skipped optional module) — a
partial surface must never be exported as if it were the contract.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVER_ROOT.parents[1]
DEFAULT_OUTPUT = REPO_ROOT / "contracts" / "radas-api-v2.openapi.json"

# Dev/test fallbacks mirroring tests/conftest.py so a bare checkout can
# export without providing credentials. These are documented ephemeral
# values, never production secrets.
_TEST_ENV_DEFAULTS = {
    "JWT_SECRET_KEY": "test-jwt-secret-key-at-least-32-chars-long!!",
    "FLASK_ENV": "testing",
    "GLOBAL_SECRETS_ENCRYPTION_KEY": "test-global-secrets-encryption-key-32b",
    "INTERNAL_CALL_SECRET": "test-internal-call-secret-at-least-32-chars",
    "DATABASE_URL": "postgresql://localhost/radas_test",
}


def _ensure_server_on_path() -> None:
    if str(SERVER_ROOT) not in sys.path:
        sys.path.insert(0, str(SERVER_ROOT))


def build_contract_app():
    """Mount the same /api/v2 surface production mounts — no shortcuts."""
    _ensure_server_on_path()
    # Modules resolve relative data/log paths from the server root.
    os.chdir(SERVER_ROOT)
    for name, value in _TEST_ENV_DEFAULTS.items():
        os.environ.setdefault(name, value)

    from flask import Flask

    from api.route_inventory import REGISTRY_EXTENSION_KEY, register_blueprints
    from api_v2 import finalize_api_v2, init_api_v2

    app = Flask(__name__)
    app.config.update(TESTING=True)
    register_blueprints(app)

    # Mirrors app.py: the cloud provisioning service blueprint (registered
    # outside route_inventory's policy) is part of the served contract.
    from services.cloud_provisioning import register as _register_cloud

    _register_cloud(app)

    init_api_v2(app)
    finalize_api_v2(app)

    report = app.extensions.get(REGISTRY_EXTENSION_KEY) or {}
    if report.get("failed_required") or report.get("skipped_optional"):
        raise RuntimeError(
            "Contract export requires the complete blueprint surface; "
            f"failed_required={report.get('failed_required')} "
            f"skipped_optional={report.get('skipped_optional')}"
        )
    return app


def fetch_openapi_document(app) -> dict:
    """Return the served /api/v2 document exactly as a client would see it."""
    client = app.test_client()
    response = client.get("/api/v2/openapi.json")
    if response.status_code != 200:
        raise RuntimeError(
            f"GET /api/v2/openapi.json returned {response.status_code}; "
            "the contract surface is not mounted correctly"
        )
    return response.get_json()


def canonical_json_bytes(document: dict) -> bytes:
    """Byte-stable serialization: sorted keys, 2-space indent, UTF-8, LF."""
    return (
        json.dumps(document, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    ).encode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Export the served /api/v2 OpenAPI document byte-stably."
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"output path (default: {DEFAULT_OUTPUT})",
    )
    args = parser.parse_args()

    _ensure_server_on_path()
    from api_v2.contract_checks import find_contract_violations, iter_operations

    app = build_contract_app()
    document = fetch_openapi_document(app)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(canonical_json_bytes(document))

    operations = sum(1 for _ in iter_operations(document))
    violations = find_contract_violations(document)
    print(
        f"openapi={document.get('openapi')} "
        f"info.version={document.get('info', {}).get('version')} "
        f"paths={len(document.get('paths', {}))} operations={operations}"
    )
    for category, entries in violations.items():
        print(f"violations[{category}]={len(entries)} (baseline-gated in tests)")
    print(f"wrote {args.output} ({args.output.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
