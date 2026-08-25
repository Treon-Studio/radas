#!/usr/bin/env python3
"""Documentation."""
import json
import logging
import time
from pathlib import Path
from typing import Optional, Dict, Any

# Comment removed.
try:
    from worker.config import PROJECTS_DIR
except ImportError:
    try:
        from .worker.config import PROJECTS_DIR
    except ImportError:
        try:
            from .app import PROJECTS_DIR
        except ImportError:
            # Comment removed.
            import os
            _env_data = os.environ.get('DATA_DIR')
            if _env_data:
                PROJECTS_DIR = Path(_env_data) / 'projects'
            else:
                _mod_dir = Path(__file__).resolve().parent
                if str(_mod_dir) == '/app':
                    _base = _mod_dir  # Comment removed.
                elif _mod_dir.name == 'backend':
                    _base = _mod_dir.parent
                else:
                    _base = _mod_dir.parent.parent
                PROJECTS_DIR = _base / 'data' / 'projects'

logger = logging.getLogger(__name__)

# Execution State Machine
# Comment removed.
FINAL_STATUSES = {'CANCELED', 'SUCCESS', 'FAILED'}

# Comment removed.
ALLOWED_TRANSITIONS = {
    'QUEUED': {'RUNNING', 'CANCELED'},
    'RUNNING': {'SUCCESS', 'FAILED', 'CANCELING'},
    'CANCELING': {'CANCELED', 'FAILED'},
    'CANCELED': set(),  # Comment removed.
    'SUCCESS': set(),   # Comment removed.
    'FAILED': set()     # Comment removed.
}


def validate_status_transition(from_status: str, to_status: str) -> None:
    """Documentation."""
    from_status = from_status.upper() if from_status else None
    to_status = to_status.upper() if to_status else None
    
    if not from_status or not to_status:
        raise ValueError(f"Status cannot be None or empty (from: {from_status}, to: {to_status})")
    
    # Comment removed.
    if from_status == to_status:
        return
    
    # Comment removed.
    allowed = ALLOWED_TRANSITIONS.get(from_status, set())
    if to_status not in allowed:
        # Comment removed.
        if from_status in FINAL_STATUSES:
            raise ValueError(
                f"Cannot change status from final status '{from_status}' to '{to_status}'. "
                f"Final statuses ({', '.join(FINAL_STATUSES)}) cannot be changed."
            )
        elif to_status == 'CANCELED' and from_status == 'RUNNING':
            raise ValueError(
                f"Cannot transition from '{from_status}' to '{to_status}' directly. "
                f"Must go through CANCELING first: {from_status} → CANCELING → {to_status}"
            )
        else:
            allowed_str = ', '.join(sorted(allowed)) if allowed else 'none (final status)'
            raise ValueError(
                f"Invalid status transition: '{from_status}' → '{to_status}'. "
                f"Allowed transitions from '{from_status}': {allowed_str}"
            )


def get_project_dir(project_id):
    """Documentation."""
    return PROJECTS_DIR / project_id


def get_project_executions_dir(project_id):
    """Documentation."""
    project_dir = get_project_dir(project_id)
    # Comment removed.
    return project_dir / 'history' / 'executions'


