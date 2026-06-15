// The connect / manage dialog for a single provider. Switches on `provider.kind`:
//   - 'github' → per-user OAuth connect + (admin) OAuth-app credentials
//   - 'dns'    → list existing API-key connections + an add form. For Cloudflare
//                the add form leads with the access-level choice the user asked
//                for: a least-privilege scoped token vs a full-account global key.
import { useEffect, useState } from 'react';
import {
    CheckCircle2, ExternalLink, KeyRound, Link2, PlugZap, ShieldCheck, ShieldAlert, Trash2,
} from 'lucide-react';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProviderBrandIcon } from '../../icons/ProviderBrands';
import { deriveScope } from './providerCatalog';

const EMPTY_FORM = { name: '', api_key: '', api_secret: '', api_email: '' };

export default function ConnectProviderModal({
    provider, open, onOpenChange,
    githubStatus, githubConfig, dnsProviders, isAdmin,
    onConnectGithub, onDisconnectGithub, onSaveGithubConfig,
    onAddDns, onRemoveDns, onTestDns,
}) {
    const [cfMode, setCfMode] = useState('scoped'); // 'scoped' | 'global'
    const [form, setForm] = useState(EMPTY_FORM);
    const [ghConfig, setGhConfig] = useState({ client_id: '', client_secret: '' });
    const [busy, setBusy] = useState(false);

    // Reset form state whenever the dialog opens for a (possibly different) provider.
    useEffect(() => {
        if (!provider) return;
        setForm({ ...EMPTY_FORM, name: provider.name === 'Route 53' ? 'Route 53' : provider.name });
        setCfMode('scoped');
        setGhConfig({
            client_id: githubConfig?.client_id || '',
            client_secret: githubConfig?.client_secret || '',
        });
    }, [provider, githubConfig]);

    if (!provider) return null;

    const callbackUrl = `${window.location.origin}/connections/callback/github`;
    const isCloudflare = provider.provider === 'cloudflare';
    const isRoute53 = provider.provider === 'route53';
    const connections = (dnsProviders || []).filter((p) => p.provider === provider.provider);

    // Add-form validity per provider / access level.
    const canAdd = (() => {
        if (!form.api_key.trim()) return false;
        if (isCloudflare && cfMode === 'global' && !form.api_email.trim()) return false;
        if (isRoute53 && !form.api_secret.trim()) return false;
        return true;
    })();

    async function withBusy(fn) {
        setBusy(true);
        try { return await fn(); } finally { setBusy(false); }
    }

    async function handleSaveGh(e) {
        e.preventDefault();
        await withBusy(() => onSaveGithubConfig(ghConfig));
    }

    async function handleAddDns(e) {
        e.preventDefault();
        const base = { name: form.name.trim() || provider.name, provider: provider.provider, api_key: form.api_key.trim() };
        let payload = base;
        if (isCloudflare && cfMode === 'global') payload = { ...base, api_email: form.api_email.trim() };
        if (isRoute53) payload = { ...base, api_secret: form.api_secret.trim() };
        const ok = await withBusy(() => onAddDns(payload));
        if (ok) setForm({ ...EMPTY_FORM, name: provider.name === 'Route 53' ? 'Route 53' : provider.name });
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="conn-modal">
                <DialogHeader>
                    <div className="conn-modal__title">
                        <span className="conn-modal__icon"><ProviderBrandIcon provider={provider.id} size={22} /></span>
                        <div>
                            <DialogTitle>{provider.name}</DialogTitle>
                            <DialogDescription>{provider.blurb}</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="conn-modal__body">
                    {provider.kind === 'github' && (
                        <GithubBody
                            status={githubStatus} isAdmin={isAdmin} callbackUrl={callbackUrl}
                            ghConfig={ghConfig} setGhConfig={setGhConfig} busy={busy}
                            onConnect={onConnectGithub} onDisconnect={onDisconnectGithub} onSaveConfig={handleSaveGh}
                            docUrl={provider.docUrl}
                        />
                    )}

                    {provider.kind === 'dns' && (
                        <>
                            {connections.length > 0 && (
                                <div className="conn-list">
                                    {connections.map((c) => {
                                        const scope = deriveScope(c);
                                        return (
                                            <div key={c.id} className="conn-list__row">
                                                <div className="conn-list__info">
                                                    <strong>{c.name}</strong>
                                                    <span className="conn-list__key">{c.api_key}</span>
                                                </div>
                                                {scope && <span className={`conn-pill conn-pill--${scope.tone}`} title={scope.hint}>{scope.label}</span>}
                                                {isAdmin && (
                                                    <div className="conn-list__actions">
                                                        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => withBusy(() => onTestDns(c.id))}>Test</Button>
                                                        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => withBusy(() => onRemoveDns(c))} aria-label={`Remove ${c.name}`}><Trash2 size={15} /></Button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {!isAdmin ? (
                                <p className="conn-modal__note"><ShieldCheck size={15} /> Only administrators can add or change connections.</p>
                            ) : (
                                <form className="conn-form" onSubmit={handleAddDns}>
                                    <div className="conn-form__heading">{connections.length > 0 ? 'Add another connection' : 'Connect ' + provider.name}</div>

                                    {isCloudflare && (
                                        <div className="conn-scope" role="radiogroup" aria-label="Access level">
                                            <button type="button" className={`conn-scope__opt${cfMode === 'scoped' ? ' is-active' : ''}`} onClick={() => setCfMode('scoped')} role="radio" aria-checked={cfMode === 'scoped'}>
                                                <span className="conn-scope__head"><ShieldCheck size={16} /> Scoped token <span className="conn-scope__rec">Recommended</span></span>
                                                <span className="conn-scope__desc">A Cloudflare token limited to DNS:Edit on the zones you choose. ServerKit can only touch DNS.</span>
                                            </button>
                                            <button type="button" className={`conn-scope__opt${cfMode === 'global' ? ' is-active' : ''}`} onClick={() => setCfMode('global')} role="radio" aria-checked={cfMode === 'global'}>
                                                <span className="conn-scope__head"><ShieldAlert size={16} /> Global API key</span>
                                                <span className="conn-scope__desc">Your account email + global key. Simplest to set up, but grants full account access — we manage everything.</span>
                                            </button>
                                        </div>
                                    )}

                                    <div className="conn-form__grid">
                                        <div className="form-group">
                                            <Label htmlFor="conn-name">Connection name</Label>
                                            <Input id="conn-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={provider.name} />
                                        </div>

                                        {isCloudflare && cfMode === 'scoped' && (
                                            <div className="form-group conn-form__wide">
                                                <Label htmlFor="conn-token">API token</Label>
                                                <Input id="conn-token" type="password" value={form.api_key} onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))} placeholder="Cloudflare scoped API token" autoComplete="off" />
                                            </div>
                                        )}

                                        {isCloudflare && cfMode === 'global' && (
                                            <>
                                                <div className="form-group">
                                                    <Label htmlFor="conn-email">Account email</Label>
                                                    <Input id="conn-email" type="email" value={form.api_email} onChange={(e) => setForm((f) => ({ ...f, api_email: e.target.value }))} placeholder="you@example.com" autoComplete="off" />
                                                </div>
                                                <div className="form-group">
                                                    <Label htmlFor="conn-key">Global API key</Label>
                                                    <Input id="conn-key" type="password" value={form.api_key} onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))} placeholder="Cloudflare global API key" autoComplete="off" />
                                                </div>
                                            </>
                                        )}

                                        {isRoute53 && (
                                            <>
                                                <div className="form-group">
                                                    <Label htmlFor="conn-akid">Access key ID</Label>
                                                    <Input id="conn-akid" value={form.api_key} onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))} placeholder="AKIA…" autoComplete="off" />
                                                </div>
                                                <div className="form-group">
                                                    <Label htmlFor="conn-secret">Secret access key</Label>
                                                    <Input id="conn-secret" type="password" value={form.api_secret} onChange={(e) => setForm((f) => ({ ...f, api_secret: e.target.value }))} placeholder="Secret access key" autoComplete="off" />
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {provider.docUrl && (
                                        <a className="conn-form__doc" href={provider.docUrl} target="_blank" rel="noreferrer">
                                            <ExternalLink size={13} /> Where do I get this?
                                        </a>
                                    )}

                                    <div className="conn-form__actions">
                                        <Button type="submit" size="sm" disabled={busy || !canAdd}>
                                            {busy ? 'Connecting…' : 'Connect'}
                                        </Button>
                                    </div>
                                </form>
                            )}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

function GithubBody({ status, isAdmin, callbackUrl, ghConfig, setGhConfig, busy, onConnect, onDisconnect, onSaveConfig, docUrl }) {
    const connection = status?.connection;
    const configured = status?.configured;

    return (
        <>
            {connection ? (
                <div className="conn-profile">
                    {connection.avatar_url && <img src={connection.avatar_url} alt="" />}
                    <div className="conn-profile__id">
                        <strong>{connection.display_name || connection.provider_username}</strong>
                        <span>@{connection.provider_username}</span>
                    </div>
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onDisconnect}>
                        <Trash2 size={15} /> Disconnect
                    </Button>
                </div>
            ) : (
                <div className="conn-empty">
                    <span className="conn-empty__icon"><Link2 size={18} /></span>
                    <div className="conn-empty__text">
                        <strong>{configured ? 'Connect your GitHub account' : 'GitHub OAuth is not configured yet'}</strong>
                        <span>{configured
                            ? 'Authorize ServerKit once, then pick repositories directly on the New Service page.'
                            : 'An admin needs to add an OAuth app below before anyone can connect.'}</span>
                    </div>
                    <Button type="button" size="sm" disabled={!configured || busy} onClick={onConnect}>
                        <PlugZap size={15} /> Connect GitHub
                    </Button>
                </div>
            )}

            {isAdmin && (
                <form className="conn-form" onSubmit={onSaveConfig}>
                    <div className="conn-form__heading"><KeyRound size={15} /> OAuth app credentials</div>
                    <div className="conn-form__grid">
                        <div className="form-group">
                            <Label htmlFor="gh-client-id">Client ID</Label>
                            <Input id="gh-client-id" value={ghConfig.client_id} onChange={(e) => setGhConfig((c) => ({ ...c, client_id: e.target.value }))} placeholder="GitHub OAuth client ID" autoComplete="off" />
                        </div>
                        <div className="form-group">
                            <Label htmlFor="gh-client-secret">Client Secret</Label>
                            <Input id="gh-client-secret" type="password" value={ghConfig.client_secret} onChange={(e) => setGhConfig((c) => ({ ...c, client_secret: e.target.value }))} placeholder="GitHub OAuth client secret" autoComplete="off" />
                        </div>
                    </div>
                    <div className="conn-form__callback">
                        <CheckCircle2 size={14} /> Callback URL: <code>{callbackUrl}</code>
                    </div>
                    {docUrl && (
                        <a className="conn-form__doc" href={docUrl} target="_blank" rel="noreferrer">
                            <ExternalLink size={13} /> Create an OAuth app on GitHub
                        </a>
                    )}
                    <div className="conn-form__actions">
                        <Button type="submit" size="sm" disabled={busy}>{busy ? 'Saving…' : 'Save OAuth app'}</Button>
                    </div>
                </form>
            )}
        </>
    );
}
