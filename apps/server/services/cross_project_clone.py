"""Cross-project stack cloner and state key migration manager (UC429)."""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
from pathlib import Path
from typing import Any, Dict, Optional

from storage import pg

logger = logging.getLogger(__name__)


def _get_stack_dir(project_id: str, stack: str, base_dir: Path) -> Path:
    if project_id and project_id != "default":
        return base_dir / "projects" / project_id / "stacks" / "envs" / stack
    return base_dir / "cloud-provisioning" / "default" / "envs" / stack


def clone_stack_across_projects(
    source_project_id: str,
    source_stack: str,
    target_project_id: str,
    target_stack: str,
    data_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """Clone a stack from one project to another, rewriting state keys and migrating metadata (UC429)."""
    base = Path(data_dir or os.environ.get("DATA_DIR", "data"))
    src_dir = _get_stack_dir(source_project_id, source_stack, base)
    target_dir = _get_stack_dir(target_project_id, target_stack, base)

    if not src_dir.exists():
        raise ValueError(f"Source stack directory does not exist: {src_dir}")

    if target_dir.exists():
        raise ValueError(f"Target stack '{target_stack}' already exists in project '{target_project_id}'")

    # Copy files
    target_dir.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src_dir, target_dir)

    # Rewrite backend.tf state key if present
    backend_tf = target_dir / "backend.tf"
    if backend_tf.exists():
        old_content = backend_tf.read_text(encoding="utf-8")
        old_key = f"{source_project_id}/{source_stack}"
        new_key = f"{target_project_id}/{target_stack}"
        new_content = old_content.replace(old_key, new_key)
        backend_tf.write_text(new_content, encoding="utf-8")

    # Copy / clone stack_meta in DB
    src_meta = pg.query_one(
        "SELECT data FROM stack_meta WHERE project_id = %s AND stack = %s",
        (source_project_id, source_stack),
    )
    meta_dict = {}
    if src_meta and src_meta.get("data"):
        d = src_meta["data"]
        meta_dict = json.loads(d) if isinstance(d, str) else dict(d)

    meta_dict["cloned_from"] = f"{source_project_id}/{source_stack}"
    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s) "
        "ON CONFLICT (project_id, stack) DO UPDATE SET data = EXCLUDED.data",
        (target_project_id, target_stack, json.dumps(meta_dict)),
    )

    logger.info(
        f"Cloned stack {source_project_id}/{source_stack} -> {target_project_id}/{target_stack}"
    )
    return {
        "success": True,
        "source_project": source_project_id,
        "source_stack": source_stack,
        "target_project": target_project_id,
        "target_stack": target_stack,
        "target_path": str(target_dir),
    }
