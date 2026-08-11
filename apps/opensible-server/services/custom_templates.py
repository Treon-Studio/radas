"""Custom stack templates (Fase 5 — UC 15/96)."""
from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List


def _custom_dir() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "BASE_DIR", Path.cwd())) / "IaC" / "custom"
    except Exception:
        return Path.cwd() / "IaC" / "custom"


def list_templates() -> List[Dict[str, Any]]:
    root = _custom_dir()
    out = []
    if root.exists():
        for d in sorted(root.iterdir()):
            if d.is_dir() and not d.name.startswith("."):
                out.append({"name": d.name, "path": str(d)})
    return out


def import_template(name: str, git_url: str) -> Dict[str, Any]:
    slug = re.sub(r"[^a-z0-9-]+", "-", (name or "").lower()).strip("-") or "template"
    root = _custom_dir()
    dst = root / slug
    if dst.exists():
        raise ValueError(f"template '{slug}' already exists")
    root.mkdir(parents=True, exist_ok=True)
    try:
        r = subprocess.run(["git", "clone", "--depth", "1", git_url, str(dst)],
                           capture_output=True, text=True, timeout=120)
    except FileNotFoundError:
        raise ValueError("git is required to import templates")
    except subprocess.TimeoutExpired:
        shutil.rmtree(dst, ignore_errors=True)
        raise ValueError("git clone timed out")
    if r.returncode != 0:
        shutil.rmtree(dst, ignore_errors=True)
        raise ValueError(f"git clone failed: {r.stderr.strip()[:200]}")
    return {"name": slug, "path": str(dst)}
