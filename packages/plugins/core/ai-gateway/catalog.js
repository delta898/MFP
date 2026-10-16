'use strict';

function createModelCatalogService(options = {}) {
    if (typeof options.fetchCatalog !== 'function' || typeof options.applySnapshot !== 'function'
        || typeof options.getSnapshot !== 'function') {
        throw new TypeError('AI Gateway catalog requires fetchCatalog(), applySnapshot(), and getSnapshot() ports.');
    }
    const refreshTtlMs = Number.isFinite(options.refreshTtlMs) ? Math.max(0, options.refreshTtlMs) : 6 * 60 * 60 * 1000;
    const logger = options.logger || { debug() {} };
    let lastRefreshAt = 0;
    let pendingRefresh = null;
    let cacheLoaded = false;
    let lastError = '';

    function loadCache() {
        if (cacheLoaded) return;
        cacheLoaded = true;
        try {
            const payload = options.loadCachedCatalog?.();
            if (payload) options.applySnapshot(payload);
        } catch (error) {
            logger.debug?.(`[AI Gateway] Cached catalog ignored: ${error.message}`);
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
                    logger.debug?.(`[AI Gateway] Catalog cache write failed: ${error.message}`);
                }
                lastError = '';
                lastRefreshAt = Date.now();
                return { refreshed: true, ...status };
            } catch (error) {
                lastError = String(error?.message || 'Catalog refresh failed').slice(0, 300);
                lastRefreshAt = Date.now();
                logger.debug?.(`[AI Gateway] Catalog refresh failed; keeping the last valid snapshot: ${lastError}`);
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
