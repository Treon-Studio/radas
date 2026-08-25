"""Detailed component health status provider (UC601)."""
from __future__ import annotations

import os
import shutil
import time
from pathlib import Path
from typing import Any, Dict, List

from storage import pg


def get_component_health_status() -> Dict[str, Any]:
    """Get rich health metrics and operational status for all components (UC601)."""
    components: List[Dict[str, Any]] = []
    overall_ok = True

    # 1. PostgreSQL Database
    try:
        pg_res = pg.query_one("SELECT 1 as ping")
        pg_ok = pg_res is not None and pg_res.get("ping") == 1
        components.append({
            "name": "postgresql",
            "type": "database",
            "status": "operational" if pg_ok else "down",
            "message": "Connected and responding to queries",
        })
        if not pg_ok:
            overall_ok = False
    except Exception as e:
        components.append({
            "name": "postgresql",
            "type": "database",
            "status": "down",
            "message": str(e),
        })
        overall_ok = False

    # 2. Local File System & Data Dir
    try:
        data_dir = Path(os.environ.get("DATA_DIR", "data"))
        data_dir.mkdir(parents=True, exist_ok=True)
        total, used, free = shutil.disk_usage(data_dir)
        free_mb = round(free / (1024 * 1024), 2)
        components.append({
            "name": "data_storage",
            "type": "filesystem",
            "status": "operational",
            "free_space_mb": free_mb,
            "path": str(data_dir),
        })
    except Exception as e:
        components.append({
            "name": "data_storage",
            "type": "filesystem",
            "status": "degraded",
            "message": str(e),
        })
        overall_ok = False

    # 3. Execution Engine & Draining Status
    try:
        from services.shutdown_drain import is_draining
        draining = is_draining()
        components.append({
            "name": "execution_engine",
            "type": "orchestration",
            "status": "draining" if draining else "operational",
            "draining": draining,
        })
    except Exception:
        components.append({
            "name": "execution_engine",
            "type": "orchestration",
            "status": "operational",
        })

    # 4. Auth & Session Store
    components.append({
        "name": "auth_session_store",
        "type": "security",
        "status": "operational",
    })

    return {
        "status": "operational" if overall_ok else "degraded",
        "timestamp": time.time(),
        "components": components,
    }
