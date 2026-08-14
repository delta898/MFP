const { normalizeSidebarPayload, normalizeDashboardPayload, normalizeAccountPayload } = require('./schema');

const MEMORY_CACHE_TTL_MS = 60 * 1000;

function emptySidebarPayload() {
    return {
        schemaVersion: 1,
        policyRevision: 0,
        surface: 'sidebar',
        regions: { utility: { blocks: [] } },
        generatedAt: ''
    };
}

function emptyDashboardPayload() {
    return {
        schemaVersion: 1,
        policyRevision: 0,
        surface: 'dashboard',
        regions: { supporting: { blocks: [] } },
        generatedAt: ''
    };
}

function emptyAccountPayload() {
    return {
        schemaVersion: 1,
        policyRevision: 0,
        surface: 'account',
        regions: { supporting: { blocks: [] } },
        generatedAt: ''
    };
}

function createSurfaceContentService(options = {}) {
    const provider = options.provider;
    const appVersion = String(options.appVersion || '0.0.0').trim();
    const logger = options.logger || console;
    const cacheTtlMs = Math.max(0, Number(options.cacheTtlMs ?? MEMORY_CACHE_TTL_MS));
    const states = new Map();

    async function loadSurface(surface, normalize, empty) {
        const now = Date.now();
        const state = states.get(surface) || { cached: null, cachedAt: 0, pending: null };
        states.set(surface, state);
        if (state.cached && now - state.cachedAt < cacheTtlMs) return state.cached;
        if (state.pending) return state.pending;

        state.pending = (async () => {
            try {
                if (!provider || typeof provider.fetch !== 'function') return empty();
                const remote = await provider.fetch(surface, appVersion);
                const normalized = normalize(remote, {
                    storageOrigin: provider.getStorageOrigin?.() || ''
                });
                if (!normalized) {
                    logger.warn?.('[SurfaceContent] 잘못된 원격 응답을 무시하고 마지막 정상 콘텐츠를 유지합니다.');
                    return state.cached || empty();
                }
                state.cached = normalized;
                state.cachedAt = Date.now();
                return normalized;
            } catch (error) {
                logger.debug?.(`[SurfaceContent] 마지막 정상 ${surface} 콘텐츠를 유지합니다: ${error.message}`);
                return state.cached || empty();
            } finally {
                state.pending = null;
            }
        })();

        return state.pending;
    }

    return {
        getSidebar: () => loadSurface('sidebar', normalizeSidebarPayload, emptySidebarPayload),
        getDashboard: () => loadSurface('dashboard', normalizeDashboardPayload, emptyDashboardPayload),
        getAccount: () => loadSurface('account', normalizeAccountPayload, emptyAccountPayload)
    };
}

module.exports = {
    createSurfaceContentService,
    emptySidebarPayload,
    emptyDashboardPayload,
    emptyAccountPayload
};
