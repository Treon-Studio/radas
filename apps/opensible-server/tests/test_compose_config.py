from __future__ import annotations

from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[3]
COMPOSE = ROOT / "apps" / "opensible-server" / "docker-compose.yml"

REQUIRED_PRODUCTION_ENV = (
    "FLASK_ENV",
    "FLASK_DEBUG",
    "DATABASE_URL",
    "JWT_SECRET_KEY",
    "INTERNAL_CALL_SECRET",
    "GLOBAL_SECRETS_ENCRYPTION_KEY",
    "WORKER_REGISTRATION_SECRET",
    "VAULT_SERVER_SECRET",
)


def _compose_services() -> dict[str, dict]:
    document = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    return document["services"]


def test_compose_worker_has_server_production_environment_contract():
    services = _compose_services()
    server_env = services["opensible-server"]["environment"]
    worker_env = services["opensible-worker"]["environment"]

    for name in REQUIRED_PRODUCTION_ENV:
        required_expansion = f"${{{name}:?{name} must be set}}"
        expected = {"FLASK_ENV": "production", "FLASK_DEBUG": "0"}.get(name, required_expansion)
        assert server_env[name] == expected
        assert worker_env[name] == server_env[name]


def test_compose_does_not_embed_production_secret_values():
    services = _compose_services()

    for service_name in ("opensible-server", "opensible-worker"):
        environment = services[service_name]["environment"]
        for name in REQUIRED_PRODUCTION_ENV[2:]:
            assert environment[name].startswith("${")
            assert ":-" not in environment[name]
