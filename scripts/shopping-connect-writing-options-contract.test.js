const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('shopping quick writing keeps direction visible and moves optional settings into disclosures', () => {
  const view = read('ui/partials/views/shopping.html');
  const directionIndex = view.indexOf('id="shopping-quick-instruction"');
  const writingIndex = view.indexOf('id="shopping-quick-writing-settings"');
  const publishIndex = view.indexOf('id="shopping-quick-publish-settings"');

  assert.ok(directionIndex >= 0 && writingIndex > directionIndex && publishIndex > writingIndex);
  assert.match(view, /id="shopping-quick-writing-strategy"[\s\S]*value="search"[\s\S]*value="discovery"/);
  assert.match(view, /id="shopping-quick-content-focus"[\s\S]*value="auto"[\s\S]*value="product_intro"[\s\S]*value="comparison"[\s\S]*value="usage"/);
  assert.match(view, /id="shopping-quick-publish-settings"[\s\S]*id="shopping-quick-target-naver"[\s\S]*id="shopping-quick-target-wordpress"/);
  assert.doesNotMatch(view.slice(0, view.indexOf('id="shopping-tab-batch"')), /\sstyle=|\sonchange=/);
});

test('shopping writing choices are carried from UI request through storage into generation', () => {
  const controller = read('ui/scripts/features/legacy-actions-controllers.js');
  const publishRuntime = read('src/ui-runtime/publish-actions-runtime.js');
  const sheetOptions = read('src/content/publish-sheet-options.js');
  const contentRuntime = read('src/ui-runtime/content-actions-runtime.js');
  const shoppingManager = read('src/shopping-manager.js');

  assert.match(controller, /writingStrategy:\s*\(document\.getElementById\('shopping-quick-writing-strategy'\)/);
  assert.match(controller, /contentFocus:\s*\(document\.getElementById\('shopping-quick-content-focus'\)/);
  assert.match(publishRuntime, /writingStrategy,\s*\n\s*contentFocus/);
  assert.match(sheetOptions, /applyStringOption\(next, 'writing_strategy', normalizeWritingStrategyOverride\(fields\.writingStrategy\)\)/);
  assert.match(sheetOptions, /applyStringOption\(next, 'content_focus', normalizeShoppingContentFocus\(fields\.contentFocus\)\)/);
  assert.match(contentRuntime, /writingStrategy,\s*\n\s*contentFocus,\s*\n\s*preScrapedData/);
  assert.match(shoppingManager, /writingStrategy:\s*runtimeOptions\.writingStrategy,\s*\n\s*contentFocus:\s*runtimeOptions\.contentFocus/);
});

test('shopping quick writing styles use semantic tokens for the new controls', () => {
  const view = read('ui/partials/views/shopping.html');
  const css = read('ui/styles/features/shopping-connect.css');

  assert.match(view, /class="blog-next-disclosures shopping-quick-disclosures"/);
  assert.match(view, /class="blog-next-disclosure" id="shopping-quick-writing-settings"/);
  assert.match(view, /class="blog-next-form-actions shopping-quick-actions"/);
  assert.match(css, /var\(--ui-border-default\)/);
  assert.doesNotMatch(css, /--ui-control-height-lg|--ui-border-subtle/);
});

test('shopping quick writing copy describes user actions instead of internal confirmation steps', () => {
  const view = read('ui/partials/views/shopping.html');
  const previewController = read('ui/scripts/features/content/shopping-quick-preview.js');

  assert.match(view, />상품으로 글 만들기</);
  assert.match(view, />상품 불러오기<\/button>/);
  assert.match(view, /id="shopping-quick-product-label">상품명</);
  assert.match(view, />글감 보관<\/button>[\s\S]*>바로 포스팅<\/button>/);
  assert.match(view, /id="shopping-quick-result" class="blog-next-form-result" role="status"/);
  assert.doesNotMatch(view.slice(0, view.indexOf('id="shopping-tab-batch"')), /id="shopping-quick-result"[^>]*scrollable-log/);
  assert.doesNotMatch(previewController, /확인된 상품명|상품 정보 확인/);
});
