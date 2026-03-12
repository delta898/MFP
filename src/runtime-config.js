const { createClient } = require('@supabase/supabase-js');
const CONFIG = require('./config-loader');
const Logger = require('./logger');

let supabase = null;
let lastFetchedAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10분
const cache = {};

function getSupabaseClient() {
    if (supabase) return supabase;
    if (!CONFIG.LICENSE_CHK_URL || !CONFIG.LICENSE_CHK_KEY) return null;
    supabase = createClient(CONFIG.LICENSE_CHK_URL, CONFIG.LICENSE_CHK_KEY);
    return supabase;
}

function hasFreshCache() {
    return (Date.now() - lastFetchedAt) < CACHE_TTL_MS;
}

async function fetchRuntimeConfig(keys, force = false) {
    if (!Array.isArray(keys) || keys.length === 0) return {};

    if (!force && hasFreshCache() && keys.every(key => key in cache)) {
        return keys.reduce((acc, key) => {
            acc[key] = cache[key];
            return acc;
        }, {});
    }

    const client = getSupabaseClient();
    if (!client) return {};

    try {
        const timeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('runtime config timeout')), 5000);
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
        Logger.debug(`🔍 [Runtime Config] 서버 설정 조회 실패: ${e.message}`);
        for (const key of keys) {
            if (!(key in cache)) cache[key] = '';
        }
        lastFetchedAt = Date.now();
        return {};
    }
}

async function ensureNaverSearchCredentials(force = false) {
    if (CONFIG.NAVER_CLIENT_ID && CONFIG.NAVER_CLIENT_SECRET) return true;

    const values = await fetchRuntimeConfig(['naver_client_id', 'naver_client_secret'], force);
    const nextId = String(values.naver_client_id || '').trim();
    const nextSecret = String(values.naver_client_secret || '').trim();

    if (!CONFIG.NAVER_CLIENT_ID && nextId) CONFIG.NAVER_CLIENT_ID = nextId;
    if (!CONFIG.NAVER_CLIENT_SECRET && nextSecret) CONFIG.NAVER_CLIENT_SECRET = nextSecret;

    return Boolean(CONFIG.NAVER_CLIENT_ID && CONFIG.NAVER_CLIENT_SECRET);
}

async function ensureGoogleOauthClientConfig(force = false) {
    if (CONFIG.GOOGLE_OAUTH_CLIENT_ID && CONFIG.GOOGLE_OAUTH_CLIENT_SECRET) return true;

    const values = await fetchRuntimeConfig(['google_oauth_client_id', 'google_oauth_client_secret'], force);
    const nextId = String(values.google_oauth_client_id || '').trim();
    const nextSecret = String(values.google_oauth_client_secret || '').trim();

    if (!CONFIG.GOOGLE_OAUTH_CLIENT_ID && nextId) CONFIG.GOOGLE_OAUTH_CLIENT_ID = nextId;
    if (!CONFIG.GOOGLE_OAUTH_CLIENT_SECRET && nextSecret) CONFIG.GOOGLE_OAUTH_CLIENT_SECRET = nextSecret;

    return Boolean(CONFIG.GOOGLE_OAUTH_CLIENT_ID && CONFIG.GOOGLE_OAUTH_CLIENT_SECRET);
}

module.exports = {
    fetchRuntimeConfig,
    ensureNaverSearchCredentials,
    ensureGoogleOauthClientConfig
};
