"""
Distributed Trace & Request Context (UC463) — Trace ID propagation.
"""
from __future__ import annotations

import contextvars
import uuid
from typing import Optional
from flask import g, request

_current_trace_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("current_trace_id", default=None)


def init_trace_context(trace_id: Optional[str] = None) -> str:
    """Initialize or extract trace ID for the current execution context."""
    if not trace_id:
        try:
            trace_id = (
                request.headers.get("X-Trace-Id")
                or request.headers.get("X-Request-Id")
                or f"trc-{uuid.uuid4().hex[:16]}"
            )
        except Exception:
            trace_id = f"trc-{uuid.uuid4().hex[:16]}"

    _current_trace_id.set(trace_id)
    try:
        g.trace_id = trace_id
    except Exception:
        pass
    return trace_id


def get_current_trace_id() -> str:
    """Retrieve the active trace ID from contextvar or Flask g."""
    tid = _current_trace_id.get()
    if tid:
        return tid
    try:
        if hasattr(g, "trace_id") and g.trace_id:
            return g.trace_id
    except Exception:
        pass
    return init_trace_context()
