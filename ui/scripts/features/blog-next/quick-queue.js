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
  if (document.getElementById('blog-next-target-naver')?.checked) platforms.push('naver');
  if (document.getElementById('blog-next-target-wordpress')?.checked) platforms.push('wordpress');
  return {
    platforms,
    naverCategory: document.getElementById('blog-next-naver-category')?.value || '',
    wordpressCategory: document.getElementById('blog-next-wordpress-category')?.value || '',
    writingStrategy: document.getElementById('blog-next-writing-strategy')?.value || 'search',
    imageMode: document.getElementById('blog-next-image-mode')?.value || 'prompt_only',
    postStatus: document.getElementById('blog-next-post-status')?.value || 'publish',
    headless: document.getElementById('blog-next-runner-headless')?.checked !== false,
    externalReference: document.getElementById('blog-next-external-reference')?.checked === true,
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
  const naver = document.getElementById('blog-next-target-naver');
  const wordpress = document.getElementById('blog-next-target-wordpress');
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
  const externalReference = document.getElementById('blog-next-external-reference');
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
  const trendContext = typeof blogNextTrendContext !== 'undefined' ? blogNextTrendContext : null;
  return {
    action,
    subject: document.getElementById('blog-next-subject')?.value || '',
    title: document.getElementById('blog-next-title')?.value || '',
    keywords: document.getElementById('blog-next-keywords')?.value || '',
    instruction: document.getElementById('blog-next-instruction')?.value || '',
    referenceUrl: document.getElementById('blog-next-reference-url')?.value || '',
    ...readBlogNextTopicSettings(),
    scheduleDate: document.getElementById('blog-next-schedule-date')?.value || '',
    source: trendContext?.source || 'blog_next',
    trendDate: trendContext?.trendDate || ''
  };
}

function setBlogNextTopicBusy(busy, action = '') {
  blogNextTopicSubmitting = busy;
  const editingReady = blogNextEditingSourceStatus === '발행 준비 완료';
  const runnerActive = typeof blogNextRunnerActive !== 'undefined' && blogNextRunnerActive;
  const aiDraftGenerating = typeof blogNextDraftState !== 'undefined' && blogNextDraftState.ai?.generating === true;
  const saveButton = document.getElementById('blog-next-save-topic');
  const enqueueButton = document.getElementById('blog-next-enqueue-topic');
  const publishButton = document.getElementById('blog-next-publish-now');
  if (saveButton) {
    saveButton.textContent = busy && action === 'save'
      ? (blogNextEditingRowIndex !== null ? '저장 중...' : '보관 중...')
      : (blogNextEditingRowIndex !== null ? '저장' : '글감 보관');
  }
  if (enqueueButton) {
    enqueueButton.textContent = busy && action === 'enqueue'
      ? (editingReady ? '저장 중...' : '추가 중...')
      : (editingReady ? '저장' : '발행 대기열에 추가');
  }
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
  const result = document.getElementById('blog-next-topic-result');
  if (!result) return;
  const text = String(message || '');
  result.textContent = text;
  result.dataset.level = level;
  const row = result.closest('.blog-next-form-result-row');
  if (row) row.hidden = !text.trim();
}

function captureBlogNextDisclosureState(context) {
  const state = blogNextDisclosureState[context];
  if (!state) return;
  const preparation = document.getElementById('blog-next-ai-preparation');
  const topic = document.getElementById('blog-next-topic-settings');
  const content = document.getElementById('blog-next-content-settings');
  if (context === 'quick' && preparation) state.preparation = preparation.open;
  if (topic) state.topic = topic.open;
  if (content) state.content = content.open;
}

function applyBlogNextDisclosureState(context) {
  const state = blogNextDisclosureState[context];
  if (!state) return;
  const preparation = document.getElementById('blog-next-ai-preparation');
  const topic = document.getElementById('blog-next-topic-settings');
  const content = document.getElementById('blog-next-content-settings');
  if (context === 'quick' && preparation) preparation.open = state.preparation;
  if (topic) topic.open = state.topic;
  if (content) content.open = state.content;
}

