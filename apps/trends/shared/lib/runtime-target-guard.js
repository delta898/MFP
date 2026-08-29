'use strict';

const { assertTrendsEnvironment, TRENDS_ENVIRONMENTS } = require('./environment-profile');

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', 'host.docker.internal']);

function normalizeText(value) {
    return String(value || '').trim();
}

function toBool(value) {
    return ['1', 'true', 'yes', 'y', 'on'].includes(normalizeText(value).toLowerCase());
}

function assertRequired(value, name) {
    const normalized = normalizeText(value);
    if (!normalized) throw new Error(`${name} is required`);
    return normalized;
}

function assertMatchingTargetEnvironment(selectedEnvironment, targetEnvironment, variableName) {
    const selected = assertTrendsEnvironment(selectedEnvironment);
    const target = assertTrendsEnvironment(assertRequired(targetEnvironment, variableName));
    if (target !== selected) {
        throw new Error(`${variableName} mismatch: selected=${selected}, target=${target}`);
    }
    return target;
}

function validateEnvironmentUrl(environment, rawUrl, variableName) {
    const selected = assertTrendsEnvironment(environment);
    const value = assertRequired(rawUrl, variableName);
    let parsed;
    try {
        parsed = new URL(value);
    } catch (_error) {
        throw new Error(`${variableName} must be a valid URL`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        throw new Error(`${variableName} must be a safe HTTP(S) URL`);
    }

    const isLocal = LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
    if (selected === TRENDS_ENVIRONMENTS.LOCAL && !isLocal) {
        throw new Error(`${variableName} must use a local host in local environment`);
    }
    if (selected !== TRENDS_ENVIRONMENTS.LOCAL && (isLocal || parsed.protocol !== 'https:')) {
        throw new Error(`${variableName} must use remote HTTPS in hosted environments`);
    }
    return parsed;
}

function assertNotKnownProductionTarget(environment, actualUrl, productionUrl, variableName) {
    if (environment === TRENDS_ENVIRONMENTS.PRODUCTION || !normalizeText(productionUrl)) return;
    const actual = new URL(actualUrl).toString().replace(/\/$/, '');
    const production = new URL(productionUrl).toString().replace(/\/$/, '');
    if (actual === production) {
        throw new Error(`${variableName} must not use the known Production target`);
    }
}

function deriveApiBaseUrl(env = {}) {
    const explicit = normalizeText(env.TRENDS_API_BASE_URL);
    if (explicit) return explicit;
    const host = normalizeText(env.TRENDS_API_HOST) || '127.0.0.1';
    const port = normalizeText(env.TRENDS_API_PORT) || '4581';
    return `http://${host}:${port}`;
}

function resolveApiRuntimeGuard(options = {}) {
    const env = options.env || process.env;
    const environment = assertTrendsEnvironment(options.environment || env.TRENDS_ENV);
    const supabaseTargetEnvironment = assertMatchingTargetEnvironment(
        environment,
        env.TRENDS_SUPABASE_TARGET_ENV,
        'TRENDS_SUPABASE_TARGET_ENV'
    );
    const supabaseUrl = validateEnvironmentUrl(environment, env.SUPABASE_URL, 'SUPABASE_URL');
    const apiBaseUrl = validateEnvironmentUrl(environment, deriveApiBaseUrl(env), 'TRENDS_API_BASE_URL');

    assertRequired(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SECRET_KEY');
    assertRequired(env.TRENDS_API_TOKEN, 'TRENDS_API_TOKEN');
    assertRequired(env.TRENDS_READ_TOKEN_SECRET, 'TRENDS_READ_TOKEN_SECRET');
    assertNotKnownProductionTarget(
        environment,
        supabaseUrl.toString(),
        env.TRENDS_PRODUCTION_SUPABASE_URL,
        'SUPABASE_URL'
    );
    assertNotKnownProductionTarget(
        environment,
        apiBaseUrl.toString(),
        env.TRENDS_PRODUCTION_API_BASE_URL,
        'TRENDS_API_BASE_URL'
    );

    return Object.freeze({
        environment,
        supabaseTargetEnvironment,
        supabaseEndpointHost: supabaseUrl.host,
        apiEndpointHost: apiBaseUrl.host,
        apiBaseUrl: apiBaseUrl.toString().replace(/\/$/, '')
    });
}

function resolveCollectorRuntimeGuard(options = {}) {
    const env = options.env || process.env;
    const environment = assertTrendsEnvironment(options.environment || env.TRENDS_ENV);
    const apiTargetEnvironment = assertMatchingTargetEnvironment(
        environment,
        env.TRENDS_API_TARGET_ENV,
        'TRENDS_API_TARGET_ENV'
    );
    const apiBaseUrl = validateEnvironmentUrl(environment, deriveApiBaseUrl(env), 'TRENDS_API_BASE_URL');
    const dryRun = toBool(env.TRENDS_DRY_RUN);

    if (!dryRun) assertRequired(env.TRENDS_API_TOKEN, 'TRENDS_API_TOKEN');
    if (environment === TRENDS_ENVIRONMENTS.PRODUCTION && !toBool(env.TRENDS_ALLOW_PRODUCTION_WRITE)) {
        throw new Error('Production collector requires TRENDS_ALLOW_PRODUCTION_WRITE=true');
    }
    assertNotKnownProductionTarget(
        environment,
        apiBaseUrl.toString(),
        env.TRENDS_PRODUCTION_API_BASE_URL,
        'TRENDS_API_BASE_URL'
    );

    return Object.freeze({
        environment,
        apiTargetEnvironment,
        apiEndpointHost: apiBaseUrl.host,
        apiBaseUrl: apiBaseUrl.toString().replace(/\/$/, ''),
        dryRun
    });
}

function formatRuntimeTargetDiagnostic(profile = {}) {
    const parts = [`environment=${normalizeText(profile.environment) || 'unselected'}`];
    if (profile.supabaseEndpointHost) parts.push(`supabase=${profile.supabaseEndpointHost}`);
    if (profile.apiEndpointHost) parts.push(`api=${profile.apiEndpointHost}`);
    return `[Trends Targets] ${parts.join(' / ')}`;
}

module.exports = {
    assertMatchingTargetEnvironment,
    deriveApiBaseUrl,
    formatRuntimeTargetDiagnostic,
    resolveApiRuntimeGuard,
    resolveCollectorRuntimeGuard,
    validateEnvironmentUrl
};
