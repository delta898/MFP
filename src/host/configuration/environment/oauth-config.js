'use strict';

const { normalizeCloudflareOAuthScopes } = require('../../cloudflare/oauth-scopes');

const OAUTH_CONFIG_KEYS = Object.freeze([
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'CLOUDFLARE_OAUTH_CLIENT_ID',
    'CLOUDFLARE_OAUTH_SCOPES'
]);

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
    OAUTH_CONFIG_KEYS,
    resolveOAuthApplicationConfig
};
