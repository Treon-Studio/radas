"""Bastion / jump-host proxy for Ansible runs (Fase 5 — UC 24)."""
from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any, Dict


def _store_path() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "bastion.json"
    except Exception:
        return Path("data") / "bastion.json"


def _load() -> Dict[str, Any]:
    try:
        from storage import kv
        v = kv.kv_load("bastion")
        if isinstance(v, dict):
            return v
    except Exception:
        pass
    return {}


def get_bastion(project_id: str) -> Dict[str, Any]:
    return _load().get(project_id, {})


def _cfg_path(project_id: str) -> Path:
    from utils.project_paths import get_project_dir
    return get_project_dir(project_id) / "ansible-config" / "ansible.cfg"


def _apply(cfg: Path, proxyjump, identity) -> None:
    cfg.parent.mkdir(parents=True, exist_ok=True)
    if not cfg.exists():
        try:
            import app as _app
            if hasattr(_app, "create_minimal_ansible_config"):
                _app.create_minimal_ansible_config(str(cfg))
        except Exception:
            cfg.write_text("[defaults]\nhost_key_checking = false\n", encoding="utf-8")
    text = cfg.read_text(encoding="utf-8")
    if not proxyjump:
        text = re.sub(r"\s+-o ProxyJump=\S+", "", text)
        cfg.write_text(text, encoding="utf-8")
        return
    extra = "-o ProxyJump=" + str(proxyjump)
    if identity:
        extra += " -o IdentityFile=" + str(identity)
    if "ssh_args" in text:
        text = re.sub(r"(ssh_args\s*=.*)", r"\1 " + extra, text, count=1)
    else:
        text += "\n[ssh_connection]\nssh_args = " + extra + "\n"
    cfg.write_text(text, encoding="utf-8")


def save_bastion(project_id: str, host: str, user: str, port: int = 22, ssh_key: str = "") -> Dict[str, Any]:
    host = (host or "").strip()
    user = (user or "").strip()
    if not host or not user:
        raise ValueError("host and user required")
    cfg = {"host": host, "user": user, "port": int(port or 22), "ssh_key": ssh_key,
           "updated_at": time.time()}
    proxyjump = "{}@{}:{}".format(user, host, int(port or 22))
    _apply(_cfg_path(project_id), proxyjump, ssh_key.strip() or None)
    from storage import kv
    kv.kv_set("bastion", project_id, cfg)
    return cfg


def delete_bastion(project_id: str) -> bool:
    from storage import kv
    if kv.kv_get("bastion", project_id) is None:
        return False
    kv.kv_delete("bastion", project_id)
    _apply(_cfg_path(project_id), None, None)
    return True
