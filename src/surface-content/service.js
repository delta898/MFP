const { normalizeSidebarPayload } = require('./schema');

const MEMORY_CACHE_TTL_MS = 2 * 60 * 1000;

function emptySidebarPayload() {
    return {
        schemaVersion: 1,
        policyRevision: 0,
        surface: 'sidebar',
        regions: { utility: { blocks: [] } },
        generatedAt: ''
    };
}

function createSurfaceContentService(options = {}) {
    const provider = options.provider;
    const appVersion = String(options.appVersion || '0.0.0').trim();
    const logger = options.logger || console;
    const cacheTtlMs = Math.max(0, Number(options.cacheTtlMs ?? MEMORY_CACHE_TTL_MS));
    let cachedSidebar = null;
    let cachedAt = 0;
    let pendingSidebar = null;

    async function loadSidebar() {
        const now = Date.now();
        if (cachedSidebar && now - cachedAt < cacheTtlMs) return cachedSidebar;
        if (pendingSidebar) return pendingSidebar;

        pendingSidebar = (async () => {
            try {
                if (!provider || typeof provider.fetch !== 'function') return emptySidebarPayload();
                const remote = await provider.fetch('sidebar', appVersion);
                const normalized = normalizeSidebarPayload(remote, {
                    storageOrigin: provider.getStorageOrigin?.() || ''
                });
                if (!normalized) {
                    logger.warn?.('[SurfaceContent] 잘못된 원격 응답을 무시하고 마지막 정상 콘텐츠를 유지합니다.');
                    return cachedSidebar || emptySidebarPayload();
                }
                cachedSidebar = normalized;
                cachedAt = Date.now();
                return normalized;
            } catch (error) {
                logger.debug?.(`[SurfaceContent] 마지막 정상 사이드바 콘텐츠를 유지합니다: ${error.message}`);
                return cachedSidebar || emptySidebarPayload();
            } finally {
                pendingSidebar = null;
            }
        })();

        return pendingSidebar;
    }

    return {
        getSidebar: loadSidebar
    };
}

module.exports = {
    createSurfaceContentService,
    emptySidebarPayload
};
