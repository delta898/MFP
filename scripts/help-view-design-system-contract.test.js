const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('help view uses the shared design system instead of compatibility scope', () => {
  const html = read('ui/partials/views/help.html');
  const css = read('ui/styles/features/help.css');

  assert.match(html, /<section class="view[^"]*" id="view-help">/);
  assert.doesNotMatch(html, /data-style-scope="compatibility"/);
  assert.match(html, /ui-overview-card/);
  assert.match(html, /ui-overview-heading/);
  assert.match(html, /ui-overview-eyebrow/);
  const overviewPattern = read('ui/styles/patterns/overview-card.css');
  assert.match(overviewPattern, /\.ui-overview-heading p \{/);
  assert.doesNotMatch(html, /help-eyebrow/);
  assert.doesNotMatch(html, /help-section-heading/);
  assert.doesNotMatch(css, /(?:--brand|--text-|--surface-|--line|--radius-|--shadow-|--transition|#[0-9a-f]{3,8}|rgba?\()/i);
  assert.doesNotMatch(css, /translateY/);
  assert.doesNotMatch(css, /radial-gradient/);
  assert.doesNotMatch(css, /\.help-view\s*\{[^}]*display/);
  assert.match(css, /#view-help\.active/);
});

test('help view keeps one primary per card and shared action variants', () => {
  const html = read('ui/partials/views/help.html');
  const css = read('ui/styles/features/help.css');

  assert.match(html, /<button class="primary[^"]*"[^>]*data-help-nav="blog-next"[^>]*>글 작성 시작하기<\/button>/);
  assert.match(html, /<button class="secondary[^"]*"[^>]*data-help-nav="blog-next"[^>]*>[\s\S]*?연속 발행 설정/);
  assert.match(html, /<button class="secondary[^"]*"[^>]*data-help-nav="settings-next"[^>]*>[\s\S]*?연결 설정 확인/);
  assert.match(html, /<a class="[^"]*ui-button-link secondary[^"]*"[^>]*>문의하기/);
  assert.doesNotMatch(html, /help-guide-count/);
  assert.doesNotMatch(html, /help-step-number/);
  assert.match(html, /ui-count-badge/);
  assert.match(html, /ui-sequence-badge/);
  assert.match(css, /\.help-start-list > li/);
});

test('help topic cards use no decorative icons', () => {
  const html = read('ui/partials/views/help.html');
  const css = read('ui/styles/features/help.css');

  assert.doesNotMatch(html, /help-topic-icon/);
  assert.doesNotMatch(css, /\.help-topic-icon/);
  assert.doesNotMatch(html, />[✎✓ⓘ]</);
});

test('help dynamic catalog hooks remain intact', () => {
  const html = read('ui/partials/views/help.html');
  const script = read('ui/scripts/features/shell/help.js');
  const css = read('ui/styles/features/help.css');

  ['help-getting-started-region', 'help-writing-region', 'help-automation-region', 'help-supporting-region', 'help-supporting-section'].forEach((id) => {
    assert.match(html, new RegExp(`id="${id}"`));
  });
  ['help-catalog-copy', 'help-link-arrow', 'help-supporting-card', 'help-guide-navigation-target'].forEach((cls) => {
    assert.match(script, new RegExp(cls));
    assert.match(css, new RegExp(`\\.${cls}`));
  });
  assert.doesNotMatch(css, /\.help-step-number/);
  assert.doesNotMatch(css, /\.help-guide-count/);
  assert.match(script, /data-help-nav/);
  assert.match(script, /ui-sequence-badge/);
  assert.match(script, /captureHelpLocalFallbacks/);
});
