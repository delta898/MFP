const axios = require('axios');

function buildTitle(item = {}) {
    return String(item.query || '').trim();
}

function buildSummary(item = {}) {
    const searchVolume = Number(item.search_volume || 0);
    const increase = Number(item.increase_percentage || 0);
    const categoryNames = Array.isArray(item.categories) ? item.categories.map((entry) => String(entry?.name || '').trim()).filter(Boolean) : [];
    const parts = [];
    if (searchVolume > 0) parts.push(`검색량 ${searchVolume}`);
    if (increase > 0) parts.push(`증가율 ${increase}%`);
    if (categoryNames.length > 0) parts.push(`카테고리 ${categoryNames.join(', ')}`);
    return parts.join(' · ');
}

function normalizeTrendItem(item = {}, definition = {}) {
    const categoryNames = Array.isArray(item.categories) ? item.categories.map((entry) => String(entry?.name || '').trim()).filter(Boolean) : [];
    return {
        title: buildTitle(item),
        summary: buildSummary(item),
        score: Number(item.increase_percentage || 0) || Number(item.search_volume || 0) || 0,
        timestamp: item.start_timestamp ? new Date(Number(item.start_timestamp) * 1000).toISOString() : '',
        metadata: {
            query: String(item.query || '').trim(),
            active: item.active === true,
            search_volume: Number(item.search_volume || 0) || 0,
            increase_percentage: Number(item.increase_percentage || 0) || 0,
            categories: categoryNames,
            trend_breakdown: Array.isArray(item.trend_breakdown) ? item.trend_breakdown : [],
            serpapi_google_trends_link: String(item.serpapi_google_trends_link || '').trim(),
            serpapi_news_link: String(item.serpapi_news_link || '').trim(),
            provider_id: String(definition.id || '').trim(),
            vendor: 'serpapi'
        }
    };
}

function createSerpApiTrendsProvider() {
    return {
        id: 'trends:serpapi',
        async fetch({ definition = {}, query = {}, transportContext = {} }) {
            const config = definition.config || {};
            const apiKey = String(config.api_key || '').trim();
            if (!apiKey) {
                throw new Error('SerpApi trends provider requires api_key');
            }
            const httpClient = transportContext.httpClient || axios;

            const geo = String(query.geo || config.geo || 'KR').trim() || 'KR';
            const hl = String(query.hl || config.hl || 'ko').trim() || 'ko';
            const hours = Number.isFinite(Number(query.hours)) ? Math.max(4, Math.min(168, Number(query.hours))) : Math.max(4, Math.min(168, Number(config.hours || 24)));
            const limit = Number.isFinite(Number(query.limit)) ? Math.max(1, Math.min(20, Number(query.limit))) : Math.max(1, Math.min(20, Number(config.limit || 10)));
            const params = {
                engine: 'google_trends_trending_now',
                api_key: apiKey,
                geo,
                hl,
                hours,
                no_cache: config.no_cache === true ? 'true' : 'false'
            };

            if (config.category_id !== undefined && config.category_id !== null && String(config.category_id).trim() !== '') {
                params.category_id = String(config.category_id).trim();
            }
            if (config.only_active === true || query.only_active === true) {
                params.only_active = 'true';
            }

            const response = await httpClient.get('https://serpapi.com/search.json', {
                params,
                timeout: 30000
            });

            const rawItems = Array.isArray(response?.data?.trending_searches) ? response.data.trending_searches : [];
            return rawItems
                .map((item) => normalizeTrendItem(item, definition))
                .filter((item) => item.title)
                .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
                .slice(0, limit);
        }
    };
}

module.exports = {
    createSerpApiTrendsProvider
};
