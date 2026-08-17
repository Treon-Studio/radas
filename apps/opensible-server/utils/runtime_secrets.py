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
    "PREVIEW_WEBHOOK_SECRET",
)

# Keep this aligned with every production gate. Secret strength is measured
# after Unicode whitespace trimming, in Unicode code points, with at least one
# ASCII letter and one ASCII digit. The ASCII requirement is deliberate: Python,
# Node, and Go otherwise disagree about which letters and digits qualify.
_REPOSITORY_KNOWN_SECRETS = frozenset(
    {
        "dev-only-change-me-0123456789abcdef",
        "radas-preview-dev-secret",
    }
)

_TRUE_DEBUG_VALUES = {"1", "true", "yes", "on"}
_FALSE_DEBUG_VALUES = {"0", "false", "no", "off"}


def _is_ascii_letter(char: str) -> bool:
    return "A" <= char <= "Z" or "a" <= char <= "z"


def _is_ascii_digit(char: str) -> bool:
    return "0" <= char <= "9"


def _is_debug_enabled(value: object) -> bool:
    return str(value).strip().lower() in _TRUE_DEBUG_VALUES


def resolve_debug_mode(settings: dict[str, object]) -> bool:
    """Resolve Flask debug without a production fallback.

    Development keeps the historical explicit environment-or-settings behavior.
    Production requires FLASK_DEBUG to be present and explicitly false, and also
    rejects a persisted debug_mode=true setting even when the environment says 0.
    """
    raw_env = os.environ.get("FLASK_DEBUG")
    persisted = settings.get("debug_mode")
    if is_production_environment():
        if _is_debug_enabled(persisted):
            raise RuntimeError("Persisted debug_mode must be disabled in production")
        if raw_env is None or not raw_env.strip():
            raise RuntimeError("FLASK_DEBUG must be explicitly disabled in production")
        normalized = raw_env.strip().lower()
        if normalized in _TRUE_DEBUG_VALUES:
            raise RuntimeError("FLASK_DEBUG must be disabled in production")
        if normalized not in _FALSE_DEBUG_VALUES:
            raise RuntimeError("FLASK_DEBUG must be explicitly disabled in production")
        return False

    normalized = (raw_env if raw_env is not None else str(persisted or False)).strip().lower()
    return normalized in _TRUE_DEBUG_VALUES


def is_production_environment() -> bool:
    """Return whether the canonical FLASK_ENV indicator is production.

    FLASK_ENV is the only supported production switch. APP_ENV and ENVIRONMENT
    are deliberately ignored so every runtime has identical fail-closed rules.
    """
    return (os.environ.get("FLASK_ENV") or "").strip().lower() == "production"


def _is_strong_secret(value: str) -> bool:
    code_points = list(value)
    return (
        len(code_points) >= 32
        and len(set(code_points)) >= 16
        and any(_is_ascii_letter(char) for char in code_points)
        and any(_is_ascii_digit(char) for char in code_points)
    )


def validate_secret_value(name: str, value: Optional[str]) -> str:
    """Validate one production secret without including its value in errors."""
    secret = (value or "").strip()
    if not secret:
        raise RuntimeError(f"{name} must be explicitly configured in production")
    if secret in _REPOSITORY_KNOWN_SECRETS:
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
