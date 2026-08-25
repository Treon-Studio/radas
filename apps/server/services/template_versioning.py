"""Custom template release versioning manager (UC571)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from storage.kv import kv_get, kv_list, kv_set

logger = logging.getLogger(__name__)

TEMPLATE_VERSION_SCOPE = "template_versions"


def publish_template_version(
    template_name: str,
    version: str,
    files: Dict[str, str],
    changelog: str = "",
) -> Dict[str, Any]:
    """Publish a release version of a custom template (UC571)."""
    tname = (template_name or "").strip()
    ver = (version or "").strip()
    key = f"{tname}@{ver}"

    entry = {
        "template_name": tname,
        "version": ver,
        "files": files,
        "changelog": changelog,
        "published_at": time.time(),
    }
    kv_set(TEMPLATE_VERSION_SCOPE, key, entry)
    logger.info(f"Published template version: {key}")
    return entry


def get_template_version(template_name: str, version: str) -> Optional[Dict[str, Any]]:
    """Retrieve a specific template release version."""
    key = f"{template_name.strip()}@{version.strip()}"
    val = kv_get(TEMPLATE_VERSION_SCOPE, key)
    return dict(val) if isinstance(val, dict) else None


def list_template_versions(template_name: str) -> List[Dict[str, Any]]:
    """List all published versions for a template."""
    tname = template_name.strip()
    records = kv_list(TEMPLATE_VERSION_SCOPE)
    versions: List[Dict[str, Any]] = []

    for r in records:
        val = r.get("value")
        if isinstance(val, dict) and val.get("template_name") == tname:
            versions.append(val)

    versions.sort(key=lambda x: x.get("published_at") or 0, reverse=True)
    return versions
