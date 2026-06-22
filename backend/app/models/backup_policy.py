from datetime import datetime
from decimal import Decimal

from app import db


def _num(value):
    """Serialize a Numeric/Decimal column to a JSON-friendly float (or None)."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return value


class BackupPolicy(db.Model):
    """Automated backup ("protection") policy for a single target.

    A target is either a WordPress site (``target_type='wordpress_site'``) or a
    generic application (``target_type='application'``). There is at most one
    policy per target. The cron schedule is mirrored into a ``ScheduledJob`` row
    by :class:`BackupPolicyService` so firing happens on the unified job bus.

    The ``last_*`` columns are a denormalized cache of the most recent run so the
    UI can render the protection status without scanning ``backup_runs``.
    """

    __tablename__ = 'backup_policies'

    id = db.Column(db.Integer, primary_key=True)
    target_type = db.Column(db.String(40), nullable=False, index=True)  # 'wordpress_site' | 'application'
    target_id = db.Column(db.Integer, nullable=False, index=True)
    enabled = db.Column(db.Boolean, default=False, nullable=False)

    # Schedule (cron expression fired by the unified scheduler)
    schedule_cron = db.Column(db.String(120), default='0 2 * * *', nullable=False)

    # Retention
    retention_count = db.Column(db.Integer, default=14, nullable=False)
    retention_days = db.Column(db.Integer, default=30, nullable=False)

    # Smart backup
    full_every_n_days = db.Column(db.Integer, default=7, nullable=False)
    compression = db.Column(db.String(20), default='balanced', nullable=False)  # 'fast' | 'balanced' | 'max'

    # Remote
    remote_copy = db.Column(db.Boolean, default=False, nullable=False)

    # Hooks (optional shell snippets run before/after a backup)
    pre_backup_hook = db.Column(db.Text, nullable=True)
    post_backup_hook = db.Column(db.Text, nullable=True)

    # Denormalized last-run cache for the UI
    last_run_at = db.Column(db.DateTime, nullable=True)
    last_status = db.Column(db.String(20), nullable=True)  # 'success' | 'failed' | 'running'
    last_size = db.Column(db.BigInteger, nullable=True)
    last_cost_local = db.Column(db.Numeric(10, 4), nullable=True)
    last_cost_remote = db.Column(db.Numeric(10, 4), nullable=True)
    last_job_id = db.Column(db.String(36), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    runs = db.relationship(
        'BackupRun',
        backref='policy',
        lazy='dynamic',
        cascade='all, delete-orphan',
        order_by='BackupRun.started_at.desc()',
    )

    __table_args__ = (db.UniqueConstraint('target_type', 'target_id', name='uq_backup_policy_target'),)

    def to_dict(self):
        return {
            'id': self.id,
            'target_type': self.target_type,
            'target_id': self.target_id,
            'enabled': self.enabled,
            'schedule_cron': self.schedule_cron,
            'retention_count': self.retention_count,
            'retention_days': self.retention_days,
            'full_every_n_days': self.full_every_n_days,
            'compression': self.compression,
            'remote_copy': self.remote_copy,
            'pre_backup_hook': self.pre_backup_hook,
            'post_backup_hook': self.post_backup_hook,
            'last_run_at': self.last_run_at.isoformat() if self.last_run_at else None,
            'last_status': self.last_status,
            'last_size': self.last_size,
            'last_cost_local': _num(self.last_cost_local),
            'last_cost_remote': _num(self.last_cost_remote),
            'last_job_id': self.last_job_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f'<BackupPolicy {self.id} {self.target_type}:{self.target_id} enabled={self.enabled}>'
