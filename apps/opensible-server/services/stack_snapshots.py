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
    from services.cloud_provisioning import _stack_dir
    d = _stack_dir(pid, name)
    out = {}
    for f in ("terraform.tfvars", "terraform.tfstate"):
        p = d / f
        if p.exists():
            out[f] = p
    return out


def snapshot(pid: str, name: str, reason: str = "manual") -> Optional[str]:
    from services.cloud_provisioning import _stack_dir
    sd = _stack_dir(pid, name)
    payload: Dict[str, Any] = {}
    for f in ("terraform.tfvars", "terraform.tfstate"):
        p = sd / f
        if p.exists():
            payload[f] = p.read_bytes().decode("utf-8", errors="replace")
    if not payload:
        return None
    ts = int(time.time() * 1000)
    snap_id = str(ts)
    from storage import pg
    pg.execute(
        "INSERT INTO snapshots (project_id, stack, ts, data) VALUES (%s, %s, %s, %s) "
        "ON CONFLICT (project_id, stack, ts) DO UPDATE SET ts = EXCLUDED.ts, "
        "data = EXCLUDED.data",
        (pid or "default", name, ts, json.dumps(
            {"files": payload, "created_at": ts / 1000, "reason": reason}).encode("utf-8")))
    _prune(pid, name)
    return snap_id


def _prune(pid: str, name: str) -> None:
    from storage import pg
    rows = pg.query_all(
        "SELECT ts FROM snapshots WHERE project_id = %s AND stack = %s ORDER BY ts DESC",
        (pid or "default", name))
    for r in rows[MAX_SNAPSHOTS:]:
        pg.execute("DELETE FROM snapshots WHERE project_id = %s AND stack = %s AND ts = %s",
                   (pid or "default", name, r["ts"]))


def list_snapshots(pid: str, name: str) -> List[Dict[str, Any]]:
    from storage import pg
    rows = pg.query_all(
        "SELECT ts, data FROM snapshots WHERE project_id = %s AND stack = %s ORDER BY ts DESC",
        (pid or "default", name))
    out = []
    for r in rows:
        try:
            data = json.loads(r["data"].decode("utf-8"))
        except Exception:
            data = {}
        out.append({"id": str(r["ts"]), "created_at": data.get("created_at"),
                    "reason": data.get("reason")})
    return out


def restore(pid: str, name: str, snapshot_id: Optional[str] = None) -> Optional[str]:
    from services.cloud_provisioning import _stack_dir
    snaps = list_snapshots(pid, name)
    if not snaps:
        return None
    sid = snapshot_id or snaps[0]["id"]
    from storage import pg
    row = pg.query_one(
        "SELECT data FROM snapshots WHERE project_id = %s AND stack = %s AND ts = %s",
        (pid or "default", name, float(sid)))
    if not row:
        return None
    try:
        data = json.loads(row["data"].decode("utf-8"))
    except Exception:
        return None
    sd = _stack_dir(pid, name)
    sd.mkdir(parents=True, exist_ok=True)
    for f, content in (data.get("files") or {}).items():
        (sd / f).write_text(content, encoding="utf-8")
    return sid


def get_state_config(pid: str, name: str) -> Dict[str, Any]:
    try:
        from services.cloud_provisioning import _load_meta
        m = _load_meta(pid, name)
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
