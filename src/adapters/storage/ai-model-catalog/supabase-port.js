'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const { resolveSupabasePublicConnection } = require('../../supabase/public-connection');

function extractCatalogPayload(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if (data.payload && typeof data.payload === 'object' && !Array.isArray(data.payload)) {
        return {
            ...data.payload,
            version: String(data.payload.version || data.version || '').trim(),
            minimum_app_version: String(data.payload.minimum_app_version || data.minimum_app_version || '').trim()
        };
    }
    return data;
}

function createSupabaseModelCatalogPort(options = {}) {
    const config = options.config;
    if (!config || typeof config !== 'object') {
        throw new TypeError('Supabase model catalog port requires injected runtime configuration.');
    }
    const fsImpl = options.fsImpl || fs;
    const pathImpl = options.pathImpl || path;
    const createClientImpl = options.createClientImpl || createClient;
    const fetchCatalogImpl = options.fetchCatalog;
    const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs) ? Math.max(100, options.requestTimeoutMs) : 10000;
    const cachePath = options.cachePath || pathImpl.join(
        config.APP_ROOT_DIR || process.cwd(), 'data', 'cache', 'ai-model-catalog.json'
    );
    let client = null;

    function getClient() {
        if (client) return client;
        const connection = resolveSupabasePublicConnection(config);
        if (!connection.configured) return null;
        client = createClientImpl(connection.url, connection.publishableKey);
        return client;
    }

    function loadCachedCatalog() {
        if (!fsImpl.existsSync(cachePath)) return null;
        return JSON.parse(fsImpl.readFileSync(cachePath, 'utf8'));
    }

    function saveCachedCatalog(payload) {
        const cacheDir = pathImpl.dirname(cachePath);
        const tempPath = `${cachePath}.tmp`;
        fsImpl.mkdirSync(cacheDir, { recursive: true });
        fsImpl.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        fsImpl.renameSync(tempPath, cachePath);
    }

    async function fetchCatalog() {
        if (typeof fetchCatalogImpl === 'function') return fetchCatalogImpl();
        const supabase = getClient();
        if (!supabase) throw new Error('Supabase client 설정이 없습니다.');
        const rpcCall = supabase.rpc('get_ai_model_catalog', {
            p_channel: String(config.UPDATE_CHANNEL || 'stable').trim().toLowerCase() || 'stable',
            p_app_version: String(options.appVersion || require('../../../host/application-metadata').APP_VERSION || '0.0.0')
        });
        let timeoutId = null;
        const timeout = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('AI model catalog timeout')), requestTimeoutMs);
        });
        try {
            const { data, error } = await Promise.race([rpcCall, timeout]);
            if (error) throw error;
            const payload = extractCatalogPayload(data);
            if (!payload) throw new Error('게시된 AI model catalog가 없습니다.');
            return payload;
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    return Object.freeze({ cachePath, fetchCatalog, loadCachedCatalog, saveCachedCatalog });
}

module.exports = { createSupabaseModelCatalogPort, extractCatalogPayload };
