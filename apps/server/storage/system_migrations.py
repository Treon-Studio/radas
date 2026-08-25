"""Versioned system configuration migrations runner (UC649)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Tuple

from storage import pg

logger = logging.getLogger(__name__)

MIGRATIONS: List[Tuple[int, str]] = [
    (1, "001_ensure_system_metadata"),
    (2, "002_ensure_default_org_settings"),
    (3, "003_ensure_default_quotas"),
]


def _ensure_migrations_table() -> None:
    pg.execute("""
        CREATE TABLE IF NOT EXISTS system_config_migrations (
            version INT PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)


def run_system_migrations() -> Dict[str, Any]:
    """Execute all pending system configuration migrations (UC649)."""
    _ensure_migrations_table()
    rows = pg.query_all("SELECT version FROM system_config_migrations")
    applied_versions = {r["version"] for r in rows}

    applied_now = []
    for version, name in sorted(MIGRATIONS, key=lambda x: x[0]):
        if version not in applied_versions:
            logger.info(f"Applying system config migration {version}: {name}")
            pg.execute(
                "INSERT INTO system_config_migrations (version, name) VALUES (%s, %s)",
                (version, name),
            )
            applied_now.append(version)

    all_rows = pg.query_all("SELECT version FROM system_config_migrations ORDER BY version")
    latest = all_rows[-1]["version"] if all_rows else 0

    return {
        "success": True,
        "applied_count": len(applied_now),
        "applied_versions": applied_now,
        "latest_version": latest,
    }
