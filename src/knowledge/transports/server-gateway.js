const ALLOWED_KINDS = new Set(['trends', 'news']);
const ALLOWED_PURPOSES = new Set(['content_ideas']);
const ALLOWED_LOCALES = new Set(['ko-KR']);
const ALLOWED_COUNTRIES = new Set(['KR']);

function compact(value, maxLength) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeGatewayQuery(query = {}, config = {}) {
    const requestedLimit = Number(query.limit || config.limit || 10);
    const requestedLocale = compact(query.locale || config.locale || 'ko-KR', 20) || 'ko-KR';
    const requestedCountry = compact(query.country || config.country || 'KR', 8).toUpperCase() || 'KR';
    return {
        topic: compact(query.topic || query.query, 180),
        locale: ALLOWED_LOCALES.has(requestedLocale) ? requestedLocale : 'ko-KR',
        country: ALLOWED_COUNTRIES.has(requestedCountry) ? requestedCountry : 'KR',
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
                query: normalizeGatewayQuery(query, definition.config)
            });
        }
    };
}

module.exports = {
    createServerGatewayTransport,
    normalizeGatewayQuery
};
