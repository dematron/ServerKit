import os
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.middleware.rbac import admin_required
from app.models import Application
from app.services.backup_service import BackupService
from app.services.storage_provider_service import StorageProviderService
from app import db, paths

backups_bp = Blueprint('backups', __name__)


@backups_bp.route('', methods=['GET'])
@jwt_required()
@admin_required
def list_backups():
    """List all backups."""
    backup_type = request.args.get('type')
    backups = BackupService.list_backups(backup_type)
    return jsonify({'backups': backups}), 200


@backups_bp.route('/stats', methods=['GET'])
@jwt_required()
@admin_required
def get_stats():
    """Get backup statistics."""
    stats = BackupService.get_backup_stats()
    return jsonify(stats), 200


@backups_bp.route('/policies', methods=['GET'])
@jwt_required()
@admin_required
def list_policies():
    """Global list of policy-driven backup schedules across every target type
    (§8 unification). Optional filters: ?target_type=, ?enabled=true|false.

    Replaces the legacy filesystem schedule list (/backups/schedules) for the
    unified Backups page — one queryable view of every BackupPolicy.
    """
    from app.models.backup_policy import BackupPolicy, VALID_TARGET_TYPES
    query = BackupPolicy.query
    target_type = request.args.get('target_type')
    if target_type:
        if target_type not in VALID_TARGET_TYPES:
            return jsonify({'error': f'invalid target_type {target_type!r}'}), 400
        query = query.filter_by(target_type=target_type)
    enabled = request.args.get('enabled')
    if enabled is not None:
        query = query.filter_by(enabled=str(enabled).lower() in ('1', 'true', 'yes'))
    policies = query.order_by(BackupPolicy.target_type, BackupPolicy.target_id).all()
    return jsonify({'policies': [p.to_dict() for p in policies]}), 200


@backups_bp.route('/runs', methods=['GET'])
@jwt_required()
@admin_required
def list_runs():
    """Global, queryable list of backup runs across every policy (§8).

    Optional filters: ?target_type=, ?status=, ?policy_id=, ?limit= (<=500).
    Each run is augmented with its policy's target_type/target_id so the unified
    Backups page can render and filter without a second lookup.
    """
    from app.models.backup_policy import BackupPolicy
    from app.models.backup_run import BackupRun
    query = db.session.query(BackupRun, BackupPolicy).join(
        BackupPolicy, BackupRun.policy_id == BackupPolicy.id
    )
    target_type = request.args.get('target_type')
    if target_type:
        query = query.filter(BackupPolicy.target_type == target_type)
    status = request.args.get('status')
    if status:
        query = query.filter(BackupRun.status == status)
    policy_id = request.args.get('policy_id', type=int)
    if policy_id:
        query = query.filter(BackupRun.policy_id == policy_id)
    try:
        limit = min(int(request.args.get('limit', 200)), 500)
    except (TypeError, ValueError):
        limit = 200
    rows = query.order_by(BackupRun.started_at.desc()).limit(limit).all()
    runs = []
    for run, policy in rows:
        item = run.to_dict()
        item['target_type'] = policy.target_type
        item['target_id'] = policy.target_id
        item['target_subtype'] = policy.target_subtype
        runs.append(item)
    return jsonify({'runs': runs}), 200


@backups_bp.route('/config', methods=['GET'])
@jwt_required()
@admin_required
def get_config():
    """Get backup configuration."""
    config = BackupService.get_config()
    return jsonify(config), 200


