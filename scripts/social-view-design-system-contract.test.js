const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('SNS composer follows the shared writing flow and selectable-card patterns', () => {
  const view = read('ui/partials/views/social.html');
  const composer = read('ui/scripts/features/social/manual-composer.js');
  const lifecycle = read('ui/scripts/features/social/manual-lifecycle.js');
  const styles = [
    'ui/styles/features/social.css',
    'ui/styles/features/social-media.css',
    'ui/styles/features/social-actions.css',
    'ui/styles/features/social-density.css',
    'ui/styles/features/social-surfaces.css'
  ].map(read).join('\n');

  assert.match(view, /class="card social-composer-card"/);
  assert.match(view, /class="social-tabs ui-top-tabs"[^>]*role="tablist"/);
  assert.match(view, /id="social-tab-button-compose"[^>]*aria-controls="social-tab-compose"[^>]*>직접 작성<\/button>/);
  assert.match(view, /id="social-tab-compose" role="tabpanel"[^>]*aria-labelledby="social-tab-button-compose"/);
  assert.match(view, /class="social-composer-intro blog-next-panel-lead blog-next-panel-intro"/);
  assert.match(view, /<h2>SNS 게시물 작성<\/h2>/);
  assert.match(view, /발행 채널을 고르고 메시지와 이미지를 준비해 발행하세요\./);
  assert.doesNotMatch(view, /class="[^"]*blog-next-panel[^"]*social-composer-card/);
  assert.doesNotMatch(view, /id="view-social"[^>]*data-style-scope=/);
  assert.doesNotMatch(view, /SNS에 바로 공유|채널을 고르고, 메시지와 이미지를 준비해 바로 발행하세요/);
  assert.match(view, /id="manual-sns-channel-list" class="social-channel-grid ui-selectable-card-grid"/);
  assert.match(view, /발행 채널 <small>최대 3개<\/small>/);
  assert.match(view, /id="manual-sns-workspaces-load"[^>]*>작업 공간 불러오기/);
  assert.match(view, /<span>Buffer 작업 공간<\/span>\s*<span class="ui-field-action"><span class="ui-select-shell"><select id="manual-sns-organization"/);
  assert.doesNotMatch(view, /manual-sns-organization-field|manual-sns-workspace-summary|social-workspace-control/);
  assert.match(view, /id="manual-sns-text" class="social-editor" rows="6"/);
  assert.match(lifecycle, /navigateTo\('settings-next', 'extras'\)/);
  assert.match(lifecycle, /settingsNextActivateExtrasTab\?\.\('social'\)/);
  assert.match(composer, /social-channel-option ui-selectable-card/);
  assert.match(composer, /social-channel-copy ui-selectable-card-copy/);
  assert.match(composer, /if \(listEl && !manualSnsConfig\.configured\)/);
  assert.match(composer, /const snapshot = readManualSnsWorkspaceCache\(\)/);
  assert.match(composer, /refreshStaleSnapshot = !snapshot\.isFresh/);
  assert.match(styles, /\.social-view \.social-composer-card[\s\S]*?var\(--ui-border-default\)/);
  assert.doesNotMatch(styles, /\.social-view \.view-title-block\s*\{/);
  assert.match(styles, /\.social-view \.social-channel-option[\s\S]*?var\(--ui-action-primary-soft\)/);
  assert.match(styles, /\.social-view \.social-composer-actions[\s\S]*?var\(--ui-border-default\)/);
  assert.doesNotMatch(styles, /var\(--(?:brand|text-|line|radius|shadow|transition|danger)\b/);
  assert.match(styles, /\.social-editor\s*\{[\s\S]*?block-size:\s*168px[\s\S]*?min-block-size:\s*168px/);
});
