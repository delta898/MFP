const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('manuscript image actions live in the preview and expose accessible empty/present states', () => {
  const editor = read('ui/scripts/features/blog-next/manuscript-editor-entry.js');
  const css = read('ui/styles/features/continuous-publishing-drafts.css');

  assert.match(editor, /media\.append\(artwork, mediaStatus, dropHint, mediaFeedback, mediaActions, expand, fileInput\)/);
  assert.match(editor, /pick\.setAttribute\('aria-label', '내 이미지에서 선택'\)/);
  assert.match(editor, /mediaActions\.classList\.toggle\('is-empty', !value\.attrs\.imageExists\)/);
  assert.match(editor, /mediaActions\.classList\.toggle\('is-present', Boolean\(value\.attrs\.imageExists\)\)/);
  assert.match(editor, /expand\.hidden = !value\.attrs\.imageExists/);
  assert.match(editor, /card\.classList\.toggle\('is-media-expanded'\)/);
  assert.match(css, /\.manuscript-image-block-media-actions\.is-empty[\s\S]*?opacity: 1; pointer-events: auto/);
  assert.match(css, /\.manuscript-image-block-media:hover \.manuscript-image-block-media-actions\.is-present/);
  assert.match(css, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.manuscript-image-block-media-actions\.is-present/);
  assert.match(css, /\.manuscript-image-block\.is-media-expanded \.manuscript-image-block-fields,\s*\.manuscript-image-block\.is-media-expanded \.manuscript-image-block-prompt-generation \{ display: none; \}/);
});

test('local image drop targets validate one supported file and do not leak editor drop handling', () => {
  const editor = read('ui/scripts/features/blog-next/manuscript-editor-entry.js');
  const cardNews = read('ui/scripts/features/card-news/generation-workflow.js');
  const cardNewsCss = read('ui/styles/features/card-news-results.css');

  for (const source of [editor, cardNews]) {
    assert.match(source, /addEventListener\('dragover'/);
    assert.match(source, /addEventListener\('drop'/);
    assert.match(source, /event\.preventDefault\(\);\s*event\.stopPropagation\(\)/);
    assert.match(source, /files\.length !== 1/);
    assert.match(source, /new DataTransfer\(\)/);
  }
  assert.match(editor, /20 \* 1024 \* 1024/);
  assert.match(cardNews, /10 \* 1024 \* 1024/);
  assert.match(editor, /image\/png,image\/jpeg,image\/webp,image\/avif/);
  assert.match(cardNewsCss, /\.card-news-result-image-wrap\.is-drag-over/);
  assert.match(cardNewsCss, /\.card-news-image-drop-hint/);
});
