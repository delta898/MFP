const BLOG_NEXT_TOPIC_DEFAULTS_STORAGE_KEY = 'blog_next_topic_defaults_v1';
const BLOG_NEXT_BUILTIN_DEFAULTS = Object.freeze({
  platforms: ['naver'], naverCategory: '', wordpressCategory: '', writingStrategy: 'search',
  imageMode: 'prompt_only', postStatus: 'publish', externalReference: true, headless: true
});
const BLOG_NEXT_PERSISTED_SETTING_IDS = new Set([
  'blog-next-target-naver', 'blog-next-target-wordpress', 'blog-next-naver-category',
  'blog-next-wordpress-category', 'blog-next-writing-strategy', 'blog-next-image-mode',
  'blog-next-runner-headless', 'blog-next-external-reference',
  'blog-next-writing-length', 'blog-next-writing-opening', 'blog-next-writing-development',
  'blog-next-writing-ending'
]);

let blogNextTopicSubmitting = false;
let blogNextQueueLoading = false;
let blogNextQueueReordering = false;
let blogNextQueueOperationBusy = false;
let blogNextQueueState = { items: [], saved_items: [], status_summary: {} };
let blogNextEditingRowIndex = null;
let blogNextEditingSourceStatus = '';
let blogNextEditingInitialSnapshot = '';
let blogNextActiveManagementTab = 'ready';
let blogNextPendingImmediateSubmission = null;
let blogNextEditingTrendContext = null;
const BLOG_NEXT_DISCLOSURE_DEFAULTS = Object.freeze({
  quick: Object.freeze({ preparation: false, topic: true, content: false }),
  queueEditor: Object.freeze({ topic: true, content: false })
});
const blogNextDisclosureState = {
  quick: { ...BLOG_NEXT_DISCLOSURE_DEFAULTS.quick },
  queueEditor: { ...BLOG_NEXT_DISCLOSURE_DEFAULTS.queueEditor }
};
const BLOG_NEXT_CLEARABLE_FIELD_IDS = Object.freeze([
  'blog-next-subject',
  'blog-next-title',
  'blog-next-keywords',
  'blog-next-instruction',
  'blog-next-reference-url',
  'blog-next-schedule-date'
]);

function readBlogNextTopicSettings() {
  const platforms = [];
  if (getBlogNextSettingsElement('blog-next-target-naver')?.checked) platforms.push('naver');
  if (getBlogNextSettingsElement('blog-next-target-wordpress')?.checked) platforms.push('wordpress');
  return {
    platforms,
    naverCategory: getBlogNextSettingsElement('blog-next-naver-category')?.value || '',
    wordpressCategory: getBlogNextSettingsElement('blog-next-wordpress-category')?.value || '',
    writingStrategy: getBlogNextSettingsElement('blog-next-writing-strategy')?.value || 'search',
    imageMode: getBlogNextSettingsElement('blog-next-image-mode')?.value || 'prompt_only',
    postStatus: getBlogNextSettingsElement('blog-next-post-status')?.value || 'publish',
    headless: getBlogNextSettingsElement('blog-next-runner-headless')?.checked !== false,
    externalReference: getBlogNextSettingsElement('blog-next-external-reference')?.checked === true,
    writingOverrides: readBlogNextWritingOverrides()
  };
}
function normalizeBlogNextTopicDefaults(value = {}) {
  const platforms = Array.isArray(value.platforms)
    ? value.platforms.filter(platform => ['naver', 'wordpress'].includes(platform))
    : BLOG_NEXT_BUILTIN_DEFAULTS.platforms;
  return {
    platforms: platforms.length === 1 ? [...new Set(platforms)] : ['naver'],
    naverCategory: String(value.naverCategory || ''),
    wordpressCategory: String(value.wordpressCategory || ''),
    writingStrategy: ['search', 'discovery'].includes(value.writingStrategy) ? value.writingStrategy : 'search',
    imageMode: ['generate', 'prompt_only', 'none'].includes(value.imageMode) ? value.imageMode : 'prompt_only',
    postStatus: ['publish', 'draft', 'schedule'].includes(value.postStatus) ? value.postStatus : 'publish',
    headless: value.headless !== false,
    externalReference: value.externalReference !== false,
    writingOverrides: normalizeBlogNextWritingOverrides(value.writingOverrides)
  };
}

