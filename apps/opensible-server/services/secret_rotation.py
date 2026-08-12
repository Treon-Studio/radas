"""Stack secret rotation (Fase 2 — UC 36)."""
from __future__ import annotations

import json
import logging
import secrets
import threading
import time
from typing import List, Optional

logger = logging.getLogger(__name__)

ROTATION_INTERVAL_SECONDS = 24 * 3600  # daily


def rotate_stack_secrets(project_id: str, name: str, keys: Optional[List[str]] = None) -> List[str]:
    """Regenerate every (or selected) stack secret and persist encrypted."""
    from services.cloud_provisioning import _load_secrets, _save_secrets, _stack_data_dir

    current = _load_secrets(project_id, name)
    if not current:
        return []
    targets = [k for k in current if (not keys) or k in keys]
    if not targets:
        return []
    newmap = {k: (secrets.token_urlsafe(32) if k in targets else v) for k, v in current.items()}
    _save_secrets(project_id, name, newmap)
    # audit trail: rotate marker on the meta
    try:
        from services.cloud_provisioning import _save_meta
        _save_meta(project_id, name, last_secret_rotation=int(time.time()))
    except Exception:
        pass
    logger.info(f"[secrets] rotated {len(targets)} secret(s) for stack {name} (project {project_id})")
    return targets


def _rotation_loop(interval: int = ROTATION_INTERVAL_SECONDS) -> None:
    """Background loop: rotate stacks flagged with meta secret_rotation: true."""
    while True:
        try:
            from services.cloud_provisioning import _stack_data_dir
            from storage.project_store import list_projects  # may not exist -> guard
        except Exception:
            list_projects = None
        try:
            if list_projects is not None:
                projects = list_projects()
            else:
                projects = []
            for proj in projects:
                pid = proj if isinstance(proj, str) else proj.get("id")
                if not pid:
                    continue
                from services.cloud_provisioning import _list_stacks
                for st in _list_stacks(pid):
                    if st.get("secret_rotation") is True:
                        rotate_stack_secrets(pid, st["name"])
        except Exception as e:
            logger.error(f"[secrets] rotation loop error: {e}")
        time.sleep(interval)


def start_rotation_scheduler() -> None:
    t = threading.Thread(target=_rotation_loop, daemon=True)
    t.start()
    logger.info("Secret rotation scheduler started (daily)")
