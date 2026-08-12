"""Per-user notification preferences (Fase 5 — UC 84)."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict


def _store_path() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "notif_prefs.json"
    except Exception:
        return Path("data") / "notif_prefs.json"


def _load() -> Dict[str, Any]:
    try:
        from storage import kv
        v = kv.kv_load("notif_prefs")
        if isinstance(v, dict):
            return v
    except Exception:
        pass
    return {}


def get_prefs(user_id: str) -> Dict[str, Any]:
    data = _load()
    return data.get(user_id, {"email": True, "console": True, "slack_webhook": ""})


def save_prefs(user_id: str, prefs: Dict[str, Any]) -> Dict[str, Any]:
    data = _load()
    clean = {
        "email": bool(prefs.get("email", True)),
        "console": bool(prefs.get("console", True)),
        "slack_webhook": str(prefs.get("slack_webhook") or ""),
        "updated_at": time.time(),
    }
    data[user_id] = clean
    from storage import kv
    kv.kv_set("notif_prefs", user_id, clean)
    return clean
