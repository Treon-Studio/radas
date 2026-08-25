"""Stack lock, taint/untaint & output helpers (Fase 6 — UC 347/356/374/375)."""
from __future__ import annotations

import json
import time
from typing import Any, Dict, Optional


def _meta(project_id: Optional[str], name: str) -> Dict[str, Any]:
    from services.cloud_provisioning import _load_meta
    return _load_meta(project_id, name)


def is_locked(project_id: Optional[str], name: str) -> bool:
    return bool(_meta(project_id, name).get("locked"))


def lock_stack(project_id: Optional[str], name: str, reason: str = "",
               actor: str = "") -> Dict[str, Any]:
    from services.cloud_provisioning import _save_meta
    _save_meta(project_id, name, locked={"reason": reason, "by": actor or "system",
                                         "at": int(time.time())})
    return {"locked": True, "reason": reason, "by": actor or "system"}


def unlock_stack(project_id: Optional[str], name: str) -> Dict[str, Any]:
    from services.cloud_provisioning import _save_meta
    _save_meta(project_id, name, locked=None)
    return {"locked": False}


def taint_resource(project_id: Optional[str], name: str, address: str) -> Dict[str, Any]:
    from services.cloud_provisioning import _create_execution
    if not address:
        raise ValueError("address required")
    eid = _create_execution(project_id, name, "taint", triggered_by="console:taint",
                            extra_run_params={"target": address})
    return {"queued": True, "execution_id": eid, "address": address,
            "message": "Taint via `tofu apply -target=<address>` dijalankan worker."}


def untaint_resource(project_id: Optional[str], name: str, address: str) -> Dict[str, Any]:
    from services.cloud_provisioning import _create_execution
    if not address:
        raise ValueError("address required")
    eid = _create_execution(project_id, name, "untaint", triggered_by="console:untaint",
                            extra_run_params={"target": address})
    return {"queued": True, "execution_id": eid, "address": address}
