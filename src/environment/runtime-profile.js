'use strict';

const manifest = require('./manifest');
const {
    ENVIRONMENT_SCHEMA_VERSION,
    ENVIRONMENTS,
    assertEnvironmentName
} = require('./contract');

const STATUS = Object.freeze({
    READY: 'ready',
    ENVIRONMENT_NOT_SELECTED: 'environment_not_selected',
    ENVIRONMENT_INVALID: 'environment_invalid',
    PROFILE_NOT_FOUND: 'profile_not_found',
    PUBLIC_CONFIG_MISSING: 'public_config_missing',
    PUBLIC_CONFIG_INVALID: 'public_config_invalid'
});

function normalizeText(value) {
    return String(value || '').trim();
}

function readSelectedEnvironment(env, buildConfig) {
    const explicit = normalizeText(env.BLOGGENIUS_ENV);
    if (explicit) return { value: explicit, source: 'process_environment' };

    const built = normalizeText(buildConfig.BLOGGENIUS_ENV);
    if (built) return { value: built, source: 'build_config' };

    return { value: '', source: 'none' };
}

function readPublicValue(env, buildConfig, sourceName, buildKeys) {
    const explicit = normalizeText(env[sourceName]);
    if (explicit) return { value: explicit, source: `process_environment:${sourceName}` };

    for (const key of buildKeys) {
        const built = normalizeText(buildConfig[key]);
        if (built) return { value: built, source: `build_config:${key}` };
    }

    return { value: '', source: 'none' };
}

function validatePublicUrl(environment, rawUrl) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch (_error) {
        return { valid: false, reason: 'invalid_url', host: '' };
    }

    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        return { valid: false, reason: 'unsafe_url', host: '' };
    }

    const host = parsed.hostname.toLowerCase();
    const localHosts = new Set(['127.0.0.1', 'localhost', '::1', 'host.docker.internal']);
    const isLocalHost = localHosts.has(host);

    if (environment === ENVIRONMENTS.LOCAL && !isLocalHost) {
        return { valid: false, reason: 'local_requires_localhost', host };
    }
    if (environment !== ENVIRONMENTS.LOCAL && (parsed.protocol !== 'https:' || isLocalHost)) {
        return { valid: false, reason: 'hosted_requires_remote_https', host };
    }

    return { valid: true, reason: '', host: parsed.host };
}

function createUnavailableProfile({ status, environment = '', selectionSource = 'none', reason = '' }) {
    return Object.freeze({
        schemaVersion: ENVIRONMENT_SCHEMA_VERSION,
        environment,
        status,
        configured: false,
        selectionSource,
        reason,
        effects: Object.freeze({
            manualPublish: false,
            automatedPublish: false,
            livePublish: false,
            livePayment: false,
            liveNotifications: false
        }),
        supabase: Object.freeze({
            url: '',
            publishableKey: '',
            endpointHost: '',
            urlSource: 'none',
            publishableKeySource: 'none'
        }),
        trendsApi: Object.freeze({
            configured: false,
            url: '',
            endpointHost: '',
            urlSource: 'none',
            reason: 'runtime_environment_unavailable'
        })
    });
}

