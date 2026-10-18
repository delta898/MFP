const ALLOWED_KINDS = new Set(['trends', 'news']);
const ALLOWED_PURPOSES = new Set(['content_ideas', 'serendipity']);
const CONTENT_ALLOWED_LOCALES = new Set(['ko-KR']);
const CONTENT_ALLOWED_COUNTRIES = new Set(['KR']);
const DISCOVERY_ALLOWED_LOCALES = new Set(['ko-KR', 'en-US']);
const DISCOVERY_ALLOWED_COUNTRIES = new Set(['KR', 'US']);
const ALLOWED_LANES = new Set([
    'headlines_kr', 'headlines_global', 'technology', 'business', 'science',
    'culture_lifestyle', 'travel_local'
]);

function compact(value, maxLength) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function boundedUniqueStrings(value, fallback, allowed, maxItems, maxLength) {
    const source = Array.isArray(value) ? value : (Array.isArray(fallback) ? fallback : []);
    return Array.from(new Set(source
        .map((item) => compact(item, maxLength))
        .filter((item) => item && (!allowed || allowed.has(item)))))
        .slice(0, maxItems);
}

function normalizeGatewayQuery(query = {}, config = {}, purpose = '') {
    const normalizedPurpose = compact(purpose || config.purpose || 'content_ideas', 40);
    const requestedLimit = Number(query.limit || config.limit || (normalizedPurpose === 'serendipity' ? 12 : 10));
    if (normalizedPurpose === 'serendipity') {
        return {
            lanes: boundedUniqueStrings(query.lanes, config.lanes, ALLOWED_LANES, 7, 40),
            locales: boundedUniqueStrings(query.locales, config.locales, DISCOVERY_ALLOWED_LOCALES, 2, 20),
            countries: boundedUniqueStrings(query.countries, config.countries, DISCOVERY_ALLOWED_COUNTRIES, 2, 8),
            exclude_ids: boundedUniqueStrings(query.exclude_ids, [], null, 100, 180),
            limit: Math.max(1, Math.min(20, Number.isFinite(requestedLimit) ? requestedLimit : 12))
        };
    }
    const requestedLocale = compact(query.locale || config.locale || 'ko-KR', 20) || 'ko-KR';
    const requestedCountry = compact(query.country || config.country || 'KR', 8).toUpperCase() || 'KR';
    return {
        topic: compact(query.topic || query.query, 180),
        locale: CONTENT_ALLOWED_LOCALES.has(requestedLocale) ? requestedLocale : 'ko-KR',
        country: CONTENT_ALLOWED_COUNTRIES.has(requestedCountry) ? requestedCountry : 'KR',
        limit: Math.max(1, Math.min(20, Number.isFinite(requestedLimit) ? requestedLimit : 10))
    };
}

function createServerGatewayTransport(options = {}) {
    const client = options.client;
    return {
        id: 'server_gateway',
        async fetch(definition = {}, query = {}) {
            if (!client || typeof client.fetchSnapshot !== 'function') {
                throw new Error('server_gateway client is unavailable');
            }
            const kind = compact(definition.kind, 40);
            const purpose = compact(query.purpose || definition?.config?.purpose || 'content_ideas', 40);
            if (!ALLOWED_KINDS.has(kind)) throw new Error(`server_gateway kind is not allowed: ${kind}`);
            if (!ALLOWED_PURPOSES.has(purpose)) throw new Error(`server_gateway purpose is not allowed: ${purpose}`);
            return client.fetchSnapshot({
                kind,
                purpose,
                query: normalizeGatewayQuery(query, definition.config, purpose)
            });
        }
    };
}

module.exports = {
    createServerGatewayTransport,
    normalizeGatewayQuery
};
