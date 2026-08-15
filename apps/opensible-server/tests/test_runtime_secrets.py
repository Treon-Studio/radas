from __future__ import annotations

import importlib
import os
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


@pytest.mark.parametrize(
    ("value", "accepted"),
    [
        ("Abcdefghijklmnop1234567890123456", True),
        ("Abcdefghijklmnop" + "١" * 16, False),
        ("ébcdefghijklmnop" + "1234567890123456", True),
        ("é" * 16 + "١" * 16, False),
    ],
)
def test_secret_strength_uses_ascii_letter_and_digit_boundaries(monkeypatch, value, accepted):
    monkeypatch.setenv("FLASK_ENV", "production")
    if accepted:
        runtime_secrets.validate_secret_value("JWT_SECRET_KEY", value)
    else:
        with pytest.raises(RuntimeError, match="strong secret"):
            runtime_secrets.validate_secret_value("JWT_SECRET_KEY", value)


def test_production_debug_requires_explicit_disabled_environment(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.delenv("FLASK_DEBUG", raising=False)
    with pytest.raises(RuntimeError, match="explicitly disabled"):
        runtime_secrets.resolve_debug_mode({"debug_mode": False})

    monkeypatch.setenv("FLASK_DEBUG", "0")
    with pytest.raises(RuntimeError, match="Persisted debug_mode"):
        runtime_secrets.resolve_debug_mode({"debug_mode": True})

    monkeypatch.setenv("FLASK_DEBUG", "false")
    assert runtime_secrets.resolve_debug_mode({"debug_mode": False}) is False


def test_development_debug_remains_explicit(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "development")
    monkeypatch.delenv("FLASK_DEBUG", raising=False)
    assert runtime_secrets.resolve_debug_mode({"debug_mode": True}) is True
    monkeypatch.setenv("FLASK_DEBUG", "0")
    assert runtime_secrets.resolve_debug_mode({"debug_mode": True}) is False


def test_production_accepts_configured_secrets(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "production")
    for name in runtime_secrets.PRODUCTION_SECRET_NAMES:
        monkeypatch.setenv(name, _secret())
    monkeypatch.setenv("DATABASE_URL", "postgresql://db.example.invalid/radas")

    runtime_secrets.validate_runtime_secrets(require_database=True)


def test_production_accepts_valid_configured_preview_webhook_secret(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "production")
    value = "preview-webhook-0123456789-abcdefghijklmnop"
    monkeypatch.setenv("PREVIEW_WEBHOOK_SECRET", value)

    assert runtime_secrets.resolve_secret("PREVIEW_WEBHOOK_SECRET") == value


def test_production_requires_preview_webhook_secret(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "production")
    for name in runtime_secrets.PRODUCTION_SECRET_NAMES:
        monkeypatch.setenv(name, _secret())
    monkeypatch.delenv("PREVIEW_WEBHOOK_SECRET", raising=False)

    with pytest.raises(RuntimeError, match="PREVIEW_WEBHOOK_SECRET"):
        runtime_secrets.validate_runtime_secrets()


def test_preview_webhook_secret_is_not_available_from_an_implicit_fallback(monkeypatch):
    from services import preview_envs

    monkeypatch.setenv("FLASK_ENV", "development")
    monkeypatch.delenv("PREVIEW_WEBHOOK_SECRET", raising=False)
    generated = preview_envs.webhook_secret()
    assert generated and len(generated) >= 32

    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.delenv("PREVIEW_WEBHOOK_SECRET", raising=False)
    with pytest.raises(RuntimeError, match="PREVIEW_WEBHOOK_SECRET"):
        preview_envs.webhook_secret()


def test_production_rejects_known_preview_webhook_fallback(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("PREVIEW_WEBHOOK_SECRET", "radas-preview-dev-secret")
    with pytest.raises(RuntimeError, match="PREVIEW_WEBHOOK_SECRET"):
        runtime_secrets.validate_secret_value(
            "PREVIEW_WEBHOOK_SECRET", os.environ["PREVIEW_WEBHOOK_SECRET"]
        )


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
    key_file = tmp_path / "global" / "secrets" / ".encryption_key"
    key_file.parent.mkdir(parents=True)
    key_file.write_text(_secret(), encoding="utf-8")

    with pytest.raises(RuntimeError, match="GLOBAL_SECRETS_ENCRYPTION_KEY"):
        secret_encryption.get_encryption(tmp_path)
    with pytest.raises(RuntimeError, match="environment"):
        secret_encryption.save_encryption_key(_secret(), tmp_path)
    with pytest.raises(RuntimeError, match="environment"):
        secret_encryption.generate_and_save_encryption_key(tmp_path)

    assert key_file.read_text(encoding="utf-8")
    secret_encryption._encryption_instance = None


def test_production_indicator_is_only_flask_env(monkeypatch):
    monkeypatch.delenv("FLASK_ENV", raising=False)
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ENVIRONMENT", "prod")
    assert runtime_secrets.is_production_environment() is False

    monkeypatch.setenv("FLASK_ENV", " Production ")
    assert runtime_secrets.is_production_environment() is True
