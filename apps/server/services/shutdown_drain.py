"""Server graceful shutdown and in-flight run draining service (UC648)."""
from __future__ import annotations

import logging
import threading
import time
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_in_flight_jobs: Dict[str, Dict[str, Any]] = {}
_is_draining: bool = False


def register_in_flight_job(job_id: str, metadata: Optional[Dict[str, Any]] = None) -> None:
    """Register an active running execution or task."""
    with _lock:
        _in_flight_jobs[job_id] = {
            "job_id": job_id,
            "registered_at": time.time(),
            "metadata": metadata or {},
        }
        logger.debug(f"Registered in-flight job: {job_id}")


def unregister_in_flight_job(job_id: str) -> None:
    """Unregister a completed or terminated execution."""
    with _lock:
        _in_flight_jobs.pop(job_id, None)
        logger.debug(f"Unregistered in-flight job: {job_id}")


def is_draining() -> bool:
    """Check if server shutdown draining is active."""
    return _is_draining


def drain_and_shutdown(timeout_seconds: float = 10.0, poll_interval: float = 0.1) -> Dict[str, Any]:
    """Set server state to draining and wait for all in-flight jobs to finish before shutdown (UC648)."""
    global _is_draining
    _is_draining = True
    start_time = time.time()
    logger.info(f"Initiating graceful shutdown drain (timeout={timeout_seconds}s)...")

    while (time.time() - start_time) < timeout_seconds:
        with _lock:
            remaining = len(_in_flight_jobs)
            if remaining == 0:
                logger.info("All in-flight jobs have completed successfully. Ready for shutdown.")
                return {
                    "drained": True,
                    "active_jobs_remaining": 0,
                    "elapsed_seconds": round(time.time() - start_time, 3),
                }
        time.sleep(poll_interval)

    with _lock:
        remaining = len(_in_flight_jobs)
    logger.warning(f"Graceful shutdown timeout exceeded. {remaining} jobs still active.")
    return {
        "drained": remaining == 0,
        "active_jobs_remaining": remaining,
        "elapsed_seconds": round(time.time() - start_time, 3),
    }


def reset_drain_state() -> None:
    """Reset draining state and clear in-flight jobs (for testing)."""
    global _is_draining
    with _lock:
        _is_draining = False
        _in_flight_jobs.clear()
