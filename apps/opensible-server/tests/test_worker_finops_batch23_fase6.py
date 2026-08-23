import pytest
import time


def test_worker_metrics_and_status(pg_db):
    from services.worker_metrics import record_worker_metrics
    from services.worker_status import get_worker_health_status

    now = 1700000000.0

    # 1. Record metrics for worker-01
    entry = record_worker_metrics(
        worker_id="worker-node-01",
        cpu_percent=42.5,
        memory_percent=68.0,
        disk_percent=30.0,
        recorded_at=now,
    )
    assert entry["worker_id"] == "worker-node-01"
    assert entry["cpu_percent"] == 42.5

    # 2. Check health status within timeout -> Online
    status_online = get_worker_health_status(
        worker_id="worker-node-01",
        timeout_seconds=60,
        current_time=now + 20,
    )
    assert status_online["status"] == "online"
    assert status_online["online"] is True
    assert status_online["metrics"]["memory_percent"] == 68.0

    # 3. Check health status after timeout -> Offline
    status_offline = get_worker_health_status(
        worker_id="worker-node-01",
        timeout_seconds=60,
        current_time=now + 120,
    )
    assert status_offline["status"] == "offline"
    assert status_offline["online"] is False
