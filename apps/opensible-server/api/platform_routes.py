"""Health, idempotency & error-handler wiring (Fase 5 cross-cutting)."""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from flask import Blueprint, jsonify, request

from api.platform_contracts import (
    REQUEST_ID_HEADER,
    error_response,
    is_platform_request,
    redact_sensitive,
    set_request_id,
)
from services.health import json_error_payload, readiness

bp = Blueprint("platform_api", __name__)

IDEMPOTENCY_TTL = 24 * 3600


def _idem_path() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "idempotency.json"
    except Exception:
        return Path("data") / "idempotency.json"


def _idem_load() -> dict:
    try:
        p = _idem_path()
        if p.exists():
            d = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(d, dict):
                return d
    except Exception:
        pass
    return {}


def _idem_save(d: dict) -> None:
    try:
        p = _idem_path()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(d, indent=2), encoding="utf-8")
    except Exception:
        pass


@bp.before_app_request
def _idempotency_before():
    key = request.headers.get("Idempotency-Key")
    # Keep health probes and the historical status endpoint byte-for-byte
    # compatible. Only additive platform mutations use the new contract.
    if not key or request.method != "POST" or not is_platform_request():
        return None
    body = request.get_data(cache=True) or b""
    h = hashlib.sha256(body).hexdigest()
    store = _idem_load()
    entry = store.get(key)
    now = time.time()
    if entry and now - entry.get("ts", 0) < IDEMPOTENCY_TTL:
        if entry.get("body_hash") == h:
            cached = entry.get("result")
            if isinstance(cached, dict):
                cached_body = cached.get("body")
                cached_request_id = cached.get("request_id")
                if isinstance(cached_body, dict) and isinstance(cached_request_id, str):
                    # Reuse only the already-redacted response envelope and its ID;
                    # never return the storage record or raw body text.
                    set_request_id(cached_request_id)
                    response = jsonify(redact_sensitive(cached_body))
                    response.status_code = int(cached.get("status", 202))
                    response.headers[REQUEST_ID_HEADER] = cached_request_id
                    return response
        return error_response(
            "CONFLICT",
            "Idempotency key was already used with a different request payload",
            status=409,
        )
    request._idem_key = key
    request._idem_hash = h
    return None


@bp.after_app_request
def _idempotency_after(resp):
    key = getattr(request, "_idem_key", None)
    if key and resp.status_code < 500:
        try:
            body = resp.get_json(silent=True)
        except Exception:
            body = None
        if isinstance(body, dict) and isinstance(body.get("request_id"), str):
            store = _idem_load()
            store[key] = {
                "body_hash": getattr(request, "_idem_hash", ""),
                "ts": time.time(),
                "result": {
                    "status": resp.status_code,
                    "body": redact_sensitive(body),
                    "request_id": body["request_id"],
                },
            }
            _idem_save(store)
    return resp


@bp.route('/healthz', methods=['GET'])
def api_healthz():
    return jsonify({"status": "ok"}), 200


@bp.route('/readyz', methods=['GET'])
def api_readyz():
    r = readiness()
    return (jsonify(r), 200 if r["ok"] else 503)


@bp.route('/api/platform/idempotency', methods=['GET'])
def api_idempotency_status():
    return jsonify({"entries": len(_idem_load())})


def register_error_handlers(app):
    @app.errorhandler(500)
    def _h500(e):
        return jsonify(json_error_payload("Internal server error")), 500

    @app.errorhandler(404)
    def _h404(e):
        return jsonify(json_error_payload("Not found", code="not_found", status=404)), 404