function resolveRuntimeEnvironmentProfile(options = {}) {
    const env = options.env || process.env;
    const buildConfig = options.buildConfig || {};
    const environmentManifest = options.manifest || manifest;
    const selected = readSelectedEnvironment(env, buildConfig);

    if (!selected.value) {
        return createUnavailableProfile({
            status: STATUS.ENVIRONMENT_NOT_SELECTED,
            selectionSource: selected.source,
            reason: 'BLOGGENIUS_ENV is required'
        });
    }

    let environment;
    try {
        environment = assertEnvironmentName(selected.value);
    } catch (_error) {
        return createUnavailableProfile({
            status: STATUS.ENVIRONMENT_INVALID,
            selectionSource: selected.source,
            reason: `unsupported environment: ${selected.value}`
        });
    }

    const descriptor = environmentManifest?.profiles?.[environment];
    if (environmentManifest?.schema_version !== ENVIRONMENT_SCHEMA_VERSION || !descriptor) {
        return createUnavailableProfile({
            status: STATUS.PROFILE_NOT_FOUND,
            environment,
            selectionSource: selected.source,
            reason: 'environment manifest profile is unavailable'
        });
    }

    const buildEnvironment = normalizeText(buildConfig.BLOGGENIUS_ENV).toLowerCase();
    const buildMatches = buildEnvironment === environment;
    const url = readPublicValue(
        env,
        buildMatches ? buildConfig : {},
        descriptor.supabase_url_source,
        ['SUPABASE_URL', 'LICENSE_CHK_URL']
    );
    const publishableKey = readPublicValue(
        env,
        buildMatches ? buildConfig : {},
        descriptor.supabase_publishable_key_source,
        ['SUPABASE_PUBLISHABLE_KEY', 'LICENSE_CHK_KEY']
    );
    const trendsApiUrl = readPublicValue(
        env,
        buildMatches ? buildConfig : {},
        descriptor.trends_api_url_source,
        ['TRENDS_API_URL']
    );

    if (!url.value || !publishableKey.value) {
        return createUnavailableProfile({
            status: STATUS.PUBLIC_CONFIG_MISSING,
            environment,
            selectionSource: selected.source,
            reason: 'Supabase public connection is incomplete'
        });
    }

    const validatedUrl = validatePublicUrl(environment, url.value);
    if (!validatedUrl.valid) {
        return createUnavailableProfile({
            status: STATUS.PUBLIC_CONFIG_INVALID,
            environment,
            selectionSource: selected.source,
            reason: validatedUrl.reason
        });
    }

    const validatedTrendsApiUrl = trendsApiUrl.value
        ? validatePublicUrl(environment, trendsApiUrl.value)
        : { valid: false, reason: 'trends_api_url_missing', host: '' };
    const productionTrendsUrl = normalizeText(env.BLOGGENIUS_PRODUCTION_TRENDS_API_URL)
        .replace(/\/+$/, '');
    const normalizedTrendsUrl = normalizeText(trendsApiUrl.value).replace(/\/+$/, '');
    const trendsTargetCollision = environment !== ENVIRONMENTS.PRODUCTION
        && productionTrendsUrl
        && normalizedTrendsUrl === productionTrendsUrl;
    const productionFenceMissing = environment === ENVIRONMENTS.DEVELOPMENT && !productionTrendsUrl;
    const trendsApiConfigured = validatedTrendsApiUrl.valid
        && !trendsTargetCollision
        && !productionFenceMissing;

    return Object.freeze({
        schemaVersion: ENVIRONMENT_SCHEMA_VERSION,
        environment,
        status: STATUS.READY,
        configured: true,
        selectionSource: selected.source,
        reason: '',
        effects: Object.freeze({
            manualPublish: descriptor.allows_manual_publish === true,
            automatedPublish: descriptor.allows_automated_publish === true,
            livePublish: descriptor.allows_automated_publish === true,
            livePayment: descriptor.allows_live_payment === true,
            liveNotifications: descriptor.allows_live_notifications === true
        }),
        supabase: Object.freeze({
            url: url.value,
            publishableKey: publishableKey.value,
            endpointHost: validatedUrl.host,
            urlSource: url.source,
            publishableKeySource: publishableKey.source
        }),
        trendsApi: Object.freeze({
            configured: trendsApiConfigured,
            url: trendsApiConfigured ? normalizedTrendsUrl : '',
            endpointHost: trendsApiConfigured ? validatedTrendsApiUrl.host : '',
            urlSource: trendsApiUrl.source,
            reason: trendsTargetCollision
                ? 'production_target_collision'
                : (productionFenceMissing
                    ? 'production_target_unknown'
                    : (validatedTrendsApiUrl.valid ? '' : validatedTrendsApiUrl.reason))
        })
    });
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

    // Dependency-injected tests and transitional callers may still provide the
    // old aliases. Runtime CONFIG creates these aliases only from this resolver.
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

function resolveTrendsApiPublicConnection(config = {}) {
    const profile = config.RUNTIME_ENVIRONMENT_PROFILE;
    if (profile?.trendsApi) {
        return Object.freeze({
            environment: normalizeText(profile.environment),
            configured: profile.trendsApi.configured === true,
            url: normalizeText(profile.trendsApi.url),
            endpointHost: normalizeText(profile.trendsApi.endpointHost),
            reason: normalizeText(profile.trendsApi.reason)
        });
    }

    const publicConfig = config.TRENDS_API_PUBLIC_CONFIG;
    return Object.freeze({
        environment: normalizeText(publicConfig?.environment),
        configured: publicConfig?.configured === true,
        url: normalizeText(publicConfig?.url),
        endpointHost: normalizeText(publicConfig?.endpointHost),
        reason: normalizeText(publicConfig?.reason) || 'trends_api_url_missing'
    });
}

function toSafeRuntimeEnvironmentDiagnostic(profile) {
    return Object.freeze({
        environment: normalizeText(profile?.environment) || 'unselected',
        status: normalizeText(profile?.status) || STATUS.ENVIRONMENT_NOT_SELECTED,
        configured: profile?.configured === true,
        endpointHost: normalizeText(profile?.supabase?.endpointHost) || '',
        selectionSource: normalizeText(profile?.selectionSource) || 'none'
    });
}

function logRuntimeEnvironmentStatus(logger, profile) {
    const diagnostic = toSafeRuntimeEnvironmentDiagnostic(profile);
    if (diagnostic.configured) {
        logger.info(
            `🌐 [Runtime Environment] ${diagnostic.environment} / ${diagnostic.endpointHost}`
        );
        return diagnostic;
    }

    logger.warn(
        `⚠️ [Runtime Environment] ${diagnostic.environment} / ${diagnostic.status} `
        + '(Supabase 기능 비활성화)'
    );
    return diagnostic;
}

module.exports = {
    STATUS,
    resolveRuntimeEnvironmentProfile,
    resolveSupabasePublicConnection,
    resolveTrendsApiPublicConnection,
    toSafeRuntimeEnvironmentDiagnostic,
    logRuntimeEnvironmentStatus,
    validatePublicUrl
};
