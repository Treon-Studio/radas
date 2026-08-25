"""Project CRUD + host status/settings routes (Phase 3)."""
from __future__ import annotations

import importlib
import json
import shutil
import sys
import time
import uuid
from flask import Blueprint, current_app, jsonify, request

from api.platform_contracts import error_response, get_request_id

from auth.middleware import require_auth, require_project_access
from storage import config_db
from utils.host_status import HOST_STATUS_TTL_DEFAULT, get_host_check_status

bp = Blueprint("projects_api", __name__)


def _app_module():
    for module_name in ("__main__", "app"):
        module = sys.modules.get(module_name)
        if module is not None and hasattr(module, "load_projects"):
            return module
    return importlib.import_module("app")


class _AppLogger:
    def __getattr__(self, name):
        return getattr(current_app.logger, name)


app_logger = _AppLogger()


_APP_NAMES = {
    "load_projects",
    "save_projects",
    "load_project_config",
    "save_project_config",
    "get_project_dir",
    "get_project_hosts_list",
    "create_minimal_ansible_config",
    "DATA_DIR",
    "BASE_DIR",
    "HOST_STATUS_TTL_DEFAULT",
}


def _project_error(message, status, code="PROJECT_ERROR"):
    """Use the standard request-correlated envelope for integrity failures."""
    return error_response(code, message, status, request_id_value=get_request_id())


def __getattr__(name):
    if name in _APP_NAMES:
        return getattr(_app_module(), name)
    raise AttributeError(name)


class _LazyAppProxy:
    def __init__(self, name):
        self._name = name

    def _resolve(self):
        return getattr(_app_module(), self._name)

    def __call__(self, *args, **kwargs):
        return self._resolve()(*args, **kwargs)

    def __getattr__(self, item):
        return getattr(self._resolve(), item)

    def __fspath__(self):
        return str(self._resolve())

    def __str__(self):
        return str(self._resolve())

    def __truediv__(self, other):
        return self._resolve() / other


for _name in _APP_NAMES - {"HOST_STATUS_TTL_DEFAULT"}:
    globals()[_name] = _LazyAppProxy(_name)


# ============================================================================

@bp.route('/api/projects', methods=['GET'])
@require_auth
def api_list_projects():
    """API: """
    try:
        projects = load_projects(strict=True)
        # Org-scope: only projects in orgs the user belongs to (Fase 7 — D2).
        uid = (getattr(request, "current_user", {}) or {}).get("user_id")
        try:
            from services.org_service import list_orgs_for_user
            my_org_ids = {o["id"] for o in list_orgs_for_user(uid)} if uid else set()
        except Exception as exc:
            app_logger.error("Error loading organizations for project list", exc_info=True)
            return _project_error("Unable to resolve organization access", 503, "ORG_LOOKUP_FAILED")
        projects = [p for p in projects
                    if (not p.get("org_id")) or p.get("org_id") in my_org_ids]
        # ( include_archived)
        include_archived = request.args.get('include_archived', 'false').lower() == 'true'
        if not include_archived:
            projects = [p for p in projects if not p.get('isArchived', False)]
        
        return jsonify({'success': True, 'projects': projects})
    except Exception as e:
        app_logger.error(f"Error listing projects: {e}", exc_info=True)
        return _project_error("Unable to load projects", 500, "PROJECTS_LOOKUP_FAILED")


