"""Domain-registrar portfolio service.

Connects to registrar APIs (GoDaddy today; Namecheap is a planned addition) to
answer the question "what domains do I own and when do they expire?" — the data
that powers the Connections → Registrars cards and the Domains-page portfolio.

Credentials live on RegistrarConnection rows, Fernet-encrypted. The public
methods return plain dicts so the API layer can jsonify them directly.
"""

import logging
from datetime import datetime, timezone

import requests

from app import db
from app.models.registrar_connection import RegistrarConnection
from app.utils.crypto import encrypt_secret, decrypt_secret

logger = logging.getLogger(__name__)


class RegistrarService:
    # Only providers we can fully read are listed here; the connect form is
    # gated on this. Namecheap (XML API + IP allow-listing) is intentionally
    # left out until implemented, and shown as "coming soon" in the catalog.
    SUPPORTED = {
        'godaddy': {'name': 'GoDaddy', 'fields': ['api_key', 'api_secret']},
    }

    GODADDY_BASE = 'https://api.godaddy.com/v1'

    # --- Connections (CRUD) ---

    @staticmethod
    def list_connections():
        return RegistrarConnection.query.order_by(RegistrarConnection.created_at.desc()).all()

    @staticmethod
    def get_connection(cid):
        return RegistrarConnection.query.get(cid)

    @classmethod
    def add_connection(cls, data, user_id=None):
        provider = (data.get('provider') or '').lower().strip()
        if provider not in cls.SUPPORTED:
            raise ValueError(f'Unsupported registrar: {provider or "(none)"}')
        api_key = (data.get('api_key') or '').strip()
        api_secret = (data.get('api_secret') or '').strip()
        if not api_key or not api_secret:
            raise ValueError('api_key and api_secret are required')

        conn = RegistrarConnection(
            provider=provider,
            name=(data.get('name') or '').strip() or cls.SUPPORTED[provider]['name'],
            api_key_encrypted=encrypt_secret(api_key),
            api_secret_encrypted=encrypt_secret(api_secret),
            user_id=user_id,
        )
        db.session.add(conn)
        db.session.commit()
        return conn

    @staticmethod
    def delete_connection(cid):
        conn = RegistrarConnection.query.get(cid)
        if not conn:
            return False
        db.session.delete(conn)
        db.session.commit()
        return True

    @staticmethod
    def _creds(conn):
        return decrypt_secret(conn.api_key_encrypted), decrypt_secret(conn.api_secret_encrypted)

    # --- GoDaddy ---

    @classmethod
    def _godaddy_headers(cls, conn):
        key, secret = cls._creds(conn)
        return {'Authorization': f'sso-key {key}:{secret}', 'Accept': 'application/json'}

    @classmethod
    def _godaddy_list_domains(cls, conn):
        resp = requests.get(
            f'{cls.GODADDY_BASE}/domains',
            params={'limit': 1000, 'statuses': 'ACTIVE'},
            headers=cls._godaddy_headers(conn),
            timeout=20,
        )
        resp.raise_for_status()
        rows = resp.json() if isinstance(resp.json(), list) else []
        return [
            cls._normalize_domain(conn, {
                'domain': d.get('domain'),
                'status': d.get('status'),
                'expires': d.get('expires'),
                'auto_renew': d.get('renewAuto'),
                'locked': d.get('locked'),
                'nameservers': d.get('nameServers'),
                'created': d.get('createdAt'),
            })
            for d in rows
        ]

    # --- Public capability methods ---

    @classmethod
    def test_connection(cls, conn):
        try:
            if conn.provider == 'godaddy':
                resp = requests.get(
                    f'{cls.GODADDY_BASE}/domains', params={'limit': 1},
                    headers=cls._godaddy_headers(conn), timeout=15,
                )
                if resp.status_code == 200:
                    return {'success': True, 'message': 'GoDaddy connection works'}
                if resp.status_code in (401, 403):
                    return {'success': False, 'error': 'Access denied — check the API key/secret (must be a Production key, not OTE).'}
                return {'success': False, 'error': f'GoDaddy returned HTTP {resp.status_code}'}
            return {'success': False, 'error': f'Unsupported registrar: {conn.provider}'}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    @classmethod
    def list_domains(cls, conn):
        if conn.provider == 'godaddy':
            return cls._godaddy_list_domains(conn)
        return []

    @classmethod
    def list_all_domains(cls):
        """Aggregate every domain across all connected registrars, soonest-to-expire first."""
        domains = []
        for conn in cls.list_connections():
            try:
                domains.extend(cls.list_domains(conn))
            except Exception as e:
                logger.warning(f'Registrar {conn.id} ({conn.provider}) domain list failed: {e}')
        domains.sort(key=lambda d: (d.get('days_until_expiry') is None, d.get('days_until_expiry') if d.get('days_until_expiry') is not None else 0))
        return domains

    @classmethod
    def sync_now(cls):
        """Refresh the portfolio and stamp last_synced_at on every connection."""
        domains = cls.list_all_domains()
        now = datetime.utcnow()
        conns = cls.list_connections()
        for conn in conns:
            conn.last_synced_at = now
            # Surface the per-account domain count as the card subtitle.
            count = sum(1 for d in domains if d.get('connection_id') == conn.id)
            conn.account_label = f'{count} domain' + ('' if count == 1 else 's')
        db.session.commit()
        return domains

    # --- Helpers ---

    @staticmethod
    def _normalize_domain(conn, d):
        expires_raw = d.get('expires')
        expires_at = None
        days = None
        if expires_raw:
            try:
                dt = datetime.fromisoformat(str(expires_raw).replace('Z', '+00:00'))
                expires_at = dt
                if dt.tzinfo:
                    days = (dt - datetime.now(timezone.utc)).days
                else:
                    days = (dt - datetime.utcnow()).days
            except Exception:
                pass
        return {
            'domain': d.get('domain'),
            'registrar': conn.provider,
            'registrar_name': conn.name or conn.provider,
            'connection_id': conn.id,
            'status': d.get('status'),
            'expires_at': expires_at.isoformat() if expires_at else None,
            'days_until_expiry': days,
            'auto_renew': d.get('auto_renew'),
            'locked': d.get('locked'),
            'nameservers': d.get('nameservers') or [],
        }
