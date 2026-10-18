const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('manuscript image file reader resolves the browser data URL', async () => {
  class FakeBlob {
    constructor(dataUrl) { this.dataUrl = dataUrl; }
  }
  class FakeFileReader {
    readAsDataURL(file) {
      this.result = file.dataUrl;
      queueMicrotask(() => this.onload?.());
    }
  }
  const context = { Blob: FakeBlob, FileReader: FakeFileReader };
  vm.createContext(context);
  vm.runInContext(`${read('ui/scripts/features/blog/draft-images.js')}\nglobalThis.__readFile = readBlogNextFileAsDataUrl;`, context);

  assert.equal(await context.__readFile(new FakeBlob('data:image/png;base64,aGVsbG8=')), 'data:image/png;base64,aGVsbG8=');
});

test('manuscript image actions live in the preview and expose accessible empty/present states', () => {
  const editor = read('ui/scripts/features/blog/manuscript-editor-entry.js');
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

test('Markdown-to-block transitions rehydrate existing manuscript image assets', () => {
  const inputs = read('ui/scripts/features/blog/draft-inputs.js');

  assert.match(inputs, /function restoreBlogNextEditorImages\(state\)\s*\{\s*const preview = state\?\.preview;\s*state\?\.editor\?\.syncImages\?\.\(\s*preview\?\.images \|\| \[\]/);
  assert.equal((inputs.match(/restoreBlogNextEditorImages\(state\);/g) || []).length, 1);
});

test('local image drop targets validate one supported file and do not leak editor drop handling', () => {
  const editor = read('ui/scripts/features/blog/manuscript-editor-entry.js');
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

test('manuscript editors add image blocks from clipboard and canvas drops through the existing image import flow', () => {
  const editor = read('ui/scripts/features/blog/manuscript-editor-entry.js');
  const images = read('ui/scripts/features/blog/draft-images.js');
  const inputs = read('ui/scripts/features/blog/draft-inputs.js');
  const css = read('ui/styles/features/continuous-publishing-drafts.css');

  assert.match(editor, /function extractManuscriptImageFiles\(dataTransfer\)/);
  assert.match(editor, /function insertManuscriptImageAt\(editor, position\)/);
  assert.match(editor, /function removeManuscriptImageByBlockId\(editor, blockId\)/);
  assert.match(editor, /StarterKit\.configure\(\{ codeBlock: false, dropcursor: false \}\)/);
  assert.match(editor, /resolvedPosition\.depth > 0 \? resolvedPosition\.after\(1\) : position/);
  assert.match(editor, /root\.addEventListener\('drop',[\s\S]*?event\.target\.closest\?\.\('\.manuscript-image-block-media'\)\) return/);
  assert.match(editor, /event\.target\.closest\?\.\('\.ProseMirror'\)[\s\S]*?editor\.view\.posAtCoords/);
  assert.match(editor, /editorPosition\?\.pos \?\? editor\.state\.doc\.content\.size/);
  assert.match(editor, /handlePaste\(_view, event\)[\s\S]*?editor\.state\.selection\.from/);
  assert.match(images, /async function importBlogNextEditorImage\(type, file, blockId\)/);
  assert.match(images, /function readBlogNextFileAsDataUrl\(file\)[\s\S]*?reader\.readAsDataURL\(file\)/);
  assert.match(images, /async function importBlogNextManuscriptImage\(type, slotId, input\)[\s\S]*?catch \(error\)[\s\S]*?setBlogNextDraftValidation/);
  assert.match(images, /preview\.images\?\.find\(\(item\) => item\.blockId === blockId\)/);
  assert.match(images, /applyBlogNextManuscriptMutation\(type, 'import',[\s\S]*?\{ lockAcquired: true \}\)/);
  assert.equal((inputs.match(/onImageFileDrop\(file, blockId\)/g) || []).length, 1);
  assert.match(css, /\.manuscript-editor-canvas\.is-file-drag-over::after/);
});