function loadBlogNextTopicDefaults() {
  try {
    const stored = localStorage.getItem(BLOG_NEXT_TOPIC_DEFAULTS_STORAGE_KEY);
    const settings = stored ? normalizeBlogNextTopicDefaults(JSON.parse(stored)) : normalizeBlogNextTopicDefaults(BLOG_NEXT_BUILTIN_DEFAULTS);
    // Publishing fields are target-scoped and intentionally live only for the current browser session.
    settings.naverCategory = '';
    settings.wordpressCategory = '';
    settings.postStatus = 'publish';
    return settings;
  } catch (_error) {
    return normalizeBlogNextTopicDefaults(BLOG_NEXT_BUILTIN_DEFAULTS);
  }
}

function applyBlogNextTopicSettings(settings = BLOG_NEXT_BUILTIN_DEFAULTS) {
  const normalized = normalizeBlogNextTopicDefaults(settings);
  const naver = getBlogNextSettingsElement('blog-next-target-naver');
  const wordpress = getBlogNextSettingsElement('blog-next-target-wordpress');
  if (naver) naver.checked = normalized.platforms.includes('naver');
  if (wordpress) wordpress.checked = normalized.platforms.includes('wordpress');
  Object.entries({
    'blog-next-naver-category': normalized.naverCategory,
    'blog-next-wordpress-category': normalized.wordpressCategory,
    'blog-next-writing-strategy': normalized.writingStrategy,
    'blog-next-image-mode': normalized.imageMode,
    'blog-next-post-status': normalized.postStatus,
    'blog-next-runner-headless': normalized.headless
  }).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (!element) return;
    if (element.type === 'checkbox') element.checked = value;
    else element.value = value;
  });
  const externalReference = getBlogNextSettingsElement('blog-next-external-reference');
  if (externalReference) externalReference.checked = normalized.externalReference;
  applyBlogNextWritingOverrides(normalized.writingOverrides);
  if (typeof syncBlogNextDraftProviderFields === 'function') syncBlogNextDraftProviderFields('ai');
  syncBlogNextProviderDependentFields();
  syncBlogNextScheduleField();
}

function rememberBlogNextTopicDefaults() {
  if (blogNextEditingRowIndex !== null) return;
  try {
    const settings = readBlogNextTopicSettings();
    // Publishing choices belong to a specific queue item; they are never quick-flow defaults.
    delete settings.platforms;
    delete settings.naverCategory;
    delete settings.wordpressCategory;
    delete settings.postStatus;
    localStorage.setItem(BLOG_NEXT_TOPIC_DEFAULTS_STORAGE_KEY, JSON.stringify(settings));
  } catch (_error) {
    // 저장소가 차단되어도 글감 등록은 계속할 수 있어야 한다.
  }
}

function rememberBlogNextTopicDefaultsForSetting(fieldId = '') {
  if (!BLOG_NEXT_PERSISTED_SETTING_IDS.has(String(fieldId || ''))) return;
  rememberBlogNextTopicDefaults();
}

function readBlogNextTopicPayload(action) {
  const trendContext = blogNextEditingRowIndex !== null
    ? blogNextEditingTrendContext
    : typeof blogNextTrendContext !== 'undefined' ? blogNextTrendContext : null;
  return {
    action,
    subject: getBlogNextSettingsElement('blog-next-subject')?.value || '',
    title: getBlogNextSettingsElement('blog-next-title')?.value || '',
    keywords: getBlogNextSettingsElement('blog-next-keywords')?.value || '',
    instruction: getBlogNextSettingsElement('blog-next-instruction')?.value || '',
    referenceUrl: getBlogNextSettingsElement('blog-next-reference-url')?.value || '',
    ...readBlogNextTopicSettings(),
    scheduleDate: getBlogNextSettingsElement('blog-next-schedule-date')?.value || '',
    source: trendContext?.source || 'blog_next',
    trendDate: trendContext?.trendDate || ''
  };
}

