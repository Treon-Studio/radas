"""Daily summary digest compiler for test failures and drift detections (UC475)."""
from __future__ import annotations

import datetime
import logging
import time
from typing import Any, Dict, List, Optional

from storage import pg

logger = logging.getLogger(__name__)


def compile_daily_digest(project_id: Optional[str] = None, hours: int = 24) -> Dict[str, Any]:
    """Compile aggregated status report of failures, drifts, and pending tasks over past period (UC475)."""
    pid = project_id or "default"
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours)
    cutoff_iso = cutoff.strftime("%Y-%m-%dT%H:%M:%SZ")

    failed_rows = pg.query_all(
        "SELECT id, action, target_id, meta_json, created_at FROM audit_log "
        "WHERE action LIKE '%%fail%%' AND created_at >= %s",
        (cutoff_iso,),
    )
    failed_runs = [r for r in failed_rows if not project_id or (r.get("meta_json") and project_id in str(r.get("meta_json")))]

    drift_rows = pg.query_all(
        "SELECT id, action, target_id, meta_json, created_at FROM audit_log "
        "WHERE action LIKE '%%drift%%' AND created_at >= %s",
        (cutoff_iso,),
    )
    drift_events = [r for r in drift_rows if not project_id or (r.get("meta_json") and project_id in str(r.get("meta_json")))]

    return {
        "project_id": pid,
        "period_hours": hours,
        "summary_title": f"Daily Infrastructure Digest - {pid}",
        "failed_runs_count": len(failed_runs),
        "drift_events_count": len(drift_events),
        "failed_runs": failed_runs,
        "drift_events": drift_events,
        "generated_at": time.time(),
    }
