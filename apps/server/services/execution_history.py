"""Execution history service (Phase 3 extraction).

All execution-record helpers previously living in backend/app.py.
Uses lazy access to app-module globals (load_projects, PROJECTS_DIR) via
app_context / a lazy proxy to avoid circular imports.
"""
from __future__ import annotations

import importlib
import json
import logging
import os
import sys
import time
import uuid

from utils.backup_settings import (  # re-exports used by callers
    load_execution_settings,
    save_execution_settings,
    load_backup_settings,
    save_backup_settings,
    get_project_backup_enabled,
    should_create_backup,
    cleanup_old_backups,
    cleanup_old_archives,
    validate_log_level,
)
from utils.project_paths import (
    get_project_dir,
    get_project_executions_dir,
    get_project_logs_dir,
)
from app_context import get_projects_dir

logger = logging.getLogger("app")


def _pg_upsert_execution(execution_id: str, project_id: str, execution: dict) -> None:
    """Store an execution record as jsonb (Fase 7 — C2)."""
    from storage import pg
    pg.execute(
        "INSERT INTO executions (id, project_id, data, created_at) VALUES (%s, %s, %s, %s) "
        "ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, "
        "project_id = EXCLUDED.project_id, created_at = EXCLUDED.created_at",
        (execution_id, project_id, json.dumps(execution, ensure_ascii=False),
         execution.get("createdAt") or time.time()),
    )


def _pg_get_execution(execution_id: str, project_id: Optional[str] = None):
    from storage import pg
    try:
        if project_id:
            row = pg.query_one(
                "SELECT data FROM executions WHERE id = %s AND project_id = %s",
                (execution_id, project_id))
        else:
            row = pg.query_one("SELECT data FROM executions WHERE id = %s", (execution_id,))
        if row:
            return row["data"]
    except Exception:
        pass
    return None


def _app():
    for module_name in ("__main__", "app"):
        module = sys.modules.get(module_name)
        if module is not None and hasattr(module, "load_projects"):
            return module
    return importlib.import_module("app")


class _LazyProjectsDir:
    """Behaves like the app.PROJECTS_DIR Path."""
    def __getattr__(self, name):
        return getattr(get_projects_dir(), name)
    def __truediv__(self, other):
        return get_projects_dir() / other
    def __fspath__(self):
        return str(get_projects_dir())


PROJECTS_DIR = _LazyProjectsDir()


def load_projects():
    return _app().load_projects()


