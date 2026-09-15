const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHtmlCompositionRuntime } = require('../src/ui-runtime/html-composition-runtime');

const repoRoot = path.resolve(__dirname, '..');
const uiRoot = path.join(repoRoot, 'ui');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readBlogNextView() {
  return createHtmlCompositionRuntime({ fs, path }).composeHtmlFile({
    uiRoot,
    entryFile: 'partials/views/blog-next.html'
  }).html;
}

test('Blog Beta quick flow keeps essential writing inputs visible', () => {
  const html = readBlogNextView();
  const core = html.match(/<div class="blog-next-form-grid blog-next-core-fields">([\s\S]*?)<\/div>\s*<div class="blog-next-disclosures">/)?.[1] || '';

  ['blog-next-subject', 'blog-next-keywords', 'blog-next-title', 'blog-next-instruction'].forEach((id) => {
    assert.match(core, new RegExp(`id="${id}"`));
  });
  ['blog-next-reference-url', 'blog-next-target-naver', 'blog-next-post-status'].forEach((id) => {
    assert.doesNotMatch(core, new RegExp(`id="${id}"`));
  });
});

test('optional content and publish settings disclose their current values', () => {
  const html = readBlogNextView();

  assert.match(html, /<details class="blog-next-disclosure" id="blog-next-content-settings">[\s\S]*id="blog-next-content-settings-summary"[\s\S]*id="blog-next-reference-url"[\s\S]*id="blog-next-writing-strategy"[\s\S]*id="blog-next-image-mode"[\s\S]*<\/details>/);
  assert.match(html, /<details class="blog-next-disclosure blog-next-draft-settings" id="blog-next-publish-settings"[^>]*data-blog-next-publish-settings[^>]*>[\s\S]*id="blog-next-publish-settings-summary"[\s\S]*id="blog-next-target-naver"[\s\S]*id="blog-next-post-status"[\s\S]*id="blog-next-runner-headless"[\s\S]*<\/details>/);
  assert.equal((html.match(/id="blog-next-publish-settings"/g) || []).length, 1);
  assert.equal((html.match(/data-blog-next-publish-settings-slot="(?:ai-queue|ai-publish|folder|paste)"/g) || []).length, 4);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:\s|>)/);
});

