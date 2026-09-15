const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('discovery surfaces use the shared status badge instead of hex palettes', () => {
  const quickDiscovery = read('ui/scripts/features/discovery/quick-discovery.js');
  const keywordModal = read('ui/scripts/features/discovery/keyword-modal.js');
  const modalCss = [
    'ui/styles/features/discovery-modal.css',
    'ui/styles/features/discovery-keyword-research.css',
    'ui/styles/features/discovery-responsive.css',
    'ui/styles/features/discovery-writing-assists.css'
  ].map(read).join('\n');
  const feedback = read('ui/styles/components/feedback.css');

  assert.match(feedback, /\.ui-status-badge:is\(\[data-state="danger"\], \[data-state="error"\]\)/);
  assert.match(quickDiscovery, /competitionBadgeAttributes\(competition\.state\)/);
  assert.match(quickDiscovery, /class="ui-status-badge">시작</);
  assert.match(keywordModal, /class="ui-status-badge"\$\{compState/);
  assert.match(keywordModal, /<span class="ui-status-badge">\$\{escapeHtml\(role\)\}<\/span>/);
  for (const source of [quickDiscovery, keywordModal, modalCss]) {
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
