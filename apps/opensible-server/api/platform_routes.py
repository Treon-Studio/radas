"""Health, idempotency & error-handler wiring (Fase 5 cross-cutting)."""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from flask import Blueprint, jsonify, request

from services.health import json_error_payload, readiness, redact

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
    if not key or request.method != "POST":
        return None
    body = request.get_data(cache=False) or b""
    h = hashlib.sha256(body).hexdigest()
    store = _idem_load()
    entry = store.get(key)
    now = time.time()
    if entry and entry.get("body_hash") == h and now - entry.get("ts", 0) < IDEMPOTENCY_TTL:
        return jsonify({"duplicate": True, "result": entry.get("result")}), 202
    request._idem_key = key
    request._idem_hash = h
    return None


@bp.after_app_request
def _idempotency_after(resp):
    key = getattr(request, "_idem_key", None)
    if key and resp.status_code < 500:
        try:
            body = resp.get_data(as_text=True)[:4000]
        except Exception:
            body = ""
        store = _idem_load()
        store[key] = {"body_hash": getattr(request, "_idem_hash", ""), "ts": time.time(),
                      "result": {"status": resp.status_code, "body": body}}
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