@backups_bp.route('/config', methods=['PUT'])
@jwt_required()
@admin_required
def update_config():
    """Update backup configuration."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    current_config = BackupService.get_config()
    current_config.update(data)
    result = BackupService.save_config(current_config)
    return jsonify(result), 200 if result['success'] else 400


@backups_bp.route('/cost-rates', methods=['GET'])
@jwt_required()
@admin_required
def get_cost_rates():
    """Storage-cost rates ($/GB/month). 'local' is the operator's own server
    disk (free by default); s3/b2 are the real cloud-provider rates."""
    from app.services.backup_cost_service import BackupCostService, DEFAULT_RATES
    return jsonify({'rates': BackupCostService.get_rates(), 'defaults': DEFAULT_RATES}), 200


@backups_bp.route('/cost-rates', methods=['PUT'])
@jwt_required()
@admin_required
def update_cost_rates():
    """Update storage-cost rates. Accepts {rates:{local,s3,b2}} or the flat dict."""
    from app.services.backup_cost_service import BackupCostService
    data = request.get_json() or {}
    rates = BackupCostService.save_rates(data.get('rates') if 'rates' in data else data)
    return jsonify({'success': True, 'rates': rates}), 200


@backups_bp.route('/cost-summary', methods=['GET'])
@jwt_required()
@admin_required
def cost_summary():
    """Aggregate storage cost across all protection backups (BackupRun rows),
    recomputed from current sizes x current rates, plus a forward projection."""
    from sqlalchemy import func
    from app.models.backup_run import BackupRun
    from app.models.backup_policy import BackupPolicy
    from app.services.backup_cost_service import BackupCostService

    totals = db.session.query(
        func.coalesce(func.sum(BackupRun.size_local), 0),
        func.coalesce(func.sum(BackupRun.size_remote), 0),
        func.count(BackupRun.id),
    ).filter(BackupRun.status == 'success').first()
    size_local = int(totals[0] or 0)
    size_remote = int(totals[1] or 0)
    count = int(totals[2] or 0)

    remote_provider = BackupCostService.configured_remote_provider()
    cost_local = float(BackupCostService.compute_cost(size_local, 'local'))
    cost_remote = float(BackupCostService.compute_cost(size_remote, remote_provider)) if remote_provider else 0.0

    projected = 0.0
    for policy in BackupPolicy.query.all():
        recent = (BackupRun.query.filter_by(policy_id=policy.id, status='success')
                  .order_by(BackupRun.started_at.desc()).limit(5).all())
        sizes = [r.size_local or 0 for r in recent]
        avg = (sum(sizes) / len(sizes)) if sizes else (policy.last_size or 0)
        projected += float(BackupCostService.project_monthly_cost(policy, avg))

    return jsonify({
        'backup_count': count,
        'total_size_local': size_local,
        'total_size_remote': size_remote,
        'total_cost_local': round(cost_local, 4),
        'total_cost_remote': round(cost_remote, 4),
        'total_cost': round(cost_local + cost_remote, 4),
        'projected_monthly_cost': round(projected, 4),
        'cost_rates': BackupCostService.get_rates(),
    }), 200


@backups_bp.route('/application', methods=['POST'])
@jwt_required()
@admin_required
def backup_application():
    """Backup an application."""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    app_id = data.get('application_id')
    if not app_id:
        return jsonify({'error': 'application_id is required'}), 400

    app = Application.query.get(app_id)
    if not app:
        return jsonify({'error': 'Application not found'}), 404

    result = BackupService.backup_application(
        app_name=app.name,
        app_path=app.root_path,
        include_db=data.get('include_db', False),
        db_config=data.get('db_config')
    )

    return jsonify(result), 201 if result['success'] else 400


@backups_bp.route('/database', methods=['POST'])
@jwt_required()
@admin_required
def backup_database():
    """Backup a database."""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    required = ['db_type', 'db_name']
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({'error': f'Missing required fields: {", ".join(missing)}'}), 400

    result = BackupService.backup_database(
        db_type=data['db_type'],
        db_name=data['db_name'],
        user=data.get('user'),
        password=data.get('password'),
        host=data.get('host', 'localhost')
    )

    return jsonify(result), 201 if result['success'] else 400


@backups_bp.route('/files', methods=['POST'])
@jwt_required()
@admin_required
def backup_files():
    """Backup specific files and directories."""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    file_paths = data.get('paths', [])
    if not file_paths:
        return jsonify({'error': 'paths is required (list of file/directory paths)'}), 400

    result = BackupService.backup_files(
        file_paths=file_paths,
        backup_name=data.get('name')
    )

    return jsonify(result), 201 if result['success'] else 400


@backups_bp.route('/restore/application', methods=['POST'])
@jwt_required()
@admin_required
def restore_application():
    """Restore an application from backup."""
    data = request.get_json()

    if not data or 'backup_path' not in data:
        return jsonify({'error': 'backup_path is required'}), 400

    result = BackupService.restore_application(
        backup_path=data['backup_path'],
        restore_path=data.get('restore_path')
    )

    return jsonify(result), 200 if result['success'] else 400


@backups_bp.route('/restore/database', methods=['POST'])
@jwt_required()
@admin_required
def restore_database():
    """Restore a database from backup."""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    required = ['backup_path', 'db_type', 'db_name']
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({'error': f'Missing required fields: {", ".join(missing)}'}), 400

    result = BackupService.restore_database(
        backup_path=data['backup_path'],
        db_type=data['db_type'],
        db_name=data['db_name'],
        user=data.get('user'),
        password=data.get('password'),
        host=data.get('host', 'localhost')
    )

    return jsonify(result), 200 if result['success'] else 400


@backups_bp.route('/<path:backup_path>', methods=['DELETE'])
@jwt_required()
@admin_required
def delete_backup(backup_path):
    """Delete a backup."""
    # Ensure path is within backup directory
    full_path = os.path.realpath(os.path.join(paths.SERVERKIT_BACKUP_DIR, backup_path))
    if not full_path.startswith(os.path.realpath(paths.SERVERKIT_BACKUP_DIR)):
        return jsonify({'error': 'Invalid backup path'}), 400
    result = BackupService.delete_backup(full_path)
    return jsonify(result), 200 if result['success'] else 400


@backups_bp.route('/cleanup', methods=['POST'])
@jwt_required()
@admin_required
def cleanup_backups():
    """Clean up old backups."""
    data = request.get_json() or {}
    retention_days = data.get('retention_days')

    result = BackupService.cleanup_old_backups(retention_days)
    return jsonify(result), 200 if result['success'] else 400


# --- Schedules ---

@backups_bp.route('/schedules', methods=['GET'])
@jwt_required()
@admin_required
def list_schedules():
    """List backup schedules."""
    schedules = BackupService.get_schedules()
    return jsonify({'schedules': schedules}), 200


@backups_bp.route('/schedules', methods=['POST'])
@jwt_required()
@admin_required
def add_schedule():
    """Add a backup schedule."""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    required = ['name', 'backup_type', 'target', 'schedule_time']
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({'error': f'Missing required fields: {", ".join(missing)}'}), 400

    result = BackupService.add_schedule(
        name=data['name'],
        backup_type=data['backup_type'],
        target=data['target'],
        schedule_time=data['schedule_time'],
        days=data.get('days'),
        upload_remote=data.get('upload_remote', False)
    )

    return jsonify(result), 201 if result['success'] else 400


@backups_bp.route('/schedules/<schedule_id>', methods=['PUT'])
@jwt_required()
@admin_required
def update_schedule(schedule_id):
    """Update a backup schedule."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    result = BackupService.update_schedule(schedule_id, data)
    return jsonify(result), 200 if result.get('success') else 400


