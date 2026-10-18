const crypto = require('crypto');

const TOPIC_FACET_KINDS = Object.freeze(['keyword', 'category', 'platform']);
const TOPIC_FACET_SCOPES = Object.freeze(['content', 'generic', 'naver', 'wordpress']);

function normalizeDisplayValue(value, maxLength = 180) {
    let text = String(value ?? '');
    try { text = text.normalize('NFKC'); } catch (_ignore) { }
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function normalizeFacetValue(value) {
    return normalizeDisplayValue(value).toLowerCase();
}

function createTopicFacet(kind, scope, value) {
    const normalizedKind = String(kind || '').trim().toLowerCase();
    const normalizedScope = String(scope || '').trim().toLowerCase();
    const displayValue = normalizeDisplayValue(value);
    const normalizedValue = normalizeFacetValue(displayValue);
    if (!TOPIC_FACET_KINDS.includes(normalizedKind)) return null;
    if (!TOPIC_FACET_SCOPES.includes(normalizedScope)) return null;
    if (!normalizedValue) return null;

    const digest = crypto
        .createHash('sha256')
        .update(`${normalizedKind}\u0000${normalizedScope}\u0000${normalizedValue}`)
        .digest('hex');
    return {
        id: `topic_facet:${digest}`,
        kind: normalizedKind,
        scope: normalizedScope,
        normalized_value: normalizedValue,
        display_value: displayValue
    };
}

function splitFacetList(value) {
    const rawItems = Array.isArray(value) ? value : [value];
    return rawItems
        .flatMap((item) => String(item ?? '').split(/[,;\n\r]+/))
        .map((item) => normalizeDisplayValue(item))
        .filter(Boolean);
}

function parseCategoryFacets(value) {
    const displayValue = normalizeDisplayValue(value);
    if (!displayValue) return [];

    const scopedFacets = [];
    const pattern = /(?:^|,)\s*([NW])\s*:\s*([^,]*)/gi;
    let match = pattern.exec(displayValue);
    while (match) {
        const scope = String(match[1] || '').toUpperCase() === 'N' ? 'naver' : 'wordpress';
        const facet = createTopicFacet('category', scope, match[2]);
        if (facet) scopedFacets.push(facet);
        match = pattern.exec(displayValue);
    }
    if (scopedFacets.length > 0 || /(?:^|,)\s*[NW]\s*:/i.test(displayValue)) {
        return scopedFacets;
    }

    const genericFacet = createTopicFacet('category', 'generic', displayValue);
    return genericFacet ? [genericFacet] : [];
}

function buildTopicFacets(payload = {}) {
    const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    const facets = [];

    for (const keyword of splitFacetList(source.keywords)) {
        const facet = createTopicFacet('keyword', 'content', keyword);
        if (facet) facets.push(facet);
    }
    for (const platform of splitFacetList(source.platform)) {
        const facet = createTopicFacet('platform', 'content', platform);
        if (facet) facets.push(facet);
    }
    facets.push(...parseCategoryFacets(source.category));

    const uniqueFacets = new Map();
    for (const facet of facets) {
        if (!uniqueFacets.has(facet.id)) uniqueFacets.set(facet.id, facet);
    }
    return [...uniqueFacets.values()];
}

module.exports = {
    TOPIC_FACET_KINDS,
    TOPIC_FACET_SCOPES,
    normalizeDisplayValue,
    normalizeFacetValue,
    createTopicFacet,
    splitFacetList,
    parseCategoryFacets,
    buildTopicFacets
};
