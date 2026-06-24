// Managed reverse-proxy stack (opt-in Traefik/Caddy as a Compose stack).
// Host nginx stays the default. Mounted by the backend at /api/v1/servers,
// so paths are /servers/<id>/proxy*.

export async function getServerProxy(serverId) {
    return this.request(`/servers/${serverId}/proxy`);
}

// Fleet-wide proxy posture: one row per server. Returns { servers: [...] }.
// Backed by GET /api/v1/servers/proxy/overview (a static prefix that never
// collides with the per-server /servers/<id>/proxy route).
export async function getFleetProxyOverview() {
    return this.request('/servers/proxy/overview');
}

export async function getServerProxyComposePreview(serverId, options = {}) {
    const params = new URLSearchParams();
    if (options.proxyType) params.set('proxy_type', options.proxyType);
    if (options.acmeEmail) params.set('acme_email', options.acmeEmail);
    if (options.dashboard) params.set('dashboard', '1');
    const qs = params.toString();
    return this.request(`/servers/${serverId}/proxy/compose-preview${qs ? `?${qs}` : ''}`);
}

export async function configureServerProxy(serverId, data) {
    return this.request(`/servers/${serverId}/proxy/configure`, {
        method: 'POST',
        body: data,
    });
}

export async function regenerateServerProxy(serverId, data = {}) {
    return this.request(`/servers/${serverId}/proxy/regenerate`, {
        method: 'POST',
        body: data,
    });
}

export async function switchServerProxy(serverId, proxyType) {
    return this.request(`/servers/${serverId}/proxy/switch`, {
        method: 'POST',
        body: { proxy_type: proxyType },
    });
}
