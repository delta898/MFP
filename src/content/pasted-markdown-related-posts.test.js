const test = require('node:test');
const assert = require('node:assert/strict');

const {
    appendRelatedPostsToPastedMarkdown
} = require('./pasted-markdown-related-posts');

test('appendRelatedPostsToPastedMarkdown appends the related section at the bottom', () => {
    const result = appendRelatedPostsToPastedMarkdown(
        '# 제목\n\n본문\n\n#태그',
        '## 이어서 보면 좋은 글\nhttps://example.com/1\nhttps://example.com/2\nhttps://example.com/3'
    );

    assert.equal(result, [
        '# 제목',
        '',
        '본문',
        '',
        '#태그',
        '',
        '## 이어서 보면 좋은 글',
        'https://example.com/1',
        'https://example.com/2',
        'https://example.com/3',
        ''
    ].join('\n'));
});

test('appendRelatedPostsToPastedMarkdown replaces an existing related section', () => {
    const result = appendRelatedPostsToPastedMarkdown(
        '# 제목\n\n본문\n\n## 함께 보면 좋은 글\nhttps://example.com/old',
        '## 추천 포스팅\nhttps://example.com/new',
        () => '# 제목\n\n본문'
    );

    assert.equal(result, '# 제목\n\n본문\n\n## 추천 포스팅\nhttps://example.com/new\n');
});
