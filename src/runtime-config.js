const { createClient } = require('@supabase/supabase-js');
const CONFIG = require('./config-loader');
const Logger = require('./logger');
const { resolveSupabasePublicConnection } = require('./environment/runtime-profile');

const PUBLIC_RUNTIME_CONFIG_KEYS = Object.freeze([
    'NAVER_AUTO_CATEGORIES_MASTER',
    'BLOG_AUTO_CATEGORIES_MASTER',
    'blog_auto_categories_master',
    'naver_auto_categories_master'
]);
const PUBLIC_RUNTIME_CONFIG_KEY_SET = new Set(PUBLIC_RUNTIME_CONFIG_KEYS);

function normalizePublicRuntimeConfigKeys(keys) {
    if (!Array.isArray(keys) || keys.length === 0) {
        throw new TypeError('runtime config keys must be a non-empty array');
    }

    const normalized = [...new Set(keys.map((key) => String(key || '').trim()))];
    if (normalized.some((key) => !key || !PUBLIC_RUNTIME_CONFIG_KEY_SET.has(key))) {
        throw new TypeError('runtime config request contains a non-public key');
    }
    return normalized;
}

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
        const requestedKeys = normalizePublicRuntimeConfigKeys(keys);

        if (!force && hasFreshCache() && requestedKeys.every((key) => key in cache)) {
            return requestedKeys.reduce((acc, key) => {
                acc[key] = cache[key];
                return acc;
            }, {});
        }

        const client = getSupabaseClient();
        if (!client) {
            return requestedKeys.reduce((acc, key) => {
                if (key in cache) acc[key] = cache[key];
                return acc;
            }, {});
        }

        let lastError = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            let timeoutId = null;
            try {
                const timeout = new Promise((_, reject) => {
                    timeoutId = setTimeout(
                        () => reject(new Error('runtime config timeout')),
                        requestTimeoutMs
                    );
                });
                const rpcCall = client.rpc('get_runtime_config', { p_keys: requestedKeys });
                const { data, error } = await Promise.race([rpcCall, timeout]);

                if (error) throw error;

                const map = (data && typeof data === 'object') ? data : {};
                for (const key of requestedKeys) {
                    cache[key] = String(map[key] || '').trim();
                }
                lastFetchedAt = Date.now();

                return requestedKeys.reduce((acc, key) => {
                    acc[key] = cache[key];
                    return acc;
                }, {});
            } catch (e) {
                lastError = e;
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
            }
        }

        try {
            throw lastError || new Error('runtime config unavailable');
        } catch (e) {
            logger.debug(`🔍 [Runtime Config] 서버 설정 조회 실패: ${e.message}`);
            return requestedKeys.reduce((acc, key) => {
                if (key in cache) acc[key] = cache[key];
                return acc;
            }, {});
        }
    }

    return {
        fetchRuntimeConfig
    };
}

const runtimeConfigApi = createRuntimeConfigApi();

module.exports = {
    ...runtimeConfigApi,
    PUBLIC_RUNTIME_CONFIG_KEYS,
    normalizePublicRuntimeConfigKeys,
    createRuntimeConfigApi
};
