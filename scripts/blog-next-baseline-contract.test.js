const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHtmlCompositionRuntime } = require('../src/ui-runtime/html-composition-runtime');

const repoRoot = path.resolve(__dirname, '..');
const uiRoot = path.join(repoRoot, 'ui');
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

function readBlogNextView() {
  return createHtmlCompositionRuntime({ fs, path }).composeHtmlFile({
    uiRoot,
    entryFile: 'partials/views/blog-next.html'
  }).html;
}

test('folder and paste modes share one manuscript publishing grammar', () => {
  const html = readBlogNextView();

  for (const type of ['folder', 'paste']) {
    const panel = html.match(new RegExp(`<div class="blog-next-mode-panel blog-next-draft-mode"[^>]*data-blog-next-mode-panel="${type}"[\\s\\S]*?(?=<div class="blog-next-mode-panel|</section>\\s*<section class="card)`))?.[0] || '';
    assert.match(panel, /class="blog-next-draft-source"/);
    assert.match(panel, new RegExp(`data-blog-next-draft-validation="${type}"[^>]*role="status"[^>]*aria-live="polite"`));
    assert.match(panel, new RegExp(`data-blog-next-draft-preview="${type}"`));
    assert.match(panel, new RegExp(`data-blog-next-draft-settings="${type}"`));
    assert.match(panel, new RegExp(`data-blog-next-draft-settings-summary="${type}"`));
    assert.match(panel, /<fieldset class="blog-next-field blog-next-field-wide blog-next-targets blog-next-draft-targets">/);
    assert.match(panel, /data-draft-schedule-field data-dependency-active="false"/);
    assert.match(panel, /data-draft-field="schedule-date"[^>]*disabled/);
    assert.match(panel, new RegExp(`data-blog-next-draft-publish="${type}"`));
    assert.ok(panel.indexOf(`data-blog-next-draft-preview="${type}"`) < panel.indexOf(`data-blog-next-draft-settings="${type}"`));
    assert.ok(panel.indexOf(`data-blog-next-draft-settings="${type}"`) < panel.indexOf(`data-blog-next-draft-publish="${type}"`));
  }
});

