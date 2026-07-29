const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeSnsService,
    isSnsServiceSupported,
    isSnsServiceDisabled,
    requiresImageAsset,
    normalizeHashtagTokens,
    measurePost,
    formatSnsPost
} = require('./sns-content-formatter');

test('SNS service policy normalizes aliases and excludes video-only channels', () => {
    assert.equal(normalizeSnsService('X/Twitter'), 'twitter');
    assert.equal(normalizeSnsService('youtube_shorts'), 'youtubeshorts');
    assert.equal(isSnsServiceSupported('threads'), true);
    assert.equal(isSnsServiceDisabled('TikTok'), true);
    assert.equal(isSnsServiceDisabled('YouTube Shorts'), true);
    assert.equal(requiresImageAsset('Instagram'), true);
});

test('SNS hashtag normalization deduplicates and rejects number-only tags', () => {
    assert.deepEqual(
        normalizeHashtagTokens(['#Blog', 'blog', '블로그 자동화', '#123', 'AI!']),
        ['#Blog', '#블로그_자동화', '#AI']
    );
});

test('SNS formatter includes summary and preserves URL while fitting Bluesky', () => {
    const url = 'https://example.com/a-very-long-original-blog-url';
    const result = formatSnsPost({
        service: 'bluesky',
        title: '새 글 제목',
        summary: '긴 요약 '.repeat(100),
        url,
        hashtags: '#블로그 #자동화 #SNS #Buffer #새글'
    });

    assert.equal(result.success, true);
    assert.ok(result.characterCount <= 300);
    assert.match(result.text, /새 글 제목/);
    assert.match(result.text, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(measurePost(result.text, 'bluesky', url), result.characterCount);
    assert.equal(result.summaryTruncated, true);
});

test('SNS formatter trims summary, then hashtags, then title without cutting URL', () => {
    const url = `https://example.com/${'u'.repeat(250)}`;
    const result = formatSnsPost({
        service: 'twitter',
        title: '제목'.repeat(40),
        summary: '요약'.repeat(100),
        url,
        hashtags: '#하나 #둘 #셋 #넷 #다섯'
    });

    assert.equal(result.success, true);
    assert.ok(result.characterCount <= 280);
    assert.ok(result.text.includes(url));
    assert.equal(result.usedHashtags.length, 0);
    assert.equal(result.summaryTruncated, true);
    assert.equal(result.titleTruncated, true);
});

test('SNS formatter rejects an unsupported service or an URL that cannot fit', () => {
    assert.equal(formatSnsPost({ service: 'tiktok', url: 'https://example.com' }).code, 'SNS_SERVICE_DISABLED');
    const result = formatSnsPost({
        service: 'twitter',
        url: `https://example.com/${'x'.repeat(400)}`
    });
    assert.equal(result.success, false);
    assert.equal(result.code, 'SNS_CONTENT_TOO_LONG');
});
