'use strict';

const DEFAULT_CLOUDFLARE_OAUTH_SCOPES = Object.freeze([
    'memberships.read',
    'workers-scripts.admin',
    'workers-routes.write',
    'dns.read',
    'zone.read',
    'offline_access'
]);

const OAUTH_CONFIG_KEYS = Object.freeze([
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'CLOUDFLARE_OAUTH_CLIENT_ID',
    'CLOUDFLARE_OAUTH_SCOPES'
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

function resolveOAuthApplicationConfig(options = {}) {
    const environment = String(options.environment || '').trim().toLowerCase();
    if (!['local', 'development', 'production'].includes(environment)) {
        throw new Error(`Unsupported OAuth environment: ${environment || '(missing)'}`);
    }

    const runtimeEnv = options.runtimeEnv || {};
    const buildConfig = options.buildConfig || {};
    const runtimeMatches = runtimeEnv.BLOGGENIUS_OAUTH_ENV === environment
        || (environment === 'local' && !runtimeEnv.BLOGGENIUS_OAUTH_ENV);
    const buildMatches = buildConfig.BLOGGENIUS_ENV === environment;
    const runtimeValues = runtimeMatches ? runtimeEnv : {};
    const buildValues = buildMatches ? buildConfig : {};
    const valueFor = (key) => String(runtimeValues[key] || buildValues[key] || '').trim();

    return Object.freeze({
        BLOGGENIUS_ENV: environment,
        GOOGLE_OAUTH_CLIENT_ID: valueFor('GOOGLE_OAUTH_CLIENT_ID'),
        GOOGLE_OAUTH_CLIENT_SECRET: valueFor('GOOGLE_OAUTH_CLIENT_SECRET'),
        CLOUDFLARE_OAUTH_CLIENT_ID: valueFor('CLOUDFLARE_OAUTH_CLIENT_ID'),
        CLOUDFLARE_OAUTH_SCOPES: normalizeCloudflareOAuthScopes(
            valueFor('CLOUDFLARE_OAUTH_SCOPES')
        ).join(' ')
    });
}

module.exports = {
    DEFAULT_CLOUDFLARE_OAUTH_SCOPES,
    OAUTH_CONFIG_KEYS,
    normalizeCloudflareOAuthScopes,
    resolveOAuthApplicationConfig
};