def update_execution_record(execution_id, updates, project_id=None):
    """Documentation."""
    # Comment removed.
    if not project_id:
        project_id = updates.get('project_id')
    if not project_id:
        try:
            from storage import index_db as _index_db
            project_id = _index_db.find_execution_project(execution_id)
        except Exception:
            project_id = None
    if not project_id:
        # Try to find execution in Project Storage to get projectId
        # Comment removed.
        for proj_dir in PROJECTS_DIR.iterdir():
            if not proj_dir.is_dir():
                continue
            # Comment removed.
            executions_dir = proj_dir / 'history' / 'executions'
            if not executions_dir.exists():
                continue
            exec_file = executions_dir / f'{execution_id}.json'
            if exec_file.exists():
                try:
                    with open(exec_file, 'r', encoding='utf-8') as f:
                        exec_data = json.load(f)
                        project_id = exec_data.get('projectId')
                        break
                except:
                    pass
    if not project_id:
        logger.error(f"[update_execution_record] project_id is required for execution {execution_id}")
        raise ValueError(f"project_id is required for update_execution_record (execution_id: {execution_id})")
    
    # ALWAYS use Project Storage - no fallback. (Fase 7: Postgres jsonb.)
    try:
        execution = get_execution(execution_id, project_id=project_id)
        if execution is not None:
            # Comment removed.
            old_status = execution.get('status', 'QUEUED')
            new_status = updates.get('status')
            
            if new_status and new_status != old_status:
                validate_status_transition(old_status, new_status)
            
            # Comment removed.
            now = time.time()
            
            if new_status and new_status != old_status:
                # Comment removed.
                updates['statusUpdatedAt'] = now
                
                # Comment removed.
                if new_status == 'RUNNING':
                    if 'startedAt' not in updates:
                        updates['startedAt'] = now
                    # Comment removed.
                    if old_status == 'QUEUED' and 'queuedAt' not in execution:
                        updates['queuedAt'] = execution.get('createdAt', now)
                
                elif new_status == 'CANCELING':
                    if 'cancelRequestedAt' not in updates:
                        updates['cancelRequestedAt'] = now
                
                elif new_status == 'CANCELED':
                    if 'canceledAt' not in updates:
                        updates['canceledAt'] = now
                    if 'cancelReason' not in updates:
                        # Comment removed.
                        if old_status == 'QUEUED':
                            updates['cancelReason'] = 'user'  # Comment removed.
                        elif old_status == 'CANCELING':
                            updates['cancelReason'] = 'user'  # Comment removed.
                        else:
                            updates['cancelReason'] = 'admin'  # Fallback
                
                elif new_status in ('SUCCESS', 'FAILED'):
                    if 'finishedAt' not in updates:
                        updates['finishedAt'] = now
            
            # Comment removed.
            if 'finishedAt' in updates and 'duration' not in updates:
                started_at = execution.get('startedAt') or updates.get('startedAt') or execution.get('createdAt')
                finished_at = updates.get('finishedAt')
                if started_at and finished_at:
                    duration = int(finished_at - started_at)
                    updates['duration'] = duration
            
            # Comment removed.
            execution.update(updates)
            
            # Comment removed. (Fase 7: Postgres jsonb.)
            from storage import pg as _pg
            _pg.execute(
                "INSERT INTO executions (id, project_id, data, created_at) VALUES (%s, %s, %s, %s) "
                "ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, "
                "project_id = EXCLUDED.project_id, created_at = EXCLUDED.created_at",
                (execution_id, project_id, json.dumps(execution, ensure_ascii=False),
                 execution.get("createdAt") or time.time()),
            )

            # Outbound webhook (Fase 1 — UC 95): fire-and-forget on terminal status.
            if new_status in ('SUCCESS', 'FAILED'):
                try:
                    from services.webhook_dispatcher import dispatch_event
                    dispatch_event('run.finished', {
                        'execution_id': execution_id,
                        'project_id': project_id,
                        'status': new_status,
                        'type': execution.get('type') or execution.get('executionType'),
                        'finished_at': execution.get('finishedAt'),
                        'duration': execution.get('duration'),
                        'playbook_id': (execution.get('selectionSnapshot') or {}).get('playbookId'),
                    })
                except Exception:
                    pass
            
            # Keep the SQLite index in sync so /api/worker/claim stays O(1).
            try:
                from storage import index_db as _index_db
                effective_status = new_status or execution.get('status')
                _index_db.upsert_execution_location(
                    execution_id,
                    project_id,
                    effective_status,
                    execution.get('workerId'),
                    execution.get('statusUpdatedAt') or time.time(),
                )
                if effective_status == 'QUEUED':
                    _index_db.add_queued_execution(
                        execution_id, project_id,
                        execution.get('queuedAt') or execution.get('createdAt') or time.time(),
                    )
                    _index_db.remove_running_execution(execution_id)
                elif effective_status == 'RUNNING' and execution.get('workerId'):
                    _index_db.mark_running_execution(
                        execution_id,
                        project_id,
                        execution.get('workerId'),
                        execution.get('startedAt') or execution.get('createdAt') or time.time(),
                    )
                else:
                    _index_db.remove_queued_execution(execution_id)
                    _index_db.remove_running_execution(execution_id)
            except Exception as _idx_e:
                logger.debug("index_db sync failed for %s: %s", execution_id, _idx_e)
            
            logger.debug(f"Updated execution {execution_id}: {old_status} → {new_status or old_status}")
            return True
        else:
            logger.warning(f"Execution file not found: {execution_file}")
            return False
    except ValueError as e:
        # Comment removed.
        logger.error(f"Invalid status transition for execution {execution_id}: {e}")
        raise
    except Exception as e:
        logger.error(f"Error updating execution record {execution_id}: {e}", exc_info=True)
        return False


