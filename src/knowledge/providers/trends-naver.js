const { createAccessTokenCache } = require('../../trend-posting/access-token-cache');
const {
    DEFAULT_TRENDS_API_BASE_URL,
    createTrendPostingRemoteClient
} = require('../../trend-posting/remote-client');
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

function normalizeNaverTrendItem(item = {}, definition = {}) {
    const changeAmount = finiteNumberOrNull(item.change?.amount);
    const displayOrder = finiteNumberOrNull(item.displayOrder);
    return {
        title: String(item.keyword || '').trim(),
        summary: buildSummary(item),
        score: item.change?.type === 'up' && Number.isFinite(changeAmount) ? changeAmount : 0,
        timestamp: item.latestTrendDate ? `${item.latestTrendDate}T00:00:00+09:00` : '',
        metadata: {
            keyword: String(item.keyword || '').trim(),
            categories: Array.isArray(item.categories) ? item.categories.map(String).filter(Boolean) : [],
            trend_date: String(item.latestTrendDate || '').trim(),
            change_type: String(item.change?.type || 'steady').trim(),
            change_amount: Number.isFinite(changeAmount) ? changeAmount : null,
            change_raw: String(item.change?.raw || '-').trim(),
            display_order: Number.isFinite(displayOrder) ? displayOrder : null,
            provider_id: String(definition.id || DEFAULT_PROVIDER_ID).trim(),
            vendor: DEFAULT_VENDOR,
            source: 'naver_trend',
            evidence_stage: 'observed',
            evidence_strength: 'weak'
        }
    };
}

function createDefaultNaverTrendsDefinition() {
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
            base_url: DEFAULT_TRENDS_API_BASE_URL
        }
    };
}

function createNaverTrendsProvider(options = {}) {
    const axios = options.axios;
    const License = options.License;
    const injectedClient = options.remoteClient || null;
    const clients = new Map();

    function getClient(config = {}) {
        if (injectedClient) return injectedClient;
        if (!axios || typeof axios.get !== 'function') throw new Error('Naver trends provider requires axios');
        if (!License || typeof License.issueTrendsAccessToken !== 'function') {
            throw new Error('Naver trends provider requires licensed access');
        }
        const baseUrl = String(config.base_url || DEFAULT_TRENDS_API_BASE_URL).replace(/\/+$/, '');
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

            return aggregateTrendKeywords(result.items)
                .map((item) => normalizeNaverTrendItem(item, definition))
                .filter((item) => item.title)
                .slice(0, limit);
        }
    };
}

module.exports = {
    DEFAULT_PROVIDER_ID,
    DEFAULT_VENDOR,
    createDefaultNaverTrendsDefinition,
    createNaverTrendsProvider,
    normalizeNaverTrendItem,
    resolveLatestDate
};
