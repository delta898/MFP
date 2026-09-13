const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('discovery surfaces use the shared status badge instead of hex palettes', () => {
  const quickDiscovery = read('ui/scripts/features/discovery/quick-discovery.js');
  const lifecycle = read('ui/scripts/foundation/lifecycle.js');
  const modalCss = read('ui/styles/features/discovery-modal.css');
  const overview = read('ui/styles/patterns/overview-card.css');

  assert.match(overview, /\.ui-status-badge:is\(\[data-state="danger"\]\)/);
  assert.match(quickDiscovery, /competitionBadgeAttributes\(competition\.state\)/);
  assert.match(quickDiscovery, /class="ui-status-badge">시작</);
  assert.match(lifecycle, /class="ui-status-badge"\$\{compState/);
  assert.match(lifecycle, /<span class="ui-status-badge">\$\{escapeHtml\(role\)\}<\/span>/);
  for (const source of [quickDiscovery, lifecycle, modalCss]) {
    assert.doesNotMatch(source, /comp-badge/);
    assert.doesNotMatch(source, /title-role-badge/);
    assert.doesNotMatch(source, /keyword-input-badge/);
  }
});

test('destructive actions share one danger variant', () => {
  const actions = read('ui/styles/patterns/actions.css');
  const naverBlog = read('ui/partials/views/settings/naver-blog.html');
  const writing = read('ui/partials/views/settings/writing.html');

  assert.match(actions, /button\.ui-danger-action/);
  assert.match(naverBlog, /class="secondary ui-danger-action"/);
  assert.match(writing, /class="secondary ui-danger-action"/);
  for (const file of [
    'ui/styles/features/writing-settings.css',
    'ui/styles/features/settings-tables.css'
  ]) {
    assert.doesNotMatch(read(file), /danger-outline/);
  }
});
