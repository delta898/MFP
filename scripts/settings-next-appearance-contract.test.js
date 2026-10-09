const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const { loadDesignStyleContract } = require('./design-style-registry-test-utils');

test('appearance tab renders registry-driven live previews without compatibility', () => {
  const html = read('ui/partials/views/settings-next.html');
  const appearance = read('ui/scripts/features/settings-next/appearance.js');
  const system = read('ui/scripts/foundation/style-system.js');
  const contract = read('ui/scripts/foundation/design-style-token-contract.js');

  assert.match(html, /data-settings-next-app-tab="appearance"[^>]*>외모<\/button>/);
  assert.match(html, /id="settings-next-app-panel-appearance"/);
  assert.match(html, /id="settings-next-appearance-grid"/);
  assert.match(html, /aria-label="앱 메뉴 위치"/);
  assert.doesNotMatch(html, /settings-next-sidebar-position-label/);
  assert.match(html, /data-sidebar-position-option="left" aria-label="왼쪽에 메뉴 표시" aria-pressed="true"/);
  assert.match(html, /data-sidebar-position-option="right" aria-label="오른쪽에 메뉴 표시" aria-pressed="false"/);
  assert.match(appearance, /getSelectableDesignStyles/);
  assert.match(appearance, /data-style/);
  assert.match(appearance, /aria-pressed/);
  assert.match(appearance, /persistDesignStyleId/);
  assert.match(appearance, /bloggenius\.ui\.sidebar-position/);
  assert.match(appearance, /applySettingsNextSidebarPosition/);
  assert.match(appearance, /initSettingsNextAppearance/);
  assert.doesNotMatch(appearance, /compatibility/);
  assert.doesNotMatch(appearance, /warm-editorial/);
  assert.doesNotMatch(appearance, /quiet-sage-studio/);
  assert.doesNotMatch(appearance, /autumn-night-library/);
  assert.doesNotMatch(appearance, /hanji-dancheong/);
  assert.match(appearance, /entry\.blurb/);
  assert.match(appearance, /getSelectableDesignStyles\(\)\[0\]/);
  assert.match(contract, /DESIGN_STYLE_STORAGE_KEY = 'bloggenius\.ui\.style'/);
  assert.match(system, /readStoredDesignStyleId/);
});

test('the local baseline is not selectable and Amade supplies style metadata', () => {
  const { DESIGN_STYLE_REQUIRED_TOKENS, DESIGN_STYLE_CONTRACT_VERSION } = require('../ui/scripts/foundation/design-style-token-contract');
  const { contract } = loadDesignStyleContract({ repoRoot: root });
  assert.deepEqual(Object.keys(contract.registry), ['warm-editorial']);
  assert.equal(contract.registry['warm-editorial'].selectable, false);
  assert.equal(contract.selectableStyles.length, 0);

  const remote = {
    id: 'remote-forest', label: '원격 숲', blurb: '원격 카탈로그에서 온 스타일입니다.',
    contractVersion: DESIGN_STYLE_CONTRACT_VERSION, selectable: true,
    tokens: Object.fromEntries(DESIGN_STYLE_REQUIRED_TOKENS.map((name) => [name, '#49675a']))
  };
  const populated = loadDesignStyleContract({ repoRoot: root, initialRemoteStyles: [remote] }).contract;
  assert.deepEqual(Array.from(populated.selectableStyles, (style) => style.id), ['remote-forest']);
  assert.equal(populated.registry['remote-forest'], undefined);
});

test('appearance styles use shared tokens only', () => {
  const css = read('ui/styles/features/settings-next-appearance.css');
  const manifest = read('ui/styles.css');

  assert.match(manifest, /\/\* @include styles\/features\/settings-next-appearance\.css \*\//);
  assert.match(manifest, /\/\* @include styles\/layout\/shell-navigation\.css \*\//);
  assert.match(css, /\.settings-next-appearance-grid/);
  assert.match(css, /\.settings-next-sidebar-layout/);
  assert.match(css, /\.settings-next-sidebar-position-option\[aria-pressed="true"\]/);
  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.appearance-style-card\[aria-pressed="true"\]/);
  const shell = read('ui/styles/layout/shell-navigation.css');
  const responsiveShell = read('ui/styles/layout/responsive-shell.css');
  const responsive = read('ui/styles/layout/responsive.css');
  assert.match(shell, /html\[data-sidebar-position="right"\] \.app\s*\{\s*flex-direction:\s*row-reverse/s);
  assert.match(responsiveShell, /html\[data-sidebar-position="right"\] \.sidebar\s*\{[^}]*right:\s*0;[^}]*transform:\s*translateX\(100%\)/s);
  assert.match(responsiveShell, /html\[data-sidebar-position="right"\] \.sidebar\.open\s*\{\s*transform:\s*translateX\(0\)/s);
  assert.match(responsive, /html\[data-sidebar-position="right"\] body\.mobile-quick-mode \.sidebar/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/i);
  assert.doesNotMatch(css, /rgba?\(/i);
  assert.doesNotMatch(css, /font-size:\s*\d+px/);
});
