const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeCardNewsSource,
    normalizeCardNewsTextRenderMode,
    normalizeCardNewsAssets,
    assessCardNewsDelivery
} = require('./contract');
const { DEFAULT_SCOPES: GOOGLE_DEFAULT_SCOPES } = require('../google-oauth');

test('feed source keeps RSS identity separate from the current public article URL', () => {
    assert.deepEqual(normalizeCardNewsSource({
        kind: 'feed_item',
        feedUrl: 'https://blog.example/feed/',
        guid: 'post-42',
        canonicalUrl: 'https://blog.example/post/42#comments',
        title: '현재 공개된 글',
        publishedAt: '2026-09-04T01:00:00Z',
        previewText: 'RSS 미리보기'
    }), {
        kind: 'feed_item',
        feed_url: 'https://blog.example/feed/',
        item_key: 'post-42',
        canonical_url: 'https://blog.example/post/42',
        title: '현재 공개된 글',
        published_at: '2026-09-04T01:00:00Z',
        preview_text: 'RSS 미리보기'
    });
});

test('direct URL sources require public HTTPS-shaped input and strip fragments', () => {
    assert.equal(normalizeCardNewsSource({
        kind: 'url',
        url: 'https://example.com/article#section'
    }).canonical_url, 'https://example.com/article');
    assert.throws(
        () => normalizeCardNewsSource({ kind: 'url', url: 'http://example.com/article' }),
        (error) => error.code === 'CARD_NEWS_SOURCE_URL_INVALID'
    );
});

test('manuscript sources work without any remote URL', () => {
    assert.deepEqual(normalizeCardNewsSource({
        kind: 'manuscript',
        title: '직접 작성한 원고',
        text: '카드뉴스로 만들 본문입니다.'
    }), {
        kind: 'manuscript',
        title: '직접 작성한 원고',
        text: '카드뉴스로 만들 본문입니다.',
        attribution: ''
    });
});

test('AI-integrated text is the default while deterministic layout remains an optional future mode', () => {
    assert.equal(normalizeCardNewsTextRenderMode(''), 'integrated');
    assert.equal(normalizeCardNewsTextRenderMode('integrated'), 'integrated');
    assert.equal(normalizeCardNewsTextRenderMode('layout'), 'layout');
    assert.throws(
        () => normalizeCardNewsTextRenderMode('automatic'),
        (error) => error.code === 'CARD_NEWS_TEXT_RENDER_MODE_INVALID'
    );
});

test('local card assets are ordered and remain valid for export without public URLs', () => {
    assert.deepEqual(normalizeCardNewsAssets([
        { order: 2, localPath: '/tmp/card-02.png', width: 1080, height: 1350 },
        { order: 1, localPath: '/tmp/card-01.png', width: 1080, height: 1350 }
    ]).map((asset) => asset.order), [1, 2]);

    const result = assessCardNewsDelivery({
        assets: [
            { order: 1, localPath: '/tmp/card-01.png' },
            { order: 2, localPath: '/tmp/card-02.png' }
        ],
        capability: { min_assets: 1, max_assets: 10, requires_public_urls: false }
    });
    assert.equal(result.ready, true);
});

test('remote distribution can require public URLs independently of local export', () => {
    const result = assessCardNewsDelivery({
        assets: [
            { order: 1, localPath: '/tmp/card-01.png' },
            { order: 2, publicUrl: 'https://cdn.example/card-02.png' }
        ],
        capability: { min_assets: 2, max_assets: 10, requires_public_urls: true }
    });
    assert.equal(result.ready, false);
    assert.deepEqual(result.issues, ['CARD_NEWS_DELIVERY_PUBLIC_URL_REQUIRED']);
});

test('delivery validation uses injected channel limits instead of provider branches', () => {
    const assets = Array.from({ length: 5 }, (_, index) => ({
        order: index + 1,
        publicUrl: `https://cdn.example/card-${index + 1}.png`
    }));
    const result = assessCardNewsDelivery({
        assets,
        capability: { min_assets: 1, max_assets: 4, requires_public_urls: true }
    });
    assert.equal(result.ready, false);
    assert.deepEqual(result.issues, ['CARD_NEWS_DELIVERY_TOO_MANY_ASSETS']);
});

test('the existing Google connection can manage files created by BlogGenius without broad Drive access', () => {
    assert.equal(GOOGLE_DEFAULT_SCOPES.includes('https://www.googleapis.com/auth/drive.file'), true);
    assert.equal(GOOGLE_DEFAULT_SCOPES.includes('https://www.googleapis.com/auth/drive'), false);
});
