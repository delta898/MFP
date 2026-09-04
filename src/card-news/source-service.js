const { normalizeCardNewsSource, createCardNewsContractError } = require('./contract');
const { resolveSnsFeedDefinitions, sortOldestFirst } = require('../social/sns-rss-discovery');

function compact(value, maxLength = 50000) {
    return String(value || '').trim().slice(0, maxLength);
}

const CARD_NEWS_PREVIEW_TEXT_LIMIT = 1400;

function cleanPreviewText(value) {
    return compact(value, CARD_NEWS_PREVIEW_TEXT_LIMIT)
        .replace(/\s*(?:더 읽기|read more)\s*$/i, '')
        .trim();
}

function sourceKey(platform, feedUrl, item = {}) {
    return compact(item.guid || item.item_key || item.link || `${platform}:${feedUrl}:${item.title}`, 1000);
}

function createCardNewsSourceService(options = {}) {
    const fetchFeed = options.fetchFeed;
    const fetchPublicDocument = options.fetchPublicDocument;
    const now = options.now || (() => new Date().toISOString());

    async function discoverConfiguredArticles(config = {}) {
        if (typeof fetchFeed !== 'function') {
            throw new Error('카드뉴스 RSS 조회 기능이 필요합니다.');
        }
        const feeds = resolveSnsFeedDefinitions(config);
        const articles = [];
        const failures = [];
        for (const feed of feeds) {
            try {
                const items = await fetchFeed(feed.url);
                for (const item of sortOldestFirst(items).reverse()) {
                    try {
                        articles.push({
                            ...normalizeCardNewsSource({
                                kind: 'feed_item',
                                feed_url: feed.url,
                                item_key: sourceKey(feed.sourcePlatform, feed.url, item),
                                canonical_url: item.link,
                                title: item.title,
                                published_at: item.pubDate,
                                preview_text: item.summary || item.description || item.content
                            }),
                            source_platform: feed.sourcePlatform,
                            image_url: compact(item.imageUrl, 4000)
                        });
                    } catch (_error) {
                        // One malformed entry must not hide healthy entries from the same feed.
                    }
                }
            } catch (error) {
                failures.push({
                    source_platform: feed.sourcePlatform,
                    feed_url: feed.url,
                    code: compact(error?.code || 'CARD_NEWS_FEED_FETCH_FAILED', 100),
                    message: compact(error?.message || '블로그 글 목록을 불러오지 못했습니다.', 500)
                });
            }
        }
        return {
            articles,
            failures,
            configured_feed_count: feeds.length,
            configured_sources: feeds.map((feed) => feed.sourcePlatform)
        };
    }

    async function resolveSourceSnapshot(input = {}) {
        const source = normalizeCardNewsSource(input);
        if (source.kind === 'manuscript') {
            return {
                source,
                title: source.title,
                text: source.text,
                excerpt: cleanPreviewText(source.text),
                canonical_url: '',
                attribution: source.attribution,
                retrieved_at: now()
            };
        }
        if (typeof fetchPublicDocument !== 'function') {
            throw new Error('카드뉴스 공개 문서 조회 기능이 필요합니다.');
        }
        const document = await fetchPublicDocument(source.canonical_url);
        const text = compact(document?.text);
        if (!text) {
            throw createCardNewsContractError('CARD_NEWS_SOURCE_EMPTY', '선택한 글에서 카드뉴스로 만들 내용을 찾지 못했습니다.');
        }
        return {
            source,
            title: compact(document?.title || source.title, 300),
            text,
            excerpt: cleanPreviewText(document?.text || document?.excerpt || source.preview_text || text),
            canonical_url: compact(document?.url || source.canonical_url, 4000),
            attribution: compact(document?.attribution, 500),
            retrieved_at: now()
        };
    }

    return { discoverConfiguredArticles, resolveSourceSnapshot };
}

module.exports = { CARD_NEWS_PREVIEW_TEXT_LIMIT, createCardNewsSourceService };
