const test = require('node:test');
const assert = require('node:assert/strict');
const { formatRelatedPostsForNaver } = require('./related-posts');

test('Naver related-post section becomes unbulleted URL-only paragraphs', () => {
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

    assert.equal(formatRelatedPostsForNaver(source), [
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

test('only known generated related-post headings enable Naver conversion', () => {
    const source = [
        '## 참고 링크',
        '- [본문 출처](https://example.com/source)',
        '',
        '## 추천 포스팅',
        '- [관련 글](https://example.com/related)'
    ].join('\n');

    assert.equal(formatRelatedPostsForNaver(source), [
        '## 참고 링크',
        '- [본문 출처](https://example.com/source)',
        '',
        '## 추천 포스팅',
        'https://example.com/related'
    ].join('\n'));
});

test('keeps heading and non-link content inside the related section unchanged', () => {
    const source = '## 관련 글 더 보기\n설명\n- 링크 문법이 아닌 항목';
    assert.equal(formatRelatedPostsForNaver(source), source);
});
