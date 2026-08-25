"""FinOps right-sizing recommendation engine with confidence scoring (UC555)."""
from __future__ import annotations

import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)


def generate_rightsizing_recommendation(
    resource_id: str,
    current_type: str,
    avg_cpu_percent: float,
    avg_memory_percent: float,
) -> Dict[str, Any]:
    """Analyze resource utilization and generate rightsizing recommendations with confidence metrics (UC555)."""
    cpu = float(avg_cpu_percent)
    mem = float(avg_memory_percent)

    if cpu < 20.0 and mem < 30.0:
        # Heavily underutilized -> recommend downsize
        confidence = 0.92 if (cpu < 15.0 and mem < 20.0) else 0.85
        return {
            "resource_id": resource_id,
            "current_type": current_type,
            "action": "downsize",
            "confidence": confidence,
            "reason": f"Underutilized instance: average CPU is {cpu:.1f}% (<20%) and memory is {mem:.1f}% (<30%)",
            "estimated_savings_percent": 50.0,
        }

    if cpu > 85.0 or mem > 85.0:
        # High bottleneck pressure -> recommend upsize
        confidence = 0.90 if (cpu > 90.0 or mem > 90.0) else 0.80
        return {
            "resource_id": resource_id,
            "current_type": current_type,
            "action": "upsize",
            "confidence": confidence,
            "reason": f"High resource pressure: average CPU is {cpu:.1f}% or memory is {mem:.1f}% (>85%)",
            "estimated_savings_percent": 0.0,
        }

    return {
        "resource_id": resource_id,
        "current_type": current_type,
        "action": "maintain",
        "confidence": 0.95,
        "reason": f"Optimal sizing: CPU={cpu:.1f}%, MEM={mem:.1f}% within balanced operating targets",
        "estimated_savings_percent": 0.0,
    }
