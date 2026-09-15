const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('shopping connect uses the shared product navigation shell', () => {
  const view = read('ui/partials/views/shopping.html');

  assert.match(view, /class="view shopping-view" id="view-shopping"/);
  assert.doesNotMatch(view, /id="view-shopping"[^>]*data-style-scope="compatibility"/);
  assert.match(view, /class="shopping-tabs ui-top-tabs"[^>]*role="tablist"/);
  assert.match(view, /class="shopping-tab-btn ui-top-tab active"[^>]*role="tab"[^>]*aria-selected="true"[^>]*>빠른 글 작성<\/button>/);
  assert.match(view, /id="shopping-tab-button-batch"[^>]*data-shopping-tab="batch" hidden>글감 관리<\/button>/);
  assert.doesNotMatch(view, />빠른 포스팅<\/button>|>일괄 포스팅<\/button>/);
});

test('shopping tabs expose linked panels and synchronize accessible state', () => {
  const view = read('ui/partials/views/shopping.html');
  const navigation = read('ui/scripts/features/content/tab-navigation.js');
  const controllers = read('ui/scripts/features/legacy-actions-controllers.js');

  assert.match(view, /id="shopping-tab-button-quick"[\s\S]*aria-controls="shopping-tab-quick"/);
  assert.match(view, /id="shopping-tab-quick" role="tabpanel"[\s\S]*aria-labelledby="shopping-tab-button-quick"/);
  assert.match(view, /id="shopping-tab-button-batch"[\s\S]*aria-controls="shopping-tab-batch"/);
  assert.match(view, /id="shopping-tab-batch" role="tabpanel"[\s\S]*aria-labelledby="shopping-tab-button-batch" hidden/);
  assert.match(navigation, /const allowed = \['quick'\]/);
  assert.match(navigation, /setAttribute\('aria-selected', active \? 'true' : 'false'\)/);
  assert.match(navigation, /panel\.hidden = !active/);
  assert.match(controllers, /handleUiTabNavigationKeydown\(event,[\s\S]*dataKey: 'shoppingTab'/);
});

test('legacy shopping tab presentation no longer overrides shared tab tokens', () => {
  const tabs = read('ui/styles/features/content-tabs.css');
  const dashboard = read('ui/styles/features/dashboard.css');
  const responsive = read('ui/styles/layout/responsive.css');

  assert.doesNotMatch(tabs, /\.shopping-tab-btn/);
  assert.doesNotMatch(dashboard, /\.shopping-tabs/);
  assert.doesNotMatch(responsive, /\.shopping-tabs|\.shopping-tab-btn/);
});
