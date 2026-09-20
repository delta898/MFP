const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('../core');
const {
    RELATED_POSTS_STATUS,
    extractManuscriptTitle,
    insertSectionAboveHashtags,
    buildRelatedSection,
    finalizeManuscriptRelatedPosts
} = require('./manuscript-related-posts');

function gateway(overrides = {}) {
    return {
        fetchPosts: async () => [
            { title: '첫 글', url: 'https://blog.naver.com/fixture/1' },
            { title: '둘째 글', url: 'https://blog.naver.com/fixture/2' }
        ],
        pickHeading: () => '함께 보면 좋은 글',
        buildSection: (posts, heading) => Core.buildRelatedPostsSectionMarkdown(posts, heading, true),
        stripSection: (text) => Core.stripAiRelatedPostsSection(text),
        ...overrides
    };
}

test('extractManuscriptTitle reads the first H1 heading', () => {
    assert.equal(extractManuscriptTitle('# 제목\n\n본문'), '제목');
    assert.equal(extractManuscriptTitle('본문만'), '');
});

test('insertSectionAboveHashtags appends when no hashtag block exists', () => {
    const result = insertSectionAboveHashtags('# 제목\n\n본문', '## 함께 보면 좋은 글\nhttps://example.com/1');
    assert.match(result, /본문\n\n## 함께 보면 좋은 글/);
});

test('insertSectionAboveHashtags places the section before a trailing hashtag block', () => {
    const result = insertSectionAboveHashtags(
        '# 제목\n\n본문\n\n#맛집 #서울',
        '## 함께 보면 좋은 글\nhttps://example.com/1'
    );
    const sectionIndex = result.indexOf('## 함께 보면 좋은 글');
    const hashtagIndex = result.indexOf('#맛집');
    assert.ok(sectionIndex !== -1 && hashtagIndex !== -1 && sectionIndex < hashtagIndex);
    assert.match(result, /#맛집 #서울\n?$/);
});

test('buildRelatedSection matches the canonical Core section format', () => {
    const posts = [
        { title: '첫 글', url: 'https://blog.naver.com/fixture/1' },
        { title: '둘째 글', url: 'https://blog.naver.com/fixture/2' },
        { title: '셋째 글', url: 'not-a-url' }
    ];
    const expected = Core.buildRelatedPostsSectionMarkdown(posts.slice(0, 2), '함께 보면 좋은 글', true);
    assert.equal(buildRelatedSection(posts.slice(0, 2), '함께 보면 좋은 글'), expected);
});

test('finalize leaves the body untouched when disabled', async () => {
    const source = '# 제목\n\n본문';
    const result = await finalizeManuscriptRelatedPosts({ markdownText: source, enabled: false, gateway: gateway() });
    assert.equal(result.markdownText, source);
    assert.equal(result.status, RELATED_POSTS_STATUS.DISABLED);
    assert.equal(result.count, 0);
});

test('finalize includes the section and replaces an existing one without duplication', async () => {
    const source = '# 제목\n\n본문\n\n## 함께 보면 좋은 글\nhttps://blog.naver.com/old\n';
    const result = await finalizeManuscriptRelatedPosts({ markdownText: source, title: '제목', enabled: true, gateway: gateway() });
    assert.equal(result.status, RELATED_POSTS_STATUS.INCLUDED);
    assert.equal(result.count, 2);
    assert.doesNotMatch(result.markdownText, /blog\.naver\.com\/old/);
    assert.equal(result.markdownText.match(/함께 보면 좋은 글/g).length, 1);
});

test('finalize reports unavailable when no candidates exist', async () => {
    const result = await finalizeManuscriptRelatedPosts({
        markdownText: '# 제목\n\n본문',
        enabled: true,
        gateway: gateway({ fetchPosts: async () => [] })
    });
    assert.equal(result.status, RELATED_POSTS_STATUS.UNAVAILABLE);
    assert.doesNotMatch(result.markdownText, /함께 보면 좋은 글/);
});

test('finalize reports failed without losing the draft when fetch throws', async () => {
    const result = await finalizeManuscriptRelatedPosts({
        markdownText: '# 제목\n\n본문',
        enabled: true,
        gateway: gateway({
            fetchPosts: async () => { throw new Error('network down'); }
        })
    });
    assert.equal(result.status, RELATED_POSTS_STATUS.FAILED);
    assert.match(result.markdownText, /# 제목/);
    assert.match(result.markdownText, /본문/);
});
