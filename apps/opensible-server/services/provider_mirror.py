"""OpenTofu provider mirror config (Fase 5 — UC 99)."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict


def _store_path() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "provider_mirror.json"
    except Exception:
        return Path("data") / "provider_mirror.json"


def get_config() -> Dict[str, Any]:
    try:
        p = _store_path()
        if p.exists():
            d = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(d, dict):
                return d
    except Exception:
        pass
    return {"enabled": False, "dir": ""}


def save_config(directory: str, enabled: bool = True) -> Dict[str, Any]:
    cfg = {"enabled": bool(enabled), "dir": (directory or "").strip(), "updated_at": time.time()}
    from storage import kv
    kv.kv_set("provider_mirror", "default", cfg)
    return cfg


def registry_tfrc(cfg: Dict[str, Any]) -> str:
    """Render an OpenTofu CLI config (registry.tfrc.json) with a filesystem mirror."""
    if not cfg.get("enabled") or not cfg.get("dir"):
        return ""
    import json as _json
    body = {"provider_installation": [{"filesystem_mirror": {"path": cfg["dir"]}, "direct": {}}]}
    return _json.dumps(body, indent=2)
