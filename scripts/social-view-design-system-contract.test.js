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
  const optimization = read('ui/scripts/features/social/manual-optimization.js');
  const sharedBufferControls = read('ui/scripts/shared/buffer-publishing-controls.js');
  const styles = [
    'ui/styles/patterns/buffer-publishing-controls.css',
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
  assert.match(view, /메시지와 이미지를 준비한 뒤 발행 대상을 선택해 발행하세요\./);
  assert.doesNotMatch(view, /class="[^"]*blog-next-panel[^"]*social-composer-card/);
  assert.doesNotMatch(view, /id="view-social"[^>]*data-style-scope=/);
  assert.doesNotMatch(view, /SNS에 바로 공유|채널을 고르고, 메시지와 이미지를 준비해 바로 발행하세요/);
  assert.match(view, /id="manual-sns-channel-list" class="social-channel-grid ui-selectable-card-grid"/);
  assert.match(view, /발행 채널 <small id="manual-sns-channel-limit">최대 3개 · 0개 선택<\/small>/);
  assert.match(view, /id="manual-sns-workspaces-load"[^>]*>작업 공간 불러오기/);
  assert.match(view, /class="ui-settings-field social-workspace-select buffer-publishing-workspace"[\s\S]*<span>작업 공간<\/span>\s*<span class="ui-field-action"><span class="ui-select-shell"><select id="manual-sns-organization"/);
  assert.ok(view.indexOf('for="manual-sns-organization"') < view.indexOf('id="manual-sns-select-all"'));
  assert.ok(view.indexOf('id="manual-sns-select-all"') < view.indexOf('id="manual-sns-channel-list"'));
  assert.ok(view.indexOf('id="manual-sns-text"') < view.indexOf('id="manual-sns-image-title"'));
  assert.ok(view.indexOf('id="manual-sns-image-title"') < view.indexOf('for="manual-sns-organization"'));
  assert.ok(view.indexOf('id="manual-sns-channel-list"') < view.indexOf('id="manual-sns-publish-btn"'));
  assert.doesNotMatch(view, /manual-sns-organization-field|manual-sns-workspace-summary|social-workspace-control/);
  assert.match(view, /id="manual-sns-text" class="social-editor" rows="6"/);
  assert.match(view, /id="manual-sns-image-grid"/);
  assert.match(composer, /social-local-image-add-tile/);
  assert.match(composer, /AI 이미지 만들기/);
  assert.match(composer, /manualSnsImagePromptOpen/);
  assert.match(composer, /이미지 추가 요청/);
  assert.match(composer, /예: 벚꽃길을 걷는 장면, 따뜻한 봄 햇살의 수채화풍/);
  assert.match(composer, /artwork\.append\(instruction\)/);
  assert.match(composer, /promptRow\.append\(generate, cancel\)/);
  assert.match(composer, /footer\.hidden = false/);
  assert.match(composer, /footer\.append\(promptRow\)/);
  assert.doesNotMatch(composer, /workingOverlay\.append\(promptRow\)/);
  assert.match(composer, /generatedInstruction: generated \? String\(instruction \|\| ''\)\.trim\(\) : null/);
  assert.match(composer, /social-local-image-regenerate/);
  assert.match(composer, /manualSnsImagePromptTargetIndex = index/);
  assert.match(composer, /download\.download = file\.name/);
  assert.match(composer, /const isAiGenerated = generatedInstruction !== null && generatedInstruction !== undefined/);
  assert.match(composer, /const caption = isAiGenerated \? null : document\.createElement\('figcaption'\)/);
  assert.match(composer, /if \(caption\) tile\.appendChild\(caption\)/);
  assert.match(optimization, /const targetIndex = manualSnsImagePromptTargetIndex/);
  assert.match(optimization, /replaceManualSnsLocalImage\(targetIndex, file, instructionSnapshot\)/);
  assert.match(optimization, /본문을 입력한 뒤 이미지를 생성해 주세요\./);
  assert.doesNotMatch(view, /이미지 URL|manual-sns-image-url/);
  assert.match(composer, /generateManualSnsImage\(\)/);
  assert.match(optimization, /postJson\('\/api\/v1\/social\/manual\/image'/);
  assert.match(lifecycle, /navigateTo\('settings-next', 'extras'\)/);
  assert.match(lifecycle, /settingsNextActivateExtrasTab\?\.\('social'\)/);
  assert.match(composer, /social-channel-option ui-selectable-card/);
  assert.match(composer, /social-channel-copy ui-selectable-card-copy/);
  assert.match(composer, /BufferPublishingControls\.syncWorkspace/);
  assert.match(composer, /BufferPublishingControls\.syncChannelSelectAll/);
  assert.match(lifecycle, /BufferPublishingControls\.applyChannelSelectAll/);
  assert.match(lifecycle, /BufferPublishingControls\.setWorkspaceRefresh/);
  assert.match(sharedBufferControls, /syncWorkspace\(/);
  assert.match(sharedBufferControls, /syncChannelSelectAll\(/);
  assert.match(composer, /if \(listEl && !manualSnsConfig\.configured\)/);
  assert.match(composer, /const snapshot = readManualSnsWorkspaceCache\(\)/);
  assert.match(composer, /refreshStaleSnapshot = !snapshot\.isFresh/);
  assert.match(styles, /\.social-view \.social-composer-card[\s\S]*?var\(--ui-border-default\)/);
  assert.doesNotMatch(styles, /\.social-view \.view-title-block\s*\{/);
  assert.match(styles, /\.social-view \.social-channel-option[\s\S]*?var\(--ui-action-primary-soft\)/);
  assert.match(styles, /\.social-view \.social-composer-actions[\s\S]*?var\(--ui-border-default\)/);
  assert.match(styles, /\.social-local-image-add-tile\s*\{[\s\S]*?aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(styles, /\.social-local-image-tile\s*\{[\s\S]*?width:\s*100%[\s\S]*?box-sizing:\s*border-box/);
  assert.match(styles, /\.social-local-image-add-tile\s*\{[\s\S]*?width:\s*100%[\s\S]*?box-sizing:\s*border-box/);
  assert.match(styles, /\.social-local-image-add-artwork \.manuscript-image-block-placeholder-waves\s*\{[\s\S]*?translateY\(-14%\)/);
  assert.match(styles, /\.social-local-image-add-artwork textarea\s*\{[\s\S]*?inset:\s*12px 12px 92px[\s\S]*?background:\s*transparent/);
  assert.match(styles, /\.social-local-image-add-tile\s*\{[\s\S]*?background:\s*transparent/);
  assert.match(styles, /\.social-view \.social-local-image-add-actions button\.primary\.compact[\s\S]*?height:\s*48px[\s\S]*?min-height:\s*48px/);
  assert.match(styles, /\.social-view \.social-local-image-prompt button\.secondary\.compact[\s\S]*?height:\s*48px[\s\S]*?min-height:\s*48px/);
  assert.match(styles, /\.social-local-image-prompt\s*\{[\s\S]*?display:\s*flex/);
  assert.doesNotMatch(styles, /\.social-local-image-add-tile\.is-prompt-open\s*\{[^}]*grid-column/);
  assert.doesNotMatch(styles, /var\(--(?:brand|text-|line|radius|shadow|transition|danger)\b/);
  assert.match(styles, /\.social-editor\s*\{[\s\S]*?block-size:\s*168px[\s\S]*?min-block-size:\s*168px/);
});
