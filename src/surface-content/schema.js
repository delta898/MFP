const SUPPORTED_SCHEMA_VERSION = 1;
const ALLOWED_KINDS = new Set(['support', 'resource', 'affiliate']);
const ALLOWED_ICONS = new Set(['heart', 'coffee', 'book', 'link', 'sparkles']);
const ALLOWED_MEDIA_TYPES = new Set(['image/webp', 'image/png', 'image/jpeg']);
const ALLOWED_MEDIA_BUCKET = 'app-public-content';

function normalizeText(value, maxLength) {
    const text = String(value || '').trim();
    if (!text || text.length > maxLength) return '';
    return text;
}

function normalizeOptionalText(value, maxLength) {
    const text = String(value || '').trim();
    return text.length <= maxLength ? text : '';
}

function normalizeHttpsUrl(value) {
    try {
        const url = new URL(String(value || '').trim());
        const hostname = url.hostname.toLowerCase();
        if (url.protocol !== 'https:') return '';
        if (hostname === 'localhost' || hostname.endsWith('.localhost')) return '';
        if (hostname === '127.0.0.1' || hostname === '::1') return '';
        url.username = '';
        url.password = '';
        return url.toString();
    } catch (_) {
        return '';
    }
}

function normalizeObjectPath(value) {
    const path = String(value || '').trim().replace(/^\/+/, '');
    if (!path || path.length > 500 || path.includes('\\')) return '';
    const segments = path.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return '';
    return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

function normalizeMedia(rawMedia, options = {}) {
    if (!rawMedia || typeof rawMedia !== 'object' || Array.isArray(rawMedia)) return null;
    if (rawMedia.kind !== 'image' || rawMedia.transport !== 'supabase_storage') return null;
    if (rawMedia.bucket !== ALLOWED_MEDIA_BUCKET) return null;
    if (!ALLOWED_MEDIA_TYPES.has(String(rawMedia.mime_type || '').trim())) return null;

    const objectPath = normalizeObjectPath(rawMedia.object_path);
    const width = Number(rawMedia.width);
    const height = Number(rawMedia.height);
    const revision = Number(rawMedia.revision);
    if (!objectPath || !Number.isInteger(width) || width < 1 || width > 4000) return null;
    if (!Number.isInteger(height) || height < 1 || height > 4000) return null;
    if (!Number.isInteger(revision) || revision < 1) return null;

    let storageOrigin;
    try {
        storageOrigin = new URL(String(options.storageOrigin || '')).origin;
    } catch (_) {
        return null;
    }
    if (!storageOrigin.startsWith('https://')) return null;

    return {
        url: `${storageOrigin}/storage/v1/object/public/${ALLOWED_MEDIA_BUCKET}/${objectPath}?v=${revision}`,
        mimeType: String(rawMedia.mime_type).trim(),
        alt: normalizeOptionalText(rawMedia.alt, 240),
        width,
        height,
        revision
    };
}

function normalizeBlock(rawBlock, options = {}) {
    if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) return null;

    const id = normalizeText(rawBlock.id, 80);
    const title = normalizeText(rawBlock.title, 24);
    const kind = String(rawBlock.kind || '').trim();
    const presentation = String(rawBlock.presentation || '').trim();
    const targetUrl = normalizeHttpsUrl(rawBlock.target_url);
    const sortOrder = Number(rawBlock.sort_order);
    if (!id || !title || !ALLOWED_KINDS.has(kind)) return null;
    if (presentation !== 'nav_item' || !targetUrl) return null;
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) return null;

    const disclosure = kind === 'affiliate'
        ? (normalizeOptionalText(rawBlock.disclosure, 240) || '제휴')
        : normalizeOptionalText(rawBlock.disclosure, 240);

    return {
        id,
        kind,
        presentation,
        title,
        icon: ALLOWED_ICONS.has(String(rawBlock.icon || '').trim())
            ? String(rawBlock.icon).trim()
            : 'link',
        media: normalizeMedia(rawBlock.media, options),
        targetUrl,
        ctaLabel: normalizeOptionalText(rawBlock.cta_label, 80),
        disclosure,
        sortOrder
    };
}

