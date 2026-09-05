const crypto = require('node:crypto');
const { resolveSnsFeedDefinitions } = require('../social/sns-rss-discovery');

const CARD_NEWS_CUSTOM_RSS_SOURCE_LIMIT = 20;
const CARD_NEWS_BUILTIN_SOURCE_IDS = ['naver', 'wordpress'];

function compact(value, maxLength = 4000) {
    return String(value || '').trim().slice(0, maxLength);
}

function normalizeRssUrl(value) {
    const raw = compact(value);
    if (!raw) throw new Error('RSS 주소를 입력해 주세요.');
    let parsed;
    try {
        parsed = new URL(raw);
    } catch (_error) {
        throw new Error('RSS 주소가 올바르지 않습니다.');
    }
    if (parsed.protocol !== 'https:') throw new Error('RSS 주소는 https:// 형식이어야 합니다.');
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.toString();
}

function sourceIdForUrl(url) {
    return `rss-${crypto.createHash('sha256').update(url, 'utf8').digest('hex').slice(0, 12)}`;
}

function fallbackSourceName(url) {
    try { return new URL(url).hostname.replace(/^www\./i, ''); } catch (_error) { return 'RSS'; }
}

function normalizeCardNewsRssSources(value, options = {}) {
    const strict = options.strict === true;
    const items = Array.isArray(value) ? value : [];
    const results = [];
    const seenUrls = new Set();
    for (const item of items.slice(0, CARD_NEWS_CUSTOM_RSS_SOURCE_LIMIT)) {
        try {
            const url = normalizeRssUrl(item?.url);
            if (seenUrls.has(url)) continue;
            seenUrls.add(url);
            results.push({
                id: sourceIdForUrl(url),
                name: compact(item?.name, 80) || fallbackSourceName(url),
                url,
                enabled: item?.enabled !== false
            });
        } catch (error) {
            if (strict) throw error;
        }
    }
    return results;
}

function normalizeCardNewsBuiltinSources(value) {
    if (!Array.isArray(value)) return [...CARD_NEWS_BUILTIN_SOURCE_IDS];
    return [...new Set(value.map((item) => compact(item, 30).toLowerCase()))]
        .filter((item) => CARD_NEWS_BUILTIN_SOURCE_IDS.includes(item));
}

function resolveCardNewsFeedDefinitions(config = {}) {
    const enabledBuiltinSources = new Set(normalizeCardNewsBuiltinSources(config.CARD_NEWS_BUILTIN_SOURCES));
    const configured = resolveSnsFeedDefinitions(config).filter((feed) => enabledBuiltinSources.has(feed.sourcePlatform)).map((feed) => ({
        id: feed.sourcePlatform,
        label: feed.sourcePlatform === 'naver' ? '네이버' : 'WordPress',
        sourcePlatform: feed.sourcePlatform,
        url: feed.url,
        origin: 'configured_blog'
    }));
    const custom = normalizeCardNewsRssSources(config.CARD_NEWS_RSS_SOURCES).filter((source) => source.enabled).map((source) => ({
        id: source.id,
        label: source.name,
        sourcePlatform: source.id,
        url: source.url,
        origin: 'custom_rss'
    }));
    return [...configured, ...custom];
}

module.exports = {
    CARD_NEWS_CUSTOM_RSS_SOURCE_LIMIT,
    CARD_NEWS_BUILTIN_SOURCE_IDS,
    normalizeRssUrl,
    normalizeCardNewsBuiltinSources,
    normalizeCardNewsRssSources,
    resolveCardNewsFeedDefinitions
};
