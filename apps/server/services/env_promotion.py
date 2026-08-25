"""Environment promotion (Fase 5 — UC 52)."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, Optional


def _stack_data_dir(pid: str, name: str) -> Path:
    from services.cloud_provisioning import _stack_data_dir as _sd
    return _sd(pid, name)


def promote(pid: str, from_stack: str, to_stack: str) -> Dict[str, Any]:
    from services.cloud_provisioning import _create_execution, _stack_dir
    src = _stack_data_dir(pid, from_stack) / "terraform.tfvars"
    if not src.exists():
        raise ValueError(f"source stack '{from_stack}' has no tfvars")
    if not _stack_dir(pid, to_stack).exists():
        raise ValueError(f"target stack '{to_stack}' not found")
    dst = _stack_data_dir(pid, to_stack)
    dst.mkdir(parents=True, exist_ok=True)
    content = src.read_text(encoding="utf-8")
    (dst / "terraform.tfvars").write_text(content, encoding="utf-8")
    eid = _create_execution(pid, to_stack, "apply", triggered_by=f"promote:{from_stack}")
    return {"from": from_stack, "to": to_stack, "execution_id": eid, "promoted_at": time.time()}
