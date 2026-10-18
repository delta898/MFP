'use strict';

const DEFAULT_CLOUDFLARE_OAUTH_SCOPES = Object.freeze([
    'memberships.read',
    'workers-scripts.admin',
    'workers-routes.write',
    'dns.read',
    'zone.read',
    'offline_access'
]);

function normalizeCloudflareOAuthScopes(value) {
    const scopes = (Array.isArray(value) ? value : String(value || '').split(/\s+/))
        .map((scope) => String(scope || '').trim())
        .filter(Boolean);
    const normalized = scopes.length > 0 ? [...new Set(scopes)] : [...DEFAULT_CLOUDFLARE_OAUTH_SCOPES];
    if (normalized.some((scope) => !/^[a-z][a-z0-9._-]*$/.test(scope))) {
        throw new Error('Cloudflare OAuth scope 설정 형식이 올바르지 않습니다.');
    }
    return Object.freeze(normalized);
}

module.exports = {
    DEFAULT_CLOUDFLARE_OAUTH_SCOPES,
    normalizeCloudflareOAuthScopes
};
