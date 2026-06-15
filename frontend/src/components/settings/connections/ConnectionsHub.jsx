// Connections hub — the Settings → Connections tab. Presents every external
// integration ServerKit can bridge to, grouped by category, over a single
// surface. It composes two backends that already exist instead of inventing a
// new one:
//   - GitHub      → /source-connections        (per-user OAuth)
//   - Cloudflare,
//     Route 53    → /email/dns-providers        (admin API-key configs)
// Each connected provider shows its access level ("scope") so you can see at a
// glance whether ServerKit holds a least-privilege token or a full-account key.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2 } from 'lucide-react';
import api from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';
import {
    CONNECTION_CATEGORIES, CONNECTION_PROVIDERS, deriveScope, dedupeScopes,
} from './providerCatalog';
import ProviderCard from './ProviderCard';
import ConnectProviderModal from './ConnectProviderModal';

export default function ConnectionsHub() {
    const { isAdmin } = useAuth();
    const toast = useToast();

    const [githubStatus, setGithubStatus] = useState(null);
    const [githubConfig, setGithubConfig] = useState(null);
    const [dnsProviders, setDnsProviders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalProvider, setModalProvider] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);

    const loadData = useCallback(async () => {
        try {
            const [status, dns] = await Promise.all([
                api.getGithubSourceStatus().catch(() => null),
                api.getEmailDNSProviders().then((d) => d.providers || []).catch(() => []),
            ]);
            setGithubStatus(status);
            setDnsProviders(dns);
            if (isAdmin) {
                const cfg = await api.getGithubSourceConfig().catch(() => null);
                setGithubConfig(cfg?.config || { client_id: '', client_secret: '' });
            }
        } finally {
            setLoading(false);
        }
    }, [isAdmin]);

    useEffect(() => { loadData(); }, [loadData]);

    const refreshDns = useCallback(async () => {
        const d = await api.getEmailDNSProviders().then((r) => r.providers || []).catch(() => []);
        setDnsProviders(d);
    }, []);

    // ── Handlers (return truthy on success so the modal can reset its form) ──

    const onConnectGithub = useCallback(async () => {
        try {
            const redirectUri = `${window.location.origin}/connections/callback/github`;
            sessionStorage.setItem('sourceConnectionReturnTo', '/settings/connections');
            const { auth_url } = await api.startSourceConnection('github', redirectUri);
            window.location.href = auth_url;
        } catch (err) {
            toast.error(err.message || 'Failed to start GitHub connection');
        }
    }, [toast]);

    const onDisconnectGithub = useCallback(async () => {
        try {
            await api.disconnectSourceConnection('github');
            toast.success('GitHub disconnected');
            const status = await api.getGithubSourceStatus().catch(() => null);
            setGithubStatus(status);
            setModalOpen(false);
        } catch (err) {
            toast.error(err.message || 'Failed to disconnect GitHub');
        }
    }, [toast]);

    const onSaveGithubConfig = useCallback(async (config) => {
        try {
            const result = await api.updateGithubSourceConfig(config);
            setGithubConfig(result.config || config);
            const status = await api.getGithubSourceStatus().catch(() => null);
            setGithubStatus(status);
            toast.success('GitHub OAuth app saved');
            return true;
        } catch (err) {
            toast.error(err.message || 'Failed to save GitHub OAuth app');
            return false;
        }
    }, [toast]);

    const onAddDns = useCallback(async (payload) => {
        try {
            const res = await api.addEmailDNSProvider(payload);
            if (res && res.success === false) throw new Error(res.error || 'Failed to add connection');
            toast.success(`${payload.name} connected`);
            await refreshDns();
            return true;
        } catch (err) {
            toast.error(err.message || 'Failed to add connection');
            return false;
        }
    }, [toast, refreshDns]);

    const onRemoveDns = useCallback(async (record) => {
        if (!window.confirm(`Remove the connection "${record.name}"?`)) return false;
        try {
            await api.deleteEmailDNSProvider(record.id);
            toast.success(`${record.name} removed`);
            await refreshDns();
            return true;
        } catch (err) {
            toast.error(err.message || 'Failed to remove connection');
            return false;
        }
    }, [toast, refreshDns]);

    const onTestDns = useCallback(async (id) => {
        try {
            const res = await api.testEmailDNSProvider(id);
            if (res && res.success) toast.success(res.message || 'Connection works');
            else toast.error((res && res.error) || 'Connection test failed');
            return res;
        } catch (err) {
            toast.error(err.message || 'Connection test failed');
            return null;
        }
    }, [toast]);

    // ── Per-provider summaries for the cards ──

    const summaries = useMemo(() => {
        const dnsSummary = (providerKey) => {
            const list = dnsProviders.filter((p) => p.provider === providerKey);
            if (!list.length) return { connected: false, statusLabel: 'Not connected', statusTone: 'neutral', scopes: [] };
            return {
                connected: true,
                statusLabel: list.length === 1 ? 'Connected' : `${list.length} connected`,
                statusTone: 'ok',
                subtitle: list.map((p) => p.name).join(', '),
                scopes: dedupeScopes(list.map(deriveScope).filter(Boolean)),
            };
        };

        const ghConn = githubStatus?.connection;
        return {
            github: ghConn
                ? {
                    connected: true, statusLabel: 'Connected', statusTone: 'ok',
                    subtitle: ghConn.provider_username ? `@${ghConn.provider_username}` : (ghConn.display_name || null),
                    scopes: [{ label: 'OAuth', tone: 'neutral', hint: ghConn.scope || 'Authorized via OAuth' }],
                }
                : { connected: false, statusLabel: githubStatus?.configured ? 'Not connected' : 'Setup needed', statusTone: 'neutral', scopes: [] },
            cloudflare: dnsSummary('cloudflare'),
            route53: dnsSummary('route53'),
        };
    }, [githubStatus, dnsProviders]);

    function handleManage(provider) {
        setModalProvider(provider);
        setModalOpen(true);
    }

    const connectedCount = (summaries.github.connected ? 1 : 0) + dnsProviders.length;

    return (
        <div className="connections-hub">
            <div className="connections-hub__intro">
                <span className="connections-hub__intro-icon"><Link2 size={20} /></span>
                <div className="connections-hub__intro-text">
                    <h2>Connections</h2>
                    <p>Bridge ServerKit to the services you already use — source hosts, DNS providers, mail and storage. {connectedCount > 0 ? `${connectedCount} active.` : 'Nothing connected yet.'}</p>
                </div>
            </div>

            {loading ? (
                <div className="connections-hub__loading">Loading connections…</div>
            ) : (
                CONNECTION_CATEGORIES.map((cat) => {
                    const providers = CONNECTION_PROVIDERS.filter((p) => p.category === cat.key);
                    if (!providers.length) return null;
                    return (
                        <section key={cat.key} className="connections-hub__category">
                            <header className="connections-hub__category-head">
                                <h3>{cat.label}</h3>
                                <p>{cat.blurb}</p>
                            </header>
                            <div className="connections-hub__grid">
                                {providers.map((provider) => (
                                    <ProviderCard
                                        key={provider.id}
                                        provider={provider}
                                        summary={summaries[provider.id]}
                                        onManage={handleManage}
                                    />
                                ))}
                            </div>
                        </section>
                    );
                })
            )}

            <ConnectProviderModal
                provider={modalProvider}
                open={modalOpen}
                onOpenChange={setModalOpen}
                githubStatus={githubStatus}
                githubConfig={githubConfig}
                dnsProviders={dnsProviders}
                isAdmin={isAdmin}
                onConnectGithub={onConnectGithub}
                onDisconnectGithub={onDisconnectGithub}
                onSaveGithubConfig={onSaveGithubConfig}
                onAddDns={onAddDns}
                onRemoveDns={onRemoveDns}
                onTestDns={onTestDns}
            />
        </div>
    );
}
