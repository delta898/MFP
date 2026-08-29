const crypto = require('crypto');
const { createAccessTokenCache } = require('../../trend-posting/access-token-cache');
const { createTrendPostingRemoteClient } = require('../../trend-posting/remote-client');
const { aggregateTrendKeywords } = require('../../trend-posting/query');

const DEFAULT_PROVIDER_ID = 'naver-trends';
const DEFAULT_VENDOR = 'naver_trend_posting';

function normalizeList(value) {
    const items = Array.isArray(value) ? value : String(value || '').split(',');
    return Array.from(new Set(items.map((item) => String(item || '').trim()).filter(Boolean)));
}

function resolveLatestDate(meta = {}) {
    const available = Array.isArray(meta.availableDates) ? meta.availableDates.map(String).filter(Boolean) : [];
    return String(meta?.dateRange?.max || available.sort().at(-1) || '').trim();
}

function buildSummary(item = {}) {
    const parts = [];
    if (Array.isArray(item.categories) && item.categories.length > 0) parts.push(item.categories.join(', '));
    if (item.latestTrendDate) parts.push(item.latestTrendDate);
    if (item.change?.type === 'new') parts.push('신규');
    if (item.change?.type === 'up' && Number.isFinite(item.change.amount)) parts.push(`상승 ${item.change.amount}`);
    if (item.change?.type === 'down' && Number.isFinite(item.change.amount)) parts.push(`하락 ${item.change.amount}`);
    return parts.join(' · ');
}

function finiteNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function stableTrendItemId(providerId, keyword, observedAt, categories = []) {
    const identity = [providerId, keyword, observedAt, ...categories].join(':');
    return `trend_${crypto.createHash('sha256').update(identity).digest('hex')}`;
}

function resolveTrendObservedAt(value, fallback) {
    const date = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Date(`${date}T00:00:00+09:00`).toISOString();
    const parsed = Date.parse(date);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function normalizeNaverTrendItem(item = {}, definition = {}, options = {}) {
    const changeAmount = finiteNumberOrNull(item.change?.amount);
    const displayOrder = finiteNumberOrNull(item.displayOrder);
    const providerId = String(definition.id || DEFAULT_PROVIDER_ID).trim();
    const keyword = String(item.keyword || '').trim();
    const categories = Array.isArray(item.categories) ? item.categories.map(String).filter(Boolean) : [];
    const fallbackObservedAt = new Date(options.now || Date.now()).toISOString();
    const observedAt = resolveTrendObservedAt(item.latestTrendDate, fallbackObservedAt);
    return {
        id: stableTrendItemId(providerId, keyword, observedAt, categories),
        title: keyword,
        summary: buildSummary(item),
        observed_at: observedAt,
        url: '',
        source: 'naver-trend-posting',
        publisher: '',
        keyword,
        categories,
        change_type: String(item.change?.type || 'steady').trim(),
        change_amount: Number.isFinite(changeAmount) ? changeAmount : null,
        score: item.change?.type === 'up' && Number.isFinite(changeAmount) ? changeAmount : 0,
        ...(Number.isFinite(displayOrder) ? { display_order: displayOrder } : {})
    };
}

function createDefaultNaverTrendsDefinition(options = {}) {
    const baseUrl = String(options.baseUrl || '').trim().replace(/\/+$/, '');
    return {
        id: DEFAULT_PROVIDER_ID,
        kind: 'trends',
        transport: 'builtin_api',
        enabled: true,
        label: 'Naver Trend Posting',
        config: {
            vendor: DEFAULT_VENDOR,
            categories: [],
            limit: 10,
            ...(baseUrl ? { base_url: baseUrl } : {})
        }
    };
}

function createNaverTrendsProvider(options = {}) {
    const axios = options.axios;
    const License = options.License;
    const injectedClient = options.remoteClient || null;
    const runtimeBaseUrl = String(options.runtimeBaseUrl || '').trim().replace(/\/+$/, '');
    const now = typeof options.now === 'function' ? options.now : () => new Date();
    const clients = new Map();

    function getClient(config = {}) {
        if (injectedClient) return injectedClient;
        if (!axios || typeof axios.get !== 'function') throw new Error('Naver trends provider requires axios');
        if (!License || typeof License.issueTrendsAccessToken !== 'function') {
            throw new Error('Naver trends provider requires licensed access');
        }
        const baseUrl = runtimeBaseUrl;
        if (!baseUrl) {
            const error = new Error('현재 환경의 Trends API가 설정되지 않았습니다.');
            error.code = 'TRENDS_API_NOT_CONFIGURED';
            throw error;
        }
        if (clients.has(baseUrl)) return clients.get(baseUrl);
        const tokenCache = createAccessTokenCache({ issueToken: () => License.issueTrendsAccessToken() });
        const client = createTrendPostingRemoteClient({
            axios,
            tokenCache,
            baseUrl
        });
        clients.set(baseUrl, client);
        return client;
    }

    return {
        id: `trends:${DEFAULT_VENDOR}`,
        async fetch({ definition = {}, query = {} }) {
            const config = definition.config || {};
            const client = getClient(config);
            const meta = await client.getMeta();
            if (!meta?.success) throw new Error(meta?.message || 'invalid Naver trends metadata');
            const latestDate = String(query.dateTo || query.date_to || resolveLatestDate(meta)).trim();
            if (!latestDate) return [];

            const configuredCategories = normalizeList(query.categories || config.categories);
            const availableCategories = normalizeList(meta.categories);
            const categories = (configuredCategories.length > 0 ? configuredCategories : availableCategories).slice(0, 5);
            if (categories.length === 0) return [];

            const dateFrom = String(query.dateFrom || query.date_from || latestDate).trim();
            const limit = Math.max(1, Math.min(20, Number(query.limit || config.limit || 10)));
            const result = await client.getRows({ categories, dateFrom, dateTo: latestDate });
            if (!result?.success || !Array.isArray(result.items)) {
                throw new Error(result?.message || 'invalid Naver trends response');
            }

            const snapshotObservedAt = new Date(now()).toISOString();
            const items = aggregateTrendKeywords(result.items)
                .map((item) => normalizeNaverTrendItem(item, definition, { now: snapshotObservedAt }))
                .filter((item) => item.title)
                .slice(0, limit);
            const ttlSeconds = Math.max(60, Math.min(86400, Number(config.snapshot_ttl_seconds) || 900));
            const snapshotIdentity = `${definition.id}:${snapshotObservedAt}:${items.map((item) => item.id).join(',')}`;
            return {
                schema_version: 1,
                snapshot_id: `ks_${crypto.createHash('sha256').update(snapshotIdentity).digest('hex')}`,
                kind: 'trends',
                provider_id: String(definition.id || DEFAULT_PROVIDER_ID).trim(),
                transport: String(definition.transport || 'builtin_api').trim(),
                freshness: 'fresh',
                observed_at: snapshotObservedAt,
                expires_at: new Date(Date.parse(snapshotObservedAt) + ttlSeconds * 1000).toISOString(),
                items
            };
        }
    };
}

module.exports = {
    DEFAULT_PROVIDER_ID,
    DEFAULT_VENDOR,
    createDefaultNaverTrendsDefinition,
    createNaverTrendsProvider,
    normalizeNaverTrendItem,
    resolveLatestDate,
    stableTrendItemId
};