test('AI assists have one distinct pattern without becoming primary actions', () => {
  const html = readBlogNextView();
  const css = read('ui/styles/features/blog-next-quick-flow.css');

  assert.equal((html.match(/class="secondary blog-next-ai-assist"/g) || []).length, 3);
  assert.equal((html.match(/class="secondary blog-next-ai-assist"[^>]*aria-label="AI [^"]+"[^>]*><span aria-hidden="true">✦<\/span>/g) || []).length, 3);
  assert.match(css, /\.blog-next-ai-assist\s*\{[^}]*background:\s*var\(--ui-action-primary-soft\)/s);
  assert.doesNotMatch(html, /class="primary blog-next-ai-assist"/);
  assert.doesNotMatch(html, /<span aria-hidden="true">AI<\/span>/);
});

test('quick flow summaries update from existing controls and clear remains undoable', () => {
  const html = readBlogNextView();
  const script = read('ui/scripts/features/blog-next/quick-queue.js');
  const uiScript = read('ui/scripts/features/blog-next/quick-flow-ui.js');

  assert.match(html, /id="blog-next-clear-undo"[^>]*hidden>되돌리기/);
  assert.match(html, /class="blog-next-recoverable-action-slot">[\s\S]*?id="blog-next-clear-topic"[\s\S]*?id="blog-next-clear-undo"/);
  assert.match(uiScript, /function syncBlogNextQuickFlowSummaries\(\)/);
  assert.match(uiScript, /formatBlogPlatformList\(platforms, ' \+ '\) \|\| '발행 대상 없음'/);
  assert.match(uiScript, /function captureBlogNextClearableContent\(\)/);
  assert.match(script, /clearBlogNextTopicContent\(\{ preserveUndo: true \}\)/);
  assert.match(uiScript, /function restoreBlogNextClearedTopicContent\(\)/);
  assert.match(uiScript, /function syncBlogNextTopicActionAvailability\(\)/);
  assert.match(uiScript, /ideaValid: hasIdea && referencesValid/);
  assert.match(uiScript, /readyValid: hasIdea && referencesValid && hasTarget && scheduleValid/);
  assert.match(uiScript, /save\.disabled = busy \|\| !editingChanged \|\| \(editingReady \? !readyValid : !ideaValid\)/);
  assert.match(uiScript, /enqueue\.disabled = busy \|\| !readyValid/);
  assert.match(uiScript, /publish\.disabled = busy \|\| runnerActive [^;]* \|\| !ideaValid/);
  assert.match(script, /document\.getElementById\('blog-next-clear-undo'\)\?\.addEventListener\('click', restoreBlogNextClearedTopicContent\)/);
});

test('quick writing distinguishes queued ideas from the generated manuscript flow', () => {
  const html = readBlogNextView();
  const css = read('ui/styles/features/blog-next-quick-flow.css');
  const execution = read('ui/scripts/features/blog-next/draft-execution.js');
  const queue = read('ui/scripts/features/blog-next/quick-queue.js');
  const inputs = read('ui/scripts/features/blog-next/draft-inputs.js');
  const uiScript = read('ui/scripts/features/blog-next/quick-flow-ui.js');

  assert.match(html, /data-blog-next-ai-step="prepare"[\s\S]*>원고 준비<[\s\S]*data-blog-next-ai-idea-actions/);
  assert.match(html, /data-blog-next-ai-idea-actions[\s\S]*>나중에 활용<[\s\S]*id="blog-next-save-topic"[\s\S]*>글감 보관/);
  assert.match(html, /data-blog-next-ai-generate-action[\s\S]*>지금 작성<[\s\S]*id="blog-next-publish-now"[\s\S]*>원고 만들기/);
  assert.match(html, /id="blog-next-enqueue-topic"[\s\S]*>발행 대기열에 추가<\/button>/);
  assert.match(html, /id="blog-next-queue-action-hint">대기열의 글감은 실행할 때 원고를 새로 만듭니다/);
  assert.match(html, /data-blog-next-ai-step="preview" hidden>[\s\S]*>미리보기</);
  assert.match(html, /data-blog-next-ai-step="publish" hidden>[\s\S]*>발행</);
  assert.match(execution, /data-blog-next-publish-settings-slot="ai-publish"/);
  assert.match(uiScript, /function mountBlogNextPublishSettings/);
  assert.match(execution, /if \(save\) save\.hidden = hasDraft/);
  assert.match(execution, /enqueue\.hidden = hasDraft/);
  assert.match(execution, /prepareActions\.hidden = !editing && hasDraft/);
  assert.match(execution, /ideaActions\.hidden = !editing && hasDraft/);
  assert.match(execution, /previewActions\.hidden = editing \|\| !hasDraft/);
  assert.match(html, /data-blog-next-ai-preview-actions hidden>[\s\S]*id="blog-next-regenerate-draft"[^>]*>원고 다시 만들기/);
  assert.match(execution, /publishSettings\.hidden = !editing && !hasDraft/);
  assert.match(queue, /발행 계획을 확인한 뒤 발행 대기열에 추가해 주세요/);
  assert.match(queue, /\['blog-next-publish-now', 'blog-next-regenerate-draft'\][\s\S]*generateBlogNextAiDraft\(\)/);
  assert.match(queue, /publishButton\.textContent = aiDraftGenerating \? '원고 만드는 중\.\.\.'/);
  assert.match(queue, /publishSettings\.hidden = false;[\s\S]*publishSettings\.open = true/);
  assert.match(queue, /bindBlogNextDetachedPublishSettings\(form\)/);
  assert.match(execution, /function bindBlogNextDetachedPublishSettings\(form\)/);
  assert.doesNotMatch(html, /data-blog-next-draft-result=/);
  assert.match(css, /\.blog-next-ai-action-row\s*\{[\s\S]*?justify-content:\s*space-between/);
  assert.match(css, /\.blog-next-ai-action-buttons\s*\{[\s\S]*?display:\s*inline-flex/);
  assert.doesNotMatch(execution, /runWithLiveProgress/);
  assert.doesNotMatch(inputs, /runWithLiveProgress/);
  assert.match(execution, /source: 'manuscript_generation'/);
  const sourceFields = execution.match(/const sourceFields = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
  assert.doesNotMatch(sourceFields, /blog-next-target-(?:naver|wordpress)/);
});

test('quick flow width and disclosure layout adapt without style-specific selectors', () => {
  const html = readBlogNextView();
  const css = read('ui/styles/features/blog-next-quick-flow.css');
  const selectShellCss = read('ui/styles/patterns/select-shell.css');

  assert.match(css, /#blog-next-topic-form-home \.blog-next-topic-form\s*\{[^}]*width:\s*min\(100%, 1180px\)/s);
  assert.match(css, /#blog-next-topic-form-home \.blog-next-ai-prepare-actions\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*width:\s*100%;/s);
  assert.match(css, /\.blog-next-ai-action-row\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*width:\s*100%;/s);
  assert.match(css, /\[data-blog-next-draft-actions\]\[hidden\]\s*\{[^}]*display:\s*none;/s);
  assert.match(css, /\.blog-next-disclosure > summary\s*\{/);
  const topicForm = html.match(/<form id="blog-next-topic-form"[\s\S]*?<\/form>/)?.[0] || '';
  assert.equal((topicForm.match(/<span class="ui-select-shell">/g) || []).length, 7);
  assert.match(topicForm, /<span class="ui-select-shell">\s*<select id="blog-next-writing-strategy">/);
  assert.match(topicForm, /<span class="ui-select-shell">\s*<select id="blog-next-image-mode">/);
  assert.match(topicForm, /<span class="ui-select-shell"><select id="blog-next-post-status"[^>]*>/);
  assert.match(selectShellCss, /\.ui-select-shell::after\s*\{[^}]*inset-inline-end:\s*var\(--ui-space-4\)/s);
  assert.match(selectShellCss, /\.ui-select-shell > select\s*\{[^}]*appearance:\s*none/s);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.blog-next-disclosure > summary/s);
  assert.doesNotMatch(css, /\[data-style=/);
});

test('quick flow uses user language and separates publishing targets', () => {
  const html = readBlogNextView();
  const css = read('ui/styles/features/blog-next-quick-flow.css');

  assert.match(html, />담고 싶은 경험·방향<\/span>/);
  assert.doesNotMatch(html, />참고·지시사항<\/span>/);
  assert.match(css, /\.blog-next-disclosure \.blog-next-targets\s*\{[^}]*column-gap:\s*var\(--ui-space-6\)/s);
});

test('surface fills communicate state and help follows the active style', () => {
  const html = readBlogNextView();
  const css = read('ui/styles/features/blog-next-quick-flow.css');
  const script = read('ui/scripts/features/blog-next/quick-queue.js');

  assert.match(css, /\.blog-next-disclosure > summary:hover\s*\{[^}]*background:\s*var\(--ui-surface-hover\)/s);
  assert.match(css, /\.blog-next-disclosure\[open\] > summary\s*\{[^}]*background:\s*var\(--ui-surface-muted\)/s);
  assert.match(css, /\.blog-next-disclosure \.blog-next-execution-options\s*\{[^}]*background:\s*transparent/s);
  assert.equal((html.match(/class="tooltip-container blog-next-help-trigger" tabindex="0" aria-label="[^"]+ 도움말" aria-describedby="blog-next-help-[^"]+"/g) || []).length, 6);
  assert.equal((html.match(/class="tooltip-text" id="blog-next-help-[^"]+" role="tooltip"/g) || []).length, 6);
  assert.match(css, /\.blog-next-topic-form \.blog-next-help-trigger \.tooltip-text\s*\{[^}]*background:\s*var\(--ui-surface-emphasis\)[^}]*color:\s*var\(--ui-text-inverse\)/s);
  assert.match(css, /\.blog-next-topic-form \.blog-next-help-trigger \.tooltip-text\s*\{[^}]*transition:\s*opacity\s+var\(--ui-motion-standard\)/s);
  assert.match(css, /\.blog-next-topic-form \.blog-next-help-trigger:focus \.tooltip-text\s*\{/);
  assert.match(script, /event\.target\?\.matches\?\.\('\.blog-next-help-trigger'\)[^\n]*event\.target\.blur\(\)/);
});

test('collision-aware help placement and dependent schedule field follow their explicit contracts', () => {
  const html = readBlogNextView();
  const foundationCss = read('ui/styles/base/foundation.css');
  const css = read('ui/styles/features/blog-next-quick-flow.css');
  const script = read('ui/scripts/features/blog-next/quick-flow-ui.js');

  assert.doesNotMatch(html, /blog-next-help-trigger-(?:start|end)/);
  assert.match(css, /\.blog-next-topic-form \.blog-next-help-trigger\[data-help-placement="start"\] \.tooltip-text\s*\{[^}]*left:\s*0[^}]*transform:\s*none/s);
  assert.match(css, /\.blog-next-topic-form \.blog-next-help-trigger\[data-help-placement="end"\] \.tooltip-text\s*\{[^}]*right:\s*0[^}]*left:\s*auto/s);
  assert.match(script, /function syncBlogNextHelpPlacement\(trigger\)/);
  assert.match(script, /triggerCenter - \(tooltipWidth \/ 2\) < leftBoundary/);
  assert.match(script, /triggerCenter \+ \(tooltipWidth \/ 2\) > rightBoundary/);
  assert.match(script, /trigger\.addEventListener\('mouseenter', syncPlacement\)/);
  assert.match(script, /trigger\.addEventListener\('focus', syncPlacement\)/);
  assert.match(html, /id="blog-next-schedule-field"[^>]*data-dependency-active="false"/);
  assert.match(html, /id="blog-next-schedule-required"[^>]*hidden>\(필수\)/);
  assert.match(html, /class="visually-hidden" id="blog-next-schedule-hint">예약 발행을 선택하면 활성화됩니다/);
  assert.match(html, /id="blog-next-schedule-date"[^>]*type="datetime-local"[^>]*aria-describedby="blog-next-schedule-hint"[^>]*disabled/);
  assert.match(foundationCss, /\.visually-hidden\s*\{[^}]*position:\s*absolute !important;[^}]*clip:\s*rect\(0, 0, 0, 0\) !important;/s);
  assert.match(css, /\.blog-next-topic-form \.blog-next-dependent-field input:disabled\s*\{[^}]*background:\s*var\(--ui-surface-muted\)[^}]*cursor:\s*not-allowed/s);
  assert.match(script, /field\.dataset\.dependencyActive = String\(scheduled\)/);
  assert.match(script, /input\.disabled = !scheduled;/);
  assert.match(script, /input\.required = scheduled;/);
  assert.match(script, /requiredIndicator\.hidden = !scheduled;/);
});

test('provider-dependent controls align UI, summaries and runner payloads', () => {
  const html = readBlogNextView();
  const css = read('ui/styles/features/blog-next-quick-flow.css');
  const script = read('ui/scripts/features/blog-next/quick-queue.js');
  const uiScript = read('ui/scripts/features/blog-next/quick-flow-ui.js');
  const runnerScript = read('ui/scripts/features/blog-next/runner.js');

  assert.match(html, /id="blog-next-headless-field"[^>]*data-dependency-active="true"/);
  assert.match(html, /id="blog-next-naver-category-field"[^>]*data-dependency-active="true"/);
  assert.match(html, /id="blog-next-wordpress-category-field"[^>]*data-dependency-active="false"[\s\S]*id="blog-next-wordpress-category"[^>]*disabled/);
  assert.match(html, /id="blog-next-help-headless" role="tooltip">네이버 포스팅 브라우저/);
  assert.match(css, /\.blog-next-dependent-field\[data-dependency-active="false"\] \.blog-next-check-label\s*\{[^}]*color:\s*var\(--ui-text-muted\)/s);
  assert.match(uiScript, /function syncBlogNextProviderDependentFields\(\)/);
  assert.match(uiScript, /input\.disabled = !naverSelected \|\| runnerBusy;/);
  assert.match(uiScript, /\['blog-next-naver-category-field', 'blog-next-naver-category', naverSelected\]/);
  assert.match(uiScript, /\['blog-next-wordpress-category-field', 'blog-next-wordpress-category', wordpressSelected\]/);
  assert.match(uiScript, /categoryInput\.disabled = !selected/);
  assert.match(uiScript, /if \(document\.getElementById\('blog-next-target-naver'\)\?\.checked\)\s*\{\s*summaryParts\.push/s);
  assert.match(script, /startBlogNextRunner\(\{ rowIndex: Number\(data\.rowIndex\), platforms: payload\.platforms \}\)/);
  assert.match(script, /startBlogNextRunner\(\{ rowIndex, platforms: item\.options\?\.platforms \}\)/);
  assert.match(runnerScript, /const supportsHeadless = platforms === null \|\| platforms\.includes\('naver'\)/);
  assert.match(runnerScript, /const headless = supportsHeadless &&/);
});