def create_execution_record(data, project_id=None, execution_id=None):
    """ execution Project Storage
    
    REQUIRED: project_id must be provided (no fallback to legacy EXECUTIONS_DIR)
    
 data 'status', , 'QUEUED' ( worker API mode).
 : QUEUED, RUNNING, SUCCESS, FAILED, CANCELED, CANCELING
    
 :
    - createdAt, statusUpdatedAt
 - queuedAt QUEUED
 - startedAt RUNNING
 - workerId 
    
    Args:
 data: execution
 project_id: ID 
 execution_id: ID execution ( , UUID)
    """
    if execution_id is None:
        execution_id = str(uuid.uuid4())
    now = time.time()
    
    # projectId - REQUIRED
    if not project_id:
        project_id = data.get('project_id')
    if not project_id:
        logger.error("[create_execution_record] project_id is required")
        raise ValueError("project_id is required for create_execution_record")
    
    # : , , 'QUEUED' ( worker API mode)
    status = data.get('status', 'QUEUED')
    status = status.upper()
    
    # ( QUEUED RUNNING )
    if status not in ('QUEUED', 'RUNNING'):
        logger.warning(f"[create_execution_record] Invalid initial status '{status}', defaulting to QUEUED")
        status = 'QUEUED'
    
    execution = {
        'id': execution_id,
        'projectId': project_id,
        'createdAt': now,
        'status': status,
        'statusUpdatedAt': now,
        'playbookName': data.get('playbookName', 'dynamic_playbook'),
        'mode': data.get('mode', 'PER_GROUP'),
        'inventorySnapshot': data.get('inventorySnapshot', {}),
        'selectionSnapshot': data.get('selectionSnapshot', {}),
        'stats': data.get('stats', {}),
        'warnings': data.get('warnings', []),
        'priority': int(data.get('priority') or 0)
    }
    
    # queuedAt QUEUED 
    if status == 'QUEUED':
        execution['queuedAt'] = now
    
    # startedAt workerId RUNNING 
    if status == 'RUNNING':
        execution['startedAt'] = now
        if 'workerId' in data:
            execution['workerId'] = data.get('workerId')
    
    # workerId ( QUEUED )
    if 'workerId' in data and status == 'QUEUED':
        execution['workerId'] = data.get('workerId')
    
    # run 
    if 'runName' in data:
        execution['runName'] = data.get('runName')
    if 'tag' in data:
        execution['tag'] = data.get('tag')
    if 'description' in data:
        execution['description'] = data.get('description')
    
    # ( )
    if 'runParams' in data:
        execution['runParams'] = data.get('runParams')
        # Surface stage/play_name at top-level so UI can filter/tag lifecycle steps.
        rp = data.get('runParams') or {}
        if isinstance(rp, dict) and rp.get('stage'):
            execution['stage'] = rp.get('stage')

    if 'play_name' in data and data.get('play_name'):
        execution['play_name'] = data.get('play_name')

    # playbookId
    if 'playbookId' in data:
        execution['playbookId'] = data.get('playbookId')

    # Trigger attribution (who launched this run)
    if data.get('triggeredBy'):
        execution['triggeredBy'] = data.get('triggeredBy')
    if data.get('triggeredByUserId'):
        execution['triggeredByUserId'] = data.get('triggeredByUserId')

    
    # ALWAYS use Project Storage - no fallback. (Fase 7: Postgres jsonb.)
    try:
        _pg_upsert_execution(execution_id, project_id, execution)
        # Index for fast worker/claim/log/finish lookups (best-effort).
        try:
            from storage import index_db as _index_db
            _index_db.upsert_execution_location(
                execution_id,
                project_id,
                status,
                execution.get('workerId'),
                execution.get('statusUpdatedAt') or now,
            )
            if status == 'QUEUED':
                _index_db.add_queued_execution(
                    execution_id, project_id,
                    execution.get('queuedAt') or now,
                )
            elif status == 'RUNNING' and execution.get('workerId'):
                _index_db.mark_running_execution(
                    execution_id,
                    project_id,
                    execution.get('workerId'),
                    execution.get('startedAt') or now,
                )
        except Exception as _idx_e:
            logger.debug("index_db add failed: %s", _idx_e)
        return execution_id
    except Exception as e:
        logger.error(f"Error creating execution record: {e}")
        return None


def update_execution_record(execution_id, updates, project_id=None):
    """ execution Project Storage 
    
    Wrapper executions_store.update_execution_record() .
    executions_store.
    
       REQUIRED: project_id must be provided (no fallback to legacy EXECUTIONS_DIR)
       """
    # executions_store 
    try:
        from storage.executions_store import update_execution_record as _update_execution_record
    except ImportError:
        from storage.executions_store import update_execution_record as _update_execution_record
    return _update_execution_record(execution_id, updates, project_id)


def append_execution_log(execution_id, text, project_id=None):
    """ execution Project Storage
    
    REQUIRED: project_id must be provided (no fallback to legacy EXECUTION_LOGS_DIR)
    """
    if not project_id:
        logger.error(f"[append_execution_log] project_id is required for execution {execution_id}")
        raise ValueError(f"project_id is required for append_execution_log (execution_id: {execution_id})")
    
    # ALWAYS use Project Storage - no fallback. (Fase 7: Postgres bytea.)
    try:
        from storage import pg
        pg.execute(
            "INSERT INTO execution_logs (execution_id, chunk, data) VALUES (%s, 0, %s) "
            "ON CONFLICT (execution_id, chunk) DO UPDATE SET data = execution_logs.data || EXCLUDED.data",
            (execution_id, (text + ("" if text.endswith("\n") else "\n")).encode("utf-8")),
        )
        return True
    except Exception as e:
        logger.error(f"Error writing log for execution {execution_id}: {e}")
    return False


