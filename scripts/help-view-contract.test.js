const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('sidebar Help opens the internal guide view and preserves external contact as a CTA', () => {
  const shell = read('ui/index.html');
  const view = read('ui/partials/views/help.html');

  assert.match(shell, /class="nav-btn nav-help-link"[^>]*data-view="help"/);
  assert.doesNotMatch(shell, /nav-help-link[^>]*href=/);
  assert.match(view, /id="view-help"/);
  assert.match(view, /class="page-clock-widget">\s*<div class="clock-display" data-clock-display/);
  assert.match(view, /class="help-contact-action"[^>]*href="https:\/\/open\.kakao\.com\/o\/gZWL25Zh"/);
});

test('Help foundation exposes the agreed guide groups and safe official links', () => {
  const view = read('ui/partials/views/help.html');
  const externalLinks = Array.from(view.matchAll(/<a\s+[^>]*href="https:[^"]+"[^>]*>/g), (match) => match[0]);

  assert.match(view, /처음 시작하기/);
  assert.match(view, /콘텐츠 만들기/);
  assert.match(view, /자동화·관리/);
  assert.match(view, /data-help-nav="blog-next" data-help-tab="quick"/);
  assert.match(view, /data-help-nav="blog-next" data-help-tab="automation"/);
  assert.match(view, /data-help-nav="settings"/);
  assert.equal(externalLinks.length, 9);
  externalLinks.forEach((link) => {
    assert.match(link, /target="_blank"/);
    assert.match(link, /rel="noopener noreferrer"/);
  });
});

test('Help navigation initializes once, refreshes its catalog, and remains available in mobile quick mode', () => {
  const helpScript = read('ui/scripts/features/shell/help.js');
  const navigation = read('ui/scripts/foundation/navigation.js');
  const responsive = read('ui/styles/layout/responsive.css');

  assert.match(helpScript, /view\.dataset\.initialized !== 'true'/);
  assert.match(helpScript, /navigateTo\(button\.dataset\.helpNav, button\.dataset\.helpTab \|\| undefined\)/);
  assert.match(helpScript, /fetchJson\('\/api\/v1\/surface-content\/help'\)/);
  assert.match(helpScript, /keeping local guides/);
  assert.match(helpScript, /captureHelpLocalFallbacks\(view\)/);
  assert.match(helpScript, /restoreHelpLocalFallback\(element\)/);
  assert.match(helpScript, /copy\.className = 'help-catalog-copy'/);
  assert.match(helpScript, /arrow\.className = 'help-link-arrow'/);
  assert.match(helpScript, /regions\.getting_started\?\.blocks/);
  assert.match(helpScript, /renderHelpSupportingRegion\(regions\.supporting\?\.blocks\)/);
  assert.match(navigation, /'account', 'help'/);
  assert.match(navigation, /viewName === 'help'[\s\S]*initHelpView\(\)/);
  assert.doesNotMatch(responsive, /body\.mobile-quick-mode \.nav-help-link\s*\{/);
});
