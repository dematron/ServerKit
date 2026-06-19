// Per-app container operations (image-update, auto-sleep, auto-scale) + GPU.

// --- Image updates ---
export async function checkImageUpdate(appId) {
    return this.request(`/image-updates/applications/${appId}/check`, { method: 'POST' });
}

export async function getImageUpdate(appId) {
    return this.request(`/image-updates/applications/${appId}`);
}

export async function applyImageUpdate(appId) {
    return this.request(`/apps/${appId}/image-update/apply`, { method: 'POST' });
}

// --- Auto-sleep ---
export async function getSleepPolicy(appId) {
    return this.request(`/apps/${appId}/sleep-policy`);
}

export async function updateSleepPolicy(appId, data) {
    return this.request(`/apps/${appId}/sleep-policy`, { method: 'PUT', body: data });
}

export async function sleepApp(appId) {
    return this.request(`/apps/${appId}/sleep`, { method: 'POST' });
}

export async function wakeApp(appId) {
    return this.request(`/apps/${appId}/wake`, { method: 'POST' });
}

// --- Auto-scale ---
export async function getScalePolicy(appId) {
    return this.request(`/apps/${appId}/scale-policy`);
}

export async function updateScalePolicy(appId, data) {
    return this.request(`/apps/${appId}/scale-policy`, { method: 'PUT', body: data });
}

export async function scaleApp(appId, replicas) {
    return this.request(`/apps/${appId}/scale`, { method: 'POST', body: { replicas } });
}

export async function evaluateScale(appId) {
    return this.request(`/apps/${appId}/scale/evaluate`, { method: 'POST' });
}

// --- GPU ---
export async function getGpuInfo() {
    return this.request('/gpu/');
}
