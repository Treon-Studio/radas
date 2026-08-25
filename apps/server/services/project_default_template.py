"""Project default template association manager (UC520)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

PROJECT_DEFAULT_TEMPLATES_SCOPE = "project_default_templates"


def set_project_default_template(project_id: str, template_id: str) -> Dict[str, Any]:
    """Assign a default scaffolding template for new stack creation within a project (UC520)."""
    clean_pid = project_id.strip()
    clean_tid = template_id.strip()

    entry = {
        "project_id": clean_pid,
        "template_id": clean_tid,
        "updated_at": time.time(),
    }
    kv_set(PROJECT_DEFAULT_TEMPLATES_SCOPE, clean_pid, entry)
    logger.info(f"Associated default template {clean_tid} to project {clean_pid}")
    return {"success": True, **entry}


def get_project_default_template(project_id: str) -> Optional[str]:
    """Retrieve the bound default template ID for a project, if configured (UC520)."""
    clean_pid = project_id.strip()
    data = kv_get(PROJECT_DEFAULT_TEMPLATES_SCOPE, clean_pid)
    if data and isinstance(data, dict) and "template_id" in data:
        return str(data["template_id"])
    return None
