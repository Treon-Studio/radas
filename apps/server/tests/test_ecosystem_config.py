from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
CONFIG = ROOT / "ecosystem.config.cjs"


def _load_config(
    env: dict[str, str], *, unset: set[str] | None = None
) -> subprocess.CompletedProcess[str]:
    script = f"const c=require({json.dumps(str(CONFIG))}); console.log(JSON.stringify(c.apps));"
    process_env = {**os.environ, **env}
    for key in unset or set():
        process_env.pop(key, None)
    return subprocess.run(
        ["node", "-e", script], cwd=ROOT, env=process_env,
        text=True, capture_output=True, check=False,
    )


def test_production_ecosystem_defaults_flask_debug_to_zero_when_absent():
    common = {
        "FLASK_ENV": "  Production ",
        "JWT_SECRET_KEY": "jwt-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
        "INTERNAL_CALL_SECRET": "internal-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
        "GLOBAL_SECRETS_ENCRYPTION_KEY": "global-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
        "WORKER_REGISTRATION_SECRET": "worker-registration-0123456789-abcdefghijklmnop",
        "VAULT_SERVER_SECRET": "vault-server-0123456789-abcdefghijklmnop",
        "PREVIEW_WEBHOOK_SECRET": "preview-webhook-0123456789-abcdefghijklmnop",
        "DATABASE_URL": "postgresql://db.example.invalid/radas",
    }
    result = _load_config(common, unset={"FLASK_DEBUG"})
    assert result.returncode == 0, result.stderr
    apps = json.loads(result.stdout)
    server = next(app for app in apps if app["name"] == "radas-server")
    assert server["env"]["FLASK_ENV"] == "production"
    assert server["env"]["FLASK_DEBUG"] == "0"


def test_production_ecosystem_rejects_enabled_flask_debug():
    result = _load_config({"FLASK_ENV": "production", "FLASK_DEBUG": "true"})
    assert result.returncode != 0
    assert "FLASK_DEBUG must be disabled in production" in result.stderr


def test_production_ecosystem_requires_all_strong_secrets():
    result = _load_config({"FLASK_ENV": "production"})
    assert result.returncode != 0
    assert "WORKER_REGISTRATION_SECRET" in result.stderr or "INTERNAL_CALL_SECRET" in result.stderr


def test_production_ecosystem_shares_registration_secret_and_requires_vault_secret():
    common = {
        "FLASK_ENV": "production",
        "JWT_SECRET_KEY": "jwt-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
        "INTERNAL_CALL_SECRET": "internal-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
        "GLOBAL_SECRETS_ENCRYPTION_KEY": "global-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
        "WORKER_REGISTRATION_SECRET": "worker-registration-0123456789-abcdefghijklmnop",
        "VAULT_SERVER_SECRET": "vault-server-0123456789-abcdefghijklmnop",
        "PREVIEW_WEBHOOK_SECRET": "preview-webhook-0123456789-abcdefghijklmnop",
        "DATABASE_URL": "postgresql://db.example.invalid/radas",
    }
    result = _load_config(common)
    assert result.returncode == 0, result.stderr
    apps = json.loads(result.stdout)
    server = next(app for app in apps if app["name"] == "radas-server")
    worker = next(app for app in apps if app["name"] == "radas-worker")
    assert server["env"]["WORKER_REGISTRATION_SECRET"] == worker["env"]["WORKER_REGISTRATION_SECRET"]
    assert worker["env"]["VAULT_SERVER_SECRET"] == common["VAULT_SERVER_SECRET"]


@pytest.mark.parametrize(
    ("field", "value", "accepted"),
    [
        ("JWT_SECRET_KEY", "Abcdefghijklmnop1234567890123456", True),
        ("JWT_SECRET_KEY", "Abcdefghijklmnop١١١١١١١١١١١١١١١١", False),
        ("JWT_SECRET_KEY", "ébcdefghijklmnop1234567890123456", True),
        ("JWT_SECRET_KEY", "éééééééééééééééé١١١١١١١١١١١١١١١١", False),
    ],
)
def test_production_ecosystem_uses_ascii_secret_boundaries(field, value, accepted):
    common = {
        "FLASK_ENV": "production",
        "JWT_SECRET_KEY": "jwt-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
        "INTERNAL_CALL_SECRET": "internal-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
        "GLOBAL_SECRETS_ENCRYPTION_KEY": "global-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
        "WORKER_REGISTRATION_SECRET": "worker-registration-0123456789-abcdefghijklmnop",
        "VAULT_SERVER_SECRET": "vault-server-0123456789-abcdefghijklmnop",
        "PREVIEW_WEBHOOK_SECRET": "preview-webhook-0123456789-abcdefghijklmnop",
        "DATABASE_URL": "postgresql://db.example.invalid/radas",
    }
    common[field] = value
    result = _load_config(common)
    assert (result.returncode == 0) is accepted, result.stderr


def test_production_ecosystem_rejects_repository_known_secret():
    env = {
        "FLASK_ENV": "production",
        "JWT_SECRET_KEY": "jwt-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
        "INTERNAL_CALL_SECRET": "internal-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
        "GLOBAL_SECRETS_ENCRYPTION_KEY": "global-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
        "WORKER_REGISTRATION_SECRET": "dev-only-change-me-0123456789abcdef",
        "VAULT_SERVER_SECRET": "vault-server-0123456789-abcdefghijklmnop",
        "PREVIEW_WEBHOOK_SECRET": "preview-webhook-0123456789-abcdefghijklmnop",
        "DATABASE_URL": "postgresql://db.example.invalid/radas",
    }
    result = _load_config(env)
    assert result.returncode != 0
    assert "WORKER_REGISTRATION_SECRET" in result.stderr
