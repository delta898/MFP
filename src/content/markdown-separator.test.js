const test = require('node:test');
const assert = require('node:assert/strict');
const { marked } = require('marked');

const Utils = require('../utils');

test('parseMarkdown treats a standalone hyphen rule as a separator block', () => {
    const parsed = Utils.parseMarkdown([
        '# 제목',
        '',
        '첫 문단',
        '',
        '---',
        '',
        '다음 문단'
    ].join('\n'));

    assert.deepEqual(parsed.contents.map((item) => item.type), [
        'newline',
        'paragraph',
        'newline',
        'separator',
        'newline',
        'paragraph'
    ]);
});

test('parseMarkdown keeps inline hyphen runs as paragraph text', () => {
    const parsed = Utils.parseMarkdown('# 제목\n본문 --- 이어쓰기');

    assert.equal(parsed.contents.length, 1);
    assert.deepEqual(parsed.contents[0], {
        type: 'paragraph',
        text: '본문 --- 이어쓰기'
    });
});

test('marked renders standalone hyphen rules as horizontal rules for WordPress', () => {
    const html = marked('첫 문단\n\n---\n\n다음 문단');

    assert.match(html, /<hr>/);
});
