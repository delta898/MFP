const test = require('node:test');
const assert = require('node:assert/strict');
const { formatNaverLinks } = require('./related-posts');

test('Naver Markdown links become URL-only paragraphs in any section', () => {
    const source = [
        '# 원고 제목',
        '',
        '본문의 [인라인 링크](https://example.com/body)는 유지합니다.',
        '',
        '## 함께 보면 좋은 글',
        '- [첫 관련글](https://m.blog.naver.com/example/1)',
        '* [두 번째 관련글](https://example.com/post/2?x=1)',
        '',
        '## 해시태그',
        '#여행'
    ].join('\n');

    assert.equal(formatNaverLinks(source), [
        '# 원고 제목',
        '',
        '본문의 [인라인 링크](https://example.com/body)는 유지합니다.',
        '',
        '## 함께 보면 좋은 글',
        'https://m.blog.naver.com/example/1',
        'https://example.com/post/2?x=1',
        '',
        '## 해시태그',
        '#여행'
    ].join('\n'));
});

test('Naver link formatter reports related-post titles for progress presentation', () => {
    const links = [];
    const result = formatNaverLinks('## 함께 보면 좋은 글\n- [녹차 가이드](https://example.com/tea)', (link) => links.push(link));

    assert.equal(result, '## 함께 보면 좋은 글\nhttps://example.com/tea');
    assert.deepEqual(links, [{ label: '녹차 가이드', url: 'https://example.com/tea' }]);
});

test('Naver converts Markdown links outside related headings without labeling them related', () => {
    const source = [
        '## 참고 링크',
        '- [본문 출처](https://example.com/source)',
        '',
        '## 추천 포스팅',
        '- [관련 글](https://example.com/related)'
    ].join('\n');

    const links = [];
    assert.equal(formatNaverLinks(source, (link) => links.push(link)), [
        '## 참고 링크',
        'https://example.com/source',
        '',
        '## 추천 포스팅',
        'https://example.com/related'
    ].join('\n'));
    assert.deepEqual(links, [{ label: '관련 글', url: 'https://example.com/related' }]);
});

test('keeps heading and non-link content inside the related section unchanged', () => {
    const source = '## 관련 글 더 보기\n설명\n- 링크 문법이 아닌 항목';
    assert.equal(formatNaverLinks(source), source);
});

test('Naver converts a standalone Markdown link without a heading or list marker', () => {
    assert.equal(formatNaverLinks('[본문 링크](https://example.com/source)'), 'https://example.com/source');
});
