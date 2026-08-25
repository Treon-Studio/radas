"""Sequential multi-playbook workflow execution chain manager (UC386)."""
from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Callable, Dict, List, Optional

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

CHAIN_SCOPE = "playbook_chains"


def create_playbook_workflow_chain(
    chain_name: str,
    playbooks: List[str],
    project_id: str,
) -> Dict[str, Any]:
    """Create a sequential multi-playbook execution workflow chain (UC386)."""
    chain_id = str(uuid.uuid4())
    entry = {
        "id": chain_id,
        "name": chain_name,
        "project_id": project_id,
        "playbooks": playbooks,
        "status": "draft",
        "steps_completed": [],
        "created_at": time.time(),
        "updated_at": time.time(),
    }
    kv_set(CHAIN_SCOPE, chain_id, entry)
    logger.info(f"Created playbook workflow chain {chain_name} ({chain_id}) with {len(playbooks)} steps")
    return entry


def get_playbook_chain(chain_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve playbook workflow chain details."""
    val = kv_get(CHAIN_SCOPE, chain_id)
    return dict(val) if isinstance(val, dict) else None


def execute_playbook_chain(
    chain_id: str,
    runner_fn: Optional[Callable[[str, str], Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Execute all playbooks in the workflow chain in sequence (UC386)."""
    chain = get_playbook_chain(chain_id)
    if not chain:
        raise ValueError(f"Playbook chain '{chain_id}' not found")

    chain["status"] = "running"
    chain["started_at"] = time.time()
    kv_set(CHAIN_SCOPE, chain_id, chain)

    steps_completed: List[str] = []
    project_id = chain.get("project_id", "default")

    for pb in chain.get("playbooks", []):
        logger.info(f"Executing step in chain {chain_id}: playbook {pb}")
        try:
            if runner_fn:
                res = runner_fn(pb, project_id)
                if res.get("exit_code", 0) != 0:
                    raise RuntimeError(f"Playbook {pb} failed with exit code {res.get('exit_code')}")
            steps_completed.append(pb)
        except Exception as e:
            chain["status"] = "failed"
            chain["error"] = str(e)
            chain["failed_at_step"] = pb
            chain["steps_completed"] = steps_completed
            chain["finished_at"] = time.time()
            kv_set(CHAIN_SCOPE, chain_id, chain)
            logger.error(f"Playbook workflow chain {chain_id} failed at step {pb}: {e}")
            return chain

    chain["status"] = "completed"
    chain["steps_completed"] = steps_completed
    chain["finished_at"] = time.time()
    kv_set(CHAIN_SCOPE, chain_id, chain)
    logger.info(f"Playbook workflow chain {chain_id} completed successfully")
    return chain
