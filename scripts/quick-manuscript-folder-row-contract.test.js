const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHtmlCompositionRuntime } = require('../src/adapters/ui/assets/composition/html-composition');

const repoRoot = path.resolve(__dirname, '..');
const uiRoot = path.join(repoRoot, 'ui');
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('Blog Beta no longer renders the retired manuscript-folder selector', () => {
  const html = createHtmlCompositionRuntime({ fs, path }).composeHtmlFile({
    uiRoot,
    entryFile: 'partials/views/blog-next.html'
  }).html;
  const inputs = read('ui/scripts/features/blog/draft-inputs.js');
  const styles = read('ui/styles/features/continuous-publishing-interactions.css');

  assert.doesNotMatch(html, /blog-next-folder-input|blog-next-folder-row|blog-next-folder-clear/);
  assert.doesNotMatch(inputs, /blogNextDraftState\.folder|serializeBlogNextFolderFiles/);
  assert.doesNotMatch(styles, /\.blog-next-folder-row|\.blog-next-folder-clear/);
  assert.match(html, /id="blog-next-ai-editor"/);
});