test('folder preview presents one reading surface and defers image diagnostics', () => {
  const html = readBlogNextView();
  const script = read('ui/scripts/features/blog-next/draft-inputs.js');
  const css = read('ui/styles/features/blog-next-baseline.css');
  const panel = html.match(/<div class="blog-next-draft-preview blog-next-folder-preview local-markdown-preview-panel"[\s\S]*?(?=<details class="blog-next-disclosure)/)?.[0] || '';

  assert.match(panel, /class="blog-next-draft-preview blog-next-folder-preview local-markdown-preview-panel"/);
  assert.match(panel, /data-blog-next-draft-preview="folder" hidden/);
  assert.match(panel, /data-draft-preview-title/);
  assert.doesNotMatch(panel, /data-draft-preview-meta/);
  assert.match(panel, /data-draft-preview-body aria-label="본문 미리보기"/);
  assert.doesNotMatch(panel, /본문 Preview/);
  assert.match(panel, /data-draft-preview-image-details/);
  assert.match(panel, /<summary><strong>이미지 확인<\/strong><span data-draft-preview-image-summary>/);
  assert.match(script, /imageDetails\.hidden = Number\(stats\.imageMissingCount \|\| 0\) === 0/);
  assert.match(script, /imageSummary\.textContent = `누락 \$\{stats\.imageMissingCount \|\| 0\}개`/);
  assert.match(script, /imageItems\.filter\(image => !image\.exists\)/);
  assert.match(script, /local-markdown-image-card is-missing/);
  assert.match(script, /local-markdown-image-card-status missing">파일 없음/);
  assert.match(css, /\.blog-next-folder-preview \.local-markdown-body-preview[\s\S]*?border: 0;[\s\S]*?background: transparent;/);
  assert.match(css, /\.blog-next-folder-preview \.local-markdown-body-preview figure\s*{[\s\S]*?border: 0;/);
});

test('folder draft keeps idle results quiet and summarizes repeated image warnings', () => {
  const html = readBlogNextView();
  const script = read('ui/scripts/features/blog-next/draft-inputs.js');
  const sharedCss = read('ui/styles/features/continuous-publishing.css');

  assert.match(html, /data-blog-next-draft-validation="folder"[^>]*aria-live="polite" hidden><\/div>/);
  assert.match(script, /function summarizeBlogNextDraftWarnings\(type, validation = null, preview = null\)/);
  assert.match(script, /`이미지 \$\{missingCount\}개를 확인해 주세요\.`/);
  assert.match(script, /validation\?\.ok === true && type !== 'folder'/);
  assert.match(script, /setBlogNextDraftValidation\('folder'\);/);
  assert.doesNotMatch(script, /setBlogNextDraftValidation\('folder', null, '원고 폴더를 선택해 주세요\.'\)/);
  assert.match(sharedCss, /\.blog-next-draft-validation\[hidden\],[\s\S]*?\.blog-next-draft-preview\[hidden\]\s*\{\s*display: none;/);
});

test('quick writing modes expose complete tabs and keyboard navigation', () => {
  const html = readBlogNextView();
  const script = read('ui/scripts/features/blog-next/shell.js');

  for (const type of ['ai', 'folder', 'paste']) {
    assert.match(html, new RegExp(`id="blog-next-mode-tab-${type}"[\\s\\S]*?role="tab"[\\s\\S]*?aria-controls="blog-next-mode-panel-${type}"`));
    assert.match(html, new RegExp(`id="blog-next-mode-panel-${type}" role="tabpanel"[\\s\\S]*?aria-labelledby="blog-next-mode-tab-${type}"`));
  }
  assert.match(script, /button\.tabIndex = active \? 0 : -1/);
  assert.match(script, /function handleBlogNextInputModeKeydown\(event\)/);
  assert.match(script, /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\]/);
  assert.match(script, /targetButton\.focus\(\)/);
});

test('manuscript settings preserve dependent values while matching provider and schedule state', () => {
  const script = read('ui/scripts/features/blog-next/draft-inputs.js');

  assert.match(script, /function syncBlogNextDraftSchedule\(type\)/);
  assert.match(script, /field\.dataset\.dependencyActive = String\(scheduled\)/);
  assert.match(script, /input\.disabled = !scheduled/);
  assert.match(script, /requiredIndicator\.hidden = !scheduled/);
  assert.match(script, /function syncBlogNextDraftProviderFields\(type\)/);
  assert.match(script, /field\.dataset\.draftProviderField === 'naver' \? naverSelected : wordpressSelected/);
  assert.match(script, /control\.disabled = !active/);
  assert.match(script, /headless: targets\.includes\('naver'\) &&/);
  assert.doesNotMatch(script, /blogNextDraftField\(type, 'naver-category'\)\.value = ''/);
  assert.doesNotMatch(script, /blogNextDraftField\(type, 'wordpress-category'\)\.value = ''/);
});

test('manuscript summaries expose consequential values without opening settings', () => {
  const script = read('ui/scripts/features/blog-next/draft-inputs.js');

  assert.match(script, /function syncBlogNextDraftSettingsSummary\(type\)/);
  assert.match(script, /targetLabels\.length > 0 \? targetLabels\.join\('\+'\) : '발행 대상 없음'/);
  assert.match(script, /settings\.postStatus === 'draft' \? '임시 저장'/);
  assert.match(script, /settings\.imageMode === 'generate' \? '이미지 생성'/);
  assert.match(script, /if \(settings\.targets\.includes\('naver'\)\)/);
});

test('pasted manuscript clearing is recoverable until new input replaces the snapshot', () => {
  const html = readBlogNextView();
  const script = read('ui/scripts/features/blog-next/draft-inputs.js');

  assert.match(html, /id="blog-next-paste-clear"[^>]*>내용 지우기/);
  assert.match(html, /id="blog-next-paste-clear-undo"[^>]*hidden>되돌리기/);
  assert.match(script, /blogNextDraftState\.paste\.clearSnapshot = currentValue/);
  assert.match(script, /function restoreBlogNextPastedDraft\(\)/);
  assert.match(script, /function discardBlogNextPastedClearSnapshot\(\)/);
  assert.match(script, /pastedInput\.addEventListener\('input',[\s\S]*discardBlogNextPastedClearSnapshot\(\)/);
});

test('manuscript baseline styles use semantic tokens and collapse predictably', () => {
  const css = read('ui/styles/features/blog-next-baseline.css');

  assert.match(css, /\.blog-next-draft-mode\s*\{[^}]*width:\s*min\(100%, 1180px\)/s);
  assert.match(css, /\.blog-next-draft-options\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(css, /data-dependency-active="false"[\s\S]*color:\s*var\(--ui-text-muted\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.blog-next-draft-options\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(css, /\[data-style=/);
});

test('trend posting exposes explicit idle, loading, empty, error and result state boundaries', () => {
  const html = readBlogNextView();
  const script = read('ui/scripts/features/blog-next/trend-posting.js');

  assert.match(html, /id="blog-next-trend-status"[^>]*data-state="idle"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="blog-next-trend-filters"[^>]*aria-disabled="true"/);
  assert.match(html, /id="blog-next-trend-filter-keyword"[^>]*disabled/);
  assert.match(html, /class="table-wrap trend-posting-table-wrap" aria-busy="false"/);
  assert.match(html, /id="blog-next-trend-results" data-state="idle"/);
  assert.match(script, /function setBlogNextTrendStatus\(state, message\)/);
  assert.match(script, /function syncBlogNextTrendFilterAvailability\(\)/);
  assert.match(script, /const available = !blogNextTrendState\.loading && blogNextTrendState\.items\.length > 0/);
  assert.match(script, /body\.dataset\.state = blogNextTrendState\.queryRange \? 'empty' : 'idle'/);
  assert.match(script, /body\.dataset\.state = 'filtered-empty'/);
  assert.match(script, /setBlogNextTrendStatus\('error', `트렌드 조회에 실패했습니다:/);
  assert.match(script, /setBlogNextTrendTableBusy\(true\)/);
  assert.match(script, /setBlogNextTrendTableBusy\(false\)/);
});

test('trend posting state styling remains semantic and style-independent', () => {
  const css = read('ui/styles/features/blog-next-baseline.css');

  assert.match(css, /trend-posting-status\[data-state="loading"\][\s\S]*var\(--ui-action-primary-soft\)/);
  assert.match(css, /trend-posting-status\[data-state="error"\][\s\S]*var\(--ui-status-danger\)/);
  assert.match(css, /trend-posting-status\[data-state="success"\][\s\S]*var\(--ui-status-success\)/);
  assert.match(css, /trend-posting-result-filters\[aria-disabled="true"\][\s\S]*var\(--ui-surface-muted\)/);
});

test('queue management exposes complete local tabs and list-owned async states', () => {
  const html = readBlogNextView();
  const uiScript = read('ui/scripts/features/blog-next/queue-ui.js');
  const queueScript = read('ui/scripts/features/blog-next/quick-queue.js');

  for (const type of ['ready', 'saved']) {
    assert.match(html, new RegExp(`id="blog-next-management-tab-${type}"[\\s\\S]*?aria-controls="blog-next-management-panel-${type}"`));
    assert.match(html, new RegExp(`id="blog-next-management-panel-${type}"[\\s\\S]*?role="tabpanel"[\\s\\S]*?aria-labelledby="blog-next-management-tab-${type}"`));
  }
  assert.match(html, /id="blog-next-management-status"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
  assert.equal((html.match(/class="blog-next-queue-list" data-state="loading" aria-live="polite" aria-busy="true"/g) || []).length, 2);
  assert.match(uiScript, /function handleBlogNextManagementTabKeydown\(event\)/);
  assert.match(uiScript, /button\.tabIndex = active \? 0 : -1/);
  assert.match(uiScript, /function setBlogNextManagementStatus\(state, message = ''\)/);
  assert.match(uiScript, /if \(blogNextQueueHasLoaded\) return/);
  assert.match(queueScript, /blogNextQueueHasLoaded = true/);
  assert.match(queueScript, /setBlogNextManagementStatus\('loading'/);
  assert.match(queueScript, /setBlogNextManagementStatus\('error'/);
  assert.match(queueScript, /existing list|기존 목록/);
  assert.doesNotMatch(queueScript, /setBlogNextTopicResult\(error\.message \|\| '발행 대기열/);
});

test('queue loading and error feedback use the shared semantic baseline', () => {
  const css = read('ui/styles/features/blog-next-baseline.css');

  assert.match(css, /\.blog-next-management-status\s*\{[^}]*var\(--ui-border-default\)/s);
  assert.match(css, /blog-next-management-status\[data-state="loading"\][\s\S]*var\(--ui-action-primary-soft\)/);
  assert.match(css, /blog-next-management-status\[data-state="error"\][\s\S]*var\(--ui-status-danger\)/);
  assert.match(css, /blog-next-empty-state\.is-loading[\s\S]*var\(--ui-surface-muted\)/);
});

test('smart comment identifies its model role and preserves results through async states', () => {
  const html = readBlogNextView();
  const script = read('ui/scripts/features/blog-next/smart-comment.js');

  assert.match(html, /id="blog-next-smart-comment-settings-summary">글쓰기 모델 사용/);
  assert.match(html, /id="blog-next-smart-comment-model-role">현재: 글쓰기 모델/);
  assert.match(html, /id="blog-next-smart-comment-run"[^>]*aria-describedby="blog-next-smart-comment-model-role"[^>]*disabled/);
  assert.match(html, /id="blog-next-smart-comment-list"[^>]*data-state="idle"[^>]*aria-busy="false"/);
  assert.match(script, /function syncBlogNextSmartCommentModelRole\(\)/);
  assert.match(script, /const label = custom \? 'Chat Model' : '글쓰기 모델'/);
  assert.match(script, /blogNextSmartCommentLoading \|\| blogNextSmartCommentRunning/);
  assert.match(script, /setAttribute\('aria-busy', 'true'\)/);
  assert.match(script, /setAttribute\('aria-busy', 'false'\)/);
  assert.match(script, /if \(nextItems\.length > 0 \|\| blogNextSmartCommentItems\.length === 0\)/);
});

test('continuous publishing disables dependent fields and separates operation feedback from schedule summary', () => {
  const html = readBlogNextView();
  const script = read('ui/scripts/features/blog-next/automation-settings.js');

  assert.match(html, /class="blog-next-automation-fields blog-next-dependent-field" data-dependency-active="false"/);
  assert.equal((html.match(/id="blog-next-automation-(?:start-time|end-time|interval|notify)"[^>]*disabled/g) || []).length, 4);
  assert.match(html, /id="blog-next-automation-feedback"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
  assert.match(html, /id="blog-next-automation-status"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
  assert.match(script, /function syncBlogNextAutomationDependentFields\(\)/);
  assert.match(script, /fields\.dataset\.dependencyActive = String\(active\)/);
  assert.match(script, /control\.disabled = locked \|\| !active/);
  assert.match(script, /setBlogNextAutomationFeedback\('loading', '연속 발행 설정을 불러오는 중입니다.'/);
  assert.match(script, /setBlogNextAutomationFeedback\('success', '설정을 저장했습니다.'/);
  assert.match(script, /setBlogNextAutomationFeedback\('error'/);
});