def get_execution_log(execution_id, project_id=None):
    """ execution Project Storage
    
    REQUIRED: project_id must be provided (no fallback to legacy EXECUTION_LOGS_DIR)
    """
    if not project_id:
        logger.error(f"[get_execution_log] project_id is required for execution {execution_id}")
        raise ValueError(f"project_id is required for get_execution_log (execution_id: {execution_id})")
    
    # ALWAYS use Project Storage - no fallback. (Fase 7: Postgres bytea.)
    try:
        from storage import pg
        row = pg.query_one(
            "SELECT data FROM execution_logs WHERE execution_id = %s AND chunk = 0",
            (execution_id,))
        if row and row["data"]:
            return row["data"].decode("utf-8", errors="replace")
    except Exception as e:
        logger.error(f"Error reading log for execution {execution_id}: {e}")
    return ''


def list_executions(limit=None, offset=0, search_query=None, playbook_id=None, project_id=None):
    """ executions ( ) Project Storage (Fase 7: Postgres jsonb)"""
    if not project_id:
        logger.error("[list_executions] project_id is required")
        raise ValueError("project_id is required for list_executions")

    executions = []
    try:
        from storage import pg
        rows = pg.query_all(
            "SELECT data FROM executions WHERE project_id = %s "
            "ORDER BY COALESCE(data->>'createdAt', '0')::float DESC",
            (project_id,))
        for r in rows:
            execution = r["data"] or {}
            # playbook_id
            if playbook_id:
                selection_snapshot = execution.get('selectionSnapshot', {})
                execution_playbook_id = selection_snapshot.get('playbookId')
                if execution_playbook_id != playbook_id:
                    continue
            if search_query:
                query_lower = search_query.lower()
                if (query_lower not in execution.get('id', '').lower() and
                        query_lower not in str(execution.get('stats', {}).get('hostsTargeted', '')).lower()):
                    found = False
                    inventory = execution.get('inventorySnapshot', {})
                    for group in inventory.get('groups', []):
                        if query_lower in group.get('groupName', '').lower():
                            found = True
                            break
                        for host in group.get('hosts', []):
                            if query_lower in host.get('hostId', '').lower() or query_lower in host.get('ip', '').lower():
                                found = True
                                break
                        if found:
                            break
                    if not found:
                        continue
            executions.append(execution)
        if limit:
            executions = executions[offset:offset + limit]
        elif offset:
            executions = executions[offset:]
        return executions
    except Exception as e:
        logger.error(f"Error getting list of executions: {e}")
    return []


def get_execution(execution_id, project_id=None):
    """ execution ID (Fase 7: Postgres jsonb)"""
    return _pg_get_execution(execution_id, project_id)


def _cleanup_generated_playbooks_for_execution(project_id, execution_id):
    """ runtime/generated_playbooks/ execution"""
    try:
        project_dir = get_project_dir(project_id)
        gp_dir = project_dir / 'runtime' / 'generated_playbooks'
        if not gp_dir.exists():
            return
        playbook_file = gp_dir / f'{execution_id}.yml'
        inventory_file = gp_dir / f'inventory_{execution_id}.yml'
        if playbook_file.exists():
            playbook_file.unlink()
            logger.debug(f"Deleted generated playbook: {playbook_file}")
        if inventory_file.exists():
            key_files_to_delete = set()
            try:
                with open(inventory_file, 'r', encoding='utf-8') as f:
                    inv_data = yaml_loader.load(f) or {}
                hosts_dict = (inv_data.get('all') or {}).get('hosts') or {}
                for host_data in hosts_dict.values():
                    if isinstance(host_data, dict):
                        key_path = host_data.get('ansible_ssh_private_key_file')
                        if key_path and 'generated_playbooks' in str(key_path) and str(key_path).endswith('.pem'):
                            key_name = os.path.basename(str(key_path))
                            if key_name.startswith('key_'):
                                key_files_to_delete.add(key_name)
            except Exception as e:
                logger.debug(f"Could not parse inventory for key paths: {e}")
            inventory_file.unlink()
            logger.debug(f"Deleted generated inventory: {inventory_file}")
            for key_name in key_files_to_delete:
                key_file = gp_dir / key_name
                if key_file.exists():
                    key_file.unlink()
                    logger.debug(f"Deleted generated key: {key_file}")
    except Exception as e:
        logger.warning(f"Error cleaning generated_playbooks for {execution_id}: {e}")


