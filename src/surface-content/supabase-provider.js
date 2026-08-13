const { createClient } = require('@supabase/supabase-js');

const DEFAULT_TIMEOUT_MS = 3500;

function withTimeout(promise, timeoutMs) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('surface content request timed out')), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function createSupabaseSurfaceContentProvider(options = {}) {
    const config = options.config || {};
    const License = options.License;
    const logger = options.logger || console;
    const createClientImpl = options.createClient || createClient;
    const timeoutMs = Math.max(500, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
    let client = null;

    function getClient() {
        if (client) return client;
        const url = String(config.LICENSE_CHK_URL || '').trim();
        const key = String(config.LICENSE_CHK_KEY || '').trim();
        if (!url || !key) return null;
        client = createClientImpl(url, key);
        return client;
    }

    return {
        async fetch(surface, appVersion) {
            if (!License || typeof License.resolveAuthenticatedServerContext !== 'function') {
                throw new Error('license server context capability is unavailable');
            }

            const auth = await License.resolveAuthenticatedServerContext();
            if (!auth?.success || !auth.licenseKey || !auth.hwid) {
                throw new Error(auth?.message || 'license server context is unavailable');
            }

            const supabase = getClient();
            if (!supabase) throw new Error('surface content server is not configured');

            const request = supabase.rpc('get_app_surface_content', {
                p_license_key: auth.licenseKey,
                p_hwid: auth.hwid,
                p_surface: surface,
                p_app_version: appVersion
            });
            const { data, error } = await withTimeout(request, timeoutMs);
            if (error) throw new Error(String(error.message || 'surface content RPC failed'));
            return data;
        },

        getStorageOrigin() {
            try {
                return new URL(String(config.LICENSE_CHK_URL || '')).origin;
            } catch (error) {
                logger.debug?.(`[SurfaceContent] Storage origin unavailable: ${error.message}`);
                return '';
            }
        }
    };
}

module.exports = {
    createSupabaseSurfaceContentProvider
};
