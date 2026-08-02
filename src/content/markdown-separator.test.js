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

test('parseMarkdown preserves inline bold ranges while normalizing paragraph text', () => {
    const parsed = Utils.parseMarkdown('첫 **굵은 글자**와 **두 번째** 문장');

    assert.deepEqual(parsed.contents[0], {
        type: 'paragraph',
        text: '첫 굵은 글자와 두 번째 문장',
        boldRanges: [
            { start: 2, end: 7 },
            { start: 9, end: 13 }
        ]
    });
});

test('parseMarkdown preserves inline bold ranges in list items', () => {
    const parsed = Utils.parseMarkdown('- **중요** 항목');

    assert.deepEqual(parsed.contents[0], {
        type: 'list-item',
        listType: 'unordered',
        text: '중요 항목',
        boldRanges: [{ start: 0, end: 2 }]
    });
});

test('parseMarkdown preserves Markdown ### headings as dedicated H3 blocks', () => {
    const parsed = Utils.parseMarkdown('# 제목\n### foobar');

    assert.deepEqual(parsed.contents, [{
        type: 'header-h3',
        text: 'foobar'
    }]);
});

test('parseMarkdown keeps H2, H3, and quote blocks distinct', () => {
    const parsed = Utils.parseMarkdown([
        '# 제목',
        '## H2',
        '### H3',
        '> quote'
    ].join('\n'));

    assert.deepEqual(parsed.contents, [
        { type: 'header-h2', text: 'H2' },
        { type: 'header-h3', text: 'H3' },
        { type: 'quote', text: 'quote' }
    ]);
});

test('marked renders standalone hyphen rules as horizontal rules for WordPress', () => {
    const html = marked('첫 문단\n\n---\n\n다음 문단');

    assert.match(html, /<hr>/);
});

test('marked renders inline Markdown bold for WordPress', () => {
    const html = marked('**굵은 글자**');

    assert.match(html, /<strong>굵은 글자<\/strong>/);
});

test('marked keeps Markdown ### headings as H3 tags for WordPress', () => {
    const html = marked('### foobar');

    assert.match(html, /<h3>foobar<\/h3>/);
});
