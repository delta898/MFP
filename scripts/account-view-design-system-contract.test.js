const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('account view uses the shared design system and provides a structured plan guide', () => {
  const html = read('ui/partials/views/account.html');
  const css = read('ui/styles/features/account.css');

  assert.match(html, /<section class="view account-view" id="view-account">/);
  assert.doesNotMatch(html, /data-style-scope="compatibility"/);
  assert.match(html, /class="account-usage-card ui-overview-card"/);
  assert.match(html, /id="account-plan-info-dialog" class="account-plan-info-dialog ui-transaction-dialog"/);
  assert.match(html, /<h3>Tester<\/h3>/);
  assert.match(html, /<h3>Ultra<\/h3>/);
  assert.match(css, /var\(--ui-card-radius\)/);
  assert.match(css, /var\(--ui-text-primary\)/);
  assert.match(css, /\.account-usage-card,[\s\S]*?padding:\s*var\(--ui-space-5\);/);
  assert.doesNotMatch(css, /(?:--brand|--text-|--surface-|#[0-9a-f]{3,8}|rgba\()/i);
  assert.doesNotMatch(css, /\.account-view\s*\{[^}]*display/);
  assert.match(css, /#view-account\.active/);
  assert.doesNotMatch(html, /account-supporting-region|account-refresh-btn/);
});

test('account connection shortcuts navigate to Settings Beta targets', () => {
  const html = read('ui/partials/views/account.html');
  const lifecycle = read('ui/scripts/foundation/lifecycle.js');
  const setupBanner = read('ui/scripts/features/shell/setup-banner.js');

  assert.match(html, /data-account-settings-next-tab="core" data-account-settings-next-target="settings-next-naver-form"/);
  assert.match(html, /data-account-settings-next-target="settings-next-content-form"/);
  assert.match(html, /data-account-settings-next-target="settings-next-wordpress-form"/);
  assert.match(lifecycle, /\[data-account-settings-next-tab\]/);
  assert.match(lifecycle, /navigateToSettingsNextTarget\(/);
  assert.match(setupBanner, /async function navigateToSettingsNextTarget\(tabName, targetId\)/);
  assert.match(setupBanner, /navigateTo\('settings-next', tabName\)/);
});

test('account overview retains its loading and data contract', () => {
  const html = read('ui/partials/views/account.html');
  const script = read('ui/scripts/features/shell/account-overview.js');

  ['account-plan-name', 'account-usage-used', 'account-credit-balance', 'account-total-available', 'account-register-email-btn'].forEach((id) => {
    assert.match(html, new RegExp(`id="${id}"`));
  });
  assert.match(script, /document\.getElementById\('account-plan-info-dialog'\)/);
  assert.match(script, /dialog\.showModal\(\)/);
  assert.match(script, /statusEl\.dataset\.state = statusTone/);
  assert.match(script, /totalAvailableCard\.classList\.toggle\('hidden', unlimited \|\| creditBalance <= 0\)/);
});

test('shared app layout does not live inside the account feature stylesheet', () => {
  const accountCss = read('ui/styles/features/account.css');
  const appChrome = read('ui/styles/components/app-chrome.css');

  assert.doesNotMatch(accountCss, /(^|\n)\.main\s*\{/);
  assert.match(appChrome, /\.main\s*\{[\s\S]*?overflow-y:\s*auto;/);
});

test('shared hidden state remains available after a view leaves compatibility containment', () => {
  const foundation = read('ui/styles/base/foundation.css');
  const html = read('ui/partials/views/account.html');

  assert.match(foundation, /\.hidden\s*\{\s*display:\s*none !important;/);
  assert.match(html, /id="account-overview-error"[^>]*class="[^"]*hidden/);
  assert.match(html, /id="account-overview-content"[^>]*class="[^"]*hidden/);
});
