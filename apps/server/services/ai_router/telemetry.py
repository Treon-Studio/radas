"""Request/attempt telemetry persistence for the RADAS 9Router module.

Log rows carry metadata only — request IDs, provider/model resolution, error
classifications, token counts, and cost estimates. Prompts, completions, and
credentials are never persisted here; redaction is asserted by tests.
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any, Dict, List, Optional

from storage import pg

logger = logging.getLogger(__name__)


def record_request_log(
    *,
    org_id: str,
    user_id: str,
    endpoint: str,
    requested_model: str,
    attempts: List[Dict[str, Any]],
    status: str,
    request_id: str,
    resolved_provider: str = "",
    resolved_model: str = "",
    error_code: str = "",
    http_status: Optional[int] = None,
    latency_ms: int = 0,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    tokens_saved_rtk: int = 0,
    stream: bool = False,
    created_at: Optional[float] = None,
) -> None:
    """Persist one redacted request log row; telemetry must never fail a request."""
    fallback_used = sum(1 for attempt in attempts if attempt.get("status") == "error") > 0
    try:
        from .pricing import estimate_cost

        cost = estimate_cost(resolved_model or requested_model, prompt_tokens, completion_tokens)
        pg.execute(
            """INSERT INTO org_ai_request_logs
               (id, org_id, user_id, endpoint, requested_model, resolved_provider, resolved_model,
                status, error_code, http_status, latency_ms, prompt_tokens, completion_tokens,
                tokens_saved_rtk, cost_usd_est, fallback_used, stream, request_id, attempts, created_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (
                f"log-{uuid.uuid4().hex[:12]}",
                org_id,
                user_id or "system",
                endpoint,
                requested_model,
                resolved_provider or None,
                resolved_model or None,
                status,
                error_code or None,
                http_status,
                max(0, int(latency_ms)),
                max(0, int(prompt_tokens)),
                max(0, int(completion_tokens)),
                max(0, int(tokens_saved_rtk)),
                cost,
                fallback_used,
                stream,
                request_id,
                json.dumps(attempts),
                created_at if created_at is not None else time.time(),
            ),
        )
    except Exception:
        logger.warning("9Router request log write failed for request %s", request_id, exc_info=True)


def list_request_logs(
    org_id: str,
    *,
    limit: int = 50,
    since: Optional[float] = None,
    until: Optional[float] = None,
    status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Redacted log rows for one organization, newest first."""
    clauses = ["org_id = %s"]
    params: List[Any] = [org_id]
    if since is not None:
        clauses.append("created_at >= %s")
        params.append(float(since))
    if until is not None:
        clauses.append("created_at <= %s")
        params.append(float(until))
    if status:
        clauses.append("status = %s")
        params.append(status)
    params.append(max(1, min(200, int(limit))))
    rows = pg.query_all(
        f"SELECT * FROM org_ai_request_logs WHERE {' AND '.join(clauses)} ORDER BY created_at DESC LIMIT %s",
        tuple(params),
    )
    for row in rows:
        if isinstance(row.get("attempts"), str):
            try:
                row["attempts"] = json.loads(row["attempts"])
            except (TypeError, ValueError):
                row["attempts"] = []
    return rows


def cost_summary(org_id: str, *, since: Optional[float] = None, until: Optional[float] = None) -> Dict[str, Any]:
    """Aggregate cost/token/latency estimates over a date range (estimates only)."""
    clauses = ["org_id = %s", "status = 'success'"]
    params: List[Any] = [org_id]
    if since is not None:
        clauses.append("created_at >= %s")
        params.append(float(since))
    if until is not None:
        clauses.append("created_at <= %s")
        params.append(float(until))
    rows = pg.query_all(
        f"""SELECT resolved_provider, resolved_model,
                   COUNT(*) AS requests,
                   SUM(prompt_tokens) AS prompt_tokens,
                   SUM(completion_tokens) AS completion_tokens,
                   SUM(tokens_saved_rtk) AS tokens_saved_rtk,
                   SUM(cost_usd_est) AS cost_usd_est,
                   AVG(latency_ms) AS avg_latency_ms,
                   SUM(CASE WHEN fallback_used THEN 1 ELSE 0 END) AS fallbacks
            FROM org_ai_request_logs WHERE {' AND '.join(clauses)}
            GROUP BY resolved_provider, resolved_model
            ORDER BY cost_usd_est DESC""",
        tuple(params),
    )
    breakdown = [
        {
            "provider": row.get("resolved_provider") or "unknown",
            "model": row.get("resolved_model") or "unknown",
            "requests": int(row.get("requests") or 0),
            "prompt_tokens": int(row.get("prompt_tokens") or 0),
            "completion_tokens": int(row.get("completion_tokens") or 0),
            "tokens_saved_rtk": int(row.get("tokens_saved_rtk") or 0),
            "cost_usd_est": round(float(row.get("cost_usd_est") or 0), 6),
            "avg_latency_ms": round(float(row.get("avg_latency_ms") or 0), 1),
            "fallbacks": int(row.get("fallbacks") or 0),
        }
        for row in rows
    ]
    return {
        "total_requests": sum(entry["requests"] for entry in breakdown),
        "total_prompt_tokens": sum(entry["prompt_tokens"] for entry in breakdown),
        "total_completion_tokens": sum(entry["completion_tokens"] for entry in breakdown),
        "total_tokens_saved_rtk": sum(entry["tokens_saved_rtk"] for entry in breakdown),
        "total_fallbacks": sum(entry["fallbacks"] for entry in breakdown),
        "total_cost_usd_est": round(sum(entry["cost_usd_est"] for entry in breakdown), 6),
        "breakdown": breakdown,
        "note": "Costs are public-rate estimates for observability, not billing data.",
    }
