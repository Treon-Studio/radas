from __future__ import annotations

import importlib
import secrets

import pytest

from utils import runtime_secrets


def _secret() -> str:
    return secrets.token_urlsafe(48)


def test_production_requires_all_runtime_secrets(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "production")
    for name in runtime_secrets.PRODUCTION_SECRET_NAMES:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(RuntimeError) as exc_info:
        runtime_secrets.validate_runtime_secrets(require_database=True)

    message = str(exc_info.value)
    assert all(name in message for name in (*runtime_secrets.PRODUCTION_SECRET_NAMES, "DATABASE_URL"))


def test_production_rejects_weak_secret_without_echoing_value(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "production")
    value = "short-development-value"
    with pytest.raises(RuntimeError, match="strong secret") as exc_info:
        runtime_secrets.validate_secret_value("JWT_SECRET_KEY", value)
    assert value not in str(exc_info.value)


def test_production_accepts_configured_secrets(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "production")
    for name in runtime_secrets.PRODUCTION_SECRET_NAMES:
        monkeypatch.setenv(name, _secret())
    monkeypatch.setenv("DATABASE_URL", "postgresql://db.example.invalid/radas")

    runtime_secrets.validate_runtime_secrets(require_database=True)


def test_nonproduction_fallbacks_are_ephemeral_and_not_persisted(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "testing")
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    first = runtime_secrets.resolve_secret("JWT_SECRET_KEY", generate_in_nonproduction=True)
    second = runtime_secrets.resolve_secret("JWT_SECRET_KEY", generate_in_nonproduction=True)
    assert first and second and first != second


def test_production_encryption_does_not_load_or_generate_data_volume_key(monkeypatch, tmp_path):
    import utils.secret_encryption as secret_encryption

    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.delenv("GLOBAL_SECRETS_ENCRYPTION_KEY", raising=False)
    secret_encryption._encryption_instance = None
    key_file = secret_encryption.get_encryption_key_file_path(tmp_path)
    key_file.write_text(_secret(), encoding="utf-8")

    with pytest.raises(RuntimeError, match="GLOBAL_SECRETS_ENCRYPTION_KEY"):
        secret_encryption.get_encryption(tmp_path)

    assert key_file.read_text(encoding="utf-8")
    secret_encryption._encryption_instance = None
