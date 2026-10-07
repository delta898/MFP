const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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
  const topicSettings = html.match(/<details class="blog-next-disclosure blog-next-topic-settings" id="blog-next-topic-settings" open>([\s\S]*?)<\/details>/)?.[1] || '';
  const css = read('ui/styles/features/blog-next-quick-flow.css');
  const core = topicSettings;

  assert.match(html, /<section class="card form-card blog-next-panel active" id="blog-next-panel-quick"/);
  assert.doesNotMatch(html, /data-blog-next-input-mode|blog-next-mode-tab-/);
  assert.match(css, /#blog-next-mode-panel-ai\s*\{[^}]*gap: var\(--ui-density-page-gap\);[^}]*padding: 0;[^}]*border: 0;[^}]*background: transparent;/s);
  assert.match(html, /<details class="blog-next-disclosure blog-next-preparation-disclosure" id="blog-next-ai-preparation">/);
  assert.match(topicSettings, /<summary>[\s\S]*<strong>주제 설정<\/strong>[\s\S]*id="blog-next-topic-settings-summary"/);
  ['blog-next-subject', 'blog-next-keywords', 'blog-next-title', 'blog-next-instruction'].forEach((id) => {
    assert.match(core, new RegExp(`id="${id}"`));
  });
  ['blog-next-reference-url', 'blog-next-target-naver', 'blog-next-post-status'].forEach((id) => {
    assert.doesNotMatch(core, new RegExp(`id="${id}"`));
  });
  assert.match(core, /blog-next-topic-settings-primary-fields[\s\S]*blog-next-subject[\s\S]*blog-next-keywords[\s\S]*blog-next-title[\s\S]*blog-next-experience-field[\s\S]*blog-next-instruction/);
  assert.match(core, /<label class="blog-next-field">\s*<span>주제 <em class="blog-next-required-marker" aria-hidden="true">\*<\/em><\/span>[\s\S]*id="blog-next-subject"[^>]*required aria-required="true"/);
  assert.doesNotMatch(core, /제목\s*<small>\(선택\)<\/small>/);
  assert.match(css, /\.blog-next-topic-settings-fields\s*\{\s*display: grid;\s*grid-template-columns: minmax\(0, 1\.15fr\) minmax\(300px, 0\.85fr\);/);
  assert.match(css, /\.blog-next-topic-settings-primary-fields \.blog-next-input-action-row button\s*\{[^}]*inline-size: 44px;[^}]*justify-self: start;[^}]*padding-inline: 0;/);
  ['blog-next-topic-recommend', 'blog-next-keyword-recommend', 'blog-next-title-recommend'].forEach((id) => {
    assert.match(html, new RegExp(`id="${id}"[^>]*aria-label="[^"]+"[^>]*data-tooltip="[^"]+"[^>]*><svg class="ui-ai-icon" aria-hidden="true"><use href="#ui-icon-ai"><\\/use><\\/svg>`));
  });
  assert.match(css, /button\[data-tooltip\]:hover::after[\s\S]*button\[data-tooltip\]:focus-visible::after/);
  assert.match(css, /\.blog-next-required-marker\s*\{[^}]*color:\s*var\(--ui-action-danger\)/s);
  assert.match(css, /\.blog-next-topic-settings-primary-fields \.blog-next-input-action-row button svg\s*\{\s*display: block;\s*width: 18px;\s*height: 18px;[\s\S]*?stroke: currentColor;/);
  assert.match(css, /\.blog-next-experience-field textarea\s*\{\s*flex: 1 1 auto;\s*min-height: 200px;/);
  assert.match(css, /@media \(max-width: 768px\)\s*\{[\s\S]*?\.blog-next-topic-settings-fields\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/);
});

test('optional content and publish settings disclose their current values', () => {
  const html = readBlogNextView();

  assert.match(html, /<details class="blog-next-disclosure" id="blog-next-content-settings">[\s\S]*id="blog-next-content-settings-summary"[\s\S]*id="blog-next-reference-url"[\s\S]*id="blog-next-writing-strategy"[\s\S]*id="blog-next-image-mode"[\s\S]*<\/details>/);
  assert.doesNotMatch(html, /<details class="blog-next-disclosure blog-next-preparation-disclosure" id="blog-next-ai-preparation"[^>]*\sopen/);
  assert.doesNotMatch(html, /<details class="blog-next-disclosure" id="blog-next-content-settings"[^>]*\sopen/);
  assert.match(html, /<details class="blog-next-disclosure blog-next-draft-settings" id="blog-next-publish-settings"[^>]*data-blog-next-publish-settings[^>]*>[\s\S]*id="blog-next-publish-settings-summary"[\s\S]*id="blog-next-target-naver"[\s\S]*id="blog-next-post-status"[\s\S]*id="blog-next-runner-headless"[\s\S]*<\/details>/);
  assert.equal((html.match(/id="blog-next-publish-settings"/g) || []).length, 1);
  assert.equal((html.match(/data-blog-next-publish-settings-slot="(?:ai-queue|ai-publish|folder|paste)"/g) || []).length, 4);
  assert.match(html, /<details class="blog-next-disclosure blog-next-topic-settings" id="blog-next-topic-settings" open>/);
  assert.doesNotMatch(html, /<details class="blog-next-disclosure blog-next-preparation-disclosure" id="blog-next-ai-preparation"[^>]*\sopen/);
  assert.doesNotMatch(html, /<details class="blog-next-disclosure" id="blog-next-content-settings"[^>]*\sopen/);
});

test('quick writing and saved-idea editing keep independent disclosure state for the session', () => {
  const queueSource = read('ui/scripts/features/blog-next/quick-queue.js');
  const elements = new Map([
    ['blog-next-ai-preparation', { open: false }],
    ['blog-next-topic-settings', { open: true }],
    ['blog-next-content-settings', { open: false }]
  ]);
  const context = vm.createContext({
    document: { getElementById: (id) => elements.get(id) || null }
  });
  vm.runInContext(queueSource, context);

  assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext('blogNextDisclosureState', context))),
    { quick: { preparation: false, topic: true, content: false }, queueEditor: { topic: true, content: false } }
  );

  elements.get('blog-next-ai-preparation').open = true;
  elements.get('blog-next-topic-settings').open = false;
  elements.get('blog-next-content-settings').open = true;
  context.captureBlogNextDisclosureState('quick');

  elements.get('blog-next-topic-settings').open = true;
  elements.get('blog-next-content-settings').open = false;
  context.applyBlogNextDisclosureState('queueEditor');
  assert.equal(elements.get('blog-next-topic-settings').open, true);
  assert.equal(elements.get('blog-next-content-settings').open, false);

  elements.get('blog-next-topic-settings').open = false;
  elements.get('blog-next-content-settings').open = true;
  context.captureBlogNextDisclosureState('queueEditor');
  context.applyBlogNextDisclosureState('quick');
  assert.equal(elements.get('blog-next-ai-preparation').open, true);
  assert.equal(elements.get('blog-next-topic-settings').open, false);
  assert.equal(elements.get('blog-next-content-settings').open, true);

  assert.match(queueSource, /function moveBlogNextTopicFormToQueueEditor\(\)[\s\S]*captureBlogNextDisclosureState\('quick'\)[\s\S]*applyBlogNextDisclosureState\('queueEditor'\)/);
  assert.match(queueSource, /function restoreBlogNextTopicFormHome\(\)[\s\S]*captureBlogNextDisclosureState\('queueEditor'\)[\s\S]*applyBlogNextDisclosureState\('quick'\)/);
});

