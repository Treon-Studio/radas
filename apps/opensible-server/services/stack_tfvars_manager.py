"""Stack custom terraform.tfvars configuration storage and manager (UC521)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

STACK_TFVARS_SCOPE = "stack_tfvars"


def save_stack_tfvars(
    project_id: str,
    stack: str,
    tfvars_content: str,
) -> Dict[str, Any]:
    """Store custom terraform.tfvars HCL content directly on the stack configuration (UC521)."""
    clean_pid = project_id.strip()
    clean_stack = stack.strip()
    key = f"{clean_pid}:{clean_stack}"

    entry = {
        "project_id": clean_pid,
        "stack": clean_stack,
        "content": tfvars_content,
        "updated_at": time.time(),
    }
    kv_set(STACK_TFVARS_SCOPE, key, entry)
    logger.info(f"Saved custom tfvars for stack {key} ({len(tfvars_content)} bytes)")
    return {"success": True, **entry}


def get_stack_tfvars(project_id: str, stack: str) -> str:
    """Retrieve saved custom terraform.tfvars content for a stack (UC521)."""
    clean_pid = project_id.strip()
    clean_stack = stack.strip()
    key = f"{clean_pid}:{clean_stack}"

    data = kv_get(STACK_TFVARS_SCOPE, key)
    if data and isinstance(data, dict) and "content" in data:
        return str(data["content"])
    return ""
