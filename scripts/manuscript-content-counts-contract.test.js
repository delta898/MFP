const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Blog Beta manuscript workspaces expose live counts and keep all formatting actions accessible', () => {
  const ai = read('ui/partials/views/blog-next.html');
  const quick = read('ui/partials/views/blog-next/quick-draft-modes.html');
  const inputs = read('ui/scripts/features/blog-next/draft-inputs.js');
  const css = read('ui/styles/features/continuous-publishing-drafts.css');

  for (const [source, type] of [[ai, 'ai'], [quick, 'folder'], [quick, 'paste']]) {
    assert.match(source, new RegExp(`data-manuscript-counts="${type}"`));
    assert.match(source, /data-count-title/);
    assert.match(source, /data-count-body/);
    assert.match(source, /data-count-words/);
    assert.match(source, /data-count-keywords/);
  }
  for (const source of [ai, quick]) {
    const toolbarIndex = source.indexOf('class="manuscript-editor-toolbar"');
    const countsIndex = source.indexOf('class="manuscript-editor-counts"', toolbarIndex);
    const modeIndex = source.indexOf('class="manuscript-editor-mode"', countsIndex);
    assert.ok(toolbarIndex >= 0 && toolbarIndex < countsIndex && countsIndex < modeIndex);
    const toolbar = source.slice(toolbarIndex, countsIndex);
    assert.doesNotMatch(toolbar, /<button(?![^>]*\baria-label=|[^>]*\bdata-tooltip=)[^>]*>/);
  }
  assert.match(inputs, /function stripBlogNextMarkdownForCounts/);
  assert.ok(inputs.includes(".replace(/^\\s*\\[\\[IMAGE"));
  assert.match(inputs, /function countBlogNextKeywordOccurrences/);
  assert.match(inputs, /updateBlogNextManuscriptCounts\('ai'/);
  assert.match(inputs, /updateBlogNextManuscriptCounts\('folder'/);
  assert.match(inputs, /updateBlogNextManuscriptCounts\('paste'/);
  assert.match(css, /\.manuscript-editor-counts\.has-keywords:hover/);
  assert.match(css, /\.manuscript-editor-counts\.has-keywords:focus-within/);
  assert.match(css, /button\[data-tooltip\]:focus-visible::after/);
});

test('count helpers exclude the article title and complete image metadata blocks', () => {
  const source = read('ui/scripts/features/blog-next/draft-inputs.js');
  const context = {};
  vm.runInNewContext(`${source}\nglobalThis.countHelpers = { strip: stripBlogNextMarkdownForCounts, keyword: countBlogNextKeywordOccurrences };`, context);
  const body = context.countHelpers.strip('# 제목은 별도\n\n첫 문단 **키워드** 포함\n\n[[IMAGE_0\ntitle: 이미지 제목 키워드\nprompt: 키워드가 든 긴 프롬프트\n]]\n\n둘째 문단 키워드');

  assert.equal(body, '첫 문단 키워드 포함\n\n둘째 문단 키워드');
  assert.equal(context.countHelpers.keyword(body, '키워드'), 2);
  assert.equal(context.countHelpers.keyword(body, ' 키워드 '), 2);
});
