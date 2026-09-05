const test = require('node:test');
const assert = require('node:assert/strict');
const { createCardNewsSourceService } = require('./source-service');

test('configured feeds expose public articles while isolating a failing feed', async () => {
    const service = createCardNewsSourceService({
        fetchFeed: async (url) => {
            if (url.includes('naver.com')) throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
            return [
                { guid: 'wp-1', title: '최근 글', link: 'https://blog.example/recent', pubDate: '2026-09-04T02:00:00Z', summary: '요약' },
                { guid: 'wp-0', title: '이전 글', link: 'https://blog.example/older', pubDate: '2026-09-03T02:00:00Z' }
            ];
        },
        fetchPublicDocument: async () => ({})
    });

    const result = await service.discoverConfiguredArticles({
        NAVER_ID: 'writer',
        WORDPRESS_URL: 'https://blog.example'
    });

    assert.equal(result.configured_feed_count, 2);
    assert.deepEqual(result.configured_sources, ['naver', 'wordpress']);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].source_platform, 'naver');
    assert.deepEqual(result.articles.map((item) => item.item_key), ['wp-1', 'wp-0']);
    assert.equal(result.articles[0].source_platform, 'wordpress');
});

test('configured discovery includes custom RSS metadata and keeps identities feed-scoped', async () => {
    const service = createCardNewsSourceService({
        async fetchFeed() {
            return [{ guid: 'shared-guid', link: 'https://example.com/post', title: '글' }];
        },
        async fetchPublicDocument() { return {}; }
    });
    const result = await service.discoverConfiguredArticles({
        NAVER_ID: 'writer',
        CARD_NEWS_RSS_SOURCES: [{ name: '업계 뉴스', url: 'https://news.example/rss' }]
    });

    assert.deepEqual(result.feed_sources.map((feed) => feed.label), ['네이버', '업계 뉴스']);
    assert.equal(new Set(result.articles.map((article) => article.item_key)).size, 2);
    assert.equal(result.articles.find((article) => article.feed_label === '업계 뉴스').source_platform, result.feed_sources[1].source_platform);
});

test('feed item keeps RSS identity but resolves the current article body', async () => {
    const service = createCardNewsSourceService({
        fetchFeed: async () => [],
        fetchPublicDocument: async (url) => ({
            url: `${url}?current=1`,
            title: '플랫폼에서 수정한 제목',
            text: '플랫폼에서 수정한 현재 본문'
        }),
        now: () => '2026-09-04T03:00:00.000Z'
    });

    const snapshot = await service.resolveSourceSnapshot({
        kind: 'feed_item',
        feed_url: 'https://blog.example/feed/',
        item_key: 'stable-rss-key',
        canonical_url: 'https://blog.example/post',
        title: 'RSS 제목',
        feed_label: '업계 뉴스'
    });

    assert.equal(snapshot.source.item_key, 'stable-rss-key');
    assert.equal(snapshot.source.feed_label, '업계 뉴스');
    assert.equal(snapshot.title, '플랫폼에서 수정한 제목');
    assert.equal(snapshot.text, '플랫폼에서 수정한 현재 본문');
    assert.equal(snapshot.excerpt, '플랫폼에서 수정한 현재 본문');
    assert.equal(snapshot.retrieved_at, '2026-09-04T03:00:00.000Z');
});

test('feed preview uses the fetched page body instead of the short RSS summary', async () => {
    const fullText = '페이지 본문 '.repeat(250);
    const service = createCardNewsSourceService({
        fetchFeed: async () => [],
        fetchPublicDocument: async () => ({ text: `${fullText} 더 읽기` })
    });

    const snapshot = await service.resolveSourceSnapshot({
        kind: 'feed_item',
        feed_url: 'https://blog.example/feed/',
        item_key: 'stable-rss-key',
        canonical_url: 'https://blog.example/post',
        title: 'RSS 제목',
        preview_text: '더 읽기'
    });

    assert.ok(snapshot.excerpt.length > 500);
    assert.match(snapshot.excerpt, /^페이지 본문/);
    assert.doesNotMatch(snapshot.excerpt, /더 읽기$/);
});

test('manuscript resolution never requires a network fetch', async () => {
    let calls = 0;
    const service = createCardNewsSourceService({
        fetchFeed: async () => [],
        fetchPublicDocument: async () => { calls += 1; },
        now: () => '2026-09-04T04:00:00.000Z'
    });

    const snapshot = await service.resolveSourceSnapshot({ kind: 'manuscript', title: '메모', text: '직접 쓴 원고' });

    assert.equal(calls, 0);
    assert.equal(snapshot.text, '직접 쓴 원고');
    assert.equal(snapshot.canonical_url, '');
});

test('public document without readable text fails explicitly', async () => {
    const service = createCardNewsSourceService({
        fetchFeed: async () => [],
        fetchPublicDocument: async () => ({ title: '빈 페이지', text: '' })
    });

    await assert.rejects(
        () => service.resolveSourceSnapshot({ kind: 'url', url: 'https://example.com/empty' }),
        (error) => error.code === 'CARD_NEWS_SOURCE_EMPTY'
    );
});
