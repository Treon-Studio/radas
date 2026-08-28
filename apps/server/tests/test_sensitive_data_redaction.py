"""Sensitive-data redaction matrix and search-safety tests (Task 5.6).

Every seeded secret value embeds a unique marker (``SECRETMARKER123`` /
``SEARCHSECRET999``); each test asserts the marker never appears in the
serialized output under test:

- ``redact_sensitive()`` field matrix (tokens, passwords, private keys,
  authorization headers, env values, provider refs, command lines, logs)
- the same matrix through ``error_envelope`` / ``operation_envelope``
- ``global_search`` secret results (metadata only, never decrypted values)
- audit event persistence through ``services.audit_events``
- persisted service operation records (instance spec + operation payload)
- runtime provider boundaries (``ProviderResult`` / ``ProviderLogPage``)
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import flask
import pytest

from api.platform_contracts import (
    error_envelope,
    operation_envelope,
    redact_sensitive,
)
from auth.service import generate_token
from services import global_search
from services.runtime_provider import ProviderLogPage, ProviderResult
from storage import pg

MARKER = "SECRETMARKER123"
SEARCH_MARKER = "SEARCHSECRET999"

ORG_A = "org-redact-a"
PROJECT_A = "project-redact-a"
USER_A = "redact-user-a"

PEM = (
    "-----BEGIN RSA PRIVATE KEY-----\n"
    "MIIEpAIBAAKCAQEA{marker}\n"
    "-----END RSA PRIVATE KEY-----"
).format(marker=MARKER)

#: (label, payload) pairs. Each payload embeds MARKER inside a secret VALUE.
MATRIX: list[tuple[str, object]] = [
    ("access_token", {"access_token": f"AT-{MARKER}"}),
    ("refresh_token", {"refresh_token": f"RT-{MARKER}"}),
    ("password", {"password": f"hunter2-{MARKER}"}),
    ("secret", {"secret": f"S-{MARKER}"}),
    ("api_key", {"api_key": f"sk-live-{MARKER}"}),
    ("api key header form", {"X-Api-Key": f"sk-live-{MARKER}"}),
    ("private_key pem", {"private_key": PEM}),
    ("inline pem in log text", f"loaded key {PEM} for stack"),
    ("authorization bearer value", {"authorization": f"Bearer AT-{MARKER}"}),
    ("authorization header inline bearer", f"Authorization: Bearer AT-{MARKER}"),
    ("authorization header inline basic", f"authorization: Basic dXNlck1BUktFU{MARKER}jpwdw=="),
    ("env var nested", {"env": {"DATABASE_PASSWORD": f"hunter2-{MARKER}"}}),
    ("env var short name", {"env": {"DB_PASS": f"hunter2-{MARKER}"}}),
    ("env var inline export", f"export DATABASE_PASSWORD=hunter2-{MARKER}"),
    (
        "provider_ref embedded credential",
        {"provider_ref": {"container_id": "abc123", "env": {"API_TOKEN": f"zz-{MARKER}"}}},
    ),
    ("command line inline", f"tofu apply --password=hunter2-{MARKER} -out x"),
    ("command argv list", ["tofu", "apply", f"--password=hunter2-{MARKER}"]),
    ("log line", f"log: login failed api_key=sk-live-{MARKER}"),
]


def _assert_no_marker(value: object, *, note: str) -> None:
    text = json.dumps(value, default=str)
    assert MARKER.lower() not in text.lower(), f"secret value leaked via {note}: {text[:400]}"


# ---------------------------------------------------------------------------
# 1. redact_sensitive matrix
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("label,payload", MATRIX, ids=[label for label, _ in MATRIX])
def test_matrix_redact_sensitive(label: str, payload: object):
    out = redact_sensitive(payload)
    _assert_no_marker(out, note=f"redact_sensitive({label})")


def test_matrix_preserves_secret_reference_metadata():
    """secret_ref is metadata, not a value: it must survive redaction."""
    payload = {"secrets": {"cred": {"secret_ref": "secret://proj/cred"}}}
    out = redact_sensitive(payload)
    assert out["secrets"]["cred"] == {"secret_ref": "secret://proj/cred"}


# ---------------------------------------------------------------------------
# 2. The same matrix through the shared envelopes
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("label,payload", MATRIX, ids=[label for label, _ in MATRIX])
def test_matrix_error_envelope(label: str, payload: object):
    body = error_envelope("BAD_REQUEST", f"request failed for {label}: {json.dumps(payload)}", details={"payload": payload})
    _assert_no_marker(body, note=f"error_envelope({label})")


def test_matrix_operation_envelope():
    operation = {
        "id": "op-1",
        "kind": "service.deploy",
        "status": "queued",
        "poll_url": "/api/projects/p/operations/op-1",
        "spec": {label: payload for label, payload in MATRIX},
    }
    body = operation_envelope(operation)
    _assert_no_marker(body, note="operation_envelope(matrix)")


# ---------------------------------------------------------------------------
# 3. Search safety: never return secret values
# ---------------------------------------------------------------------------


def _seed_project(project_id: str, org_id: str, user_id: str) -> None:
    now = time.time()
    pg.execute(
        "INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)",
        (org_id, org_id, user_id, now),
    )
    pg.execute(
        "INSERT INTO projects (id,org_id,owner_id,name,description,is_archived,created_at,updated_at) "
        "VALUES (%s,%s,%s,%s,%s,0,%s,%s)",
        (project_id, org_id, user_id, project_id, "", now, now),
    )
    pg.execute(
        "INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)",
        (org_id, user_id, "owner", now),
    )


@pytest.fixture
def search_env(data_dir: Path):
    import app_context

    app_context.set_projects_dir(data_dir / "projects")
    _seed_project(PROJECT_A, ORG_A, USER_A)
    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s,%s,%s)",
        (PROJECT_A, "redact-stack", json.dumps({"provider": "bytedc", "env": "dev"})),
    )
    # Secret blob whose PLAINTEXT VALUE carries the search marker. The value
    # also mentions the stack name so a stack-name query matches a VALUE
    # substring through the ILIKE — the metadata-only-leakage case to pin.
    secret_payload = json.dumps(
        {
            "db_password": f"plaintext-{SEARCH_MARKER}",
            "api_key": f"sk-{SEARCH_MARKER}",
            "note": "deployed for redact-stack",
        }
    ).encode("utf-8")
    pg.execute(
        "INSERT INTO stack_secrets (project_id, stack, data) VALUES (%s,%s,%s)",
        (PROJECT_A, "redact-stack", secret_payload),
    )
    return data_dir


def _assert_secret_results_are_metadata_only(results: dict) -> None:
    for entry in results.get("secrets", []):
        assert set(entry) <= {"type", "project_id", "stack", "matched"}, entry
        assert entry.get("type") == "secret"


def test_search_query_matching_secret_value_returns_metadata_only(search_env):
    """The SQL ILIKE can match value substrings; the row identity (stack name)
    is not secret, but the value itself must never be returned."""
    results = global_search.search(SEARCH_MARKER, project_id=PROJECT_A)
    _assert_secret_results_are_metadata_only(results)
    assert any(s["stack"] == "redact-stack" for s in results["secrets"])
    _assert_no_marker(results, note="global_search(secret value query)")


def test_search_query_matching_stack_name_never_returns_values(search_env):
    results = global_search.search("redact-stack", project_id=PROJECT_A)
    assert any(s["stack"] == "redact-stack" for s in results["secrets"])
    _assert_secret_results_are_metadata_only(results)
    _assert_no_marker(results, note="global_search(stack name query)")


def test_search_route_never_returns_secret_values(search_env):
    """HTTP layer: /api/search (unified_search) must be marker-free too."""
    from auth import middleware

    middleware.set_data_dir(search_env)
    app = flask.Flask("redaction-search-test")
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    from api import register_blueprints

    register_blueprints(app)
    client = app.test_client()
    headers = {"Authorization": f"Bearer {generate_token(USER_A, USER_A, [], search_env, token_type='access')}"}

    for query in (SEARCH_MARKER, "redact-stack"):
        resp = client.get(f"/api/search?q={query}&project_id={PROJECT_A}", headers=headers)
        assert resp.status_code == 200
        _assert_no_marker(resp.get_json(), note=f"/api/search?q={query}")


# ---------------------------------------------------------------------------
# 4. Audit trail redaction
# ---------------------------------------------------------------------------


def test_audit_event_redacts_secret_payloads(pg_db, data_dir):
    from services.audit_events import record_audit_event

    record_audit_event(
        "redaction.probe",
        actor_user_id=USER_A,
        target_type="probe",
        target_id="redact-1",
        meta={
            "password": f"hunter2-{MARKER}",
            "api_key": f"sk-live-{MARKER}",
            "private_key": PEM,
            "env": {"DB_PASS": f"hunter2-{MARKER}"},
            "message": f"failed: authorization: Basic dXNlck1BUktFU{MARKER}jpwdw== Bearer AT-{MARKER}",
        },
    )

    row = pg.query_one(
        "SELECT meta_json FROM audit_log WHERE action = %s AND target_id = %s",
        ("redaction.probe", "redact-1"),
    )
    assert row is not None, "audit event was not persisted"
    meta = json.loads(row["meta_json"])
    _assert_no_marker(meta, note="audit_log.meta_json")
    assert meta["password"] == "[REDACTED]"
    assert meta["env"]["DB_PASS"] == "[REDACTED]"
    assert meta["api_key"] == "[REDACTED]"
    assert "[REDACTED]" in meta["private_key"]
    assert f"dXNlck1BUktFU{MARKER}jpwdw==" not in meta["message"]


# ---------------------------------------------------------------------------
# 5. Operation records: only {secret_ref} shapes, never values
# ---------------------------------------------------------------------------

SECRET_BEARING_SPEC = {
    "mode": "safe",
    "db_password": f"hunter2-{MARKER}",
    "api_key": f"sk-live-{MARKER}",
    "env": {"DB_PASS": f"hunter2-{MARKER}", "DATABASE_PASSWORD": f"hunter2-{MARKER}"},
    "secrets": {"cred": {"secret_ref": "secret://op/cred"}},
}


@pytest.fixture
def operation_env(data_dir: Path):
    _seed_project(PROJECT_A, ORG_A, USER_A)
    return data_dir


def test_operation_records_persist_redacted_specs(operation_env):
    from services import service_instances, service_operations

    instance, operation = service_operations.create_instance_and_deploy(
        PROJECT_A,
        "redact-inst",
        "exec-demo",
        "1.0.0",
        "development",
        "mock",
        SECRET_BEARING_SPEC,
        "redact-deploy-1",
        requested_by=USER_A,
        actor_id=USER_A,
    )

    stored_instance = service_instances.require_instance(PROJECT_A, instance["id"], actor_id=USER_A)
    stored_operation = service_operations.get_operation(PROJECT_A, operation["id"], actor_id=USER_A)

    for note, record in (
        ("create_instance_and_deploy instance", instance),
        ("create_instance_and_deploy operation", operation),
        ("require_instance", stored_instance),
        ("get_operation", stored_operation),
    ):
        _assert_no_marker(record, note=note)

    revision = pg.query_one(
        "SELECT spec, redacted_spec FROM service_revisions WHERE instance_id = %s",
        (instance["id"],),
    )
    assert revision is not None
    _assert_no_marker(revision, note="service_revisions.spec")
    spec = revision["spec"]
    assert spec["db_password"] == "[REDACTED]"
    assert spec["api_key"] == "[REDACTED]"
    assert spec["env"]["DB_PASS"] == "[REDACTED]"
    assert spec["env"]["DATABASE_PASSWORD"] == "[REDACTED]"
    assert spec["secrets"]["cred"] == {"secret_ref": "secret://op/cred"}


# ---------------------------------------------------------------------------
# 6. Runtime provider boundaries
# ---------------------------------------------------------------------------


def test_provider_result_redacts_secret_data():
    result = ProviderResult.ok(
        "deploy",
        data={
            "provider_ref": {"container_id": "abc"},
            "env": {"DB_PASS": f"hunter2-{MARKER}", "IMAGE": "example:1"},
        },
        provider_id="local-container",
    ).to_dict()
    _assert_no_marker(result, note="ProviderResult.to_dict")
    assert result["data"]["env"]["DB_PASS"] == "[REDACTED]"
    assert result["data"]["env"]["IMAGE"] == "example:1"


def test_provider_log_page_redacts_secret_lines():
    page = ProviderLogPage(
        entries=(
            {"level": "info", "message": f"boot ok image=example:1 password={MARKER}"},
        ),
        provider_id="local-container",
    ).to_dict()
    _assert_no_marker(page, note="ProviderLogPage.to_dict")
