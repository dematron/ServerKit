import logging
import re
import socket
import time
from datetime import datetime, timedelta
from app import db
from app.models.status_page import (
    StatusPage, StatusComponent, HealthCheck, StatusIncident, StatusIncidentUpdate
)

logger = logging.getLogger(__name__)


class StatusPageService:
    """Service for public status pages and automated health checks."""

    SLUG_PATTERN = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')

    @staticmethod
    def normalize_slug(value):
        slug = (value or '').strip().lower()
        slug = re.sub(r'[\s_]+', '-', slug)
        slug = re.sub(r'[^a-z0-9-]', '', slug)
        slug = re.sub(r'-{2,}', '-', slug).strip('-')
        if not slug:
            raise ValueError('Slug is required')
        if not StatusPageService.SLUG_PATTERN.match(slug):
            raise ValueError('Slug can only contain lowercase letters, numbers, and hyphens')
        return slug

    # --- Pages ---

    @staticmethod
    def list_pages():
        return StatusPage.query.order_by(StatusPage.name).all()

    @staticmethod
    def get_page(page_id):
        return StatusPage.query.get(page_id)

    @staticmethod
    def get_page_by_slug(slug):
        return StatusPage.query.filter_by(slug=slug).first()

    @staticmethod
    def create_page(data):
        slug = StatusPageService.normalize_slug(data.get('slug'))
        if StatusPage.query.filter_by(slug=slug).first():
            raise ValueError(f"Status page '{slug}' already exists")

        page = StatusPage(
            name=data['name'],
            slug=slug,
            description=data.get('description', ''),
            logo_url=data.get('logo_url'),
            primary_color=data.get('primary_color', '#4f46e5'),
            custom_domain=data.get('custom_domain'),
            is_public=data.get('is_public', True),
            show_uptime=data.get('show_uptime', True),
            show_history=data.get('show_history', True),
        )
        db.session.add(page)
        db.session.commit()
        return page

    @staticmethod
    def update_page(page_id, data):
        page = StatusPage.query.get(page_id)
        if not page:
            return None
        for field in ['name', 'description', 'logo_url', 'primary_color',
                      'custom_domain', 'is_public', 'show_uptime', 'show_history']:
            if field in data:
                setattr(page, field, data[field])
        db.session.commit()
        return page

    @staticmethod
    def delete_page(page_id):
        page = StatusPage.query.get(page_id)
        if not page:
            return False
        db.session.delete(page)
        db.session.commit()
        return True

    @staticmethod
    def get_public_page(slug):
        """Get public status page data (no auth required)."""
        page = StatusPage.query.filter_by(slug=slug, is_public=True).first()
        if not page:
            return None

        components = page.components.all()
        grouped = {}
        for comp in components:
            group = comp.group or 'Services'
            grouped.setdefault(group, []).append(comp.to_dict())

        # Active incidents
        active_incidents = page.incidents.filter(
            StatusIncident.status != 'resolved'
        ).limit(10).all()

        # Recent resolved
        resolved = page.incidents.filter_by(status='resolved').limit(5).all()

        # Overall status
        statuses = [c.status for c in components]
        if any(s == 'major_outage' for s in statuses):
            overall = 'major_outage'
        elif any(s in ('partial_outage', 'degraded') for s in statuses):
            overall = 'degraded'
        elif any(s == 'maintenance' for s in statuses):
            overall = 'maintenance'
        else:
            overall = 'operational'

        return {
            'page': page.to_dict(),
            'overall_status': overall,
            'groups': grouped,
            'active_incidents': [i.to_dict() for i in active_incidents],
            'recent_incidents': [i.to_dict() for i in resolved],
        }

    # --- Components ---

    @staticmethod
    def create_component(page_id, data):
        page = StatusPage.query.get(page_id)
        if not page:
            raise ValueError('Status page not found')

        comp = StatusComponent(
            page_id=page_id,
            name=data['name'],
            description=data.get('description', ''),
            group=data.get('group', 'Services'),
            sort_order=data.get('sort_order', 0),
            check_type=data.get('check_type', 'http'),
            check_target=data.get('check_target', ''),
            check_interval=data.get('check_interval', 60),
            check_timeout=data.get('check_timeout', 10),
        )
        db.session.add(comp)
        db.session.commit()
        return comp

    @staticmethod
    def update_component(comp_id, data):
        comp = StatusComponent.query.get(comp_id)
        if not comp:
            return None
        for field in ['name', 'description', 'group', 'sort_order', 'check_type',
                      'check_target', 'check_interval', 'check_timeout', 'status']:
            if field in data:
                setattr(comp, field, data[field])
        db.session.commit()
        return comp

    @staticmethod
    def delete_component(comp_id):
        comp = StatusComponent.query.get(comp_id)
        if not comp:
            return False
        db.session.delete(comp)
        db.session.commit()
        return True

    # --- Health Checks ---

    @staticmethod
    def run_check(component_id):
        """Run a health check for a component."""
        comp = StatusComponent.query.get(component_id)
        if not comp:
            return None

        check_result = StatusPageService._perform_check(comp)

        hc = HealthCheck(
            component_id=component_id,
            status=check_result['status'],
            response_time=check_result.get('response_time'),
            status_code=check_result.get('status_code'),
            error=check_result.get('error'),
        )
        db.session.add(hc)

        # Update component
        comp.last_check_at = datetime.utcnow()
        comp.last_response_time = check_result.get('response_time')
        if check_result['status'] == 'up':
            comp.status = StatusComponent.STATUS_OPERATIONAL
        elif check_result['status'] == 'degraded':
            comp.status = StatusComponent.STATUS_DEGRADED
        else:
            comp.status = StatusComponent.STATUS_MAJOR

        db.session.commit()
        return hc

    @staticmethod
    def _perform_check(comp):
        """Execute the actual health check."""
        start = time.time()
        result = {'status': 'down', 'response_time': None, 'error': None}

        try:
            if comp.check_type == 'http':
                import requests
                resp = requests.get(comp.check_target, timeout=comp.check_timeout, verify=True)
                result['response_time'] = int((time.time() - start) * 1000)
                result['status_code'] = resp.status_code
                if resp.status_code < 400:
                    result['status'] = 'up'
                elif resp.status_code < 500:
                    result['status'] = 'degraded'
                else:
                    result['status'] = 'down'

            elif comp.check_type == 'tcp':
                host, port = comp.check_target.rsplit(':', 1)
                sock = socket.create_connection((host, int(port)), timeout=comp.check_timeout)
                result['response_time'] = int((time.time() - start) * 1000)
                result['status'] = 'up'
                sock.close()

            elif comp.check_type == 'ping':
                from app.utils.system import run_command
                res = run_command(['ping', '-c', '1', '-W', str(comp.check_timeout), comp.check_target])
                result['response_time'] = int((time.time() - start) * 1000)
                result['status'] = 'up'

            elif comp.check_type == 'dns':
                socket.getaddrinfo(comp.check_target, None)
                result['response_time'] = int((time.time() - start) * 1000)
                result['status'] = 'up'

        except Exception as e:
            result['response_time'] = int((time.time() - start) * 1000)
            result['error'] = str(e)

        return result

    @staticmethod
    def get_check_history(component_id, hours=24):
        since = datetime.utcnow() - timedelta(hours=hours)
        return HealthCheck.query.filter(
            HealthCheck.component_id == component_id,
            HealthCheck.checked_at >= since
        ).order_by(HealthCheck.checked_at.desc()).all()

    # --- Incidents ---

    @staticmethod
    def create_incident(page_id, data):
        incident = StatusIncident(
            page_id=page_id,
            title=data['title'],
            status=data.get('status', 'investigating'),
            impact=data.get('impact', 'minor'),
            body=data.get('body', ''),
            is_maintenance=data.get('is_maintenance', False),
            scheduled_start=data.get('scheduled_start'),
            scheduled_end=data.get('scheduled_end'),
        )
        db.session.add(incident)
        db.session.commit()
        return incident

    @staticmethod
    def update_incident(incident_id, data):
        incident = StatusIncident.query.get(incident_id)
        if not incident:
            return None
        for field in ['title', 'status', 'impact', 'body']:
            if field in data:
                setattr(incident, field, data[field])
        if data.get('status') == 'resolved':
            incident.resolved_at = datetime.utcnow()

        # Add timeline update
        if data.get('update_body'):
            update = StatusIncidentUpdate(
                incident_id=incident_id,
                status=data.get('status', incident.status),
                body=data['update_body'],
            )
            db.session.add(update)

        db.session.commit()
        return incident

    @staticmethod
    def delete_incident(incident_id):
        incident = StatusIncident.query.get(incident_id)
        if not incident:
            return False
        db.session.delete(incident)
        db.session.commit()
        return True

    @staticmethod
    def get_badge(slug):
        """Generate status badge data."""
        page = StatusPage.query.filter_by(slug=slug).first()
        if not page:
            return None

        components = page.components.all()
        statuses = [c.status for c in components]

        if not statuses or all(s == 'operational' for s in statuses):
            return {'label': 'status', 'message': 'operational', 'color': 'brightgreen'}
        elif any(s == 'major_outage' for s in statuses):
            return {'label': 'status', 'message': 'major outage', 'color': 'red'}
        elif any(s in ('partial_outage', 'degraded') for s in statuses):
            return {'label': 'status', 'message': 'degraded', 'color': 'yellow'}
        else:
            return {'label': 'status', 'message': 'maintenance', 'color': 'blue'}
