const { createClient } = require('@supabase/supabase-js');
const { resolveSupabasePublicConnection } = require('./public-connection');

const DEFAULT_TIMEOUT_MS = 3500;
const ALLOWED_MEDIA_BUCKET = 'app-public-content';
const ALLOWED_MEDIA_TYPES = new Set(['image/webp', 'image/png', 'image/jpeg']);

function normalizeObjectPath(value) {
    const path = String(value || '').trim().replace(/^\/+/, '');
    if (!path || path.length > 500 || path.includes('\\')) return '';
    const segments = path.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return '';
    return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

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
        const connection = resolveSupabasePublicConnection(config);
        if (!connection.configured) return null;
        client = createClientImpl(connection.url, connection.publishableKey);
        return client;
    }

    function resolveMedia(rawMedia) {
        if (!rawMedia || typeof rawMedia !== 'object' || Array.isArray(rawMedia)) return null;
        if (rawMedia.transport !== 'supabase_storage' || rawMedia.bucket !== ALLOWED_MEDIA_BUCKET) return null;

        const mimeType = String(rawMedia.mime_type || '').trim();
        const objectPath = normalizeObjectPath(rawMedia.object_path);
        const revision = Number(rawMedia.revision);
        if (!ALLOWED_MEDIA_TYPES.has(mimeType) || !objectPath || !Number.isInteger(revision) || revision < 1) return null;

        const width = Number(rawMedia.width);
        const height = Number(rawMedia.height);
        if (!Number.isInteger(width) || width < 1 || width > 4000) return null;
        if (!Number.isInteger(height) || height < 1 || height > 4000) return null;

        let storageOrigin;
        try {
            storageOrigin = new URL(String(getStorageOrigin() || '')).origin;
        } catch (_) {
            return null;
        }
        if (!storageOrigin.startsWith('https://')) return null;

        return {
            url: `${storageOrigin}/storage/v1/object/public/${ALLOWED_MEDIA_BUCKET}/${objectPath}?v=${revision}`,
            mimeType,
            alt: String(rawMedia.alt || '').trim(),
            width,
            height,
            revision
        };
    }

    function getStorageOrigin() {
        try {
            const connection = resolveSupabasePublicConnection(config);
            return connection.configured ? new URL(connection.url).origin : '';
        } catch (error) {
            logger.debug?.(`[SurfaceContent] Storage origin unavailable: ${error.message}`);
            return '';
        }
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
        resolveMedia
    };
}

module.exports = {
    createSupabaseSurfaceContentProvider
};
