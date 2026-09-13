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

  assert.match(html, /data-settings-next-app-tab="appearance"[^>]*>외모<\/button>/);
  assert.match(html, /id="settings-next-app-panel-appearance"/);
  assert.match(html, /id="settings-next-appearance-grid"/);
  assert.match(appearance, /getSelectableDesignStyles/);
  assert.match(appearance, /data-style/);
  assert.match(appearance, /aria-pressed/);
  assert.match(appearance, /persistDesignStyleId/);
  assert.match(appearance, /initSettingsNextAppearance/);
  assert.doesNotMatch(appearance, /compatibility/);
  assert.doesNotMatch(appearance, /warm-editorial/);
  assert.doesNotMatch(appearance, /quiet-sage-studio/);
  assert.match(appearance, /entry\.blurb/);
  assert.match(appearance, /getSelectableDesignStyles\(\)\[0\]/);
  assert.match(system, /DESIGN_STYLE_STORAGE_KEY = 'bloggenius\.ui\.style'/);
  assert.match(system, /readStoredDesignStyleId/);
});

test('only product styles are selectable', () => {
  const { contract } = loadDesignStyleContract({ repoRoot: root });
  assert.equal(contract.registry.compatibility.selectable, false);
  assert.equal(contract.selectableStyles.length > 0, true);
  assert.equal(contract.selectableStyles.some((style) => style.id === 'compatibility'), false);
  contract.selectableStyles.forEach((style) => {
    assert.equal(contract.registry[style.id], style);
    assert.equal(typeof style.label === 'string' && style.label.trim().length > 0, true, style.id);
    assert.equal(typeof style.blurb === 'string' && style.blurb.trim().length > 0, true, style.id);
  });
});

test('appearance styles use shared tokens only', () => {
  const css = read('ui/styles/features/settings-next-appearance.css');
  const manifest = read('ui/styles.css');

  assert.match(manifest, /\/\* @include styles\/features\/settings-next-appearance\.css \*\//);
  assert.match(css, /\.settings-next-appearance-grid/);
  assert.match(css, /\.appearance-style-card\[aria-pressed="true"\]/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/i);
  assert.doesNotMatch(css, /rgba?\(/i);
  assert.doesNotMatch(css, /font-size:\s*\d+px/);
});
