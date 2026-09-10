const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

function loadPreviewContract() {
  const source = read('ui/scripts/features/content/shopping-quick-preview.js');
  const context = vm.createContext({ URL, URLSearchParams });
  vm.runInContext(`${source}\n;globalThis.__previewContract = { isShoppingQuickPreviewUrl, normalizeShoppingQuickPreview };`, context);
  return context.__previewContract;
}

test('shopping quick writing starts with URL analysis and reveals product correction after preview', () => {
  const view = read('ui/partials/views/shopping.html');
  const urlIndex = view.indexOf('id="shopping-quick-url"');
  const previewIndex = view.indexOf('id="shopping-quick-preview"');
  const productIndex = view.indexOf('id="shopping-quick-product-field"');
  const instructionIndex = view.indexOf('id="shopping-quick-instruction"');

  assert.ok(urlIndex >= 0 && previewIndex > urlIndex && productIndex > previewIndex && instructionIndex > productIndex);
  assert.match(view, /id="shopping-quick-preview-btn"[^>]*aria-busy="false"[^>]*>상품 정보 확인<\/button>/);
  assert.match(view, /id="shopping-quick-product-field" hidden/);
  assert.match(view, /data-state="empty"[\s\S]*id="shopping-quick-preview-loading" hidden[\s\S]*id="shopping-quick-preview-error"[^>]*hidden[\s\S]*id="shopping-quick-preview-card" hidden/);
});

test('shopping preview uses the existing read-only endpoint and resets stale product state when URL changes', () => {
  const app = read('ui/app.js');
  const source = read('ui/scripts/features/content/shopping-quick-preview.js');

  assert.match(app, /@include scripts\/features\/content\/shopping-quick-preview\.js/);
  assert.match(source, /fetchJson\(`\/api\/v1\/shopping\/preview\?\$\{query\.toString\(\)\}`\)/);
  assert.doesNotMatch(source, /postJson\(['"]\/api\/v1\/shopping\/preview/);
  assert.match(source, /urlInput\.addEventListener\('input', resetShoppingQuickPreview\)/);
  assert.match(source, /if \(button\?\.getAttribute\('aria-busy'\) === 'true'\) return/);
  assert.match(source, /showShoppingQuickProductField\('recovery'\)/);
});

test('shopping preview normalization accepts only HTTP resources and bounded display facts', () => {
  const contract = loadPreviewContract();
  assert.equal(contract.isShoppingQuickPreviewUrl('https://example.com/item'), true);
  assert.equal(contract.isShoppingQuickPreviewUrl('javascript:alert(1)'), false);

  const normalized = contract.normalizeShoppingQuickPreview({
    title: ' 확인된 상품 ',
    finalUrl: 'https://example.com/item',
    thumbnailUrl: 'data:text/html,bad',
    imageCount: 3.8,
    commerce: { salePriceText: '19,900원', originalPriceText: '29,900원', discountRate: 33 }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(normalized)), {
    title: '확인된 상품',
    finalUrl: 'https://example.com/item',
    thumbnailUrl: '',
    salePriceText: '19,900원',
    originalPriceText: '29,900원',
    discountRate: 33,
    imageCount: 3
  });
});

test('shopping preview styling stays inside the semantic design token contract', () => {
  const css = read('ui/styles/features/shopping-connect.css');

  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  assert.match(css, /var\(--ui-surface-muted\)/);
  assert.match(css, /var\(--ui-action-primary\)/);
  assert.match(css, /prefers-reduced-motion/);
});
