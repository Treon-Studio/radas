"""Git branch protection policy synchronization with stack deployment rules (UC508)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict

from storage.kv import kv_set

logger = logging.getLogger(__name__)

BRANCH_PROTECTION_SCOPE = "branch_protection"


def sync_branch_protection_policy(
    repo_name: str,
    branch: str,
    enforce_linear_history: bool = True,
    require_approvals: int = 1,
) -> Dict[str, Any]:
    """Synchronize stack governance constraints into git branch protection rules (UC508)."""
    clean_repo = repo_name.strip()
    clean_branch = branch.strip()
    key = f"{clean_repo}:{clean_branch}"

    entry = {
        "repo": clean_repo,
        "branch": clean_branch,
        "enforce_linear_history": enforce_linear_history,
        "require_approvals": max(0, int(require_approvals)),
        "synced_at": time.time(),
    }
    kv_set(BRANCH_PROTECTION_SCOPE, key, entry)

    logger.info(f"Synchronized branch protection for {key} (require_approvals={require_approvals})")
    return {"success": True, **entry}
