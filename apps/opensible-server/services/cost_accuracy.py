"""Cost forecast accuracy and Mean Absolute Error (MAE) evaluator (UC551)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def calculate_forecast_mae(
    forecast_series: List[float],
    actual_series: List[float],
) -> Dict[str, Any]:
    """Calculate Mean Absolute Error (MAE) and accuracy percentage between forecast and actual spend (UC551)."""
    if not forecast_series or not actual_series:
        return {"mae": 0.0, "samples": 0, "accuracy_pct": 100.0}

    n = min(len(forecast_series), len(actual_series))
    if n == 0:
        return {"mae": 0.0, "samples": 0, "accuracy_pct": 100.0}

    abs_errors = [abs(float(forecast_series[i]) - float(actual_series[i])) for i in range(n)]
    mae = sum(abs_errors) / n

    actual_avg = sum(float(x) for x in actual_series[:n]) / n
    accuracy_pct = max(0.0, round(100.0 * (1.0 - (mae / actual_avg if actual_avg > 0 else 0.0)), 2))

    logger.info(f"Calculated forecast accuracy MAE={mae:.2f}, accuracy={accuracy_pct}% over {n} points")
    return {
        "mae": round(mae, 2),
        "samples": n,
        "accuracy_pct": accuracy_pct,
    }
