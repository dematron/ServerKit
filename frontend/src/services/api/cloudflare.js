// Cloudflare operations — zone settings (SSL/TLS, Speed, Caching, Security) and
// one-click hardening, layered on the existing Cloudflare DNS connection. Zones
// are addressed by their ServerKit DNS zone id (same as the /dns API).

export async function getCloudflareZoneSettings(zoneId) {
    return this.request(`/cloudflare/zones/${zoneId}/settings`);
}

export async function getCloudflareZoneSetting(zoneId, settingId) {
    return this.request(`/cloudflare/zones/${zoneId}/settings/${settingId}`);
}

export async function updateCloudflareZoneSetting(zoneId, settingId, value) {
    return this.request(`/cloudflare/zones/${zoneId}/settings/${settingId}`, {
        method: 'PATCH',
        body: { value },
    });
}

export async function applyCloudflareSettingsPreset(zoneId) {
    return this.request(`/cloudflare/zones/${zoneId}/settings/apply-preset`, {
        method: 'POST',
    });
}

// Purge the zone's Cloudflare cache. payload is { purge_everything: true } or
// { files: [...] } (and on Enterprise, hosts/prefixes/tags).
export async function purgeCloudflareCache(zoneId, payload) {
    return this.request(`/cloudflare/zones/${zoneId}/purge-cache`, {
        method: 'POST',
        body: payload,
    });
}
