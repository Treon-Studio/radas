"""Role-per-environment (Fase 5 — UC 67)."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional


def _store_path() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "env_roles.json"
    except Exception:
        return Path("data") / "env_roles.json"


def load() -> Dict[str, Any]:
    try:
        p = _store_path()
        if p.exists():
            d = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(d, dict):
                return d
    except Exception:
        pass
    return {}


def get_for_project(project_id: str) -> Dict[str, List[str]]:
    return load().get(project_id, {})


def save_for_project(project_id: str, mapping: Dict[str, List[str]]) -> Dict[str, List[str]]:
    data = load()
    clean = {env: [str(r) for r in roles] for env, roles in mapping.items()}
    data[project_id] = clean
    p = _store_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return clean


def allowed(project_id: str, env: str, user_roles: List[str]) -> bool:
    mapping = get_for_project(project_id)
    allowed_roles = mapping.get(env or "")
    if not allowed_roles:
        return True  # no restriction configured for this env
    return bool(set(user_roles) & set(allowed_roles))
