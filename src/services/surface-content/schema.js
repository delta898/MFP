const SUPPORTED_SCHEMA_VERSION = 1;
const ALLOWED_KINDS = new Set(['support', 'resource', 'affiliate']);
const ALLOWED_ICONS = new Set(['heart', 'coffee', 'book', 'link', 'sparkles']);
const ALLOWED_MEDIA_TYPES = new Set(['image/webp', 'image/png', 'image/jpeg']);

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

function normalizeMedia(rawMedia, options = {}) {
    if (!rawMedia || typeof rawMedia !== 'object' || Array.isArray(rawMedia)) return null;
    if (rawMedia.kind !== 'image' || typeof options.resolveMedia !== 'function') return null;

    let resolved;
    try {
        resolved = options.resolveMedia(rawMedia);
    } catch (_) {
        return null;
    }
    if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved)) return null;

    const url = normalizeHttpsUrl(resolved.url);
    const mimeType = String(resolved.mimeType || '').trim();
    const width = Number(resolved.width);
    const height = Number(resolved.height);
    const revision = Number(resolved.revision);
    if (!url || !ALLOWED_MEDIA_TYPES.has(mimeType)) return null;
    if (!Number.isInteger(width) || width < 1 || width > 4000) return null;
    if (!Number.isInteger(height) || height < 1 || height > 4000) return null;
    if (!Number.isInteger(revision) || revision < 1) return null;

    return {
        url,
        mimeType,
        alt: normalizeOptionalText(resolved.alt, 240),
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

function normalizeCompactCardRegion(rawRegion, options, allowedKinds) {
    if (rawRegion != null && (typeof rawRegion !== 'object' || Array.isArray(rawRegion))) return null;
    const rawBlocks = rawRegion?.blocks;
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

    return { blocks };
}

function normalizeCompactCardPayload(rawPayload, options, surface, regionKinds) {
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return null;
    if (Number(rawPayload.schema_version) !== SUPPORTED_SCHEMA_VERSION) return null;
    if (String(rawPayload.surface || '').trim() !== surface) return null;

    const regions = {};
    for (const [region, allowedKinds] of Object.entries(regionKinds)) {
        const normalized = normalizeCompactCardRegion(rawPayload.regions?.[region], options, allowedKinds);
        if (!normalized) return null;
        regions[region] = normalized;
    }

    return {
        schemaVersion: SUPPORTED_SCHEMA_VERSION,
        policyRevision: Math.max(0, Number(rawPayload.policy_revision) || 0),
        surface,
        regions,
        generatedAt: String(rawPayload.generated_at || '').trim()
    };
}

function normalizeDashboardPayload(rawPayload, options = {}) {
    return normalizeCompactCardPayload(rawPayload, options, 'dashboard', {
        supporting: ALLOWED_KINDS,
        recommendations: new Set(['resource'])
    });
}

function normalizeAccountPayload(rawPayload, options = {}) {
    return normalizeCompactCardPayload(rawPayload, options, 'account', {
        supporting: new Set(['resource'])
    });
}

function normalizeHelpPayload(rawPayload, options = {}) {
    return normalizeCompactCardPayload(rawPayload, options, 'help', {
        getting_started: new Set(['resource']),
        writing: new Set(['resource']),
        automation: new Set(['resource']),
        supporting: ALLOWED_KINDS
    });
}

module.exports = {
    normalizeSidebarPayload,
    normalizeDashboardPayload,
    normalizeAccountPayload,
    normalizeHelpPayload
};
