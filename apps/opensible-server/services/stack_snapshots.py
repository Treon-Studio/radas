"""Stack snapshots, rollback & strip (Fase 5 — UC 12/13)."""
from __future__ import annotations

import json
import shutil
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

MAX_SNAPSHOTS = 5


def _stack_data_dir(pid: str, name: str) -> Path:
    from services.cloud_provisioning import _stack_data_dir as _sd
    return _sd(pid, name)


def _files(pid: str, name: str) -> Dict[str, Path]:
    d = _stack_data_dir(pid, name)
    out = {}
    for f in ("terraform.tfvars", "terraform.tfstate"):
        p = d / f
        if p.exists():
            out[f] = p
    return out


def snapshot(pid: str, name: str, reason: str = "manual") -> Optional[str]:
    files = _files(pid, name)
    if not files:
        return None
    ts = int(time.time() * 1000)
    snap_id = f"{ts}"
    d = _stack_data_dir(pid, name) / "snapshots" / snap_id
    d.mkdir(parents=True, exist_ok=True)
    for f, p in files.items():
        shutil.copy2(p, d / f)
    (d / "meta.json").write_text(json.dumps({"created_at": ts / 1000, "reason": reason}), encoding="utf-8")
    _prune(pid, name)
    return snap_id


def _prune(pid: str, name: str) -> None:
    root = _stack_data_dir(pid, name) / "snapshots"
    if not root.exists():
        return
    snaps = sorted([p for p in root.iterdir() if p.is_dir()], key=lambda p: p.name)
    for old in snaps[:-MAX_SNAPSHOTS]:
        shutil.rmtree(old, ignore_errors=True)


def list_snapshots(pid: str, name: str) -> List[Dict[str, Any]]:
    root = _stack_data_dir(pid, name) / "snapshots"
    out = []
    if root.exists():
        for p in sorted(root.iterdir(), key=lambda p: p.name, reverse=True):
            if not p.is_dir():
                continue
            meta = {}
            mp = p / "meta.json"
            if mp.exists():
                try:
                    meta = json.loads(mp.read_text(encoding="utf-8"))
                except Exception:
                    meta = {}
            out.append({"id": p.name, "created_at": meta.get("created_at"), "reason": meta.get("reason")})
    return out


def restore(pid: str, name: str, snapshot_id: Optional[str] = None) -> Optional[str]:
    snaps = list_snapshots(pid, name)
    if not snaps:
        return None
    sid = snapshot_id or snaps[0]["id"]
    src = _stack_data_dir(pid, name) / "snapshots" / sid
    if not src.is_dir():
        return None
    d = _stack_data_dir(pid, name)
    for f in ("terraform.tfvars", "terraform.tfstate"):
        p = src / f
        if p.exists():
            shutil.copy2(p, d / f)
    return sid


def get_state_config(pid: str, name: str) -> Dict[str, Any]:
    try:
        meta_p = _stack_data_dir(pid, name) / "meta.json"
        if meta_p.exists():
            m = json.loads(meta_p.read_text(encoding="utf-8"))
            return dict(m.get("remote_state") or {})
    except Exception:
        pass
    return {}


def set_state_config(pid: str, name: str, cfg: Dict[str, Any]) -> Dict[str, Any]:
    from services.cloud_provisioning import _save_meta
    clean = {k: cfg.get(k) for k in ("type", "bucket", "key", "region") if cfg.get(k)}
    if clean.get("type") not in ("s3", "oss", "local", None):
        raise ValueError("remote state type must be s3, oss or local")
    _save_meta(pid, name, remote_state=clean)
    # write backend.hcl (control-plane copy)
    d = _stack_data_dir(pid, name)
    d.mkdir(parents=True, exist_ok=True)
    backend_text = chr(10).join([
        "# Remote backend config (managed by Radas)",
        'bucket = "%s"' % (clean.get("bucket") or "REPLACE_ME_TFSTATE_BUCKET"),
        'key    = "%s"' % (clean.get("key") or "cloud-provisioning/%s.tfstate" % name),
        'region = "%s"' % (clean.get("region") or ""),
    ]) + chr(10)
    (d / "backend.hcl").write_text(backend_text, encoding="utf-8")
    return clean