function setBlogNextTopicBusy(busy, action = '') {
  blogNextTopicSubmitting = busy;
  const editingReady = blogNextEditingSourceStatus === '발행 준비 완료';
  const runnerActive = typeof blogNextRunnerActive !== 'undefined' && blogNextRunnerActive;
  const aiDraftGenerating = typeof blogNextDraftState !== 'undefined' && blogNextDraftState.ai?.generating === true;
  const saveButton = document.getElementById(blogNextEditingRowIndex !== null ? 'blog-next-editor-save' : 'blog-next-save-topic');
  const enqueueButton = document.getElementById(blogNextEditingRowIndex !== null ? 'blog-next-editor-enqueue' : 'blog-next-enqueue-topic');
  const publishButton = document.getElementById('blog-next-publish-now');
  const queueConfirmButton = document.getElementById('blog-next-queue-settings-confirm');
  const queueCloseButton = document.getElementById('blog-next-queue-settings-close');
  const queueCancelButton = document.getElementById('blog-next-queue-settings-cancel');
  if (saveButton) {
    saveButton.textContent = busy && action === 'save'
      ? (blogNextEditingRowIndex !== null ? '저장 중...' : '보관 중...')
      : (blogNextEditingRowIndex !== null ? '저장' : '글감 보관');
  }
  if (enqueueButton) {
    const label = blogNextEditingSourceStatus === '대기' ? '대기열로 이동'
      : editingReady ? '저장' : '발행 대기열에 추가';
    enqueueButton.textContent = busy && action === 'enqueue'
      ? (editingReady ? '저장 중...' : '추가 중...')
      : label;
  }
  if (blogNextEditingRowIndex !== null) {
    syncBlogNextTopicActionAvailability();
    return;
  }
  if (queueConfirmButton) queueConfirmButton.disabled = busy;
  if (queueCloseButton) queueCloseButton.disabled = busy;
  if (queueCancelButton) queueCancelButton.disabled = busy;
  if (publishButton) {
    setUiAiActionButton(publishButton, aiDraftGenerating ? '원고 만드는 중…'
      : runnerActive ? '포스팅 진행 중...'
      : busy && action === 'publish-now' ? '원고 만드는 중...'
        : '원고 만들기', { ai: !runnerActive || aiDraftGenerating });
  }
  syncBlogNextTopicActionAvailability();
  if (typeof syncBlogNextDraftExecutionState === 'function') syncBlogNextDraftExecutionState();
}
function setBlogNextTopicResult(message, level = '') {
  const result = blogNextEditingRowIndex !== null
    ? document.querySelector('#blog-next-editor-modal [data-blog-next-setting-key="blog-next-topic-result"]')
    : document.getElementById('blog-next-topic-result');
  if (!result) return;
  const text = String(message || '');
  result.textContent = text;
  result.dataset.level = level;
  const row = result.closest('.blog-next-form-result-row');
  if (row) row.hidden = !text.trim();
}

function showBlogNextQueueReadinessIssues() {
  const validity = readBlogNextTopicActionValidity();
  if (validity.readyValid) return true;
  const publishSettings = getBlogNextSettingsElement('blog-next-publish-settings');
  if (publishSettings) publishSettings.open = true;
  const missing = validity.issues.map((issue) => issue.label);
  setBlogNextTopicResult(
    `대기열로 이동할 수 없습니다. 다음 설정을 확인해 주세요${missing.length ? `: ${missing.join(', ')}` : ''}.`,
    'error'
  );
  const firstIssue = validity.issues[0];
  if (firstIssue) getBlogNextSettingsElement(firstIssue.field)?.focus();
  return false;
}

function captureBlogNextDisclosureState(context) {
  const state = blogNextDisclosureState[context];
  if (!state) return;
  const preparation = document.getElementById('blog-next-ai-preparation');
  const topic = getBlogNextSettingsElement('blog-next-topic-settings');
  const content = getBlogNextSettingsElement('blog-next-content-settings');
  if (context === 'quick' && preparation) state.preparation = preparation.open;
  if (topic) state.topic = topic.open;
  if (content) state.content = content.open;
}

