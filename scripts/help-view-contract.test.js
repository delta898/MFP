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

test('AI settings routes users to the existing Help guide instead of duplicating an external link', () => {
  const aiView = read('ui/partials/views/settings/ai.html');
  const helpView = read('ui/partials/views/help.html');
  const helpScript = read('ui/scripts/features/shell/help.js');
  const navigation = read('ui/scripts/foundation/navigation.js');

  assert.match(aiView, /data-help-guide-url="https:\/\/m\.blog\.naver\.com\/amadejjs\/224368506082"/);
  assert.match(aiView, /AI 설정 가이드 보기/);
  assert.match(helpView, /href="https:\/\/m\.blog\.naver\.com\/amadejjs\/224368506082"/);
  assert.match(helpScript, /async function navigateToHelpGuide/);
  assert.match(helpScript, /await navigateTo\('help'\)/);
  assert.match(helpScript, /help-guide-navigation-target/);
  assert.match(navigation, /data-help-guide-url/);
});

test('configuration sections expose only contextual Help entry points', () => {
  const general = read('ui/partials/views/settings/general.html');
  const blog = read('ui/partials/views/settings/naver-blog.html');
  const writing = read('ui/partials/views/settings/writing.html');
  const expected = [
    '224367369056',
    '224369593466',
    '224364560786',
    '224364876173',
    'blog.gongzza.com/blog/%eb%b8%94%eb%a1%9c%ea%b7%b8-%ec%9e%90%eb%8f%99%ed%99%94-%ed%9a%a8%ec%9c%a8-%ec%98%ac%eb%a6%ac%eb%8a%94-bloggenius-%eb%b9%a0%eb%a5%b8-%ea%b8%80-%ec%9e%91%ec%84%b1-%eb%b0%a9%eb%b2%95/'
  ];
  expected.forEach((fragment) => assert.match(`${general}\n${blog}\n${writing}`, new RegExp(`data-help-guide-url="[^"]*${fragment}`)));
  assert.match(general, /Google 계정 연결[\s\S]*연결 방법 보기/);
  assert.match(general, /앱 업데이트[\s\S]*업데이트 팁 보기/);
  assert.match(blog, /네이버 블로그[\s\S]*로그인 방법 보기/);
  assert.match(blog, /워드프레스[\s\S]*연동 방법 보기/);
  assert.match(writing, /빠른 글 작성 가이드 보기/);
});
