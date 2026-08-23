"""Startup and runtime dependency health verification service (UC647)."""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Dict

from storage import pg

logger = logging.getLogger(__name__)


def check_system_dependencies() -> Dict[str, Any]:
    """Verify vital backend dependencies (PostgreSQL, filesystem, optional Redis) (UC647)."""
    deps: Dict[str, Dict[str, Any]] = {}
    all_healthy = True

    # 1. PostgreSQL check
    try:
        row = pg.query_one("SELECT 1 as ping")
        if row and row.get("ping") == 1:
            deps["postgres"] = {"status": "ok", "message": "Connected successfully"}
        else:
            deps["postgres"] = {"status": "error", "message": "Invalid ping response"}
            all_healthy = False
    except Exception as e:
        deps["postgres"] = {"status": "error", "message": str(e)}
        all_healthy = False

    # 2. Filesystem check
    try:
        data_dir = Path(os.environ.get("DATA_DIR", "data"))
        data_dir.mkdir(parents=True, exist_ok=True)
        test_file = data_dir / ".fs_check_tmp"
        test_file.write_text("ok", encoding="utf-8")
        test_file.unlink(missing_ok=True)
        deps["filesystem"] = {"status": "ok", "path": str(data_dir)}
    except Exception as e:
        deps["filesystem"] = {"status": "error", "message": str(e)}
        all_healthy = False

    # 3. Optional Redis / Cache check
    redis_url = os.environ.get("REDIS_URL")
    if redis_url:
        deps["redis"] = {"status": "configured", "url": redis_url}
    else:
        deps["redis"] = {"status": "optional_not_configured"}

    return {
        "status": "healthy" if all_healthy else "degraded",
        "dependencies": deps,
        "all_healthy": all_healthy,
    }