function applyBlogNextDisclosureState(context) {
  const state = blogNextDisclosureState[context];
  if (!state) return;
  const preparation = document.getElementById('blog-next-ai-preparation');
  const topic = getBlogNextSettingsElement('blog-next-topic-settings');
  const content = getBlogNextSettingsElement('blog-next-content-settings');
  if (context === 'quick' && preparation) preparation.open = state.preparation;
  if (topic) topic.open = state.topic;
  if (content) content.open = state.content;
}

function restoreBlogNextTopicFormHome() {
  const modal = document.getElementById('blog-next-editor-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    modal.hidden = true;
  }
}

function finishBlogNextTopicEditing() {
  if (typeof setBlogNextEditorPromotionAction === 'function') setBlogNextEditorPromotionAction(false);
  const editorResult = document.querySelector('#blog-next-editor-modal [data-blog-next-setting-key="blog-next-topic-result"]');
  if (editorResult) {
    editorResult.textContent = '';
    editorResult.dataset.level = '';
    const row = editorResult.closest('.blog-next-form-result-row');
    if (row) row.hidden = true;
  }
  blogNextEditingRowIndex = null;
  blogNextEditingSourceStatus = '';
  blogNextEditingInitialSnapshot = '';
  blogNextEditingTrendContext = null;
  restoreBlogNextTopicFormHome();
  if (typeof endBlogNextTopicEditingSettingsContext === 'function') endBlogNextTopicEditingSettingsContext();
  setBlogNextTopicBusy(false);
  syncBlogNextTopicClearAction();
}

