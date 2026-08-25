"""Outbound webhook dispatcher (Fase 1 — UC 95).

Storage: a JSON file under DATA_DIR (``webhooks.json``), consistent with the
other config JSON files. Dispatch is fire-and-forget: each matching webhook is
POSTed in its own thread with HMAC-SHA256 signature and 3 retries.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_DATA_DIR: Optional[Path] = None
_LOCK = threading.Lock()


def _store_path() -> Path:
    global _DATA_DIR
    if _DATA_DIR is None:
        try:
            import app as _app
            _DATA_DIR = Path(getattr(_app, "DATA_DIR", "data"))
        except Exception:
            _DATA_DIR = Path("data")
    return _DATA_DIR / "webhooks.json"


def set_data_dir(path: Path) -> None:
    global _DATA_DIR
    _DATA_DIR = Path(path)


def load_webhooks() -> List[Dict[str, Any]]:
    try:
        from storage import kv
        v = kv.kv_load("webhooks")
        return v if isinstance(v, list) else []
    except Exception as e:
        logger.error(f"[webhooks] failed to load: {e}")
    return []


def _save_webhooks(webhooks: List[Dict[str, Any]]) -> None:
    try:
        from storage import kv
        kv.kv_save("webhooks", webhooks)
    except Exception as e:
        logger.error(f"[webhooks] failed to save: {e}")


def create_webhook(url: str, events: List[str], secret: str = "") -> Dict[str, Any]:
    import uuid as _uuid
    wh = {
        "id": str(_uuid.uuid4()),
        "url": url,
        "secret": secret,
        "events": events or [],
        "enabled": True,
        "created_at": time.time(),
    }
    with _LOCK:
        whs = load_webhooks()
        whs.append(wh)
        _save_webhooks(whs)
    return wh


def update_webhook(webhook_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    with _LOCK:
        whs = load_webhooks()
        for wh in whs:
            if wh.get("id") == webhook_id:
                for k in ("url", "secret", "events", "enabled"):
                    if k in updates:
                        wh[k] = updates[k]
                _save_webhooks(whs)
                return wh
    return None


def delete_webhook(webhook_id: str) -> bool:
    with _LOCK:
        whs = load_webhooks()
        nxt = [w for w in whs if w.get("id") != webhook_id]
        if len(nxt) != len(whs):
            _save_webhooks(nxt)
            return True
    return False


def _sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def _deliver(wh: Dict[str, Any], event: str, payload: Dict[str, Any]) -> None:
    import requests

    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "radas-webhook/1.0",
        "X-Radas-Event": event,
    }
    if wh.get("secret"):
        headers["X-Radas-Signature"] = "sha256=" + _sign(wh["secret"], body)

    last_err = None
    for attempt in range(3):
        try:
            r = requests.post(wh["url"], data=body, headers=headers, timeout=5)
            if 200 <= r.status_code < 300:
                return
            last_err = f"http {r.status_code}"
        except Exception as e:
            last_err = str(e)
        time.sleep(1.5 * (attempt + 1))
    logger.warning(f"[webhooks] delivery failed {event} -> {wh['url']}: {last_err}")


def dispatch_event(event: str, payload: Dict[str, Any]) -> int:
    """Fire ``event`` to every enabled webhook subscribed to it (async)."""
    sent = 0
    for wh in load_webhooks():
        if not wh.get("enabled"):
            continue
        if event not in (wh.get("events") or []):
            continue
        threading.Thread(target=_deliver, args=(wh, event, payload), daemon=True).start()
        sent += 1
    if sent:
        logger.info(f"[webhooks] dispatched {event} to {sent} webhook(s)")
    return sent


# ---------------------------------------------------------------------------
# UC404: Webhook Outbound Retry with DLQ
# ---------------------------------------------------------------------------
DLQ_SCOPE = "webhook_dlq"


def dispatch_webhook_with_dlq(
    target_url: str,
    event_type: str,
    payload: Dict[str, Any],
    max_retries: int = 3,
    sender_fn: Optional[Any] = None,
) -> Dict[str, Any]:
    """Deliver a webhook with retries; push to DLQ on persistent failure (UC404)."""
    import uuid as _uuid
    from storage.kv import kv_set

    last_error = None
    for attempt in range(max_retries):
        try:
            if sender_fn:
                sender_fn(target_url, payload)
            else:
                import requests
                headers = {"Content-Type": "application/json", "X-Radas-Event": event_type}
                r = requests.post(target_url, json=payload, headers=headers, timeout=5)
                if not (200 <= r.status_code < 300):
                    raise RuntimeError(f"HTTP error {r.status_code}")
            return {"status": "delivered", "retries_attempted": attempt + 1}
        except Exception as e:
            last_error = str(e)
            if attempt < max_retries - 1:
                time.sleep(0.01)

    dlq_id = str(_uuid.uuid4())
    dlq_entry = {
        "id": dlq_id,
        "target_url": target_url,
        "event_type": event_type,
        "payload": payload,
        "error": last_error,
        "retries_attempted": max_retries,
        "created_at": time.time(),
    }
    kv_set(DLQ_SCOPE, dlq_id, dlq_entry)
    logger.warning(f"[webhooks DLQ] Pushed failed webhook {event_type} to DLQ ({dlq_id}): {last_error}")
    return {
        "status": "dlq",
        "dlq_id": dlq_id,
        "retries_attempted": max_retries,
        "error": last_error,
    }


def list_webhook_dlq(limit: int = 100) -> List[Dict[str, Any]]:
    """List webhook failures in dead-letter queue."""
    from storage.kv import kv_list
    records = kv_list(DLQ_SCOPE)
    items = []
    for r in records:
        val = r.get("value")
        if isinstance(val, dict):
            items.append(val)
    items.sort(key=lambda x: x.get("created_at") or 0, reverse=True)
    return items[:limit]


def clear_webhook_dlq(dlq_id: Optional[str] = None) -> None:
    """Clear a specific or all entries from the webhook DLQ."""
    from storage.kv import kv_delete, kv_list
    if dlq_id:
        kv_delete(DLQ_SCOPE, dlq_id)
    else:
        for r in kv_list(DLQ_SCOPE):
            kv_delete(DLQ_SCOPE, r.get("key"))

