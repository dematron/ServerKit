import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '@/components/ui/button';
import { Pill } from '../ds';
import { CheckCircle2, Loader2, Circle, XCircle, RotateCw, Clock } from 'lucide-react';

// The canonical ordered lifecycle steps. The backend returns the same list in
// `status.states`, but we keep a labeled copy so the wizard renders before the
// first poll resolves.
const STEPS = [
    { id: 'validating', label: 'Validate', description: 'Check server details & compatibility' },
    { id: 'installing_prerequisites', label: 'Prerequisites', description: 'Install base packages' },
    { id: 'installing_docker', label: 'Docker', description: 'Ensure Docker is available' },
    { id: 'pairing_agent', label: 'Pair Agent', description: 'Connect the management agent' },
    { id: 'ready', label: 'Ready', description: 'Server is provisioned' },
];

// Active (non-terminal) states that mean "still working".
const IN_FLIGHT = new Set([
    'validating',
    'installing_prerequisites',
    'installing_docker',
    'pairing_agent',
]);

// Map a step's position relative to the current state to a visual status.
function stepStatus(stepId, currentState) {
    if (currentState === 'failed') {
        // On failure, lean on the per-step failed log row (computed by the
        // caller) to mark the failed step; everything else stays pending here.
        return 'pending';
    }
    const currentIdx = STEPS.findIndex((s) => s.id === currentState);
    const stepIdx = STEPS.findIndex((s) => s.id === stepId);
    if (currentState === 'ready') return 'done';
    if (stepIdx < currentIdx) return 'done';
    if (stepIdx === currentIdx) return IN_FLIGHT.has(currentState) ? 'active' : 'done';
    return 'pending';
}

const STEP_ICON = {
    done: CheckCircle2,
    active: Loader2,
    failed: XCircle,
    pending: Circle,
};

// Format an elapsed duration (ms) as a compact "1m 12s" / "8s" string.
function formatElapsed(ms) {
    if (ms == null || ms < 0) return '0s';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

// Short HH:MM:SS clock for a log row's created_at timestamp.
function formatLogTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour12: false });
}

/**
 * OnboardingWizard — presentational + polling view of a server's onboarding
 * lifecycle. Shows the ordered steps with per-step status icons, a live
 * auto-scrolling log trail, elapsed time, and a Retry button on failure.
 *
 * Props:
 *   serverId        — required
 *   initialState    — optional onboarding_state from the parent's server payload
 *   onStateChange   — optional callback(newState) when polling sees a change
 */