function moveBlogNextTopicFormToQueueEditor({ showPublishSettings = false } = {}) {
  const modal = document.getElementById('blog-next-editor-modal');
  const form = document.getElementById('blog-next-editor-settings-form');
  if (!modal || !form) return;
  createBlogNextEditorSettingsInstance();
  const publishSettings = getBlogNextSettingsElement('blog-next-publish-settings');
  if (publishSettings) publishSettings.open = showPublishSettings;
  if (typeof setBlogNextPublishSettingsContext === 'function') setBlogNextPublishSettingsContext('ai', '발행 계획');
  if (typeof syncBlogNextProviderDependentFields === 'function') syncBlogNextProviderDependentFields();
  if (typeof syncBlogNextScheduleField === 'function') syncBlogNextScheduleField();
  modal.hidden = false;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function syncBlogNextTopicFormHostForTab(tabName) {
  if (blogNextEditingRowIndex !== null && tabName !== 'queue') finishBlogNextTopicEditing();
}

function snapshotBlogNextEditingPayload() {
  const payload = readBlogNextTopicPayload('');
  delete payload.action;
  return JSON.stringify(payload);
}

function rememberBlogNextImmediateSubmission({ rowIndex, snapshot, editing }) {
  blogNextPendingImmediateSubmission = {
    rowIndex: Number(rowIndex),
    snapshot: String(snapshot || ''),
    editing: editing === true
  };
}

function settleBlogNextImmediateSubmission(status = {}) {
  const pending = blogNextPendingImmediateSubmission;
  if (!pending) return;
  const state = String(status.state || '').trim();
  const hasRowIndex = status.rowIndex !== null && status.rowIndex !== undefined && status.rowIndex !== '';
  const rowIndex = Number(status.rowIndex);
  if (hasRowIndex && Number.isInteger(rowIndex) && rowIndex !== pending.rowIndex) return;
  if (['selecting', 'running', 'idle'].includes(state)) return;

  if (state === 'completed') {
    if (snapshotBlogNextEditingPayload() === pending.snapshot) {
      clearBlogNextTopicContent();
      finishBlogNextTopicEditing();
    }
    setBlogNextTopicResult('포스팅을 완료했습니다.', 'success');
  } else {
    setBlogNextTopicResult(String(status.message || '포스팅을 완료하지 못했습니다. 입력 내용을 확인한 후 다시 시도해 주세요.'), 'error');
  }
  blogNextPendingImmediateSubmission = null;
}

async function closeBlogNextEditor(options = {}) {
  if (blogNextEditingRowIndex === null) return;
  const changed = blogNextEditingInitialSnapshot !== snapshotBlogNextEditingPayload();
  if (changed && options.force !== true) {
    const confirmed = await showUiConfirm('변경 내용을 저장하지 않고 닫을까요?', {
      title: '수정 취소', confirmText: '닫기', cancelText: '계속 수정'
    });
    if (!confirmed) return;
  }
  finishBlogNextTopicEditing();
}

async function submitBlogNextTopic(action) {
  if (blogNextTopicSubmitting || !await ensureBlogNextTopicStorageReady()) return;
  if (action === 'enqueue' && blogNextEditingRowIndex !== null && blogNextEditingSourceStatus === '대기'
    && !showBlogNextQueueReadinessIssues()) return;
  setBlogNextTopicBusy(true, action);
  setBlogNextTopicResult('');
  try {
    const editing = blogNextEditingRowIndex !== null;
    const editingReady = blogNextEditingSourceStatus === '발행 준비 완료';
    const editingSavedIdea = editing && blogNextEditingSourceStatus === '대기';
    const captureAction = action === 'publish-now' ? 'enqueue' : action;
    const payload = readBlogNextTopicPayload(captureAction);
    if (action === 'save' && !editing) {
      payload.platforms = [];
      payload.naverCategory = '';
      payload.wordpressCategory = '';
      payload.postStatus = 'draft';
      payload.scheduleDate = '';
    }
    const submittedSnapshot = snapshotBlogNextEditingPayload();
    if (action === 'publish-now') await preflightBlogNextPublishTargets(payload);
    if (editing) {
      payload.rowIndex = blogNextEditingRowIndex;
      payload.sourceStatus = blogNextEditingSourceStatus;
    }
    const data = await postJson(editing
      ? '/api/v1/continuous-publishing/topics/update'
      : '/api/v1/continuous-publishing/topics', payload);
    const queued = data?.status === '발행 준비 완료';
    const message = editing
      ? (editingReady ? '발행 계획을 수정했습니다.' : queued ? '글감을 발행 대기열에 추가했습니다.' : '보관한 글감을 수정했습니다.')
      : (queued ? '발행 계획을 확인해 대기열에 추가했습니다.' : '글감을 보관했습니다. 언제든 계속 작성할 수 있습니다.');
    if (action === 'enqueue' && typeof endBlogNextQueueSettingsContext === 'function') {
      endBlogNextQueueSettingsContext();
    }
    if (!editing) rememberBlogNextTopicDefaults();
    if (action !== 'publish-now') {
      if (editing) finishBlogNextTopicEditing();
      else {
        if (typeof resetBlogNextAiDraftUi === 'function') resetBlogNextAiDraftUi();
        clearBlogNextTopicContent();
      }
    }
    if (!editing) setBlogNextTopicResult(message, 'success');
    if (action !== 'publish-now') {
      showUiToast({ level: 'success', title: queued ? '대기열 추가 완료' : '글감 보관 완료', message });
    }
    await loadBlogNextQueue({ force: true, showRefreshProgress: false });
    if (editing && !editingSavedIdea) activateBlogNextTab('queue');
    if (action === 'publish-now' && Number.isInteger(Number(data?.rowIndex))) {
      rememberBlogNextImmediateSubmission({
        rowIndex: Number(data.rowIndex),
        snapshot: submittedSnapshot,
        editing
      });
      try {
        await startBlogNextRunner({ rowIndex: Number(data.rowIndex), platforms: payload.platforms });
        setBlogNextTopicResult('바로 포스팅을 시작했습니다.', 'success');
      } catch (error) {
        blogNextPendingImmediateSubmission = null;
        setBlogNextTopicResult(error.message || '실행을 시작하지 못했습니다. 발행 대기열에서 다시 시도해 주세요.', 'error');
      }
    }
  } catch (error) {
    if (action === 'enqueue' && typeof isBlogNextQueueSettingsOpen === 'function' && isBlogNextQueueSettingsOpen()) {
      showBlogNextQueueSettingsResult(error.message || '대기열에 추가하지 못했습니다. 설정을 확인해 주세요.');
      document.getElementById('blog-next-queue-settings-confirm')?.focus();
    } else setBlogNextTopicResult(error.message || '글감을 저장하지 못했습니다.', 'error');
  } finally {
    setBlogNextTopicBusy(false);
  }
}
