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
    p = _store_path()
    try:
        if p.exists():
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
    except Exception as e:
        logger.error(f"[webhooks] failed to load: {e}")
    return []


def _save_webhooks(webhooks: List[Dict[str, Any]]) -> None:
    p = _store_path()
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(webhooks, f, indent=2)
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
