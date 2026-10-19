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

function readBlogNextQueueScripts() {
  return [
    read('ui/scripts/features/blog/queue-ui.js'),
    read('ui/scripts/features/blog/quick-queue.js'),
    read('ui/scripts/features/blog/queue-management.js')
  ].join('\n');
}

function readBlogNextQueueStyles() {
  return [
    read('ui/styles/features/continuous-publishing.css'),
    read('ui/styles/features/continuous-publishing-queue.css'),
    read('ui/styles/features/continuous-publishing-usability.css')
  ].join('\n');
}

test('shared Blog Beta form and queue typography uses semantic roles', () => {
  const publishing = read('ui/styles/features/continuous-publishing.css');
  const queue = read('ui/styles/features/continuous-publishing-queue.css');
  const interactions = read('ui/styles/features/continuous-publishing-interactions.css');
  const baseline = read('ui/styles/features/blog-next-baseline.css');

  assert.match(publishing, /\.blog-next-field\s*\{[^}]*font-size:\s*var\(--ui-type-body-size\);[^}]*font-weight:\s*var\(--ui-weight-regular\);/s);
  assert.match(publishing, /\.blog-next-field > span:first-child,[\s\S]*?font-size:\s*var\(--ui-type-label-size\);[^}]*font-weight:\s*var\(--ui-weight-bold\);/s);
  assert.match(publishing, /\.blog-next-field input\[type="text"\],[\s\S]*?font-size:\s*var\(--ui-type-body-size\);[^}]*font-weight:\s*var\(--ui-weight-regular\);/s);
  assert.match(queue, /\.blog-next-queue-order\s*\{[^}]*font-size:\s*var\(--ui-type-caption-size\);[^}]*font-weight:\s*var\(--ui-weight-bold\);/s);
  assert.match(queue, /\.blog-next-queue-copy strong\s*\{[^}]*font-size:\s*var\(--ui-type-body-size\);[^}]*font-weight:\s*var\(--ui-weight-semibold\);/s);
  assert.match(queue, /\.blog-next-queue-actions \.primary\s*\{[^}]*font-size:\s*var\(--ui-type-label-size\);[^}]*font-weight:\s*var\(--ui-weight-bold\);/s);
});

