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

test('folder and paste previews share one reading surface and defer image diagnostics', () => {
  const html = readBlogNextView();
  const script = read('ui/scripts/features/blog-next/draft-inputs.js');
  const css = read('ui/styles/features/blog-next-baseline.css');

  for (const type of ['folder', 'paste']) {
    const panel = html.match(new RegExp(`<div class="blog-next-draft-preview blog-next-manuscript-preview local-markdown-preview-panel"[\\s\\S]*?data-blog-next-draft-preview="${type}"[\\s\\S]*?(?=<details class="blog-next-disclosure)`))?.[0] || '';
    assert.match(panel, /class="blog-next-draft-preview blog-next-manuscript-preview local-markdown-preview-panel"/);
    assert.match(panel, new RegExp(`data-blog-next-draft-preview="${type}" hidden`));
    assert.match(panel, /data-draft-preview-title/);
    assert.doesNotMatch(panel, /data-draft-preview-meta/);
    assert.match(panel, /data-draft-preview-body aria-label="본문 미리보기"/);
    assert.doesNotMatch(panel, /본문 Preview|이미지 매칭/);
    assert.match(panel, /data-draft-preview-image-details/);
    assert.match(panel, /<summary><strong>이미지 확인<\/strong><span data-draft-preview-image-summary>/);
  }
  assert.match(script, /imageDetails\.hidden = Number\(stats\.imageMissingCount \|\| 0\) === 0/);
  assert.match(script, /imageSummary\.textContent = `누락 \$\{stats\.imageMissingCount \|\| 0\}개`/);
  assert.match(script, /imageItems\.filter\(image => !image\.exists\)/);
  assert.match(script, /local-markdown-image-card is-missing/);
  assert.match(script, /local-markdown-image-card-status missing">파일 없음/);
  assert.match(css, /\.blog-next-manuscript-preview \.local-markdown-body-preview[\s\S]*?border: 0;[\s\S]*?background: transparent;/);
  assert.match(css, /\.blog-next-manuscript-preview \.local-markdown-body-preview figure\s*{[\s\S]*?border: 0;/);
  assert.match(css, /\.blog-next-manuscript-preview \.local-markdown-body-preview figure img\s*{[\s\S]*?max-height: min\(42vh, 460px\);[\s\S]*?object-fit: contain;/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?figure img\s*{[\s\S]*?max-height: min\(38vh, 360px\);/);
});

test('manuscript drafts keep idle results quiet and summarize repeated image warnings', () => {
  const html = readBlogNextView();
  const script = read('ui/scripts/features/blog-next/draft-inputs.js');
  const sharedCss = read('ui/styles/features/continuous-publishing.css');

  for (const type of ['folder', 'paste']) {
    assert.match(html, new RegExp(`data-blog-next-draft-validation="${type}"[^>]*aria-live="polite" hidden><\\/div>`));
  }
  assert.match(script, /function summarizeBlogNextDraftWarnings\(type, validation = null, preview = null\)/);
  assert.match(script, /!BLOG_NEXT_DRAFT_TYPES\.includes\(type\) \|\| missingCount === 0/);
  assert.match(script, /`이미지 \$\{missingCount\}개를 확인해 주세요\.`/);
  assert.doesNotMatch(script, /검증을 통과했습니다/);
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

  assert.match(html, /id="blog-next-paste-source-title"[^>]*for="blog-next-paste-markdown">Markdown 원고<\/label>/);
  assert.doesNotMatch(html, /완성된 원고 입력/);
  assert.match(html, /data-blog-next-draft-validation="paste"[^>]*aria-live="polite" hidden><\/div>/);
  assert.match(html, /id="blog-next-paste-clear"[^>]*hidden>내용 지우기/);
  assert.match(html, /id="blog-next-paste-clear-undo"[^>]*hidden>되돌리기/);
  assert.match(html, /data-blog-next-draft-actions="paste">\s*<span class="blog-next-recoverable-action-slot">[\s\S]*?id="blog-next-paste-clear"[\s\S]*?id="blog-next-paste-clear-undo"/);
  assert.match(script, /function syncBlogNextPastedDraftActions\(\)/);
  assert.match(script, /if \(clear\) clear\.hidden = !input\?\.value/);
  assert.doesNotMatch(script, /setBlogNextDraftValidation\('paste', null, 'Markdown 원고를 붙여넣어 주세요\.'\)/);
  assert.match(script, /blogNextDraftState\.paste\.clearSnapshot = currentValue/);
  assert.match(script, /function restoreBlogNextPastedDraft\(\)/);
  assert.match(script, /function discardBlogNextPastedClearSnapshot\(\)/);
  assert.match(script, /pastedInput\.addEventListener\('input',[\s\S]*discardBlogNextPastedClearSnapshot\(\)/);
});

test('manuscript baseline styles use semantic tokens and collapse predictably', () => {
  const css = read('ui/styles/features/blog-next-baseline.css');
  const actionCss = read('ui/styles/patterns/actions.css');
  const interactionCss = read('ui/styles/features/continuous-publishing-interactions.css');

  assert.match(css, /\.blog-next-draft-mode\s*\{[^}]*width:\s*min\(100%, 1180px\)/s);
  assert.match(css, /\.blog-next-draft-options\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(css, /data-dependency-active="false"[\s\S]*color:\s*var\(--ui-text-muted\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.blog-next-draft-options\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(actionCss, /button\.primary,\s*button\.secondary,\s*button\.ghost\s*\{[^}]*border:\s*1px solid/s);
  assert.doesNotMatch(interactionCss, /\.blog-next-folder-field\s*\{[^}]*margin-bottom/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(css, /\[data-style=/);
});

test('trend posting exposes explicit idle, loading, empty, error and result state boundaries', () => {
  const html = readBlogNextView();
  const script = read('ui/scripts/features/blog-next/trend-posting.js');

  assert.match(html, /id="blog-next-trend-status"[^>]*data-state="idle"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
  assert.match(html, /id="blog-next-trend-results-workspace"[^>]*hidden/);
  assert.match(html, /id="blog-next-trend-filters"[^>]*aria-disabled="true"[^>]*hidden/);
  assert.match(html, /id="blog-next-trend-filter-keyword"[^>]*disabled/);
  assert.match(html, /class="blog-next-select-shell trend-posting-filter-view-shell">\s*<select id="blog-next-trend-filter-view"/);
  assert.match(html, /class="blog-next-select-shell trend-posting-period-select-shell">\s*<select id="blog-next-trend-period" disabled/);
  assert.match(html, /id="blog-next-trend-categories"[^>]*aria-busy="true"/);
  assert.match(html, /class="table-wrap trend-posting-table-wrap" aria-busy="false"/);
  assert.match(html, /id="blog-next-trend-results" data-state="idle"><\/tbody>/);
  assert.doesNotMatch(html, /아직 조회하지 않았습니다|조회 후 사용할 수 있습니다/);
  assert.match(script, /function setBlogNextTrendStatus\(state, message\)/);
  assert.match(script, /status\.hidden = !text/);
  assert.match(script, /function syncBlogNextTrendResultsWorkspace\(\)/);
  assert.match(script, /workspace\.hidden = !blogNextTrendState\.queryRange/);
  assert.match(script, /function syncBlogNextTrendFilterAvailability\(\)/);
  assert.match(script, /function readBlogNextTrendQueryValidity\(\)/);
  assert.match(script, /inclusiveDays >= 1 && inclusiveDays <= 31/);
  assert.match(script, /function syncBlogNextTrendQueryAvailability\(\)/);
  assert.match(script, /query\.disabled = !controlsAvailable \|\| !readBlogNextTrendQueryValidity\(\)/);
  assert.match(script, /function setBlogNextTrendQueryBusy\(busy\)/);
  assert.match(script, /query\.setAttribute\('aria-busy', busy \? 'true' : 'false'\)/);
  assert.match(script, /query\.textContent = busy \? '조회 중\.\.\.' : '트렌드 조회'/);
  assert.match(script, /setBlogNextTrendQueryBusy\(true\)/);
  assert.match(script, /setBlogNextTrendQueryBusy\(false\)/);
  assert.doesNotMatch(script, /setBlogNextTrendStatus\('loading'/);
  assert.match(script, /badge\.dataset\.state = 'unavailable'/);
  assert.match(script, /새로고침 후 카테고리를 선택할 수 있습니다/);
  assert.match(script, /const hasResults = blogNextTrendState\.items\.length > 0/);
  assert.match(script, /const available = !blogNextTrendState\.loading && hasResults/);
  assert.match(script, /body\.dataset\.state = blogNextTrendState\.queryRange \? 'empty' : 'idle'/);
  assert.match(script, /filters\.hidden = !hasResults/);
  assert.match(script, /body\.dataset\.state = 'filtered-empty'/);
  assert.doesNotMatch(script, /개의 키워드를 찾았습니다/);
  assert.doesNotMatch(script, /setBlogNextTrendStatus\(blogNextTrendState\.items\.length/);
  assert.match(script, /setBlogNextTrendStatus\('error', `트렌드 조회에 실패했습니다:/);
  assert.match(script, /setBlogNextTrendTableBusy\(true\)/);
  assert.match(script, /setBlogNextTrendTableBusy\(false\)/);
});

test('trend posting state styling remains semantic and style-independent', () => {
  const css = read('ui/styles/features/blog-next-baseline.css');

  assert.match(css, /trend-posting-query-section\s*\{[^}]*background:\s*var\(--ui-surface\)/s);
  assert.match(css, /trend-posting-query-section \.trend-posting-categories\s*\{[^}]*background:\s*transparent/s);
  assert.doesNotMatch(css, /trend-posting-status\[data-state="loading"\]/);
  assert.match(css, /trend-posting-status\[data-state="error"\][\s\S]*var\(--ui-status-danger\)/);
  assert.doesNotMatch(css, /trend-posting-status\[data-state="success"\]/);
  assert.match(css, /trend-posting-result-filters\[aria-disabled="true"\][\s\S]*var\(--ui-surface-muted\)/);
  assert.match(css, /trend-posting-result-filters\[hidden\]\s*\{[^}]*display:\s*none/s);
  assert.match(css, /trend-posting-filter-view-shell\s*\{[^}]*flex:\s*0 0 180px/s);
  assert.match(css, /trend-posting-filter-view-shell > select\s*\{[^}]*width:\s*100%/s);
  assert.match(css, /trend-posting-period-select-shell > select\s*\{[^}]*width:\s*100%/s);
  assert.match(css, /trend-posting-results-workspace > \.table-responsive\s*\{[^}]*overflow:\s*visible/s);
  assert.match(css, /trend-posting-latest-badge\s*\{[^}]*var\(--ui-surface-muted\)[^}]*var\(--ui-text-secondary\)/s);
  assert.match(css, /trend-posting-table th\s*\{[^}]*background:\s*var\(--ui-surface-muted\)[^}]*color:\s*var\(--ui-text-primary\)/s);
  assert.match(css, /trend-posting-table tbody tr:hover td\s*\{[^}]*background:\s*var\(--ui-surface-hover\)/s);
  assert.match(css, /trend-posting-table \.trend-category-tag,[\s\S]*background:\s*var\(--ui-surface-muted\)[^}]*color:\s*var\(--ui-text-secondary\)/s);
  assert.match(css, /trend-change-up,[\s\S]*trend-change-new[\s\S]*background:\s*var\(--ui-action-primary-soft\)[^}]*color:\s*var\(--ui-action-primary-hover\)/s);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(css, /\[data-style=/);
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
  assert.doesNotMatch(html, /발행 대기열을 확인하고 있습니다|보관한 글감을 확인하고 있습니다/);
  assert.match(uiScript, /function handleBlogNextManagementTabKeydown\(event\)/);
  assert.match(uiScript, /button\.tabIndex = active \? 0 : -1/);
  assert.match(uiScript, /function setBlogNextManagementStatus\(state, message = ''\)/);
  assert.match(uiScript, /if \(blogNextQueueHasLoaded\) return/);
  assert.match(queueScript, /blogNextQueueHasLoaded = true/);
  assert.doesNotMatch(queueScript, /setBlogNextManagementStatus\('loading'/);
  assert.match(queueScript, /const showRefreshProgress = options\.showRefreshProgress !== false/);
  assert.match(queueScript, /if \(showRefreshProgress\) \{[\s\S]*refreshButton\.textContent = '불러오는 중\.\.\.'/);
  assert.match(queueScript, /loadBlogNextQueue\(\{ force: true, showRefreshProgress: false \}\)/);
  assert.match(queueScript, /setBlogNextManagementStatus\('error'/);
  assert.match(queueScript, /existing list|기존 목록/);
  assert.match(queueScript, /if \(blogNextQueueHasLoaded\) \{[\s\S]*setBlogNextManagementStatus\('error',[\s\S]*\} else \{[\s\S]*setBlogNextManagementStatus\('idle'\);[\s\S]*renderBlogNextQueueInitialError/);
  assert.doesNotMatch(queueScript, /setBlogNextTopicResult\(error\.message \|\| '발행 대기열/);
});

test('queue reserves status surfaces for actionable errors', () => {
  const css = read('ui/styles/features/blog-next-baseline.css');

  assert.match(css, /\.blog-next-management-status\s*\{[^}]*var\(--ui-border-default\)/s);
  assert.match(css, /blog-next-management-status\[data-state="error"\][\s\S]*var\(--ui-status-danger\)/);
  assert.doesNotMatch(css, /blog-next-management-status\[data-state="loading"\]|blog-next-empty-state\.is-loading/);
});

test('queue row actions describe their actual outcomes consistently', () => {
  const queueScript = read('ui/scripts/features/blog-next/quick-queue.js');

  assert.match(queueScript, /function getBlogNextQueueRunActionCopy\(item = \{\}\)/);
  assert.match(queueScript, /label: '지금 임시 저장'[\s\S]*busyLabel: '임시 저장 중\.\.\.'/);
  assert.match(queueScript, /label: '지금 예약 등록'[\s\S]*busyLabel: '예약 등록 중\.\.\.'/);
  assert.match(queueScript, /label: '지금 발행'[\s\S]*busyLabel: '발행 중\.\.\.'/);
  assert.match(queueScript, /secondaryAction\.textContent = saved \? '삭제' : '보관으로 이동'/);
  assert.match(queueScript, /title: actionCopy\.confirmTitle, confirmText: actionCopy\.confirmText/);
  assert.match(queueScript, /button\.textContent = actionCopy\.busyLabel/);
  assert.match(queueScript, /button\.textContent = actionCopy\.label/);
  assert.doesNotMatch(queueScript, /button\.textContent = '지금 실행'/);
  assert.doesNotMatch(queueScript, /button\.textContent = '빼기'/);
});

test('queue item titles avoid redundant edit labels and queue actions keep stable columns', () => {
  const queueScript = read('ui/scripts/features/blog-next/quick-queue.js');
  const queueCss = read('ui/styles/features/continuous-publishing.css');

  assert.match(queueScript, /copy\.setAttribute\('aria-label', `\$\{item\.subject[\s\S]*?\} 수정`\)/);
  assert.match(queueScript, /copy\.append\(title, meta, running\)/);
  assert.doesNotMatch(queueScript, /editCue|blog-next-queue-edit-cue/);
  assert.match(queueCss, /\.blog-next-queue-item:not\(\.blog-next-saved-item\) \.blog-next-queue-actions\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*36px 36px 112px 120px;/s);
  assert.match(queueCss, /@media[\s\S]*\.blog-next-queue-item:not\(\.blog-next-saved-item\) \.blog-next-queue-actions\s*\{[^}]*display:\s*flex;/s);
});

test('queue rows share one transient hover and keyboard focus surface', () => {
  const queueCss = read('ui/styles/features/continuous-publishing.css');

  assert.match(queueCss, /\.blog-next-queue-item:hover,\s*\.blog-next-queue-item:focus-within\s*\{[^}]*background:\s*var\(--ui-surface-hover\);/s);
  assert.match(queueCss, /\.blog-next-queue-item\s*\{[^}]*transition:[^;]*background-color var\(--ui-transition-interactive\)/s);
  assert.doesNotMatch(queueCss, /\.blog-next-queue-copy:hover strong/);
  assert.match(queueCss, /\.blog-next-queue-copy:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ui-action-primary\)/s);
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
