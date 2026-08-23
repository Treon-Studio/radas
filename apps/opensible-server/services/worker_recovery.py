"""Worker durable task queue recovery engine (UC477)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from storage import pg

logger = logging.getLogger(__name__)


def recover_interrupted_queue(project_id: Optional[str] = None) -> Dict[str, Any]:
    """Scan and recover tasks stuck in running executions following unexpected worker restarts (UC477)."""
    now = time.time()
    recovered_ids: List[str] = []

    with pg.transaction() as conn:
        if project_id:
            rows = conn.execute(
                "SELECT execution_id, project_id FROM running_executions WHERE project_id = %s",
                (project_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT execution_id, project_id FROM running_executions"
            ).fetchall()

        for r in rows:
            eid = r["execution_id"]
            pid = r["project_id"]
            recovered_ids.append(eid)

            # Re-queue into queued_executions
            conn.execute(
                "INSERT INTO queued_executions (execution_id, project_id, queued_at) VALUES (%s, %s, %s) "
                "ON CONFLICT (execution_id) DO UPDATE SET queued_at = EXCLUDED.queued_at",
                (eid, pid, now),
            )
            # Update location status to queued
            conn.execute(
                "INSERT INTO execution_locations (execution_id, project_id, status, updated_at) "
                "VALUES (%s, %s, 'queued', %s) "
                "ON CONFLICT (execution_id) DO UPDATE SET status = 'queued', worker_id = NULL, updated_at = EXCLUDED.updated_at",
                (eid, pid, now),
            )
            # Remove from running_executions
            conn.execute("DELETE FROM running_executions WHERE execution_id = %s", (eid,))

    logger.info(f"Worker queue recovery restored {len(recovered_ids)} running executions back to queued state")

    return {
        "success": True,
        "recovered_count": len(recovered_ids),
        "recovered_run_ids": recovered_ids,
    }
