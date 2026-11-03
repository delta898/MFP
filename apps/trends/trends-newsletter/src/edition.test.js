import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSharedEdition, validateSharedCopy } from './edition.js';

const post = (id = 'feed-guid-1', extra = {}) => ({
    id,
    source: 'BlogGenius',
    title: 'BlogGenius 글',
    url: 'https://blog.gongzza.com/guide/one/',
    excerpt: '요약 & 안내',
    imageUrl: 'https://blog.gongzza.com/wp-content/cover.png',
    publishedAt: '2026-11-02T08:00:00.000Z',
    ...extra
});

test('validates concise plain text and rejects generated links or markup', () => {
    assert.deepEqual(validateSharedCopy({ greeting: '좋은 아침입니다.', introduction: '오늘의 트렌드를 확인해 보세요.' }), {
        greeting: '좋은 아침입니다.', introduction: '오늘의 트렌드를 확인해 보세요.'
    });
    assert.throws(() => validateSharedCopy({ greeting: '안녕하세요', introduction: '링크 https://example.com' }), /limits/);
    assert.throws(() => validateSharedCopy({ greeting: '안녕하세요', introduction: 'a'.repeat(361) }), /limits/);
});

test('builds a Development edition with bounded RSS summary and fixed first-party links', () => {
    const edition = buildSharedEdition({
        trendDate: '2026-11-02', post: post('feed-guid-1', { excerpt: 'x'.repeat(700) }),
        copy: { greeting: '좋은 아침입니다.', introduction: '오늘의 관심 트렌드를 살펴보세요.' },
        model: 'gpt-test',
        downloadUrl: 'https://www-dev.bloggenius.kr/download/',
        downloadBannerUrl: 'https://www-dev.bloggenius.kr/assets/share-card.svg'
    });
    assert.equal(edition.trendDate, '2026-11-02');
    assert.equal(edition.featuredPost.id, 'feed-guid-1');
    assert.equal(edition.featuredPost.excerpt.length, 500);
    assert.equal(edition.aiProvider, 'cloudflare-ai-gateway');
    assert.equal(edition.promptVersion, 'shared-edition-v1');
});

test('rejects unsafe article links and invalid dates', () => {
    assert.throws(() => buildSharedEdition({
        trendDate: '2026-11-02', post: post('id', { url: 'http://blog.gongzza.com/post' }),
        copy: { greeting: '안녕', introduction: '소개' }, model: 'x',
        downloadUrl: 'https://www-dev.bloggenius.kr/download/',
        downloadBannerUrl: 'https://www-dev.bloggenius.kr/assets/share-card.svg'
    }), /valid published article/);
    assert.throws(() => buildSharedEdition({
        trendDate: '2026-02-30', post: post(), copy: {}, model: 'x',
        downloadUrl: 'https://www-dev.bloggenius.kr/download/',
        downloadBannerUrl: 'https://www-dev.bloggenius.kr/assets/share-card.svg'
    }), /Invalid edition date/);
});
