const test = require('node:test');
const assert = require('node:assert/strict');
const {
    CARD_NEWS_CUSTOM_RSS_SOURCE_LIMIT,
    normalizeCardNewsBuiltinSources,
    normalizeCardNewsRssSources,
    resolveCardNewsFeedDefinitions
} = require('./feed-sources');

test('custom Card News RSS sources are limited to three beyond configured blogs', () => {
    const inputs = Array.from({ length: 4 }, (_, index) => ({
        name: `추가 RSS ${index + 1}`,
        url: `https://feed-${index + 1}.example/rss`
    }));
    assert.equal(CARD_NEWS_CUSTOM_RSS_SOURCE_LIMIT, 3);
    assert.equal(normalizeCardNewsRssSources(inputs).length, 3);
    assert.throws(
        () => normalizeCardNewsRssSources(inputs, { strict: true }),
        /최대 3개/
    );
});

test('custom Card News RSS sources require HTTPS, deduplicate URLs, and derive stable ids', () => {
    const sources = normalizeCardNewsRssSources([
        { name: '새 소식', url: 'https://Example.com/feed#latest' },
        { name: '중복', url: 'https://example.com/feed' },
        { name: '비활성', url: 'https://disabled.example/rss', enabled: false }
    ], { strict: true });

    assert.equal(sources.length, 2);
    assert.equal(sources[0].url, 'https://example.com/feed');
    assert.match(sources[0].id, /^rss-[a-f0-9]{12}$/);
    assert.equal(sources[1].enabled, false);
    assert.throws(() => normalizeCardNewsRssSources([{ url: 'http://example.com/feed' }], { strict: true }), /https/);
});

test('configured blog sources default on and can be independently excluded', () => {
    assert.deepEqual(normalizeCardNewsBuiltinSources(undefined), ['naver', 'wordpress']);
    assert.deepEqual(normalizeCardNewsBuiltinSources(['wordpress', 'unknown', 'wordpress']), ['wordpress']);
    const feeds = resolveCardNewsFeedDefinitions({
        NAVER_ID: 'writer',
        WORDPRESS_URL: 'https://wp.example/blog',
        CARD_NEWS_BUILTIN_SOURCES: ['naver']
    });
    assert.deepEqual(feeds.map((feed) => feed.sourcePlatform), ['naver']);
});

test('feed definitions combine configured blogs and enabled custom RSS sources', () => {
    const feeds = resolveCardNewsFeedDefinitions({
        NAVER_ID: 'writer',
        WORDPRESS_URL: 'https://wp.example/blog',
        CARD_NEWS_RSS_SOURCES: [
            { name: '업계 뉴스', url: 'https://news.example/rss' },
            { name: '꺼진 피드', url: 'https://off.example/rss', enabled: false }
        ]
    });

    assert.deepEqual(feeds.map((feed) => feed.label), ['네이버', 'WordPress', '업계 뉴스']);
    assert.equal(feeds[2].origin, 'custom_rss');
});
