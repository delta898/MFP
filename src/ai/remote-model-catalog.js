const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const CONFIG = require('../config-loader');
const Logger = require('../logger');
const { APP_VERSION } = require('../constants');
const {
    applyRemoteCatalog,
    getCatalogStatus
} = require('./catalog-registry');

const DEFAULT_REFRESH_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

function extractCatalogPayload(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if (data.payload && typeof data.payload === 'object' && !Array.isArray(data.payload)) {
        return {
            ...data.payload,
            version: String(data.payload.version || data.version || '').trim(),
            minimum_app_version: String(
                data.payload.minimum_app_version || data.minimum_app_version || ''
            ).trim()
        };
    }
    return data;
}

function createRemoteModelCatalogService(options = {}) {
    const config = options.config || CONFIG;
    const logger = options.logger || Logger;
    const fsImpl = options.fsImpl || fs;
    const pathImpl = options.pathImpl || path;
    const createClientImpl = options.createClientImpl || createClient;
    const applyRemoteCatalogImpl = options.applyRemoteCatalogImpl || applyRemoteCatalog;
    const getCatalogStatusImpl = options.getCatalogStatusImpl || getCatalogStatus;
    const appVersion = String(options.appVersion || APP_VERSION || '0.0.0');
    const refreshTtlMs = Number.isFinite(options.refreshTtlMs)
        ? Math.max(0, options.refreshTtlMs)
        : DEFAULT_REFRESH_TTL_MS;
    const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs)
        ? Math.max(100, options.requestTimeoutMs)
        : DEFAULT_REQUEST_TIMEOUT_MS;
    const cachePath = options.cachePath || pathImpl.join(
        config.APP_ROOT_DIR || process.cwd(),
        'data',
        'cache',
        'ai-model-catalog.json'
    );

    let client = null;
    let lastRefreshAt = 0;
    let loadedCache = false;
    let pendingRefresh = null;

    function getClient() {
        if (client) return client;
        if (!config.LICENSE_CHK_URL || !config.LICENSE_CHK_KEY) return null;
        client = createClientImpl(config.LICENSE_CHK_URL, config.LICENSE_CHK_KEY);
        return client;
    }

    function loadCache() {
        if (loadedCache) return false;
        loadedCache = true;
        try {
            if (!fsImpl.existsSync(cachePath)) return false;
            const payload = JSON.parse(fsImpl.readFileSync(cachePath, 'utf8'));
            applyRemoteCatalogImpl(payload, { appVersion });
            return true;
        } catch (error) {
            logger.debug(`🔍 [AI Catalog] 로컬 cache 무시: ${error.message}`);
            return false;
        }
    }

    function writeCache(payload) {
        const cacheDir = pathImpl.dirname(cachePath);
        const tempPath = `${cachePath}.tmp`;
        fsImpl.mkdirSync(cacheDir, { recursive: true });
        fsImpl.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        fsImpl.renameSync(tempPath, cachePath);
    }

    async function fetchPublishedCatalog() {
        const supabase = getClient();
        if (!supabase) throw new Error('Supabase client 설정이 없습니다.');

        const rpcCall = supabase.rpc('get_ai_model_catalog', {
            p_channel: String(config.UPDATE_CHANNEL || 'stable').trim().toLowerCase() || 'stable',
            p_app_version: appVersion
        });
        let timeoutId = null;
        const timeout = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('AI model catalog timeout')), requestTimeoutMs);
        });
        let result;
        try {
            result = await Promise.race([rpcCall, timeout]);
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
        const { data, error } = result;
        if (error) throw error;
        const payload = extractCatalogPayload(data);
        if (!payload) throw new Error('게시된 AI model catalog가 없습니다.');
        return payload;
    }

    async function refresh(force = false) {
        loadCache();
        if (!force && lastRefreshAt && (Date.now() - lastRefreshAt) < refreshTtlMs) {
            return { refreshed: false, ...getCatalogStatusImpl() };
        }
        if (pendingRefresh) return pendingRefresh;

        pendingRefresh = (async () => {
            try {
                const payload = await fetchPublishedCatalog();
                const status = applyRemoteCatalogImpl(payload, { appVersion });
                try {
                    writeCache(payload);
                } catch (cacheError) {
                    logger.debug(`🔍 [AI Catalog] 원격 catalog cache 저장 실패: ${cacheError.message}`);
                }
                lastRefreshAt = Date.now();
                logger.debug(`✅ [AI Catalog] 원격 catalog 적용: ${status.version}`);
                return { refreshed: true, ...status };
            } catch (error) {
                lastRefreshAt = Date.now();
                logger.debug(`🔍 [AI Catalog] 원격 catalog 조회 실패, 기존 snapshot 유지: ${error.message}`);
                return { refreshed: false, error: error.message, ...getCatalogStatusImpl() };
            } finally {
                pendingRefresh = null;
            }
        })();

        return pendingRefresh;
    }

    loadCache();

    return {
        extractCatalogPayload,
        getCachePath: () => cachePath,
        getStatus: getCatalogStatusImpl,
        loadCache,
        refresh
    };
}

const remoteModelCatalogService = createRemoteModelCatalogService();

module.exports = {
    ...remoteModelCatalogService,
    createRemoteModelCatalogService,
    extractCatalogPayload
};
