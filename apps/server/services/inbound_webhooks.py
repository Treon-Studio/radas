"""Inbound webhooks — external triggers for stack actions (Fase 5 — UC 53/81)."""
from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional


def _store_path() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "inbound_webhooks.json"
    except Exception:
        return Path("data") / "inbound_webhooks.json"


def load() -> List[Dict[str, Any]]:
    # KV is the store of record (create/_save write here). The legacy JSON
    # file is only a read fallback so pre-KV registrations stay visible.
    try:
        from storage.kv import kv_load
        v = kv_load("inbound_webhooks")
        if isinstance(v, list) and v:
            return v
    except Exception:
        pass
    try:
        p = _store_path()
        if p.exists():
            d = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(d, list):
                return d
    except Exception:
        pass
    return []


def _save(items: List[Dict[str, Any]]) -> None:
    from storage import kv
    kv.kv_save("inbound_webhooks", items)



def create(name: str, secret: str, stack: str, action: str, project_id: str) -> Dict[str, Any]:
    rec = {"id": str(uuid.uuid4()), "name": name, "secret": secret, "stack": stack,
           "action": action, "project_id": project_id, "created_at": time.time()}
    items = load()
    items.append(rec)
    _save(items)
    return rec


def delete(webhook_id: str) -> bool:
    items = load()
    nxt = [x for x in items if x.get("id") != webhook_id]
    if len(nxt) != len(items):
        _save(nxt)
        return True
    return False


def verify_signature(secret: str, body: bytes, signature: Optional[str]) -> bool:
    if not signature:
        return False
    expected = "sha256=" + hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def trigger(name: str, body: bytes, signature: Optional[str]) -> Dict[str, Any]:
    for wh in load():
        if wh.get("name") != name:
            continue
        if not verify_signature(wh.get("secret") or "", body, signature):
            return {"ok": False, "error": "invalid signature"}, 401
        try:
            from services.cloud_provisioning import _create_execution, _stack_dir
            pid = wh.get("project_id")
            if not pid or not _stack_dir(pid, wh.get("stack")).exists():
                return {"ok": False, "error": "stack not found for webhook"}, 404
            eid = _create_execution(pid, wh.get("stack"), wh.get("action") or "plan",
                                    triggered_by=f"webhook:{name}")
            return {"ok": True, "execution_id": eid, "stack": wh.get("stack"),
                    "action": wh.get("action")}, 201
        except Exception as e:
            return {"ok": False, "error": str(e)}, 500
    return {"ok": False, "error": "webhook not found"}, 404