const OnboardingWizard = ({ serverId, initialState, onStateChange }) => {
    const toast = useToast();
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [retrying, setRetrying] = useState(false);
    // `now` ticks once a second so the elapsed timer stays live while polling.
    const [now, setNow] = useState(() => Date.now());
    const lastStateRef = useRef(initialState || null);
    const logTrailRef = useRef(null);

    const loadStatus = useCallback(async () => {
        try {
            const data = await api.getServerOnboardingStatus(serverId);
            setStatus(data);
            if (data?.state && data.state !== lastStateRef.current) {
                lastStateRef.current = data.state;
                onStateChange?.(data.state);
            }
        } catch (err) {
            // Onboarding may not have started yet — keep quiet, the parent
            // decides whether to render us at all.
            console.error('Failed to load onboarding status:', err);
        } finally {
            setLoading(false);
        }
    }, [serverId, onStateChange]);

    useEffect(() => {
        loadStatus();
    }, [loadStatus]);

    // Poll while onboarding is in flight; stop once terminal.
    useEffect(() => {
        if (!status) return undefined;
        if (status.is_terminal) return undefined;
        const interval = setInterval(loadStatus, 3000);
        return () => clearInterval(interval);
    }, [status, loadStatus]);

    // Keep the elapsed timer ticking only while non-terminal.
    useEffect(() => {
        if (!status || status.is_terminal) return undefined;
        const tick = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(tick);
    }, [status]);

    async function handleRetry() {
        setRetrying(true);
        try {
            const data = await api.retryServerOnboarding(serverId);
            setStatus(data);
            lastStateRef.current = data?.state || lastStateRef.current;
            toast.success('Retrying onboarding');
            loadStatus();
        } catch (err) {
            toast.error(err.message || 'Failed to retry onboarding');
        } finally {
            setRetrying(false);
        }
    }

    const state = status?.state || initialState || 'pending';
    const failed = state === 'failed';
    const ready = state === 'ready';
    const progress = useMemo(() => status?.progress || [], [status]);

    // Group log messages by step so each step row can show its own trail.
    const logsByState = progress.reduce((acc, row) => {
        (acc[row.state] = acc[row.state] || []).push(row);
        return acc;
    }, {});

    // The failure message, if any, for the header banner.
    const failureLog = failed
        ? [...progress].reverse().find((r) => r.status === 'failed')
        : null;

    // Elapsed time from the first to the last (or current) log entry.
    const elapsed = useMemo(() => {
        if (progress.length === 0) return null;
        const firstTs = new Date(progress[0].created_at).getTime();
        if (Number.isNaN(firstTs)) return null;
        const endTs = (status?.is_terminal && status?.updated_at)
            ? new Date(status.updated_at).getTime()
            : now;
        return endTs - firstTs;
    }, [progress, status, now]);

    // Auto-scroll the live log trail to the bottom as new rows arrive.
    useEffect(() => {
        const el = logTrailRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [progress.length]);

    const headerPillKind = failed ? 'red' : ready ? 'green' : 'amber';
    const headerLabel = failed ? 'Failed' : ready ? 'Ready' : 'In progress';

    return (
        <div className="onboarding-wizard">
            <div className="onboarding-wizard__header">
                <div className="onboarding-wizard__title">
                    <h3>Server Onboarding</h3>
                    <Pill kind={headerPillKind}>{headerLabel}</Pill>
                    {elapsed != null && (
                        <span className="onboarding-wizard__elapsed">
                            <Clock size={13} />
                            {formatElapsed(elapsed)}
                        </span>
                    )}
                </div>
                {failed && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRetry}
                        disabled={retrying}
                    >
                        <RotateCw size={14} />
                        {retrying ? 'Retrying…' : 'Retry'}
                    </Button>
                )}
            </div>

            {failureLog && (
                <div className="onboarding-wizard__error">
                    <XCircle size={16} />
                    <span>{failureLog.message || 'Onboarding failed'}</span>
                </div>
            )}

            <ol className="onboarding-wizard__steps">
                {STEPS.map((step) => {
                    // A step is "failed" if it has a failed log row and we're in
                    // the failed terminal state.
                    const stepLogs = logsByState[step.id] || [];
                    const hasFailedLog = stepLogs.some((l) => l.status === 'failed');
                    const visual = failed && hasFailedLog
                        ? 'failed'
                        : stepStatus(step.id, state);
                    const Icon = STEP_ICON[visual] || Circle;

                    return (
                        <li
                            key={step.id}
                            className={`onboarding-wizard__step onboarding-wizard__step--${visual}`}
                        >
                            <span className="onboarding-wizard__step-icon">
                                <Icon
                                    size={18}
                                    className={visual === 'active' ? 'onboarding-wizard__spin' : ''}
                                />
                            </span>
                            <div className="onboarding-wizard__step-body">
                                <div className="onboarding-wizard__step-head">
                                    <span className="onboarding-wizard__step-label">{step.label}</span>
                                </div>
                                <p className="onboarding-wizard__step-desc">{step.description}</p>
                            </div>
                        </li>
                    );
                })}
            </ol>

            {progress.length > 0 && (
                <div className="onboarding-wizard__trail">
                    <div className="onboarding-wizard__trail-head">Activity log</div>
                    <ul
                        ref={logTrailRef}
                        className="onboarding-wizard__trail-list"
                        aria-live="polite"
                    >
                        {progress.map((log) => (
                            <li
                                key={log.id}
                                className={`onboarding-wizard__trail-row onboarding-wizard__trail-row--${log.status}`}
                            >
                                <span className="onboarding-wizard__trail-time">
                                    {formatLogTime(log.created_at)}
                                </span>
                                <span className="onboarding-wizard__trail-msg">
                                    {log.message || log.status}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {loading && !status && (
                <p className="onboarding-wizard__loading">Loading onboarding status…</p>
            )}
        </div>
    );
};

export default OnboardingWizard;