function restoreBlogNextTopicFormHome() {
  const preparation = document.getElementById('blog-next-ai-preparation');
  const home = document.getElementById('blog-next-topic-form-home');
  const modal = document.getElementById('blog-next-editor-modal');
  const form = document.getElementById('blog-next-topic-form');
  const actions = document.querySelector('#blog-next-editor-actions-slot .blog-next-form-actions');
  if (form?.parentElement === document.getElementById('blog-next-queue-editor-slot')) {
    captureBlogNextDisclosureState('queueEditor');
  }
  if (form && actions) form.appendChild(actions);
  const destination = preparation || home;
  if (destination && form && form.parentElement !== destination) destination.appendChild(form);
  applyBlogNextDisclosureState('quick');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    modal.hidden = true;
  }
  if (typeof arrangeBlogNextAiWorkflow === 'function') arrangeBlogNextAiWorkflow();
}

function finishBlogNextTopicEditing() {
  blogNextEditingRowIndex = null;
  blogNextEditingSourceStatus = '';
  blogNextEditingInitialSnapshot = '';
  restoreBlogNextTopicFormHome();
  applyBlogNextTopicSettings(loadBlogNextTopicDefaults());
  const saveButton = document.getElementById('blog-next-save-topic');
  const enqueueButton = document.getElementById('blog-next-enqueue-topic');
  const publishButton = document.getElementById('blog-next-publish-now');
  const recoverableSlot = document.querySelector('.blog-next-form-actions .blog-next-recoverable-action-slot');
  if (recoverableSlot) recoverableSlot.hidden = false;
  if (saveButton) {
    saveButton.hidden = false;
    saveButton.classList.remove('primary');
    saveButton.classList.add('secondary');
  }
  if (enqueueButton) {
    enqueueButton.hidden = false;
    enqueueButton.classList.remove('primary');
    enqueueButton.classList.add('secondary');
  }
  if (publishButton) {
    publishButton.hidden = false;
    publishButton.classList.remove('secondary');
    publishButton.classList.add('primary');
  }
  setBlogNextTopicBusy(false);
  syncBlogNextTopicClearAction();
}

function moveBlogNextTopicFormToQueueEditor() {
  const modal = document.getElementById('blog-next-editor-modal');
  const slot = document.getElementById('blog-next-queue-editor-slot');
  const actionsSlot = document.getElementById('blog-next-editor-actions-slot');
  const form = document.getElementById('blog-next-topic-form');
  if (!modal || !slot || !actionsSlot || !form) return;
  if (form.parentElement !== slot) captureBlogNextDisclosureState('quick');
  if (typeof arrangeBlogNextAiWorkflow === 'function') arrangeBlogNextAiWorkflow({ editing: true });
  modal.hidden = false;
  slot.appendChild(form);
  const actions = form.querySelector('.blog-next-form-actions');
  if (actions) actionsSlot.appendChild(actions);
  applyBlogNextDisclosureState('queueEditor');
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
  clearBlogNextTopicContent();
  finishBlogNextTopicEditing();
  setBlogNextTopicResult('');
}

async function submitBlogNextTopic(action) {
  if (blogNextTopicSubmitting || !await ensureBlogNextTopicStorageReady()) return;
  setBlogNextTopicBusy(true, action);
  setBlogNextTopicResult('');
  try {
    const editing = blogNextEditingRowIndex !== null;
    const editingReady = blogNextEditingSourceStatus === '발행 준비 완료';
    const captureAction = action === 'publish-now' ? 'enqueue' : action;
    const payload = readBlogNextTopicPayload(captureAction);
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
    if (!editing) rememberBlogNextTopicDefaults();
    if (action !== 'publish-now') {
      if (typeof resetBlogNextAiDraftUi === 'function') resetBlogNextAiDraftUi();
      clearBlogNextTopicContent();
      finishBlogNextTopicEditing();
    }
    setBlogNextTopicResult(message, 'success');
    if (action !== 'publish-now') {
      showUiToast({ level: 'success', title: queued ? '대기열 추가 완료' : '글감 보관 완료', message });
    }
    await loadBlogNextQueue({ force: true, showRefreshProgress: false });
    if (editing) activateBlogNextTab('queue');
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
    setBlogNextTopicResult(error.message || '글감을 저장하지 못했습니다.', 'error');
  } finally {
    setBlogNextTopicBusy(false);
  }
}
