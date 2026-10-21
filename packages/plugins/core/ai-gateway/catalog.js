'use strict';

function createModelCatalogService(options = {}) {
    if (typeof options.fetchCatalog !== 'function' || typeof options.applySnapshot !== 'function'
        || typeof options.getSnapshot !== 'function') {
        throw new TypeError('AI Gateway catalog requires fetchCatalog(), applySnapshot(), and getSnapshot() ports.');
    }
    const refreshTtlMs = Number.isFinite(options.refreshTtlMs) ? Math.max(0, options.refreshTtlMs) : 6 * 60 * 60 * 1000;
    const logger = options.logger || { debug() {}, info() {}, warn() {} };
    let lastRefreshAt = 0;
    let pendingRefresh = null;
    let cacheLoaded = false;
    let lastError = '';

    function loadCache() {
        if (cacheLoaded) return;
        cacheLoaded = true;
        try {
            const payload = options.loadCachedCatalog?.();
            if (payload) {
                const status = options.applySnapshot(payload);
                logger.info?.(`[AI Model Catalog] 로컬 캐시 적용 (version=${String(status?.version || payload.version || 'unversioned')}, models=${Number(status?.remote_model_count || 0)})`);
            } else {
                logger.info?.('[AI Model Catalog] 로컬 캐시 없음');
            }
        } catch (error) {
            logger.warn?.(`[AI Model Catalog] 로컬 캐시 적용 실패 (message=${String(error?.message || error).slice(0, 240)})`);
        }
    }

    async function refresh(force = false) {
        loadCache();
        if (!force && lastRefreshAt && Date.now() - lastRefreshAt < refreshTtlMs) {
            return { refreshed: false, ...getStatus() };
        }
        if (pendingRefresh) return pendingRefresh;
        pendingRefresh = (async () => {
            try {
                const payload = await options.fetchCatalog();
                const status = options.applySnapshot(payload);
                try { options.saveCachedCatalog?.(payload); } catch (error) {
                    logger.warn?.(`[AI Model Catalog] 캐시 저장 실패 (message=${String(error?.message || error).slice(0, 240)})`);
                }
                lastError = '';
                lastRefreshAt = Date.now();
                logger.info?.(`[AI Model Catalog] 적용 완료 (version=${String(status?.version || 'unversioned')}, models=${Number(status?.remote_model_count || 0)}, providers=${Number(status?.remote_provider_count || 0)})`);
                return { refreshed: true, ...status };
            } catch (error) {
                lastError = String(error?.message || 'Catalog refresh failed').slice(0, 300);
                lastRefreshAt = Date.now();
                const currentStatus = getStatus();
                logger.warn?.(`[AI Model Catalog] 갱신 실패, 마지막 정상 카탈로그 유지 (error=${lastError}, cachedVersion=${String(currentStatus.version || 'none')}, source=${String(currentStatus.source || 'unavailable')})`);
                return { refreshed: false, error: lastError, ...getStatus() };
            } finally {
                pendingRefresh = null;
            }
        })();
        return pendingRefresh;
    }

    function getStatus() {
        const sourceStatus = typeof options.getStatus === 'function' ? options.getStatus() : {};
        return { ...sourceStatus, ...(lastError ? { refresh_error: lastError } : {}) };
    }

    function getCatalog() {
        loadCache();
        return options.getSnapshot();
    }

    return Object.freeze({ loadCache, refresh, getCatalog, getStatus });
}

module.exports = { createModelCatalogService };
