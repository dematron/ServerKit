// The Connections catalog — the declarative source of truth for the integrations
// hub. Each provider belongs to a category and is either live (wired to a real
// backend) or `comingSoon` (shown so the hub reads as a complete surface rather
// than a one-provider page). Live providers map to one of two backends that
// already exist:
//   - kind 'github' → /source-connections   (per-user OAuth)
//   - kind 'dns'    → /email/dns-providers   (admin API-key configs: Cloudflare, Route 53)
//
// Keeping this as plain data (no JSX) lets ConnectionsHub render every category
// generically and makes adding a provider a one-line change.

export const CONNECTION_CATEGORIES = [
    { key: 'source', label: 'Source code', blurb: 'Create services straight from a repository instead of pasting clone URLs.' },
    { key: 'dns', label: 'DNS & domains', blurb: 'Let ServerKit manage DNS records and issue wildcard certificates automatically.' },
    { key: 'email', label: 'Email & delivery', blurb: 'Outbound relays and deliverability for the mail server.' },
    { key: 'storage', label: 'Storage & backups', blurb: 'Off-site destinations for backups and large assets.' },
];

export const CONNECTION_PROVIDERS = [
    {
        id: 'github', category: 'source', name: 'GitHub', kind: 'github',
        blurb: 'List repositories over the GitHub API and import selected branches.',
        docUrl: 'https://github.com/settings/developers',
    },
    {
        id: 'cloudflare', category: 'dns', name: 'Cloudflare', kind: 'dns', provider: 'cloudflare',
        supportsScope: true,
        blurb: 'Auto-create DNS records and wildcard TLS for the domains you manage.',
        docUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    },
    {
        id: 'route53', category: 'dns', name: 'Route 53', kind: 'dns', provider: 'route53',
        blurb: 'Manage records in AWS hosted zones with an access-key pair.',
        docUrl: 'https://console.aws.amazon.com/iam/home#/security_credentials',
    },
    { id: 'gitlab', category: 'source', name: 'GitLab', comingSoon: true, blurb: 'Cloud or self-managed GitLab repositories.' },
    { id: 'digitalocean', category: 'dns', name: 'DigitalOcean DNS', comingSoon: true, blurb: 'Manage records in DigitalOcean-hosted domains.' },
    { id: 'smtp', category: 'email', name: 'SMTP relay', comingSoon: true, blurb: 'Send outbound mail through a provider like Postmark or SES.' },
    { id: 's3', category: 'storage', name: 'S3 / object storage', comingSoon: true, blurb: 'Stream backups to any S3-compatible bucket.' },
];

export function getProvider(id) {
    return CONNECTION_PROVIDERS.find((p) => p.id === id) || null;
}

// Access-level ("scope") derivation — the heart of the connect experience. A
// Cloudflare config authenticated with an account email uses a Global API Key
// (full account); without one it's a least-privilege scoped token. Route 53
// access keys derive their scope from the attached IAM policy, which we can't
// introspect, so we label them neutrally. Returns { label, tone, hint } or null.
export function deriveScope(record) {
    if (!record) return null;
    if (record.provider === 'cloudflare') {
        return record.api_email
            ? { label: 'Global key', tone: 'warn', hint: 'Full account access' }
            : { label: 'Scoped token', tone: 'ok', hint: 'Least privilege' };
    }
    if (record.provider === 'route53') {
        return { label: 'Access key', tone: 'neutral', hint: 'Scope set by IAM policy' };
    }
    return null;
}

// Collapse a list of scope descriptors to unique labels so a card with three
// scoped tokens shows one "Scoped token" chip, not three.
export function dedupeScopes(scopes) {
    const seen = new Set();
    const out = [];
    for (const s of scopes) {
        if (!s || seen.has(s.label)) continue;
        seen.add(s.label);
        out.push(s);
    }
    return out;
}