test('unified writer keeps the manuscript editor and removes retired input modes', () => {
  const html = readBlogNextView();
  const inputs = read('ui/scripts/features/blog/draft-inputs.js');
  assert.match(html, /id="blog-next-mode-panel-ai" role="region"[\s\S]*?data-blog-next-mode-panel="ai"/);
  assert.match(html, /id="blog-next-ai-editor"[^>]*class="manuscript-editor-canvas"/);
  assert.doesNotMatch(html, /data-blog-next-mode-panel="(?:folder|paste)"|blog-next-folder-input|blog-next-paste-markdown/);
  assert.doesNotMatch(inputs, /blogNextDraftState\.(?:folder|paste)|flushBlogNext(?:Folder|Paste)Draft/);
  assert.match(inputs, /aiEditorRoot\.addEventListener\('paste'/);
});

test('unified writer retains the manuscript preview and image workspace', () => {
  const html = readBlogNextView();
  const script = read('ui/scripts/features/blog/draft-inputs.js');
  assert.match(html, /data-blog-next-draft-preview="ai"/);
  assert.match(html, /id="blog-next-ai-draft-images"[^>]*data-draft-preview-image-details/);
  assert.doesNotMatch(html, /data-blog-next-draft-preview="(?:folder|paste)"/);
  assert.match(script, /function renderBlogNextDraftPreview\(type, preview = null\)/);
  assert.match(script, /state\.editor\?\.syncImages/);
});

test('manuscript drafts keep idle results quiet and summarize repeated image warnings', () => {
  const html = readBlogNextView();
  const script = read('ui/scripts/features/blog/draft-inputs.js');
  const sharedCss = read('ui/styles/features/continuous-publishing-drafts.css');

  assert.match(html, /data-blog-next-draft-validation="ai"[^>]*aria-live="polite" hidden><\/div>/);
  assert.match(script, /function summarizeBlogNextDraftWarnings\(type, validation = null, preview = null\)/);
  assert.match(script, /!BLOG_NEXT_DRAFT_TYPES\.includes\(type\) \|\| missingCount === 0/);
  assert.match(script, /return notices\.filter\(message => !imageWarningPattern\.test/);
  assert.match(script, /preview\?\.relatedPosts\?\.status/);
  assert.match(script, /연결된 블로그에서 함께 보여줄 글을 찾지 못해 연관글을 넣지 않았습니다\./);
  assert.match(script, /연관글을 가져오지 못해 넣지 않았습니다\. 다시 저장하면 시도합니다\./);
  assert.doesNotMatch(script, /검증을 통과했습니다/);
  assert.match(script, /setBlogNextDraftValidation\('ai'\);/);
  assert.match(sharedCss, /\.blog-next-draft-validation\[hidden\],[\s\S]*?\.blog-next-draft-preview\[hidden\]\s*\{\s*display: none;/);
});

test('unified writer exposes only its integrated AI writing mode', () => {
  const html = readBlogNextView();
  const script = read('ui/scripts/features/blog/shell.js');
  assert.doesNotMatch(html, /data-blog-next-input-mode|blog-next-mode-tab-|data-blog-next-mode-panel="(?:folder|paste)"/);
  assert.match(html, /id="blog-next-mode-panel-ai" role="region"[\s\S]*?data-blog-next-mode-panel="ai"/);
  assert.match(script, /function activateBlogNextInputMode\(modeName\)/);
  assert.doesNotMatch(script, /'folder'|'paste'/);
});

test('manuscript settings preserve dependent values while matching provider and schedule state', () => {
  const script = read('ui/scripts/features/blog/publishing-targets.js');

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
  const script = read('ui/scripts/features/blog/publishing-targets.js');

  assert.match(script, /function syncBlogNextDraftSettingsSummary\(type\)/);
  assert.match(script, /formatBlogPlatformList\(settings\.targets, ' \+ '\) \|\| '포스팅 대상 없음'/);
  assert.match(script, /settings\.postStatus === 'draft' \? '임시 저장'/);
  assert.doesNotMatch(script, /settings\.imageMode === 'generate' \? '이미지 생성'/);
  assert.doesNotMatch(readBlogNextView(), /data-draft-field="image-mode"/);
  assert.match(script, /if \(settings\.targets\.includes\('naver'\)\)/);
});

test('integrated writer accepts paste input without restoring the retired paste-only draft', () => {
  const html = readBlogNextView();
  const script = read('ui/scripts/features/blog/draft-inputs.js');
  assert.match(html, /id="blog-next-ai-editor"[^>]*class="manuscript-editor-canvas"/);
  assert.match(html, /id="blog-next-ai-markdown"/);
  assert.match(script, /aiEditorRoot\.addEventListener\('paste'/);
  assert.doesNotMatch(script, /blog_next_pasted_markdown_draft|blog-next-paste-markdown/);
});

test('manuscript baseline styles use semantic tokens and collapse predictably', () => {
  const css = [
    read('ui/styles/features/blog-next-baseline.css'),
    read('ui/styles/features/blog-next-baseline-responsive.css')
  ].join('\n');
  const actionCss = read('ui/styles/patterns/actions.css');
  const interactionCss = read('ui/styles/features/continuous-publishing-interactions.css');

  assert.match(css, /\.blog-next-draft-mode\s*\{[^}]*width:\s*100%;/s);
  assert.match(css, /\.blog-next-draft-options\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(css, /data-dependency-active="false"[\s\S]*color:\s*var\(--ui-text-muted\)/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.blog-next-draft-options\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(actionCss, /button\.primary,\s*button\.secondary,\s*button\.ghost\s*\{[^}]*border:\s*1px solid/s);
  assert.doesNotMatch(interactionCss, /\.blog-next-folder-field\s*\{[^}]*margin-bottom/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(css, /\[data-style=/);
});

test('trend posting exposes explicit idle, loading, empty, error and result state boundaries', () => {
  const html = readBlogNextView();
  const script = read('ui/scripts/features/blog/trend-posting.js');

  assert.match(html, /id="blog-next-trend-status"[^>]*data-state="idle"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
  assert.match(html, /id="blog-next-trend-results-workspace"[^>]*hidden/);
  assert.match(html, /id="blog-next-trend-filters"[^>]*aria-disabled="true"[^>]*hidden/);
  assert.match(html, /id="blog-next-trend-filter-keyword"[^>]*disabled/);
  assert.match(html, /class="ui-select-shell trend-posting-filter-view-shell">\s*<select id="blog-next-trend-filter-view"/);
  assert.match(html, /class="ui-select-shell trend-posting-period-select-shell">\s*<select id="blog-next-trend-period" disabled/);
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
  assert.match(css, /trend-posting-filter-keyword,[\s\S]*trend-posting-filter-view,[\s\S]*trend-posting-period-select-shell > select\s*\{[^}]*border:\s*1px solid var\(--ui-border-default\)[^}]*background:\s*var\(--ui-surface\)[^}]*color:\s*var\(--ui-text-primary\)[^}]*font-size:\s*var\(--ui-type-body-size\)[^}]*font-weight:\s*var\(--ui-weight-regular\)/s);
  assert.match(css, /trend-posting-filter-keyword:focus-visible,[\s\S]*trend-posting-filter-view:focus-visible,[\s\S]*trend-posting-period-select-shell > select:focus-visible\s*\{[^}]*box-shadow:\s*var\(--ui-focus-ring\)/s);
  assert.match(css, /trend-posting-filter-keyword:disabled,[\s\S]*trend-posting-filter-view:disabled,[\s\S]*trend-posting-period-select-shell > select:disabled\s*\{[^}]*background:\s*var\(--ui-surface-muted\)[^}]*color:\s*var\(--ui-text-muted\)/s);
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
  const uiScript = read('ui/scripts/features/blog/queue-ui.js');
  const queueScript = readBlogNextQueueScripts();
  const tabNavigation = read('ui/scripts/foundation/tab-navigation.js');

  for (const type of ['ready', 'saved', 'automation']) {
    assert.match(html, new RegExp(`id="blog-next-management-tab-${type}"[\\s\\S]*?aria-controls="blog-next-management-panel-${type}"`));
    assert.match(html, new RegExp(`id="blog-next-management-panel-${type}"[\\s\\S]*?role="tabpanel"[\\s\\S]*?aria-labelledby="blog-next-management-tab-${type}"`));
  }
  assert.match(html, /id="blog-next-management-status"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
  assert.equal((html.match(/class="blog-next-queue-list" data-state="loading" aria-live="polite" aria-busy="true"/g) || []).length, 2);
  assert.match(html, /data-blog-next-management-tab="automation">연속 포스팅 설정/);
  assert.doesNotMatch(html, /data-blog-next-tab="automation"/);
  assert.doesNotMatch(html, /포스팅 대기열을 확인하고 있습니다|보관한 글감을 확인하고 있습니다/);
  assert.match(queueScript, /handleUiTabNavigationKeydown/);
  assert.match(tabNavigation, /function handleUiTabNavigationKeydown/);
  assert.match(uiScript, /function setBlogNextManagementStatus\(state, message = ''\)/);
  assert.match(uiScript, /if \(blogNextQueueHasLoaded\) return/);
  assert.match(queueScript, /blogNextQueueHasLoaded = true/);
  assert.doesNotMatch(queueScript, /setBlogNextManagementStatus\('loading'/);
  assert.match(queueScript, /const showRefreshProgress = options\.showRefreshProgress !== false/);
  assert.match(queueScript, /refreshButton\.setAttribute\('aria-busy', String\(showRefreshProgress\)\)/);
  assert.match(queueScript, /loadBlogNextQueue\(\{ force: true, showRefreshProgress: false \}\)/);
  assert.match(queueScript, /setBlogNextManagementStatus\('error'/);
  assert.match(queueScript, /existing list|기존 목록/);
  assert.match(queueScript, /if \(blogNextQueueHasLoaded\) \{[\s\S]*setBlogNextManagementStatus\('error',[\s\S]*\} else \{[\s\S]*setBlogNextManagementStatus\('idle'\);[\s\S]*renderBlogNextQueueInitialError/);
  assert.match(queueScript, /renderBlogNextQueueInitialError\(`\$\{message\} 새로고침으로 다시 시도해 주세요\.`\);/);
  assert.doesNotMatch(queueScript, /setBlogNextTopicResult\(error\.message \|\| '포스팅 대기열/);
});

test('queue reserves status surfaces for actionable errors', () => {
  const css = read('ui/styles/features/blog-next-baseline.css');

  assert.match(css, /\.blog-next-management-status\s*\{[^}]*var\(--ui-border-default\)/s);
  assert.match(css, /blog-next-management-status\[data-state="error"\][\s\S]*var\(--ui-status-danger\)/);
  assert.doesNotMatch(css, /blog-next-management-status\[data-state="loading"\]|blog-next-empty-state\.is-loading/);
});

test('queue row actions describe their actual outcomes consistently', () => {
  const queueScript = readBlogNextQueueScripts();

  assert.match(queueScript, /function getBlogNextQueueRunActionCopy\(item = \{\}\)/);
  assert.match(queueScript, /label: '지금 임시 저장'[\s\S]*busyLabel: '임시 저장 중\.\.\.'/);
  assert.match(queueScript, /label: '지금 예약 발행'[\s\S]*busyLabel: '예약 발행 중\.\.\.'/);
  assert.match(queueScript, /label: '지금 발행'[\s\S]*busyLabel: '발행 중\.\.\.'/);
  assert.match(queueScript, /enqueueButton\.textContent = '대기열로 이동'/);
  assert.match(queueScript, /archiveButton\.textContent = '보관으로 이동'/);
  assert.match(queueScript, /deleteButton\.textContent = '삭제'/);
  assert.match(queueScript, /function setBlogNextQueueOperationBusy\(busy\)[\s\S]*setBlogNextQueueListsBusy\(busy\);[\s\S]*setBlogNextQueueActionsBusy\(busy\)/);
  assert.match(queueScript, /setBlogNextQueueOperationBusy\(true\);[\s\S]*button\.textContent = '이동 중\.\.\.'/);
  assert.match(queueScript, /async function refreshBlogNextQueue\(\)[\s\S]*setBlogNextQueueOperationBusy\(true\)/);
  assert.doesNotMatch(queueScript, /showUiConfirm\('글감은 삭제하지 않고 보관한 글감으로 이동합니다/);
  assert.match(queueScript, /title: actionCopy\.confirmTitle, confirmText: actionCopy\.confirmText/);
  assert.match(queueScript, /button\.textContent = actionCopy\.busyLabel/);
  assert.match(queueScript, /button\.textContent = actionCopy\.label/);
  assert.doesNotMatch(queueScript, /button\.textContent = '지금 실행'/);
  assert.doesNotMatch(queueScript, /button\.textContent = '빼기'/);
});

test('queue metadata presents platform identifiers in user language', () => {
  const html = readBlogNextView();
  const queueScript = readBlogNextQueueScripts();
  const flowScript = read('ui/scripts/features/blog/quick-flow-ui.js');
  const draftScript = read('ui/scripts/features/blog/publishing-targets.js');
  const presentationScript = read('ui/scripts/foundation/presentation.js');

  assert.match(presentationScript, /const BLOG_PLATFORM_LABELS = Object\.freeze\(\{[\s\S]*naver: '네이버 블로그',[\s\S]*wordpress: '워드프레스'/);
  assert.match(presentationScript, /function formatBlogPlatformList\(platforms, separator = ' · '\)/);
  assert.match(queueScript, /formatBlogPlatformList\(item\.options\?\.platforms\)/);
  assert.match(flowScript, /formatBlogPlatformList\(platforms, ' \+ '\)/);
  assert.match(draftScript, /formatBlogPlatformList\(settings\.targets, ' \+ '\)/);
  assert.match(html, /id="blog-next-publish-settings-summary"[^>]*>네이버 블로그 · 즉시 발행/);
  assert.doesNotMatch(queueScript, /item\.options\?\.platforms\) \? item\.options\.platforms\.join\(' · '\)/);
});

test('saved and ready rows share the same base metadata structure', () => {
  const queueScript = readBlogNextQueueScripts();

  assert.match(queueScript, /const platforms = formatBlogPlatformList\(item\.options\?\.platforms\) \|\| '포스팅 대상 미정'/);
  assert.match(queueScript, /const postStatus = formatBlogNextPostStatus\(item\)/);
  assert.match(queueScript, /if \(saved\) meta\.textContent = `\$\{platforms\} · \$\{postStatus\}`/);
  assert.doesNotMatch(queueScript, /아이디어 보관|`키워드 · \$\{item\.keywordsRaw\}`/);
});

test('queue item titles avoid redundant edit labels and queue actions keep stable columns', () => {
  const queueScript = readBlogNextQueueScripts();
  const queueCss = readBlogNextQueueStyles();

  assert.match(queueScript, /copy\.setAttribute\('aria-label', `\$\{item\.subject[\s\S]*?\} 수정`\)/);
  assert.match(queueScript, /copy\.append\(title, meta, running\)/);
  assert.doesNotMatch(queueScript, /editCue|blog-next-queue-edit-cue/);
  assert.match(queueCss, /\.blog-next-queue-item:not\(\.blog-next-saved-item\) \.blog-next-queue-actions\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*36px 36px 112px 120px;/s);
  assert.match(queueCss, /\.blog-next-saved-item \.blog-next-queue-actions\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*120px 72px;/s);
  assert.match(queueCss, /@media[\s\S]*\.blog-next-queue-actions,[\s\S]*\.blog-next-queue-item:not\(\.blog-next-saved-item\) \.blog-next-queue-actions,[\s\S]*\.blog-next-saved-item \.blog-next-queue-actions\s*\{[^}]*display:\s*flex;/s);
  assert.match(queueCss, /@media[\s\S]*\.blog-next-queue-actions\s*\{[^}]*flex-wrap:\s*wrap;[^}]*width:\s*100%;/s);
  assert.match(queueCss, /@media[\s\S]*\.blog-next-queue-copy strong\s*\{[^}]*white-space:\s*normal;[^}]*-webkit-line-clamp:\s*2;/s);
  assert.match(queueCss, /@media[\s\S]*\.blog-next-queue-actions button\s*\{[^}]*min-height:\s*var\(--ui-density-control-min-height\)/s);
});

test('queue rows share one transient hover and keyboard focus surface', () => {
  const queueCss = readBlogNextQueueStyles();

  assert.match(queueCss, /\.blog-next-queue-item:hover,\s*\.blog-next-queue-item:focus-within\s*\{[^}]*background:\s*var\(--ui-surface-hover\);/s);
  assert.match(queueCss, /\.blog-next-queue-item\s*\{[^}]*transition:[^;]*background-color var\(--ui-transition-interactive\)/s);
  assert.doesNotMatch(queueCss, /\.blog-next-queue-copy:hover strong/);
  assert.match(queueCss, /\.blog-next-queue-copy:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ui-action-primary\)/s);
});

test('queue editor keeps save and queue promotion as separate local actions', () => {
  const queueScript = readBlogNextQueueScripts();
  const flowScript = read('ui/scripts/features/blog/quick-flow-ui.js');
  const queueApplication = read('src/applications/blog/queue-management/application.js');
  const editor = read('ui/partials/views/blog-next/editor-modal.html');

  assert.match(queueScript, /function setBlogNextEditorPromotionAction\(available\)[\s\S]*if \(!available\) \{[\s\S]*existing\?\.remove\(\)/);
  assert.match(queueScript, /setBlogNextEditorPromotionAction\(sourceStatus === '대기'\)/);
  assert.match(queueScript, /blog-next-editor-save[\s\S]*submitBlogNextTopic\('save'\)/);
  assert.match(queueScript, /blog-next-editor-enqueue[\s\S]*submitBlogNextTopic\('enqueue'\)/);
  assert.match(flowScript, /const editingChanged = !editing \|\| \([\s\S]*snapshotBlogNextEditingPayload\(\) !== blogNextEditingInitialSnapshot/);
  assert.match(flowScript, /if \(editorSave\) editorSave\.disabled = busy \|\| sheetBlocked \|\| !editingChanged/);
  assert.match(queueApplication, /const ready = sourceStatus === TOPIC_STATUS\.READY \|\| action === 'enqueue'/);
  assert.match(editor, /class="blog-next-editor-modal-message"[\s\S]*class="blog-next-editor-modal-action-group"[\s\S]*id="blog-next-editor-cancel"[\s\S]*id="blog-next-editor-save"/);
});

test('smart comment identifies its model role and preserves results through async states', () => {
  const html = readBlogNextView();
  const script = read('ui/scripts/features/blog/smart-comment.js');

  assert.match(html, /id="blog-next-smart-comment-settings-summary">글쓰기 모델 사용/);
  assert.doesNotMatch(html, /id="blog-next-smart-comment-model-role"/);
  assert.match(html, /id="blog-next-smart-comment-run"[^>]*aria-describedby="blog-next-smart-comment-settings-summary"[^>]*disabled/);
  assert.match(html, /class="blog-next-empty-state blog-next-smart-comment-empty ui-empty-state"/);
  assert.match(html, /class="blog-next-smart-comment-results-head" hidden/);
  assert.match(html, /id="blog-next-smart-comment-list"[^>]*data-state="idle"[^>]*aria-busy="false"/);
  assert.match(script, /function syncBlogNextSmartCommentModelRole\(\)/);
  assert.match(script, /const label = custom \? 'Chat Model' : '글쓰기 모델'/);
  assert.match(script, /function isBlogNextSmartCommentOperationBusy\(\)/);
  assert.match(script, /blogNextSmartCommentSaving/);
  assert.match(script, /blogNextSmartCommentRedraftingIndex/);
  assert.match(script, /setBlogNextSmartCommentFormDisabled\(true\)/);
  assert.match(script, /setBlogNextSmartCommentRedraftActionsBusy\(true/);
  assert.match(script, /setAttribute\('aria-busy', 'true'\)/);
  assert.match(script, /setAttribute\('aria-busy', 'false'\)/);
  assert.match(script, /if \(nextItems\.length > 0 \|\| blogNextSmartCommentItems\.length === 0\)/);
});

test('continuous publishing disables dependent fields and separates operation feedback from schedule summary', () => {
  const html = readBlogNextView();
  const script = read('ui/scripts/features/blog/automation-settings.js');

  assert.match(html, /class="blog-next-automation-fields blog-next-dependent-field" data-dependency-active="false"/);
  assert.equal((html.match(/id="blog-next-automation-(?:start-time|end-time|interval|notify)"[^>]*disabled/g) || []).length, 4);
  assert.match(html, /id="blog-next-automation-feedback"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
  assert.match(html, /id="blog-next-automation-status"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
  assert.match(script, /function syncBlogNextAutomationDependentFields\(\)/);
  assert.match(script, /fields\.dataset\.dependencyActive = String\(active\)/);
  assert.match(script, /control\.disabled = locked \|\| !active/);
  assert.match(script, /setBlogNextAutomationFeedback\('loading', '연속 포스팅 설정을 불러오는 중입니다.'/);
  assert.match(script, /setBlogNextAutomationFeedback\('success', '설정을 저장했습니다.'/);
  assert.match(script, /setBlogNextAutomationFeedback\('error'/);
});
