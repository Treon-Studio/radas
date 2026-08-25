"""Shareable template bundle exporter and importer (UC572)."""
from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def _default_templates_dir() -> Path:
    data_dir = Path(os.environ.get("DATA_DIR", "data"))
    d = data_dir / "custom-templates"
    d.mkdir(parents=True, exist_ok=True)
    return d


def export_template_bundle(template_name: str, base_dir: Optional[Path] = None) -> Dict[str, Any]:
    """Export a custom template workspace into a portable bundle (UC572)."""
    root = base_dir or _default_templates_dir()
    tpl_dir = root / template_name
    if not tpl_dir.exists():
        raise ValueError(f"Template '{template_name}' not found at {tpl_dir}")

    files: Dict[str, str] = {}
    for item in tpl_dir.rglob("*"):
        if item.is_file() and not item.name.startswith(".git"):
            rel = str(item.relative_to(tpl_dir))
            try:
                files[rel] = item.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                pass

    return {
        "format": "radas.template.bundle/v1",
        "name": template_name,
        "exported_at": time.time(),
        "files": files,
    }


def import_template_bundle(bundle_data: Dict[str, Any], base_dir: Optional[Path] = None) -> Dict[str, Any]:
    """Import a template bundle into local custom templates directory (UC572)."""
    name = (bundle_data.get("name") or "").strip()
    if not name:
        raise ValueError("Template bundle is missing 'name'")

    files = bundle_data.get("files") or {}
    if not isinstance(files, dict):
        raise ValueError("Template bundle 'files' must be a dictionary")

    root = base_dir or _default_templates_dir()
    target_dir = root / name
    target_dir.mkdir(parents=True, exist_ok=True)

    count = 0
    for rel_path, content in files.items():
        dst = target_dir / rel_path
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(str(content), encoding="utf-8")
        count += 1

    logger.info(f"Successfully imported template '{name}' ({count} files)")
    return {
        "success": True,
        "template_name": name,
        "files_written": count,
        "target_path": str(target_dir),
    }
