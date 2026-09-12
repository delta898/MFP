const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('shopping quick panel owns a standalone image management disclosure', () => {
  const html = read('ui/partials/views/shopping.html');

  assert.match(html, /<details class="blog-next-disclosure" id="shopping-quick-image-settings">/);
  assert.ok(
    html.indexOf('id="shopping-quick-image-settings"') < html.indexOf('id="shopping-quick-writing-settings"')
    && html.indexOf('id="shopping-quick-writing-settings"') < html.indexOf('id="shopping-quick-publish-settings"'),
    'image management comes before writing and publish settings'
  );
  assert.match(html, /<strong>이미지 관리<\/strong>/);
  assert.match(html, /id="shopping-quick-image-summary"/);
  ['ftc', 'cta1', 'cta2', 'cta3'].forEach((slot) => {
    assert.match(html, new RegExp(`data-shopping-image-slot="${slot}"`));
  });
  assert.match(html, /id="shopping-image-save-btn" class="primary"/);
  assert.match(html, /id="shopping-image-feedback" class="shopping-image-feedback"/);
  assert.doesNotMatch(html, /data-shopping-image-url/);
  assert.doesNotMatch(html, /settings-image-source-/);
  assert.doesNotMatch(html, /settings-image-file-/);
  assert.doesNotMatch(html, /settings-image-preview-/);
  assert.doesNotMatch(html, /settings-image-reset-/);
  assert.doesNotMatch(html, /settings-image-card-/);
});

test('optional image slots can be cleared while required slots cannot', () => {
  const html = read('ui/partials/views/shopping.html');

  ['cta2', 'cta3'].forEach((slot) => {
    assert.match(html, new RegExp(`data-shopping-image-slot="${slot}"[\\s\\S]*?data-shopping-image-clear`));
  });
  ['ftc', 'cta1'].forEach((slot) => {
    const block = html.match(new RegExp(`data-shopping-image-slot="${slot}"[\\s\\S]*?(?=data-shopping-image-slot|$)`));
    assert.ok(block && !/data-shopping-image-clear/.test(block[0]), slot);
  });
});

test('shopping image settings is a fresh module without legacy settings coupling', () => {
  const script = read('ui/scripts/features/content/shopping-image-settings.js');
  const manifest = read('ui/app.js');

  assert.match(manifest, /\/\/ @include scripts\/features\/content\/shopping-image-settings\.js/);
  assert.match(script, /function initShoppingImageSettings\(\)/);
  assert.match(script, /\/api\/v1\/settings\/shopping-image'/);
  assert.match(script, /\/api\/v1\/settings\/shopping-image\/preview/);
  assert.match(script, /\/api\/v1\/settings\/major'/);
  assert.match(script, /기본값 사용 중/);
  assert.doesNotMatch(script, /is-wide/);
  assert.doesNotMatch(script, /naturalWidth/);
  assert.doesNotMatch(script, /data-shopping-image-url/);
  assert.doesNotMatch(script, /settings\/shopping-images/);
  assert.doesNotMatch(script, /settings-image-source-/);
  assert.doesNotMatch(script, /settingsShoppingImage/);
  assert.doesNotMatch(script, /SETTINGS_SHOPPING_SLOT/);
});

test('shopping image settings styles use shared tokens only', () => {
  const css = read('ui/styles/features/shopping-image-settings.css');
  const manifest = read('ui/styles.css');

  assert.match(manifest, /\/\* @include styles\/features\/shopping-image-settings\.css \*\//);
  assert.match(css, /\.shopping-image-grid/);
  assert.match(css, /\.shopping-image-grid \{[^}]*repeat\(2/);
  assert.match(css, /\.shopping-image-slot \{[^}]*height: 12rem/);
  assert.match(css, /\.shopping-image-top \{[^}]*3fr 2fr/);
  assert.match(css, /object-fit: contain/);
  assert.doesNotMatch(css, /is-wide/);
  assert.match(css, /white-space: nowrap/);
  assert.match(css, /\.shopping-image-feedback/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/i);
  assert.doesNotMatch(css, /rgba?\(/i);
  assert.doesNotMatch(css, /font-size:\s*\d+px/);
});
