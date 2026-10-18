'use strict';

function normalizeText(value) {
    return String(value || '').trim();
}

function resolveSupabasePublicConnection(config = {}) {
    const profile = config.RUNTIME_ENVIRONMENT_PROFILE;
    if (profile && profile.configured && profile.supabase) {
        return Object.freeze({
            environment: normalizeText(profile.environment),
            configured: true,
            url: normalizeText(profile.supabase.url),
            publishableKey: normalizeText(profile.supabase.publishableKey),
            endpointHost: normalizeText(profile.supabase.endpointHost)
        });
    }

    const publicConfig = config.SUPABASE_PUBLIC_CONFIG;
    if (publicConfig && publicConfig.configured !== false) {
        const url = normalizeText(publicConfig.url);
        const publishableKey = normalizeText(publicConfig.publishableKey);
        return Object.freeze({
            environment: normalizeText(publicConfig.environment),
            configured: Boolean(url && publishableKey),
            url,
            publishableKey,
            endpointHost: normalizeText(publicConfig.endpointHost)
        });
    }

    // Dependency-injected callers may still provide transitional CONFIG aliases.
    const legacyUrl = normalizeText(config.LICENSE_CHK_URL);
    const legacyKey = normalizeText(config.LICENSE_CHK_KEY);
    return Object.freeze({
        environment: '',
        configured: Boolean(legacyUrl && legacyKey),
        url: legacyUrl,
        publishableKey: legacyKey,
        endpointHost: ''
    });
}

module.exports = { resolveSupabasePublicConnection };
