"""Stack cloning, duplication, and renaming with state key migration (UC610, UC613)."""
from __future__ import annotations

import json
import logging
import os
import shutil
import time
from pathlib import Path
from typing import Any, Dict, Optional

from storage import pg
from services.cloud_provisioning import _stack_dir, _stack_data_dir

logger = logging.getLogger(__name__)


def clone_stack(
    project_id: Optional[str],
    source_stack: str,
    target_stack: str,
    copy_tfvars: bool = True,
) -> Dict[str, Any]:
    """Clone an existing stack workspace to create a new duplicate stack (UC610)."""
    pid = project_id or "default"
    src_dir = _stack_dir(pid, source_stack)
    if not src_dir.exists():
        raise ValueError(f"Source stack '{source_stack}' not found")

    target_dir = _stack_dir(pid, target_stack)
    if target_dir.exists():
        raise ValueError(f"Target stack '{target_stack}' already exists")

    target_dir.mkdir(parents=True, exist_ok=True)
    copied_files = []
    for item in src_dir.iterdir():
        if item.name.startswith(".terraform") or item.name == ".git":
            continue
        if item.name == "terraform.tfvars" and not copy_tfvars:
            continue
        dst = target_dir / item.name
        if item.is_dir():
            shutil.copytree(item, dst)
        else:
            shutil.copy2(item, dst)
        copied_files.append(item.name)

    source_meta = pg.query_one(
        "SELECT data FROM stack_meta WHERE project_id = %s AND stack = %s",
        (pid, source_stack),
    )
    if source_meta:
        meta_data = source_meta.get("data") or {}
        if isinstance(meta_data, str):
            try:
                meta_data = json.loads(meta_data)
            except Exception:
                meta_data = {}
        meta_data["cloned_from"] = source_stack
        meta_data["cloned_at"] = time.time()
        pg.execute(
            "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s)",
            (pid, target_stack, json.dumps(meta_data)),
        )

    logger.info(f"Cloned stack '{source_stack}' to '{target_stack}' in project '{pid}'")
    return {
        "success": True,
        "project_id": pid,
        "source_stack": source_stack,
        "target_stack": target_stack,
        "copied_files": copied_files,
    }


def rename_stack(
    project_id: Optional[str],
    old_name: str,
    new_name: str,
    migrate_state: bool = True,
) -> Dict[str, Any]:
    """Rename a stack directory and migrate database records and state keys (UC613)."""
    pid = project_id or "default"
    old_dir = _stack_dir(pid, old_name)
    if not old_dir.exists():
        raise ValueError(f"Stack '{old_name}' not found")

    new_dir = _stack_dir(pid, new_name)
    if new_dir.exists():
        raise ValueError(f"Stack '{new_name}' already exists")

    old_dir.rename(new_dir)

    old_data = _stack_data_dir(pid, old_name)
    new_data = _stack_data_dir(pid, new_name)
    if old_data.exists():
        new_data.parent.mkdir(parents=True, exist_ok=True)
        if not new_data.exists():
            old_data.rename(new_data)

    pg.execute(
        "UPDATE stack_meta SET stack = %s WHERE project_id = %s AND stack = %s",
        (new_name, pid, old_name),
    )
    try:
        pg.execute(
            "UPDATE stack_secrets SET stack = %s WHERE project_id = %s AND stack = %s",
            (new_name, pid, old_name),
        )
    except Exception:
        pass

    backend_tf = new_dir / "backend.tf"
    if backend_tf.exists() and migrate_state:
        try:
            content = backend_tf.read_text(encoding="utf-8")
            if old_name in content:
                new_content = content.replace(f"envs/{old_name}/", f"envs/{new_name}/")
                backend_tf.write_text(new_content, encoding="utf-8")
        except Exception:
            pass

    logger.info(f"Renamed stack '{old_name}' to '{new_name}' in project '{pid}'")
    return {
        "success": True,
        "project_id": pid,
        "old_name": old_name,
        "new_name": new_name,
    }