def _cleanup_orphaned_generated_playbooks(project_id, min_age_seconds=600):
    """Delete generated_playbooks that have no matching execution record.

    A grace period (min_age_seconds) is enforced to avoid a race where the
    playbook file is written by the queue endpoint BEFORE the execution
    record is persisted; without the guard, retention cleanup could wipe
    a valid file the worker is about to consume, causing the worker to
    fail with "Playbook file not found".
    """
    try:
        executions_dir = get_project_executions_dir(project_id)
        gp_dir = get_project_dir(project_id) / 'runtime' / 'generated_playbooks'
        if not gp_dir.exists():
            return
        existing_ids = {f.stem for f in executions_dir.glob('*.json')} if executions_dir.exists() else set()
        now = time.time()
        processed = set()
        for f in gp_dir.glob('*.yml'):
            ex_id = f.stem.replace('inventory_', '') if f.name.startswith('inventory_') else f.stem
            if not ex_id or ex_id in existing_ids or ex_id in processed:
                continue
            # Skip files newer than grace period — record may still be being written.
            try:
                if (now - f.stat().st_mtime) < min_age_seconds:
                    continue
            except OSError:
                continue
            processed.add(ex_id)
            _cleanup_generated_playbooks_for_execution(project_id, ex_id)
            logger.debug(f"Cleaned orphaned generated_playbooks for execution {ex_id}")
    except Exception as e:
        logger.warning(f"Error cleaning orphaned generated_playbooks: {e}")


def delete_execution(execution_id, project_id=None):
    """ execution, generated_playbooks (Fase 7: Postgres)"""
    try:
        from storage import pg
        if not project_id:
            try:
                from storage import index_db as _index_db
                project_id = _index_db.find_execution_project(execution_id)
            except Exception:
                project_id = None
        if project_id:
            _cleanup_generated_playbooks_for_execution(project_id, execution_id)
            pg.execute("DELETE FROM executions WHERE id = %s", (execution_id,))
            pg.execute("DELETE FROM execution_logs WHERE execution_id = %s", (execution_id,))
            try:
                from storage import index_db as _index_db
                _index_db.remove_queued_execution(execution_id)
                _index_db.remove_running_execution(execution_id)
            except Exception:
                pass
            return True
        return False
    except Exception as e:
        logger.error(f"Error deleting execution {execution_id}: {e}")
        return False


def apply_retention_policy():
    """ retention executions (per-project)"""
    settings = load_execution_settings()
    
    if not settings.get('save_history', True):
        return
    
    try:
        # Apply retention policy per project
        projects = load_projects()
        for project in projects:
            project_id = project.get('id')
            if not project_id:
                continue
            
            try:
                if settings.get('retention_mode') == 'count':
                    max_count = settings.get('retention_count', 200)
                    executions = list_executions(project_id=project_id)
                    
                    if len(executions) > max_count:
                        to_delete = executions[max_count:]
                        for execution in to_delete:
                            delete_execution(execution['id'], project_id=project_id)
                        logger.info(f"Retention policy (project {project_id}): deleted {len(to_delete)} old executions")
                
                elif settings.get('retention_mode') == 'size':
                    max_size_mb = settings.get('retention_size_mb', 200)
                    max_size_bytes = max_size_mb * 1024 * 1024
                    
                    executions = list_executions(project_id=project_id)
                    total_size = 0
                    
                    # execution (Fase 7: PG octet_length)
                    execution_sizes = []
                    try:
                        from storage import pg as _pg
                        size_rows = _pg.query_all(
                            "SELECT e.id, octet_length(e.data::text) AS sz, "
                            "COALESCE(octet_length(l.data), 0) AS log_sz "
                            "FROM executions e LEFT JOIN execution_logs l "
                            "ON l.execution_id = e.id AND l.chunk = 0 "
                            "WHERE e.project_id = %s", (project_id,))
                        size_by_id = {r["id"]: int(r["sz"] or 0) + int(r["log_sz"] or 0)
                                      for r in size_rows}
                    except Exception:
                        size_by_id = {}
                    for execution in executions:
                        size = size_by_id.get(execution["id"], 0)
                        execution_sizes.append((execution, size))
                        total_size += size
                    
                    # , 
                    if total_size > max_size_bytes:
                        execution_sizes.sort(key=lambda x: x[0].get('createdAt', 0))
                        deleted_count = 0
                        for execution, size in execution_sizes:
                            if total_size <= max_size_bytes:
                                break
                            delete_execution(execution['id'], project_id=project_id)
                            total_size -= size
                            deleted_count += 1
                        logger.info(f"Retention policy (project {project_id}): deleted {deleted_count} executions by size")
            except Exception as e:
                logger.warning(f"Error applying retention policy for project {project_id}: {e}")
            # generated_playbooks (execution , )
            try:
                _cleanup_orphaned_generated_playbooks(project_id)
            except Exception as e:
                logger.debug(f"Cleanup orphaned generated_playbooks for {project_id}: {e}")
    except Exception as e:
        logger.error(f"Error applying retention policy: {e}")


