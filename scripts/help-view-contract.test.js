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
  assert.match(view, /@include shared\/page-widget-area\.html/);
  assert.match(view, /class="ui-button-link secondary"[^>]*href="https:\/\/open\.kakao\.com\/o\/gZWL25Zh"/);
});

test('Help foundation exposes the agreed guide groups and safe official links', () => {
  const view = read('ui/partials/views/help.html');
  const externalLinks = Array.from(view.matchAll(/<a\s+[^>]*href="https:[^"]+"[^>]*>/g), (match) => match[0]);

  assert.match(view, /처음 시작하기/);
  assert.match(view, /콘텐츠 만들기/);
  assert.match(view, /자동화·관리/);
  assert.match(view, /data-help-nav="blog-next" data-help-tab="quick"/);
  assert.match(view, /data-help-nav="blog-next" data-help-tab="automation"/);
  assert.match(view, /data-help-nav="settings-next" data-help-tab="core"/);
  assert.doesNotMatch(view, /data-help-nav="settings"/);
  assert.match(view, /Buffer로 SNS 발행 준비/);
  assert.match(view, /href="https:\/\/m\.blog\.naver\.com\/amadejjs\/223940980574"/);
  assert.match(view, /Buffer API Key 발급 안내/);
  assert.match(view, /href="https:\/\/bit\.ly\/4i0v2Gp"/);
  assert.equal(externalLinks.length, 11);
  externalLinks.forEach((link) => {
    assert.match(link, /target="_blank"/);
    assert.match(link, /rel="noopener noreferrer"/);
  });
});

test('Help navigation initializes once, refreshes its catalog, and remains available in mobile quick mode', () => {
  const helpScript = read('ui/scripts/shell/help.js');
  const navigation = read('ui/scripts/shell/navigation.js');
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
  assert.match(navigation, /'account', 'settings-next', 'site-hosting', 'help'/);
  assert.match(navigation, /viewName === 'help'[\s\S]*initHelpView\(\)/);
  assert.doesNotMatch(responsive, /body\.mobile-quick-mode \.nav-help-link\s*\{/);
});

test('Buffer API Key guide is listed in Help and Settings navigates to it internally', () => {
  const help = read('ui/partials/views/help.html');
  const settings = read('ui/partials/views/settings-next.html');
  const navigation = read('ui/scripts/shell/navigation.js');
  const guideUrl = 'https://m.blog.naver.com/amadejjs/223940980574';

  assert.match(help, new RegExp(`href="${guideUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.match(help, /Buffer로 SNS 발행 준비/);
  assert.match(help, /href="https:\/\/bit\.ly\/4i0v2Gp"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.match(settings, /data-help-guide-url="https:\/\/bit\.ly\/4i0v2Gp"[^>]*>API Key 발급 안내/);
  assert.match(navigation, /closest\('\[data-help-guide-url\]'\)/);
});