@bp.route('/api/projects', methods=['POST'])
@require_auth
def api_create_project():
    """API: 
    
    Creates a truly empty project with:
    - All required directories (mkdir only, no content copied)
    - project.json with explicit defaults for sources (local mode)
    - Empty .sync_state.json
    - No fallback to BASE_DIR or Default Project data
    """
    try:
        data = request.json or {}
        
        name = data.get('name', '').strip()
        if not name:
            return jsonify({'success': False, 'error': 'Project name is required'}), 400
        
        # Org assignment (Fase 7 — D2): an explicitly requested organization
        # must be one the authenticated user belongs to. Never downgrade an
        # unauthorized request to an unscoped project.
        uid = (getattr(request, "current_user", {}) or {}).get("user_id")
        requested_value = data.get("org_id")
        requested = str(requested_value).strip() if requested_value else ""
        try:
            from services.org_service import list_orgs_for_user
            orgs = list_orgs_for_user(uid) if uid else []
        except Exception:
            app_logger.error("Error loading organizations for project creation", exc_info=True)
            return _project_error("Unable to resolve organization access", 503, "ORG_LOOKUP_FAILED")
        authorized_org_ids = {str(org["id"]) for org in orgs}
        if requested and requested not in authorized_org_ids:
            return jsonify({
                'success': False,
                'error': 'Organization access denied',
            }), 403
        org_id = requested or (orgs[0]["id"] if orgs else None)
        if not org_id:
            return jsonify({
                'success': False,
                'error': 'An organization membership is required to create a project',
            }), 403
        project = {
            'id': str(uuid.uuid4()),
            'name': name,
            'description': data.get('description', '').strip(),
            'org_id': org_id,
            'orgId': org_id,
            'owner_id': uid,
            'createdAt': time.time(),
            'updatedAt': time.time(),
            'createdBy': uid or 'current_user',
            'isArchived': False
        }
        
        project_dir = get_project_dir(project['id'])
        project_dir_created = False
        try:
            # Prepare all project storage before committing the database row.
            # A unique UUID directory is removed on any setup failure so a
            # failed request cannot leave a partial project behind.
            project_dir.mkdir(exist_ok=False)
            project_dir_created = True

            repo_dir = project_dir / 'repo'
            repo_dir.mkdir()
            for child in ('roles', 'playbooks', 'inventories', 'group_vars', 'host_vars', 'scripts'):
                (repo_dir / child).mkdir()

            ansible_config_dir = project_dir / 'ansible-config'
            ansible_config_dir.mkdir()
            default_ansible_cfg = ansible_config_dir / 'ansible.cfg'
            if not create_minimal_ansible_config(default_ansible_cfg):
                raise OSError(f"Failed to create {default_ansible_cfg}")
            app_logger.info(f"Created ansible-config/ansible.cfg for project {project['id']}")

            ui_dir = project_dir / 'ui'
            ui_dir.mkdir()
            (ui_dir / 'playbooks').mkdir()
            with open(ui_dir / 'folders.json', 'w', encoding='utf-8') as f:
                json.dump({}, f, indent=2, ensure_ascii=False)

            runtime_dir = project_dir / 'runtime'
            runtime_dir.mkdir()
            for child in ('generated_playbooks', 'inventory_snapshots', 'artifacts'):
                (runtime_dir / child).mkdir()

            history_dir = project_dir / 'history'
            history_dir.mkdir()
            for child in ('executions', 'logs'):
                (history_dir / child).mkdir()

            secrets_dir = project_dir / 'secrets'
            secrets_dir.mkdir()
            for child in ('ssh_keys', 'vault', 'vault_keys', 'git_auth'):
                (secrets_dir / child).mkdir()

            initial_config = {
                'sources': {
                    'repo': {
                        'mode': 'local',
                        'localPath': 'repo',
                        'syncDirection': 'pull',
                        'syncStatus': {
                            'push': {'status': 'idle', 'lastSyncAt': None, 'error': None},
                            'pull': {'status': 'idle', 'lastSyncAt': None, 'error': None}
                        },
                        'syncState': {
                            'lastPullAt': None,
                            'lastPullStatus': 'idle',
                            'lastPullRevision': None,
                            'lastPullError': None,
                            'lastPushAt': None,
                            'lastPushStatus': 'idle',
                            'lastPushRevision': None,
                            'lastPushError': None
                        }
                    }
                },
                'syncTimestamps': {},
                'syncStatus': {}
            }
            save_project_config(project['id'], initial_config)
            with open(project_dir / '.sync_state.json', 'w', encoding='utf-8') as f:
                json.dump({}, f, indent=2, ensure_ascii=False)

            created_project = config_db.create_project(DATA_DIR, project)
        except Exception:
            if project_dir_created:
                try:
                    shutil.rmtree(project_dir)
                except Exception as cleanup_error:
                    app_logger.error(
                        "Project filesystem rollback failed for %s",
                        project['id'], exc_info=True,
                    )
                    raise RuntimeError(
                        f"Project creation failed and filesystem rollback failed: {cleanup_error}"
                    ) from cleanup_error
            raise

        app_logger.info(f"Project created: {created_project['id']} - {created_project['name']} (empty, deterministic)")
        return jsonify({'success': True, 'project': created_project})
    except config_db.ProjectNameExistsError:
        # The storage layer performs the name check and insert under one
        # transaction, so this remains correct when requests race.
        app_logger.info("Project creation rejected because the name already exists")
        return jsonify({'success': False, 'error': 'Project with this name already exists'}), 400
    except Exception as e:
        app_logger.error(f"Error creating project: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/projects/<project_id>', methods=['GET'])
@require_project_access
def api_get_project(project_id):
    """API: ID"""
    try:
        projects = load_projects(strict=True)
        project = next((p for p in projects if p.get('id') == project_id), None)
        
        if not project:
            return jsonify({'success': False, 'error': 'Project not found'}), 404
        
        return jsonify({'success': True, 'project': project})
    except Exception as e:
        app_logger.error(f"Error getting project: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/projects/<project_id>', methods=['PUT'])
@require_project_access
def api_update_project(project_id):
    """API: """
    try:
        data = request.json or {}
        if config_db.get_project(project_id) is None:
            return jsonify({'success': False, 'error': 'Project not found'}), 404

        updates = {}
        if 'name' in data:
            new_name = data['name'].strip()
            if not new_name:
                return jsonify({'success': False, 'error': 'Project name cannot be empty'}), 400
            updates['name'] = new_name
        if 'description' in data:
            updates['description'] = data['description'].strip()
        if 'isArchived' in data:
            updates['isArchived'] = bool(data['isArchived'])
        if updates:
            updates['updatedAt'] = time.time()

        updated_project = config_db.update_project(project_id, updates)
        if updated_project is None:
            return jsonify({'success': False, 'error': 'Project not found'}), 404
        app_logger.info(f"Project updated: {project_id}")
        return jsonify({'success': True, 'project': updated_project})
    except config_db.ProjectNameExistsError:
        app_logger.info("Project update rejected because the name already exists")
        return jsonify({'success': False, 'error': 'Project with this name already exists'}), 400
    except Exception as e:
        app_logger.error(f"Error updating project: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500




@bp.route('/api/projects/<project_id>/hosts_status', methods=['GET'])
@require_project_access
def api_get_project_hosts_status(project_id):
    """ API ( get_all_data)."""
    try:
        hosts = get_project_hosts_list(project_id)
        host_statuses = {}
        for host_name in hosts:
            st = get_host_check_status(project_id, host_name)
            if st:
                host_statuses[host_name] = {
                    'status': st.get('status', 'unknown'),
                    'last_checked_at': st.get('last_checked_at'),
                    'status_expires_at': st.get('status_expires_at'),
                }
            else:
                host_statuses[host_name] = {'status': 'unknown', 'last_checked_at': None, 'status_expires_at': None}
        return jsonify({'success': True, 'hosts_status': host_statuses})
    except Exception as e:
        app_logger.warning(f"[api_get_project_hosts_status] {project_id}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/projects/<project_id>/host_settings', methods=['GET'])
@require_project_access
def api_get_project_host_settings(project_id):
    """API: (TTL, -)."""
    try:
        config = load_project_config(project_id) or {}
        host_status_cfg = config.get('host_status', {})
        ttl = host_status_cfg.get('ttl_seconds')
        if ttl is None:
            # : 
            ttl = config.get('host_status_ttl_seconds', HOST_STATUS_TTL_DEFAULT)
        auto_check = bool(host_status_cfg.get('auto_check_all_hosts', False))
        return jsonify({
            'success': True,
            'settings': {
                'ttl_seconds': ttl,
                'auto_check_all_hosts': auto_check,
            }
        })
    except Exception as e:
        app_logger.error(f"Error getting host settings for project {project_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/projects/<project_id>/host_settings', methods=['PUT'])
@require_project_access
def api_update_project_host_settings(project_id):
    """API: (TTL, -)."""
    try:
        data = request.json or {}
        config = load_project_config(project_id) or {}
        host_status_cfg = config.get('host_status', {})

        if 'ttl_seconds' in data:
            try:
                ttl_seconds = int(data['ttl_seconds'])
            except (TypeError, ValueError):
                ttl_seconds = HOST_STATUS_TTL_DEFAULT
            if ttl_seconds < 30:
                ttl_seconds = 30
            elif ttl_seconds > 24 * 60 * 60:
                ttl_seconds = 24 * 60 * 60
            host_status_cfg['ttl_seconds'] = ttl_seconds

        if 'auto_check_all_hosts' in data:
            host_status_cfg['auto_check_all_hosts'] = bool(data['auto_check_all_hosts'])

        config['host_status'] = host_status_cfg
        save_project_config(project_id, config)

        return jsonify({'success': True, 'settings': host_status_cfg})
    except Exception as e:
        app_logger.error(f"Error updating host settings for project {project_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500
    except Exception as e:
        app_logger.error(f"Unexpected error saving project config for {project_id}: {e}", exc_info=True)
        raise



@bp.route('/api/projects/<project_id>', methods=['DELETE'])
@require_project_access
def api_delete_project(project_id):
    """API: (hard delete)"""
    try:
        projects = load_projects()
        
        project = next((p for p in projects if p.get('id') == project_id), None)
        if not project:
            return jsonify({'success': False, 'error': 'Project not found'}), 404
        
        # Default Project ( , )
        # frontend
        
        # Delete the database row under the same mutation lock used by all
        # project persistence paths. The filesystem is removed only after the
        # row is gone, and only for this project's own directory.
        if not config_db.delete_project(project_id):
            return jsonify({'success': False, 'error': 'Project not found'}), 404
        
        # (, )
        project_dir = get_project_dir(project_id)
        if project_dir.exists():
            import shutil
            try:
                shutil.rmtree(project_dir)
                app_logger.info(f"Project directory deleted: {project_dir}")
            except Exception as e:
                app_logger.warning(f"Failed to delete project directory {project_dir}: {e}")
        
        app_logger.info(f"Project deleted permanently: {project_id}")
        return jsonify({'success': True, 'message': 'Project deleted permanently'})
    except Exception as e:
        app_logger.error(f"Error deleting project: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/projects/<project_id>/restore', methods=['POST'])
@require_project_access
def api_restore_project(project_id):
    """API: """
    try:
        project = config_db.get_project(project_id)
        if not project:
            return jsonify({'success': False, 'error': 'Project not found'}), 404
        if not project.get('isArchived', False):
            return jsonify({'success': False, 'error': 'Project is not archived'}), 400

        updated_project = config_db.update_project(
            project_id, {'isArchived': False, 'updatedAt': time.time()}
        )
        if updated_project is None:
            return jsonify({'success': False, 'error': 'Project not found'}), 404
        app_logger.info(f"Project restored: {project_id}")
        return jsonify({'success': True, 'project': updated_project})
    except config_db.ProjectNameExistsError:
        app_logger.info("Project restore rejected because the name already exists")
        return jsonify({'success': False, 'error': 'Project with this name already exists'}), 400
    except Exception as e:
        app_logger.error(f"Error restoring project: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/projects/<project_id>/switch', methods=['POST'])
@require_project_access
def api_switch_project(project_id):
    """API: ( )"""
    try:
        projects = load_projects()
        project = next((p for p in projects if p.get('id') == project_id and not p.get('isArchived', False)), None)
        
        if not project:
            return jsonify({'success': False, 'error': 'Project not found or archived'}), 404
        
        return jsonify({'success': True, 'project': project})
    except Exception as e:
        app_logger.error(f"Error switching project: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


