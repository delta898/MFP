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

function summarizeCatalog(payload) {
    const models = Array.isArray(payload?.models) ? payload.models : [];
    const selectable = models.filter((model) => ['active', 'preview', 'deprecated'].includes(
        String(model?.status || 'active').trim().toLowerCase()
    ));
    const count = (kind) => selectable.filter((model) => String(model?.kind || '').trim().toLowerCase() === kind).length;
    const kieCount = (kind) => selectable.filter((model) => String(model?.kind || '').trim().toLowerCase() === kind
        && String(model?.provider || '').trim().toLowerCase() === 'kie').length;
    return {
        version: String(payload?.version || 'unversioned').trim(),
        minimumAppVersion: String(payload?.minimum_app_version || '').trim() || '(none)',
        totalModels: models.length,
        selectableText: count('text'),
        selectableImage: count('image'),
        kieText: kieCount('text'),
        kieImage: kieCount('image')
    };
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
    const logger = options.logger || { info() {}, warn() {} };
    const environment = String(options.environment || config.RUNTIME_ENVIRONMENT || '').trim().toLowerCase();
    const channel = ['local', 'development'].includes(environment) ? 'development' : 'production';
    const appVersion = String(options.appVersion || require('../../../host/application-metadata').APP_VERSION || '0.0.0');
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
        const startedAt = Date.now();
        logger.info?.(`[AI Model Catalog] 요청 시작 (channel=${channel}, appVersion=${appVersion})`);
        let timeoutId = null;
        try {
            const supabase = getClient();
            if (!supabase) throw new Error('Supabase client 설정이 없습니다.');
            const rpcCall = supabase.rpc('get_ai_model_catalog', {
                p_channel: channel,
                p_app_version: appVersion
            });
            const timeout = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('AI model catalog timeout')), requestTimeoutMs);
            });
            const { data, error } = await Promise.race([rpcCall, timeout]);
            if (error) throw error;
            const payload = extractCatalogPayload(data);
            if (!payload) throw new Error('게시된 AI model catalog가 없습니다.');
            const summary = summarizeCatalog(payload);
            logger.info?.(`[AI Model Catalog] RPC 응답 수신 (channel=${channel}, appVersion=${appVersion}, elapsed=${Date.now() - startedAt}ms, version=${summary.version}, minimumAppVersion=${summary.minimumAppVersion}, models=${summary.totalModels}, selectableText=${summary.selectableText}, selectableImage=${summary.selectableImage}, kieText=${summary.kieText}, kieImage=${summary.kieImage})`);
            return payload;
        } catch (error) {
            logger.warn?.(`[AI Model Catalog] 요청 실패 (channel=${channel}, appVersion=${appVersion}, elapsed=${Date.now() - startedAt}ms, code=${String(error?.code || 'unknown')}, message=${String(error?.message || 'unknown').slice(0, 240)})`);
            throw error;
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    return Object.freeze({ cachePath, fetchCatalog, loadCachedCatalog, saveCachedCatalog });
}

module.exports = { createSupabaseModelCatalogPort, extractCatalogPayload, summarizeCatalog };