function normalizeCompactCardBlock(rawBlock, options = {}, allowedKinds = ALLOWED_KINDS) {
    if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) return null;

    const id = normalizeText(rawBlock.id, 80);
    const title = normalizeText(rawBlock.title, 80);
    const kind = String(rawBlock.kind || '').trim();
    const presentation = String(rawBlock.presentation || '').trim();
    const targetUrl = normalizeHttpsUrl(rawBlock.target_url);
    const sortOrder = Number(rawBlock.sort_order);
    if (!id || !title || !allowedKinds.has(kind)) return null;
    if (presentation !== 'compact_card' || !targetUrl) return null;
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) return null;

    const disclosure = kind === 'affiliate'
        ? (normalizeOptionalText(rawBlock.disclosure, 240) || '제휴')
        : normalizeOptionalText(rawBlock.disclosure, 240);

    return {
        id,
        kind,
        presentation,
        title,
        icon: ALLOWED_ICONS.has(String(rawBlock.icon || '').trim())
            ? String(rawBlock.icon).trim()
            : 'link',
        media: normalizeMedia(rawBlock.media, options),
        targetUrl,
        ctaLabel: normalizeOptionalText(rawBlock.cta_label, 80),
        disclosure,
        sortOrder
    };
}

function normalizeSidebarPayload(rawPayload, options = {}) {
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return null;
    if (Number(rawPayload.schema_version) !== SUPPORTED_SCHEMA_VERSION) return null;
    if (String(rawPayload.surface || '').trim() !== 'sidebar') return null;

    const rawBlocks = rawPayload.regions?.utility?.blocks;
    if (rawBlocks != null && !Array.isArray(rawBlocks)) return null;

    const seen = new Set();
    const blocks = (Array.isArray(rawBlocks) ? rawBlocks : [])
        .map((block) => normalizeBlock(block, options))
        .filter(Boolean)
        .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
        .filter((block) => {
            if (seen.has(block.id)) return false;
            seen.add(block.id);
            return true;
        })
        .slice(0, 3);

    return {
        schemaVersion: SUPPORTED_SCHEMA_VERSION,
        policyRevision: Math.max(0, Number(rawPayload.policy_revision) || 0),
        surface: 'sidebar',
        regions: {
            utility: { blocks }
        },
        generatedAt: String(rawPayload.generated_at || '').trim()
    };
}

function normalizeCompactCardPayload(rawPayload, options, surface, allowedKinds) {
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return null;
    if (Number(rawPayload.schema_version) !== SUPPORTED_SCHEMA_VERSION) return null;
    if (String(rawPayload.surface || '').trim() !== surface) return null;

    const rawBlocks = rawPayload.regions?.supporting?.blocks;
    if (rawBlocks != null && !Array.isArray(rawBlocks)) return null;

    const seen = new Set();
    const blocks = (Array.isArray(rawBlocks) ? rawBlocks : [])
        .map((block) => normalizeCompactCardBlock(block, options, allowedKinds))
        .filter(Boolean)
        .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
        .filter((block) => {
            if (seen.has(block.id)) return false;
            seen.add(block.id);
            return true;
        })
        .slice(0, 10);

    return {
        schemaVersion: SUPPORTED_SCHEMA_VERSION,
        policyRevision: Math.max(0, Number(rawPayload.policy_revision) || 0),
        surface,
        regions: {
            supporting: { blocks }
        },
        generatedAt: String(rawPayload.generated_at || '').trim()
    };
}

function normalizeDashboardPayload(rawPayload, options = {}) {
    return normalizeCompactCardPayload(rawPayload, options, 'dashboard', ALLOWED_KINDS);
}

function normalizeAccountPayload(rawPayload, options = {}) {
    return normalizeCompactCardPayload(rawPayload, options, 'account', new Set(['resource']));
}

module.exports = {
    normalizeSidebarPayload,
    normalizeDashboardPayload,
    normalizeAccountPayload
};
