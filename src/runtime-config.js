const { createClient } = require('@supabase/supabase-js');
const CONFIG = require('./config-loader');
const Logger = require('./logger');
const { resolveSupabasePublicConnection } = require('./environment/runtime-profile');

function createRuntimeConfigApi(options = {}) {
    const config = options.config || CONFIG;
    const logger = options.logger || Logger;
    const createClientImpl = options.createClientImpl || createClient;
    const cacheTtlMs = Number.isFinite(options.cacheTtlMs) ? options.cacheTtlMs : 10 * 60 * 1000;
    const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs) ? options.requestTimeoutMs : 10000;
    const maxAttempts = Number.isFinite(options.maxAttempts) ? Math.max(1, options.maxAttempts) : 2;

    let supabase = null;
    let lastFetchedAt = 0;
    const cache = {};

    function getSupabaseClient() {
        if (supabase) return supabase;
        const connection = resolveSupabasePublicConnection(config);
        if (!connection.configured) return null;
        supabase = createClientImpl(connection.url, connection.publishableKey);
        return supabase;
    }

    function hasFreshCache() {
        return (Date.now() - lastFetchedAt) < cacheTtlMs;
    }

    async function fetchRuntimeConfig(keys, force = false) {
        if (!Array.isArray(keys) || keys.length === 0) return {};

        if (!force && hasFreshCache() && keys.every((key) => key in cache)) {
            return keys.reduce((acc, key) => {
                acc[key] = cache[key];
                return acc;
            }, {});
        }

        const client = getSupabaseClient();
        if (!client) {
            return keys.reduce((acc, key) => {
                if (key in cache) acc[key] = cache[key];
                return acc;
            }, {});
        }

        let lastError = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                const timeout = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('runtime config timeout')), requestTimeoutMs);
                });
                const rpcCall = client.rpc('get_runtime_config', { p_keys: keys });
                const { data, error } = await Promise.race([rpcCall, timeout]);

                if (error) throw error;

                const map = (data && typeof data === 'object') ? data : {};
                for (const key of keys) {
                    cache[key] = String(map[key] || '').trim();
                }
                lastFetchedAt = Date.now();

                return keys.reduce((acc, key) => {
                    acc[key] = cache[key];
                    return acc;
                }, {});
            } catch (e) {
                lastError = e;
            }
        }

        try {
            throw lastError || new Error('runtime config unavailable');
        } catch (e) {
            logger.debug(`🔍 [Runtime Config] 서버 설정 조회 실패: ${e.message}`);
            return keys.reduce((acc, key) => {
                if (key in cache) acc[key] = cache[key];
                return acc;
            }, {});
        }
    }

    async function ensureNaverSearchCredentials(force = false) {
        if (config.NAVER_CLIENT_ID && config.NAVER_CLIENT_SECRET) return true;

        const values = await fetchRuntimeConfig(['naver_client_id', 'naver_client_secret'], force);
        const nextId = String(values.naver_client_id || '').trim();
        const nextSecret = String(values.naver_client_secret || '').trim();

        if (!config.NAVER_CLIENT_ID && nextId) config.NAVER_CLIENT_ID = nextId;
        if (!config.NAVER_CLIENT_SECRET && nextSecret) config.NAVER_CLIENT_SECRET = nextSecret;

        return Boolean(config.NAVER_CLIENT_ID && config.NAVER_CLIENT_SECRET);
    }

    async function ensureGoogleOauthClientConfig(force = false) {
        if (config.GOOGLE_OAUTH_CLIENT_ID && config.GOOGLE_OAUTH_CLIENT_SECRET) return true;

        const values = await fetchRuntimeConfig(['google_oauth_client_id', 'google_oauth_client_secret'], force);
        const nextId = String(values.google_oauth_client_id || '').trim();
        const nextSecret = String(values.google_oauth_client_secret || '').trim();

        if (!config.GOOGLE_OAUTH_CLIENT_ID && nextId) config.GOOGLE_OAUTH_CLIENT_ID = nextId;
        if (!config.GOOGLE_OAUTH_CLIENT_SECRET && nextSecret) config.GOOGLE_OAUTH_CLIENT_SECRET = nextSecret;

        return Boolean(config.GOOGLE_OAUTH_CLIENT_ID && config.GOOGLE_OAUTH_CLIENT_SECRET);
    }

    return {
        fetchRuntimeConfig,
        ensureNaverSearchCredentials,
        ensureGoogleOauthClientConfig
    };
}

const runtimeConfigApi = createRuntimeConfigApi();

module.exports = {
    ...runtimeConfigApi,
    createRuntimeConfigApi
};