@backups_bp.route('/schedules/<schedule_id>', methods=['DELETE'])
@jwt_required()
@admin_required
def remove_schedule(schedule_id):
    """Remove a backup schedule."""
    result = BackupService.remove_schedule(schedule_id)
    return jsonify(result), 200 if result['success'] else 400


# --- Remote Storage ---

@backups_bp.route('/storage', methods=['GET'])
@jwt_required()
@admin_required
def get_storage_config():
    """Get storage provider configuration (secrets masked)."""
    config = StorageProviderService.get_config_masked()
    return jsonify(config), 200


@backups_bp.route('/storage', methods=['PUT'])
@jwt_required()
@admin_required
def update_storage_config():
    """Update storage provider configuration."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    result = StorageProviderService.save_config(data)
    return jsonify(result), 200 if result['success'] else 400


@backups_bp.route('/storage/test', methods=['POST'])
@jwt_required()
@admin_required
def test_storage_connection():
    """Test connection to storage provider."""
    data = request.get_json()
    # Use provided config for testing, or current saved config
    config = data if data else None
    result = StorageProviderService.test_connection(config)
    return jsonify(result), 200 if result['success'] else 400


@backups_bp.route('/upload', methods=['POST'])
@jwt_required()
@admin_required
def upload_to_remote():
    """Upload a local backup to remote storage."""
    data = request.get_json()
    if not data or 'backup_path' not in data:
        return jsonify({'error': 'backup_path is required'}), 400

    backup_path = os.path.realpath(data['backup_path'])

    if not backup_path.startswith(os.path.realpath(paths.SERVERKIT_BACKUP_DIR)):
        return jsonify({'error': 'Invalid backup path'}), 400

    if os.path.isdir(backup_path):
        result = StorageProviderService.upload_directory(backup_path)
    elif os.path.isfile(backup_path):
        result = StorageProviderService.upload_file(backup_path)
    else:
        return jsonify({'error': 'Backup not found'}), 404

    return jsonify(result), 200 if result['success'] else 400


@backups_bp.route('/verify', methods=['POST'])
@jwt_required()
@admin_required
def verify_remote_backup():
    """Verify a backup exists and matches on remote storage."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    remote_key = data.get('remote_key')
    local_path = data.get('local_path')

    if not remote_key or not local_path:
        return jsonify({'error': 'remote_key and local_path are required'}), 400

    local_path = os.path.realpath(local_path)
    if not local_path.startswith(os.path.realpath(paths.SERVERKIT_BACKUP_DIR)):
        return jsonify({'error': 'local_path must be within backup directory'}), 400

    result = StorageProviderService.verify_file(remote_key, local_path)
    return jsonify(result), 200


@backups_bp.route('/remote', methods=['GET'])
@jwt_required()
@admin_required
def list_remote_backups():
    """List backups on remote storage."""
    prefix = request.args.get('prefix')
    result = StorageProviderService.list_files(prefix)
    return jsonify(result), 200 if result['success'] else 400


@backups_bp.route('/remote/download', methods=['POST'])
@jwt_required()
@admin_required
def download_from_remote():
    """Download a backup from remote storage to local."""
    data = request.get_json()
    if not data or 'remote_key' not in data:
        return jsonify({'error': 'remote_key is required'}), 400

    remote_key = data['remote_key']
    # Determine local path from remote key
    local_path = data.get('local_path')
    if not local_path:
        # Strip prefix and save to backup dir
        key_parts = remote_key.split('/')
        # Remove the prefix path component
        filename = '/'.join(key_parts[1:]) if len(key_parts) > 1 else key_parts[0]
        local_path = os.path.join(paths.SERVERKIT_BACKUP_DIR, filename)

    local_path = os.path.realpath(local_path)
    if not local_path.startswith(os.path.realpath(paths.SERVERKIT_BACKUP_DIR)):
        return jsonify({'error': 'Download path must be within backup directory'}), 400

    result = StorageProviderService.download_file(remote_key, local_path)
    return jsonify(result), 200 if result['success'] else 400
