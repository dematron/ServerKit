import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Info, X, Settings, ExternalLink } from 'lucide-react';
import api from '../services/api';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'serverkit_dismissed_notices';

const ICONS = {
    warning: AlertTriangle,
    info: Info,
    error: AlertTriangle,
};

function getDismissed() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function setDismissed(ids) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
        // ignore
    }
}

export default function SystemNotices() {
    const navigate = useNavigate();
    const [notices, setNotices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dismissed, setDismissedState] = useState(getDismissed);

    const load = useCallback(async () => {
        try {
            const data = await api.getSystemNotices();
            setNotices(data?.notices || []);
        } catch (err) {
            // Non-admin or endpoint error — hide silently.
            setNotices([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const handleDismiss = (id) => {
        const next = [...dismissed, id];
        setDismissedState(next);
        setDismissed(next);
    };

    const handleAction = (notice) => {
        if (notice.action_path?.startsWith('http')) {
            window.open(notice.action_path, '_blank', 'noopener,noreferrer');
        } else if (notice.action_path) {
            navigate(notice.action_path);
        }
    };

    if (loading || notices.length === 0) return null;

    const visible = notices.filter((n) => !dismissed.includes(n.id));
    if (visible.length === 0) return null;

    return (
        <div className="system-notices" role="region" aria-label="System notices">
            {visible.map((notice) => {
                const Icon = ICONS[notice.level] || Info;
                return (
                    <div
                        key={notice.id}
                        className={`system-notice system-notice--${notice.level}`}
                        role="alert"
                    >
                        <span className="system-notice__icon" aria-hidden="true">
                            <Icon size={18} />
                        </span>
                        <div className="system-notice__body">
                            <div className="system-notice__title">{notice.title}</div>
                            <div className="system-notice__message">{notice.message}</div>
                        </div>
                        <div className="system-notice__actions">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="system-notice__action"
                                onClick={() => handleAction(notice)}
                            >
                                {notice.action_label || 'Fix'}
                                {notice.action_path?.startsWith('http') ? (
                                    <ExternalLink size={13} />
                                ) : (
                                    <Settings size={13} />
                                )}
                            </Button>
                            <button
                                type="button"
                                className="system-notice__dismiss"
                                onClick={() => handleDismiss(notice.id)}
                                aria-label={`Dismiss ${notice.title}`}
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