def clear_all_executions(project_id=None):
    """ executions ( project_id=None)
    
    Note: If project_id is None, clears executions from all projects in Project Storage.
    Legacy EXECUTIONS_DIR is no longer used.
    """
    try:
        from storage import pg
        if project_id:
            rows = pg.query_all("SELECT id FROM executions WHERE project_id = %s", (project_id,))
            for r in rows:
                if delete_execution(r["id"], project_id=project_id):
                    pass
            return len(rows)
        else:
            rows = pg.query_all("SELECT id, project_id FROM executions")
            for r in rows:
                delete_execution(r["id"], project_id=r["project_id"])
            return len(rows)
    except Exception as e:
        logger.error(f"Error clearing executions: {e}")
    return 0


def get_execution_stats(project_id=None):
    """ executions ( project_id=None)
    
    Note: Legacy EXECUTIONS_DIR is no longer used. Stats are calculated from Project Storage.
    """
    try:
        total_count = 0
        total_size = 0
        
        if project_id:
            # Stats for specific project
            executions = list_executions(project_id=project_id)
            executions_dir = get_project_executions_dir(project_id)
            logs_dir = executions_dir / 'logs'
            
            for execution in executions:
                execution_file = executions_dir / f"{execution['id']}.json"
                log_file = logs_dir / f"{execution['id']}.log"
                
                if execution_file.exists():
                    total_size += execution_file.stat().st_size
                if log_file.exists():
                    total_size += log_file.stat().st_size
            
            total_count = len(executions)
        else:
            # Stats for all projects ( : history/executions/ history/logs/)
            for proj_dir in PROJECTS_DIR.iterdir():
                if not proj_dir.is_dir():
                    continue
                project_id_from_path = proj_dir.name
                try:
                    executions = list_executions(project_id=project_id_from_path)
                    # : history/logs/
                    logs_dir = proj_dir / 'history' / 'logs'
                    if not logs_dir.exists():
                        # : executions/logs/
                        logs_dir = proj_dir / 'executions' / 'logs'

                    # : history/executions/<id>.json
                    executions_dir = proj_dir / 'history' / 'executions'
                    if not executions_dir.exists():
                        # : executions/<id>.json
                        executions_dir = proj_dir / 'executions'

                    for execution in executions:
                        execution_file = executions_dir / f"{execution['id']}.json"
                        log_file = logs_dir / f"{execution['id']}.log"
                        
                        if execution_file.exists():
                            total_size += execution_file.stat().st_size
                        if log_file.exists():
                            total_size += log_file.stat().st_size
                    
                    total_count += len(executions)
                except Exception as e:
                    logger.warning(f"Error getting stats for project {project_id_from_path}: {e}")
        
        return {
            'count': total_count,
            'size_mb': round(total_size / (1024 * 1024), 2)
        }
    except Exception as e:
        logger.error(f"Error getting execution statistics: {e}")
    return {'count': 0, 'size_mb': 0}


# ==================== Execution History API Endpoints ====================