test('reusable generation and publish choices persist without carrying article data or schedule time', () => {
  const queue = `${read('ui/scripts/features/blog-next/quick-queue.js')}\n${read('ui/scripts/features/blog-next/queue-management.js')}`;
  const execution = read('ui/scripts/features/blog-next/draft-execution.js');

  assert.match(queue, /headless: true/);
  assert.match(queue, /headless: document\.getElementById\('blog-next-runner-headless'\)\?\.checked !== false/);
  assert.match(queue, /'blog-next-writing-length'[\s\S]*?'blog-next-writing-ending'/);
  assert.match(queue, /function rememberBlogNextTopicDefaultsForSetting\(fieldId = ''\)[\s\S]*?BLOG_NEXT_PERSISTED_SETTING_IDS\.has/);
  assert.match(queue, /function rememberBlogNextTopicDefaults\(\) \{\s*if \(blogNextEditingRowIndex !== null\) return;/);
  assert.match(queue, /form\.addEventListener\('change',[\s\S]*?rememberBlogNextTopicDefaultsForSetting\(event\.target\?\.id\)/);
  assert.match(execution, /publishSettings\?\.addEventListener\('change',[\s\S]*?rememberBlogNextTopicDefaultsForSetting\(event\.target\?\.id\)/);
  assert.doesNotMatch(queue.match(/function readBlogNextTopicSettings\(\) \{[\s\S]*?\n\}/)?.[0] || '', /scheduleDate|referenceUrl|subject|keywords|instruction/);
});

test('WordPress image upload warnings remain visible after a successful draft save', () => {
  const execution = read('ui/scripts/features/blog-next/draft-execution.js');
  const publishRuntime = read('src/ui-runtime/publish-actions-runtime.js');

  assert.match(publishRuntime, /warnings: Array\.isArray\(wpRes\.warnings\)/);
  assert.match(execution, /results\?\.wordpress\?\.warnings/);
  assert.match(execution, /이미지 \$\{wordpressImageUploadFailures\}개를 올리지 못했습니다\. 워드프레스에서 확인해 주세요\./);
  assert.match(publishRuntime, /이미지 \$\{wordpressImageUploadFailures\}개 업로드 실패/);
});

test('AI image generation exposes per-action stop controls and sends cancellation to the active server operation', () => {
  const inputs = `${read('ui/scripts/features/blog-next/draft-inputs.js')}\n${read('ui/scripts/features/blog-next/draft-images.js')}`;
  const operations = read('src/blog-next/ai-generation-operations.js');
  const drafts = read('src/content/manuscript-draft-service.js');
  const execution = read('ui/scripts/features/blog-next/draft-execution.js');
  const routes = read('src/ui-api/routes/content.routes.js');
  const css = read('ui/styles/features/blog-next-baseline.css');

  assert.match(inputs, /data-manuscript-generate-missing[^>]*>[\s\S]*?중지 확인/);
  assert.match(inputs, /data-manuscript-image-action="generate"[\s\S]*?중지 확인/);
  assert.match(inputs, /중지하려면 버튼을 한 번 더 누르세요/);
  assert.match(inputs, /operation\?\.confirmingStop === true/);
  assert.match(inputs, /operation\.confirmingStop = true/);
  assert.match(inputs, /사용 안 함<\/button>` : ''\}/);
  assert.match(execution, /data-manuscript-image-continue\].*?imageOperation\?\.confirmingStop === true/);
  assert.match(inputs, /completedCount > operation\.syncedCompletedCount/);
  assert.match(inputs, /fetchJson\(`\/api\/v1\/blog\/manuscript-drafts\/\$\{encodeURIComponent\(state\.draftId\)\}`\)/);
  assert.match(inputs, /!bulkOperationActive/);
  assert.match(inputs, /handleBlogNextManuscriptImageStop/);
  assert.match(inputs, /image-operations\/\$\{encodeURIComponent\(operation\.operationId\)\}\/cancel/);
  assert.match(operations, /signal: controller\.signal/);
  assert.match(operations, /setProgress\(progress\)/);
  assert.match(drafts, /callWritingImage\(slot\.prompt, pendingBase, 2, \{ useCase: 'blog', signal: input\.signal \}\)/);
  assert.match(routes, /manuscript-drafts\/image-operations/);
  assert.match(css, /local-markdown-image-spinner[\s\S]*?ui-refresh-action-spin/);
  assert.match(css, /image-card-preview\.is-generating \.local-markdown-image-media-actions\.is-empty/);
});

test('unresolved manuscript images can be opened directly from the publish restriction', () => {
  const html = readBlogNextView();
  const inputs = `${read('ui/scripts/features/blog-next/draft-inputs.js')}\n${read('ui/scripts/features/blog-next/draft-images.js')}`;

  assert.match(html, /id="blog-next-publish-safety-message"/);
  assert.match(html, /id="blog-next-publish-image-action"[^>]*aria-controls="blog-next-ai-draft-images"[^>]*hidden/);
  assert.match(html, /id="blog-next-ai-draft-images"[^>]*data-draft-preview-image-details/);
  assert.match(html, /id="blog-next-folder-draft-images"[^>]*data-draft-preview-image-details/);
  assert.match(html, /id="blog-next-paste-draft-images"[^>]*data-draft-preview-image-details/);
  assert.match(inputs, /function focusBlogNextDraftImages\(\)[\s\S]*?dataset\.blogNextDraftSettings[\s\S]*?details\.open = true;[\s\S]*?details\.scrollIntoView/);
  assert.match(inputs, /imageAction\.hidden = !imagePreparationRequired/);
  assert.match(inputs, /BLOG_NEXT_DRAFT_TYPES\.includes\(type\) && unresolvedImageCount > 0/);
  assert.doesNotMatch(inputs, /supportsBlogNextDraftAutomaticImages/);
});

test('AI assists have one distinct pattern without becoming primary actions', () => {
  const html = readBlogNextView();
  const css = read('ui/styles/features/blog-next-quick-flow.css');

  assert.equal((html.match(/class="secondary blog-next-ai-assist"/g) || []).length, 3);
  assert.equal((html.match(/class="secondary blog-next-ai-assist"[^>]*aria-label="AI[^"]+"[^>]*data-tooltip="[^"]+"><svg class="ui-ai-icon" aria-hidden="true"><use href="#ui-icon-ai"><\/use><\/svg>/g) || []).length, 3);
  assert.match(css, /\.blog-next-ai-assist\s*\{[^}]*background:\s*var\(--ui-action-primary-soft\)/s);
  assert.doesNotMatch(html, /class="primary blog-next-ai-assist"/);
  assert.doesNotMatch(html, /<span aria-hidden="true">AI<\/span>/);
});

test('AI manuscript cancellation stays in the shared execution status', () => {
  const html = readBlogNextView();
  const status = read('ui/partials/views/blog-next/publish-status.html');
  const execution = read('ui/scripts/features/blog-next/draft-execution.js');
  assert.match(status, /id="blog-next-publish-status-stop-control"[^>]*hidden/);
  assert.match(status, /id="blog-next-publish-status-cancel"[\s\S]*?data-blog-next-execution-stop/);
  assert.match(status, /data-blog-next-execution-continue hidden>계속 진행/);
  assert.equal((html.match(/data-blog-next-execution-stop/g) || []).length, 1);
  assert.match(execution, /manuscript-drafts\/ai\/operations/);
  assert.match(execution, /state === 'cancel_requested'/);
  assert.match(execution, /state === 'canceled'/);
  assert.match(read('ui/scripts/features/blog-next/runner.js'), /async function stopBlogNextLocalMarkdownPublish/);
  assert.match(read('src/ui-api/routes/continuous-publishing.routes.js'), /runner\/stop/);
  assert.match(read('ui/scripts/features/blog-next/runner.js'), /6000\)/);
  assert.match(read('ui/styles/features/continuous-publishing.css'), /\.blog-next-publish-status-stop-control\[data-disabled="true"\]:hover/);
  assert.match(read('src/core.js'), /reportPublishProgress\('submitting'\);[\s\S]*?await btn\.click\(\)/);
});

test('quick flow keeps results independent from edited inputs and scopes duplicate posts by platform', () => {
  const execution = read('ui/scripts/features/blog-next/draft-execution.js');
  const inputs = `${read('ui/scripts/features/blog-next/draft-inputs.js')}\n${read('ui/scripts/features/blog-next/draft-images.js')}`;
  const service = read('src/content/manuscript-draft-service.js');
  const html = readBlogNextView();

  assert.match(execution, /function isBlogNextDraftPublishCompleted\(type\)[\s\S]*?preview\?\.publishedTargets\?\.includes\(target\)/);
  assert.match(execution, /function markBlogNextAiDraftSourceChanged[\s\S]*?already-created manuscript result/);
  assert.doesNotMatch(execution, /options\.sourceDirty !== true/);
  assert.match(execution, /function syncBlogNextDraftOperationControls[\s\S]*?beforeExecutionDisabled/);
  assert.match(inputs, /function syncBlogNextImageAiReadiness\(\)[\s\S]*?state\.imageWorking/);
  assert.match(service, /function getContentVersion\([\s\S]*?readContentsMarkdown\(locations\)[\s\S]*?hash\.update\(fsImpl\.readFileSync\(imagePath\)\)/);
  assert.match(service, /entry\.content_version === contentVersion && entry\.target === target/);
  assert.match(service, /publishedTargets: getPublishedTargets\(manifest, contentVersion\)/);
  assert.match(html, /name="blog-next-publish-target"[^>]*type="radio"/);
});

test('AI cancellation copy stays concise with or without a previous manuscript', () => {
  const execution = read('ui/scripts/features/blog-next/draft-execution.js');
  const source = execution.match(/function blogNextAiOperationMessage\(status\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source, 'AI operation message function is missing');
  const draftState = { ai: { draftId: '', preview: null } };
  const message = vm.runInNewContext(`${source}\nblogNextAiOperationMessage`, { blogNextDraftState: draftState });

  assert.equal(message({ state: 'canceled', stage: 'writing' }),
    '원고 생성을 중지했습니다.');
  draftState.ai.draftId = 'previous-draft';
  draftState.ai.preview = { draftId: 'previous-draft' };
  assert.equal(message({ state: 'canceled', stage: 'writing' }),
    '원고 생성을 중지했습니다.');
  assert.equal(message({ state: 'canceled', stage: 'images', remoteJobPossible: true }),
    '원고 생성을 중지했습니다.');
  assert.equal(message({ state: 'failed', stage: 'images', error: { message: '이미지 생성 실패' } }),
    '이미지 생성 실패');
  assert.equal(message({ state: 'completed', stage: 'images' }),
    '원고와 미리보기를 준비했습니다.');
});

test('direct publishing confirmation names only destination, mode, and schedule', () => {
  const execution = read('ui/scripts/features/blog-next/draft-execution.js');
  const scheduleSource = execution.match(/function formatBlogNextDraftScheduleDate\(value\) \{[\s\S]*?\n\}/)?.[0];
  const confirmationSource = execution.match(/function buildBlogNextDraftPublishConfirmation\(settings, targetLabel\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(scheduleSource && confirmationSource, 'confirmation copy helpers are missing');
  const confirm = vm.runInNewContext(`${scheduleSource}\n${confirmationSource}\nbuildBlogNextDraftPublishConfirmation`);

  assert.equal(confirm({ postStatus: 'draft' }, '네이버 블로그'), '네이버 블로그에 임시 저장할까요?');
  assert.equal(confirm({ postStatus: 'publish' }, '워드프레스'), '워드프레스에 지금 발행할까요?');
  assert.equal(confirm({ postStatus: 'schedule', scheduleDate: '2026-10-25T09:30' }, '네이버 블로그'),
    '네이버 블로그에 2026년 10월 25일 09:30에 예약 발행할까요?');
  assert.doesNotMatch(confirmationSource, /Queue|대기열|만들지 못한 이미지/);
});

test('quick flow summaries update from existing controls and new writing owns input reset', () => {
  const html = readBlogNextView();
  const script = `${read('ui/scripts/features/blog-next/quick-queue.js')}\n${read('ui/scripts/features/blog-next/queue-management.js')}`;
  const uiScript = read('ui/scripts/features/blog-next/quick-flow-ui.js');

  assert.doesNotMatch(html, /id="blog-next-clear-topic"|id="blog-next-clear-undo"/);
  assert.match(uiScript, /function syncBlogNextQuickFlowSummaries\(\)/);
  assert.match(uiScript, /const topicParts = \[[\s\S]*?blog-next-subject[\s\S]*?blog-next-keywords[\s\S]*?blog-next-title[\s\S]*?blog-next-instruction/);
  assert.match(uiScript, /topicSummary\.textContent = topicParts\.join\(' · '\)/);
  assert.match(html, /class="blog-next-form-result-row" hidden>[\s\S]*id="blog-next-topic-result"/);
  assert.match(script, /function setBlogNextTopicResult\(message, level = ''\)[\s\S]*?result\.closest\('\.blog-next-form-result-row'\)[\s\S]*?row\.hidden = !text\.trim\(\)/);
  assert.match(uiScript, /formatBlogPlatformList\(platforms, ' \+ '\) \|\| '발행 대상 없음'/);
  assert.match(uiScript, /function captureBlogNextClearableContent\(\)/);
  assert.match(read('ui/scripts/features/blog-next/quick-queue.js'), /function restoreBlogNextTopicFormHome\(\)[\s\S]*const preparation = document\.getElementById\('blog-next-ai-preparation'\)[\s\S]*const destination = preparation \|\| home[\s\S]*destination\.appendChild\(form\)/);
  assert.match(read('ui/scripts/features/blog-next/writing-intent.js'), /clearBlogNextTopicContent\(\);\s*resetBlogNextAiDraftUi\(\)/);
  assert.match(uiScript, /function syncBlogNextTopicActionAvailability\(\)/);
  assert.match(uiScript, /ideaValid: Boolean\(subject\) && referencesValid/);
  assert.match(uiScript, /readyValid: Boolean\(subject\) && referencesValid && hasTarget && siteTargetReady && scheduleValid/);
  assert.match(uiScript, /save\.disabled = busy \|\| sheetBlocked \|\| !editingChanged \|\| \(editingReady \? !readyValid : !ideaValid\)/);
  assert.match(uiScript, /enqueue\.disabled = busy \|\| sheetBlocked \|\| !readyValid/);
  assert.match(uiScript, /publish\.disabled = busy \|\| runnerActive [^;]* \|\| !ideaValid/);
  assert.doesNotMatch(script, /blog-next-clear-topic|blog-next-clear-undo/);
});

test('shared writing intent leaves work untouched on cancel and resets then applies source values on confirm', async () => {
  const fields = new Map();
  const animationFrames = [];
  let destinationScrolled = false;
  [
    'blog-next-subject', 'blog-next-title', 'blog-next-keywords',
    'blog-next-instruction', 'blog-next-reference-url', 'blog-next-schedule-date',
    'blog-next-ai-preparation', 'blog-next-topic-settings', 'blog-next-topic-settings-summary'
  ].forEach((id) => fields.set(id, {
    value: '', open: false, textContent: '', focused: false,
    focus() { this.focused = true; },
    scrollIntoView() { destinationScrolled = true; }
  }));
  fields.get('blog-next-subject').value = '기존 주제';
  fields.get('blog-next-keywords').value = '기존 키워드';
  fields.get('blog-next-title').value = '기존 제목';
  fields.get('blog-next-instruction').value = '기존 경험';
  const state = { ai: { draftId: 'draft-old', preview: { markdown: '이전 미리보기' }, generating: false, publishing: false, imageWorking: false, promptGenerating: false } };
  let confirmation = false;
  let confirmationCount = 0;
  let activeTab = 'trend-posting';
  let activeMode = 'ai';
  let summariesSynced = 0;
  let draftResets = 0;
  let resultCleared = false;
  let clearActionSynced = false;
  let statusDismissed = false;
  let executionSynced = false;
  let destinationPrepared = 0;
  let destinationAvailable = true;
  let focusScheduled = 0;
  const clearableIds = [
    'blog-next-subject', 'blog-next-title', 'blog-next-keywords',
    'blog-next-instruction', 'blog-next-reference-url', 'blog-next-schedule-date'
  ];
  const context = vm.createContext({
    BLOG_NEXT_CLEARABLE_FIELD_IDS: clearableIds,
    blogNextDraftState: state,
    blogNextDisclosureState: { quick: { preparation: false, topic: false } },
    blogNextEditingRowIndex: null,
    blogNextAiOperationId: '',
    blogNextTopicSubmitting: false,
    blogNextRunnerActive: false,
    blogNextRunnerRequesting: false,
    document: { getElementById: (id) => fields.get(id) || null },
    showUiConfirm: async () => { confirmationCount += 1; return confirmation; },
    captureBlogNextClearableContent: () => ({
      values: Object.fromEntries(clearableIds.map((id) => [id, fields.get(id)?.value || ''])),
      trendContext: null
    }),
    hasBlogNextClearableContent: (snapshot) => Object.values(snapshot.values).some(Boolean),
    activateBlogNextTab: (tab) => { activeTab = tab; },
    activateBlogNextInputMode: (mode) => { activeMode = mode; },
    clearBlogNextTopicContent: () => { clearableIds.forEach((id) => { fields.get(id).value = ''; }); },
    resetBlogNextAiDraftUi: () => { draftResets += 1; state.ai.draftId = ''; state.ai.preview = null; },
    syncBlogNextQuickFlowSummaries: () => { summariesSynced += 1; fields.get('blog-next-topic-settings-summary').textContent = `${fields.get('blog-next-subject').value} · ${fields.get('blog-next-keywords').value}`; },
    setBlogNextTopicResult: (message) => { resultCleared = message === ''; },
    syncBlogNextTopicClearAction: () => { clearActionSynced = true; },
    dismissBlogNextStatusForNewWriting: () => { statusDismissed = true; },
    syncBlogNextDraftExecutionState: () => { executionSynced = true; },
    requestAnimationFrame: (callback) => { focusScheduled += 1; animationFrames.push(callback); }
  });
  vm.runInContext(read('ui/scripts/features/blog-next/writing-intent.js'), context);
  const existingValues = Object.fromEntries(clearableIds.map((id) => [id, fields.get(id).value]));
  const applyOptions = {
    values: { 'blog-next-subject': '제주 가을 여행', 'blog-next-keywords': '제주 가을 여행' },
    applySourceContext: () => { context.blogNextTrendContext = { source: 'naver_trend' }; },
    confirmation: { message: '트렌드 글감으로 교체할까요?', title: '글감 교체' },
    prepareDestination: async () => { destinationPrepared += 1; return destinationAvailable; },
    focusAfterFrame: true
  };

  assert.equal(await context.applyBlogNextWritingIntent(applyOptions), false);
  assert.deepEqual(Object.fromEntries(clearableIds.map((id) => [id, fields.get(id).value])), existingValues);
  assert.equal(activeTab, 'trend-posting');
  assert.equal(destinationPrepared, 0);
  assert.equal(draftResets, 0);
  assert.equal(fields.get('blog-next-ai-preparation').open, false);

  confirmation = true;
  destinationAvailable = false;
  assert.equal(await context.applyBlogNextWritingIntent(applyOptions), false);
  assert.deepEqual(Object.fromEntries(clearableIds.map((id) => [id, fields.get(id).value])), existingValues);
  assert.equal(activeTab, 'trend-posting');
  assert.equal(fields.get('blog-next-ai-preparation').open, false);
  assert.equal(state.ai.draftId, 'draft-old');

  destinationAvailable = true;
  assert.equal(await context.applyBlogNextWritingIntent(applyOptions), true);
  assert.equal(confirmationCount, 3);
  assert.equal(activeTab, 'quick');
  assert.equal(activeMode, 'ai');
  assert.equal(fields.get('blog-next-subject').value, '제주 가을 여행');
  assert.equal(fields.get('blog-next-keywords').value, '제주 가을 여행');
  assert.equal(fields.get('blog-next-title').value, '');
  assert.equal(fields.get('blog-next-instruction').value, '');
  assert.equal(state.ai.preview, null);
  assert.equal(state.ai.draftId, '');
  assert.equal(context.blogNextTrendContext.source, 'naver_trend');
  assert.equal(fields.get('blog-next-ai-preparation').open, true);
  assert.equal(fields.get('blog-next-topic-settings').open, true);
  assert.equal(context.blogNextDisclosureState.quick.preparation, true);
  assert.equal(context.blogNextDisclosureState.quick.topic, true);
  assert.equal(fields.get('blog-next-topic-settings-summary').textContent, '제주 가을 여행 · 제주 가을 여행');
  assert.equal(fields.get('blog-next-subject').focused, false);
  assert.equal(destinationScrolled, false);
  // A late view-state restore must not leave the destination folded or off-screen.
  fields.get('blog-next-ai-preparation').open = false;
  fields.get('blog-next-topic-settings').open = false;
  animationFrames.shift()();
  assert.equal(focusScheduled, 2);
  animationFrames.shift()();
  assert.equal(fields.get('blog-next-ai-preparation').open, true);
  assert.equal(fields.get('blog-next-topic-settings').open, true);
  assert.equal(context.blogNextDisclosureState.quick.preparation, true);
  assert.equal(context.blogNextDisclosureState.quick.topic, true);
  assert.equal(fields.get('blog-next-subject').focused, true);
  assert.equal(destinationScrolled, true);
  assert.equal(draftResets, 1);
  assert.equal(destinationPrepared, 2);
  assert.equal(summariesSynced, 1);
  assert.equal(resultCleared && clearActionSynced && statusDismissed && executionSynced, true);
});

test('quick writing keeps one editable manuscript workspace available before preparation', () => {
  const html = readBlogNextView();
  const css = read('ui/styles/features/blog-next-quick-flow.css');
  const execution = read('ui/scripts/features/blog-next/draft-execution.js');
  const queue = `${read('ui/scripts/features/blog-next/quick-queue.js')}\n${read('ui/scripts/features/blog-next/queue-management.js')}`;
  const inputs = read('ui/scripts/features/blog-next/draft-inputs.js');
  const uiScript = read('ui/scripts/features/blog-next/quick-flow-ui.js');
  const writingIntent = read('ui/scripts/features/blog-next/writing-intent.js');
  const trendScript = read('ui/scripts/features/blog-next/trend-posting.js');

  assert.match(html, /<details class="blog-next-disclosure blog-next-preparation-disclosure" id="blog-next-ai-preparation">[\s\S]*>원고 준비<[\s\S]*data-blog-next-ai-idea-actions/);
  assert.match(writingIntent, /async function applyBlogNextWritingIntent\([\s\S]*?if \(isBlogNextWritingTransitionBusy\(\)\) return false;[\s\S]*?if \(hasBlogNextWritingWork\(\)\)[\s\S]*?await showUiConfirm\([\s\S]*?if \(!confirmed\) return false;/);
  assert.match(writingIntent, /clearBlogNextTopicContent\(\);\s*resetBlogNextAiDraftUi\(\);[\s\S]*Object\.entries\(values \|\| \{\}\)/);
  assert.match(writingIntent, /BLOG_NEXT_WRITING_INTENT_FIELD_IDS\.has\(fieldId\)/);
  assert.match(writingIntent, /function revealBlogNextWritingDestination\(focusFieldId\)[\s\S]*?preparation\.open = true;[\s\S]*?preparation\.scrollIntoView\?\.\(\{ behavior: 'smooth', block: 'start' \}\)[\s\S]*?topicSettings\.open = true;[\s\S]*?blogNextDisclosureState\.quick\.preparation = true;[\s\S]*?blogNextDisclosureState\.quick\.topic = true;[\s\S]*?focus\(\{ preventScroll: true \}\)/);
  assert.match(writingIntent, /requestAnimationFrame\(\(\) => requestAnimationFrame\(reveal\)\)/);
  assert.match(trendScript, /await applyBlogNextWritingIntent\(\{[\s\S]*?'blog-next-subject': keyword,[\s\S]*?'blog-next-keywords': keyword\s*\}[\s\S]*?blogNextTrendContext = \{/);
  assert.match(trendScript, /message: '작성 중인 글감을 선택한 트렌드 키워드로 바꿀까요\?'/);
  assert.match(html, /data-blog-next-ai-idea-actions[\s\S]*>글감 활용<[\s\S]*id="blog-next-save-topic"[\s\S]*>글감 보관/);
  assert.match(html, /class="blog-next-ai-action-row blog-next-ai-actions-row"[\s\S]*id="blog-next-save-topic"[\s\S]*id="blog-next-enqueue-topic"[\s\S]*data-blog-next-ai-generate-action[\s\S]*id="blog-next-publish-now"[\s\S]*<svg class="ui-ai-icon" aria-hidden="true"><use href="#ui-icon-ai"><\/use><\/svg><span id="blog-next-publish-now-label">원고 만들기/);
  assert.match(html, /id="blog-next-enqueue-topic"[\s\S]*>발행 대기열에 추가<\/button>/);
  assert.match(html, /id="blog-next-queue-action-hint">보관하거나 대기열에 추가할 수 있고, 지금 원고를 만들 수도 있습니다/);
  assert.match(html, /data-blog-next-ai-step="preview">[\s\S]*>미리보기 · 원고 입력</);
  assert.match(html, /<details class="blog-next-disclosure blog-next-preview-disclosure" id="blog-next-ai-preview" open>[\s\S]*data-blog-next-ai-step="preview"[\s\S]*data-ai-editor-rail[\s\S]*data-ai-editor-workspace[\s\S]*data-blog-next-ai-preview-actions[\s\S]*<\/details>/);
  assert.match(html, /data-ai-editor-rail(?![^>]*\shidden)/);
  assert.match(html, /data-ai-editor-workspace(?![^>]*\shidden)/);
  assert.match(read('ui/styles/features/continuous-publishing-drafts.css'), /원고를 입력하거나 붙여넣으세요\./);
  assert.match(html, /data-blog-next-ai-step="publish">[\s\S]*>포스팅 · 발행</);
  assert.match(html, /<details class="blog-next-disclosure blog-next-publish-disclosure" id="blog-next-ai-publish" open>[\s\S]*data-blog-next-ai-step="publish"[\s\S]*data-blog-next-publish-settings-slot="ai-publish"[\s\S]*data-blog-next-draft-actions="ai"[\s\S]*<\/details>/);
  assert.doesNotMatch(html, /<details class="blog-next-disclosure blog-next-draft-settings" id="blog-next-publish-settings"[^>]*\sopen/);
  assert.match(html, /data-blog-next-draft-actions="ai">[\s\S]*data-blog-next-draft-publish="ai"[^>]*disabled/);
  assert.match(execution, /data-blog-next-publish-settings-slot="ai-publish"/);
  assert.match(uiScript, /function mountBlogNextPublishSettings/);
  assert.match(execution, /if \(save\) save\.hidden = hasDraft/);
  assert.match(execution, /enqueue\.hidden = hasDraft/);
  assert.match(execution, /prepareActions\.hidden = !editing && hasDraft/);
  assert.match(execution, /ideaActions\.hidden = !editing && hasDraft/);
  assert.match(execution, /previewActions\.hidden = editing \|\| !hasDraft/);
  assert.match(html, /data-blog-next-ai-preview-actions hidden>[\s\S]*id="blog-next-regenerate-draft"[^>]*>[\s\S]*?<span>원고 다시 만들기<\/span>/);
  assert.match(execution, /publishStep\.hidden = editing/);
  assert.match(execution, /publishSettings\.hidden = editing/);
  assert.match(execution, /if \(publishDisclosure\) publishDisclosure\.hidden = editing/);
  assert.match(execution, /if \(editing && previewDisclosure\) previewDisclosure\.open = true/);
  assert.match(execution, /if \(publishActions\) publishActions\.hidden = editing/);
  assert.match(css, /#blog-next-topic-form-home > \.blog-next-preparation-disclosure\s*\{\s*width: 100%;[\s\S]*?border: 0;/);
  assert.match(css, /\.blog-next-preview-disclosure,\s*\.blog-next-publish-disclosure\s*\{\s*overflow: visible;[\s\S]*?border: 0;/);
  assert.match(css, /\.blog-next-workflow-step-head > span,\s*\.blog-next-preparation-step\s*\{[\s\S]*?width: 30px;[\s\S]*?height: 30px;[\s\S]*?background: var\(--ui-action-primary-soft\);[\s\S]*?color: var\(--ui-action-primary\);/);
  assert.match(css, /\.blog-next-workflow-step-head\s*\{[\s\S]*?margin: 0;/);
  assert.match(css, /\.blog-next-preview-disclosure > summary,\s*\.blog-next-publish-disclosure > summary\s*\{[\s\S]*?margin: 0;/);
  assert.match(css, /\.blog-next-preview-disclosure\[open\] > summary,[\s\S]*\.blog-next-publish-disclosure\[open\] > summary\s*\{\s*margin-bottom: var\(--ui-density-page-gap\);/);
  assert.doesNotMatch(css, /#blog-next-ai-publish > summary\s*\{/);
  assert.match(css, /#blog-next-topic-form-home \.blog-next-ai-prepare-actions\s*\{[\s\S]*?margin-top: 0;/);
  assert.match(css, /\.blog-next-preparation-disclosure \.blog-next-ai-action-row\s*\{\s*padding-bottom: 0;/);
  assert.match(css, /\.blog-next-preparation-disclosure > form\s*\{\s*padding: 0 var\(--blog-next-stage-content-inset\) var\(--ui-density-page-gap\);/);
  assert.match(css, /#blog-next-ai-preview \.manuscript-editor-sticky-rail\s*\{\s*margin-bottom: var\(--ui-density-page-gap\);/);
  assert.match(css, /\.blog-next-ai-preview-actions\s*\{\s*margin-top: var\(--ui-density-page-gap\);/);
  assert.match(css, /#blog-next-ai-preview\[open\]\s*\{\s*padding-bottom: var\(--ui-density-page-gap\);/);
  assert.match(css, /#blog-next-ai-preview \[data-ai-editor-workspace\]\s*\{\s*padding-bottom: 0;/);
  assert.match(css, /\.blog-next-ai-generate-action \.primary\s*\{\s*display: inline-flex;\s*align-items: center;\s*justify-content: center;\s*gap: 8px;/);
  assert.match(css, /\.blog-next-ai-assist\s*\{[\s\S]*?gap: 8px;/);
  assert.match(css, /\.blog-next-publish-disclosure > \[data-blog-next-draft-actions\]\s*\{\s*margin-top: var\(--ui-density-page-gap\);\s*padding-bottom: var\(--ui-density-page-gap\);/);
  assert.match(css, /#blog-next-topic-form-home \.blog-next-preparation-disclosure\[open\] > summary,[\s\S]*summary:hover,[\s\S]*summary:active\s*\{\s*background: transparent;/);
  assert.match(css, /#blog-next-topic-form-home \.blog-next-preparation-disclosure\[open\] > summary\s*\{\s*border-bottom: 0;/);
  assert.match(css, /\.blog-next-disclosure\.blog-next-preview-disclosure\[open\] > summary,[\s\S]*\.blog-next-disclosure\.blog-next-publish-disclosure\[open\] > summary\s*\{\s*background: transparent;/);
  assert.ok(css.indexOf('.blog-next-disclosure[open] > summary {') < css.indexOf('.blog-next-disclosure.blog-next-preview-disclosure > summary,'));
  assert.match(css, /\.blog-next-preparation-disclosure > form\s*\{\s*padding: 0 var\(--blog-next-stage-content-inset\) var\(--ui-density-page-gap\);/);
  assert.match(inputs, /const hasSource = type === 'ai'[\s\S]*?blog-next-ai-markdown[\s\S]*?value\?\.trim\(\)/);
  assert.match(inputs, /postJson\('\/api\/v1\/blog\/manuscript-drafts\/paste',[\s\S]*?markdownText: aiMarkdownAtRequest/);
  assert.match(queue, /발행 계획을 확인한 뒤 발행 대기열에 추가해 주세요/);
  assert.match(queue, /\['blog-next-publish-now', 'blog-next-regenerate-draft'\][\s\S]*generateBlogNextAiDraft\(id === 'blog-next-regenerate-draft' \? 'regenerate' : 'create'\)/);
  assert.match(queue, /setUiAiActionButton\(publishButton, aiDraftGenerating \? '원고 만드는 중…'/);
  assert.match(queue, /publishSettings\.hidden = false;[\s\S]*publishSettings\.open = true/);
  assert.match(queue, /bindBlogNextDetachedPublishSettings\(form\)/);
  assert.match(execution, /function bindBlogNextDetachedPublishSettings\(form\)/);
  assert.doesNotMatch(html, /data-blog-next-draft-result=/);
  assert.match(css, /\.blog-next-ai-action-row\s*\{[\s\S]*?justify-content:\s*space-between/);
  assert.match(css, /\.blog-next-ai-action-buttons\s*\{[\s\S]*?display:\s*inline-flex/);
  assert.match(css, /\.blog-next-ai-action-buttons\s*\{[^}]*flex-wrap:\s*nowrap/s);
  assert.match(html, /id="blog-next-topic-recommend"[^>]*aria-label="AI로 주제 글감 추천" data-tooltip="AI로 주제 글감 추천"><svg[^>]*aria-hidden="true"/);
  assert.doesNotMatch(execution, /runWithLiveProgress/);
  assert.doesNotMatch(inputs, /runWithLiveProgress/);
  assert.match(execution, /source: 'manuscript_generation'/);
  assert.match(execution, /setBlogNextTopicResult\(''\);\s*setBlogNextDraftValidation\('ai'\);\s*if \(typeof ensureUiCapabilityReady/);
  assert.doesNotMatch(css, /#blog-next-topic-form-home \.blog-next-ai-prepare-actions > \.blog-next-recoverable-action-slot/);
  const sourceFields = execution.match(/const sourceFields = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
  assert.doesNotMatch(sourceFields, /blog-next-target-(?:naver|wordpress)/);
});

test('quick flow width and disclosure layout adapt without style-specific selectors', () => {
  const html = readBlogNextView();
  const css = read('ui/styles/features/blog-next-quick-flow.css');
  const selectShellCss = read('ui/styles/patterns/select-shell.css');

  assert.match(css, /#blog-next-topic-form-home \.blog-next-topic-form\s*\{[^}]*width:\s*100%;/s);
  assert.match(css, /#blog-next-mode-panel-ai\s*\{[^}]*--blog-next-stage-content-inset:\s*var\(--ui-space-2\);/s);
  assert.match(css, /\.blog-next-preparation-disclosure > form\s*\{[^}]*padding:\s*0 var\(--blog-next-stage-content-inset\) var\(--ui-density-page-gap\);/s);
  assert.match(css, /\.blog-next-preview-disclosure > :not\(summary\)\s*\{[^}]*margin-inline:\s*var\(--blog-next-stage-content-inset\);/s);
  assert.match(css, /#blog-next-ai-publish > \[data-blog-next-publish-settings-slot="ai-publish"\] > #blog-next-publish-settings,[\s\S]*?#blog-next-ai-publish > \.blog-next-draft-actions\s*\{\s*margin-inline:\s*var\(--blog-next-stage-content-inset\);/s);
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
  const script = `${read('ui/scripts/features/blog-next/quick-queue.js')}\n${read('ui/scripts/features/blog-next/queue-management.js')}`;

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
  const script = `${read('ui/scripts/features/blog-next/quick-queue.js')}\n${read('ui/scripts/features/blog-next/queue-management.js')}`;
  const uiScript = read('ui/scripts/features/blog-next/quick-flow-ui.js');
  const runnerScript = read('ui/scripts/features/blog-next/runner.js');

  assert.match(html, /id="blog-next-headless-field"[^>]*data-dependency-active="true"/);
  assert.match(html, /id="blog-next-category-field"/);
  assert.match(html, /id="blog-next-vault-folder-control"[^>]*hidden/);
  assert.match(html, /id="blog-next-help-headless" role="tooltip">네이버 포스팅 브라우저/);
  assert.match(css, /\.blog-next-dependent-field\[data-dependency-active="false"\] \.blog-next-check-label\s*\{[^}]*color:\s*var\(--ui-text-muted\)/s);
  assert.match(uiScript, /function syncBlogNextProviderDependentFields\(\)/);
  assert.match(uiScript, /input\.disabled = !naverSelected \|\| runnerBusy;/);
  assert.match(uiScript, /syncBlogNextDraftProviderFields\(draftType\)/);
  assert.match(uiScript, /const category = document\.getElementById\('blog-next-category'\)/);
  assert.match(uiScript, /if \(category && typeof syncBlogNextDraftProviderFields !== 'function'\) category\.disabled = siteSelected && siteKind !== 'vault'/);
  assert.match(uiScript, /if \(document\.getElementById\('blog-next-target-naver'\)\?\.checked\)\s*\{\s*summaryParts\.push/s);
  assert.match(script, /startBlogNextRunner\(\{ rowIndex: Number\(data\.rowIndex\), platforms: payload\.platforms \}\)/);
  assert.match(script, /startBlogNextRunner\(\{ rowIndex, platforms: item\.options\?\.platforms \}\)/);
  assert.match(runnerScript, /const supportsHeadless = platforms === null \|\| platforms\.includes\('naver'\)/);
  assert.match(runnerScript, /const headless = supportsHeadless &&/);
});
