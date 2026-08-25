"""Automation rules — maintenance window, auto-stop, drift remediation (Fase 5 — UC 23/78/80)."""
from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

RULE_INTERVAL_SECONDS = 3600  # hourly


def _store_path() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "automation_rules.json"
    except Exception:
        return Path("data") / "automation_rules.json"


def load() -> List[Dict[str, Any]]:
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
    kv.kv_save("automation_rules", items)



def create(rule: Dict[str, Any]) -> Dict[str, Any]:
    rule = dict(rule)
    rule["id"] = str(uuid.uuid4())
    rule.setdefault("enabled", True)
    rule.setdefault("created_at", time.time())
    items = load()
    items.append(rule)
    _save(items)
    return rule


def update(rule_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    items = load()
    for r in items:
        if r.get("id") == rule_id:
            for k in ("enabled", "hour", "days", "start_hour", "end_hour", "stack", "action"):
                if k in patch:
                    r[k] = patch[k]
            _save(items)
            return r
    return None


def delete(rule_id: str) -> bool:
    items = load()
    nxt = [r for r in items if r.get("id") != rule_id]
    if len(nxt) != len(items):
        _save(nxt)
        return True
    return False


def _in_day(days: List[int], weekday: int) -> bool:
    return (not days) or (weekday in days)


def in_maintenance(project_id: Optional[str] = None) -> bool:
    now = datetime.now()
    for r in load():
        if not r.get("enabled") or r.get("kind") != "maintenance":
            continue
        if project_id and r.get("project_id") and r.get("project_id") != project_id:
            continue
        if not _in_day(r.get("days") or [], now.weekday()):
            continue
        start = int(r.get("start_hour") or 0)
        end = int(r.get("end_hour") or 0)
        if start <= now.hour < end or (start > end and (now.hour >= start or now.hour < end)):
            return True
    return False


def _queue(pid: str, stack: str, action: str, why: str) -> bool:
    try:
        from services.cloud_provisioning import _create_execution, _stack_dir
        if not _stack_dir(pid, stack).exists():
            return False
        _create_execution(pid, stack, action, triggered_by=why)
        return True
    except Exception as e:
        logger.warning(f"[automation] queue failed {why}: {e}")
        return False


def run_rules_once() -> Dict[str, int]:
    now = datetime.now()
    queued = {"auto_stop": 0, "remediate": 0, "auto_scale": 0}
    for r in load():
        if not r.get("enabled"):
            continue
        if in_maintenance(r.get("project_id")):
            continue
        kind = r.get("kind")
        if kind == "auto_scale" and now.hour == int(r.get("hour") or 0) and _in_day(r.get("days") or [], now.weekday()):
            try:
                # Check auto_scale feature flag (UC127)
                from services.feature_flags import evaluate
                pid, stack = r.get("project_id"), r.get("stack")
                flag_res = evaluate("auto_scale", env="prod", stack=stack, project_id=pid)
                if not flag_res.get("enabled", True):
                    continue

                from services.cloud_provisioning import _create_execution, _stack_dir
                scale_to = int(r.get("scale_to") or 0)
                if pid and stack and scale_to > 0 and _stack_dir(pid, stack).exists():
                    tf = _stack_dir(pid, stack) / "terraform.tfvars"
                    if tf.exists():
                        import re as _re
                        text = tf.read_text(encoding="utf-8")
                        if _re.search(r"app_vm_count\s*=\s*\d+", text):
                            text = _re.sub(r"app_vm_count\s*=\s*\d+", "app_vm_count = %d" % scale_to, text)
                            tf.write_text(text, encoding="utf-8")
                            _create_execution(pid, stack, "apply", triggered_by="auto_scale")
                            queued["auto_scale"] += 1
            except Exception:
                pass
        elif kind == "auto_stop" and now.hour == int(r.get("hour") or 0) and _in_day(r.get("days") or [], now.weekday()):
            try:
                # Check auto_stop / block_destroy feature flags (UC127)
                from services.feature_flags import evaluate
                pid, stack = r.get("project_id"), r.get("stack")
                if not evaluate("auto_stop", env="prod", stack=stack, project_id=pid).get("enabled", True):
                    continue
                if evaluate("block_destroy", env="prod", stack=stack, project_id=pid).get("enabled", False):
                    continue
                if _queue(pid, stack, r.get("action") or "destroy", "auto_stop"):
                    queued["auto_stop"] += 1
            except Exception:
                pass
        elif kind == "remediate" and r.get("stack"):
            try:
                # Check remediation feature flags (UC134)
                from services.feature_flags import evaluate
                pid, stack = r.get("project_id"), r.get("stack")
                if not evaluate("auto_remediate", env="prod", stack=stack, project_id=pid).get("enabled", True):
                    continue
                if not evaluate("remediation.enabled", env="prod", stack=stack, project_id=pid).get("enabled", True):
                    continue
                if stack and not evaluate(f"remediation.{stack}.enabled", env="prod", stack=stack, project_id=pid).get("enabled", True):
                    continue

                from services.cloud_provisioning import _latest_drift_run
                dr = _latest_drift_run(pid, r["stack"]) or {}
                if int(dr.get("returnCode") or 0) == 2 and _queue(pid, r["stack"], "apply", "remediate"):
                    queued["remediate"] += 1
            except Exception:
                pass
    return queued


def _rule_loop(interval: int = RULE_INTERVAL_SECONDS) -> None:
    while True:
        try:
            run_rules_once()
        except Exception as e:
            logger.error(f"[automation] rule loop error: {e}")
        time.sleep(interval)


def start_automation_scheduler() -> None:
    t = threading.Thread(target=_rule_loop, daemon=True)
    t.start()
    logger.info("Automation rules scheduler started (hourly)")