def append_execution_log(execution_id, text, project_id=None):
    """Documentation. (Fase 7: Postgres bytea.)"""
    if not project_id:
        logger.error(f"[append_execution_log] project_id is required for execution {execution_id}")
        raise ValueError(f"project_id is required for append_execution_log (execution_id: {execution_id})")
    try:
        from storage import pg
        payload = (text if text.endswith("\n") else text + "\n").encode("utf-8")
        pg.execute(
            "INSERT INTO execution_logs (execution_id, chunk, data) VALUES (%s, 0, %s) "
            "ON CONFLICT (execution_id, chunk) DO UPDATE SET data = execution_logs.data || EXCLUDED.data",
            (execution_id, payload))
        return True
    except Exception as e:
        logger.error(f"Error writing log for execution {execution_id}: {e}")
    return False


def read_log_chunk(execution_id, offset=0, limit=1024*1024, project_id=None):
    """Documentation."""
    if not project_id:
        logger.error(f"[read_log_chunk] project_id is required for execution {execution_id}")
        raise ValueError(f"project_id is required for read_log_chunk (execution_id: {execution_id})")
    
    try:
        from storage import pg
        row = pg.query_one(
            "SELECT data FROM execution_logs WHERE execution_id = %s AND chunk = 0",
            (execution_id,))
        if not row or not row["data"]:
            return ('', 0, 0, False)
        data = row["data"]
        file_size = len(data)
        if offset >= file_size:
            execution = get_execution(execution_id, project_id=project_id)
            is_complete = execution and execution.get('status') in FINAL_STATUSES if execution else False
            return ('', offset, file_size, is_complete)
        chunk = data[offset:offset + limit]
        text = chunk.decode('utf-8', errors='ignore')
        next_offset = offset + len(chunk)
        execution = get_execution(execution_id, project_id=project_id)
        is_complete = execution and execution.get('status') in FINAL_STATUSES if execution else False
        return (text, next_offset, file_size, is_complete)
    except Exception as e:
        logger.error(f"Error reading log chunk for execution {execution_id}: {e}")
        return ('', offset, 0, False)


def get_execution(execution_id, project_id=None):
    """Documentation. (Fase 7: Postgres jsonb.)"""
    if not project_id:
        try:
            from storage import index_db as _index_db
            project_id = _index_db.find_execution_project(execution_id)
        except Exception:
            project_id = None
    try:
        from storage import pg
        if project_id:
            row = pg.query_one("SELECT data FROM executions WHERE id = %s AND project_id = %s",
                               (execution_id, project_id))
        else:
            row = pg.query_one("SELECT data FROM executions WHERE id = %s", (execution_id,))
        return row["data"] if row else None
    except Exception as e:
        logger.error(f"Error getting execution {execution_id}: {e}")
    return None


def is_final_status(status: str) -> bool:
    """Documentation."""
    return status.upper() in FINAL_STATUSES if status else False


def can_transition(from_status: str, to_status: str) -> bool:
    """Documentation."""
    try:
        validate_status_transition(from_status, to_status)
        return True
    except ValueError:
        return False


def get_status_transitions(from_status: str) -> set:
    """Documentation."""
    from_status = from_status.upper() if from_status else None
    return ALLOWED_TRANSITIONS.get(from_status, set()).copy() if from_status else set()
