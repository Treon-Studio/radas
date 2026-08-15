"""Runtime configuration checks for credentials required by the server.

Production never creates, loads, or substitutes cryptographic secrets. Local
and test processes may use explicitly ephemeral values so that developers do
not accidentally persist credentials in the repository.
"""
from __future__ import annotations

import logging
import os
import secrets
from typing import Iterable, Optional

logger = logging.getLogger(__name__)

PRODUCTION_SECRET_NAMES = (
    "JWT_SECRET_KEY",
    "INTERNAL_CALL_SECRET",
    "GLOBAL_SECRETS_ENCRYPTION_KEY",
    "WORKER_REGISTRATION_SECRET",
    "VAULT_SERVER_SECRET",
)

# Keep this aligned with the PM2 production gate. It rejects common copied
# placeholders without requiring a particular alphabet or exposing values.
_REPOSITORY_KNOWN_SECRET = "dev-only-change-me-0123456789abcdef"


def is_production_environment() -> bool:
    """Return whether the canonical FLASK_ENV indicator is production.

    FLASK_ENV is the only supported production switch. APP_ENV and ENVIRONMENT
    are deliberately ignored so every runtime has identical fail-closed rules.
    """
    return (os.environ.get("FLASK_ENV") or "").strip().lower() == "production"


def _is_strong_secret(value: str) -> bool:
    return (
        len(value) >= 32
        and len(set(value)) >= 16
        and any(char.isalpha() for char in value)
        and any(char.isdigit() for char in value)
    )


def validate_secret_value(name: str, value: Optional[str]) -> str:
    """Validate one production secret without including its value in errors."""
    secret = (value or "").strip()
    if not secret:
        raise RuntimeError(f"{name} must be explicitly configured in production")
    if secret == _REPOSITORY_KNOWN_SECRET:
        raise RuntimeError(f"{name} must not use a repository-known secret in production")
    if not _is_strong_secret(secret):
        raise RuntimeError(
            f"{name} must be a strong secret in production "
            "(32+ characters, letters, digits, and 16+ distinct characters)"
        )
    return secret


def resolve_secret(
    name: str,
    *,
    aliases: Iterable[str] = (),
    generate_in_nonproduction: bool = False,
) -> str:
    """Resolve a configured secret, with only explicit dev/test fallback."""
    value = os.environ.get(name)
    if not value and not is_production_environment():
        for alias in aliases:
            value = os.environ.get(alias)
            if value:
                break

    if is_production_environment():
        # Production intentionally does not consult aliases or disk-backed
        # values: operators must configure the named variable explicitly.
        return validate_secret_value(name, os.environ.get(name))

    value = (value or "").strip()
    if value:
        return value
    if not generate_in_nonproduction:
        return ""

    generated = secrets.token_urlsafe(48)
    logger.warning("%s is not set; using an ephemeral development-only value", name)
    return generated


def validate_runtime_secrets(*, require_database: bool = False) -> None:
    """Fail closed for all production credentials before application startup."""
    if not is_production_environment():
        return

    invalid: list[str] = []
    for name in PRODUCTION_SECRET_NAMES:
        try:
            validate_secret_value(name, os.environ.get(name))
        except RuntimeError:
            invalid.append(name)

    if require_database and not os.environ.get("DATABASE_URL", "").strip():
        invalid.append("DATABASE_URL")

    if invalid:
        raise RuntimeError(
            "Production configuration is missing or weak: " + ", ".join(invalid)
        )
