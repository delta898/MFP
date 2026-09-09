const BLOG_NEXT_TOPIC_DEFAULTS_STORAGE_KEY = 'blog_next_topic_defaults_v1';
const BLOG_NEXT_BUILTIN_DEFAULTS = Object.freeze({
  platforms: ['naver'], naverCategory: '', wordpressCategory: '', writingStrategy: 'search',
  imageMode: 'prompt_only', postStatus: 'publish', externalReference: true
});

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
let blogNextClearedTopicSnapshot = null;
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
    externalReference: document.getElementById('blog-next-external-reference')?.checked === true,
    writingOverrides: readBlogNextWritingOverrides()
  };
}

function normalizeBlogNextTopicDefaults(value = {}) {
  const platforms = Array.isArray(value.platforms)
    ? value.platforms.filter(platform => ['naver', 'wordpress'].includes(platform))
    : BLOG_NEXT_BUILTIN_DEFAULTS.platforms;
  return {
    platforms: platforms.length > 0 ? [...new Set(platforms)] : ['naver'],
    naverCategory: String(value.naverCategory || ''),
    wordpressCategory: String(value.wordpressCategory || ''),
    writingStrategy: ['search', 'discovery'].includes(value.writingStrategy) ? value.writingStrategy : 'search',
    imageMode: ['generate', 'prompt_only', 'none'].includes(value.imageMode) ? value.imageMode : 'prompt_only',
    postStatus: ['publish', 'draft', 'schedule'].includes(value.postStatus) ? value.postStatus : 'publish',
    externalReference: value.externalReference !== false,
    writingOverrides: normalizeBlogNextWritingOverrides(value.writingOverrides)
  };
}

function loadBlogNextTopicDefaults() {
  try {
    const stored = localStorage.getItem(BLOG_NEXT_TOPIC_DEFAULTS_STORAGE_KEY);
    return stored ? normalizeBlogNextTopicDefaults(JSON.parse(stored)) : normalizeBlogNextTopicDefaults(BLOG_NEXT_BUILTIN_DEFAULTS);
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
    'blog-next-post-status': normalized.postStatus
  }).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value;
  });
  const externalReference = document.getElementById('blog-next-external-reference');
  if (externalReference) externalReference.checked = normalized.externalReference;
  applyBlogNextWritingOverrides(normalized.writingOverrides);
  syncBlogNextProviderDependentFields();
  syncBlogNextScheduleField();
}

function rememberBlogNextTopicDefaults() {
  try {
    localStorage.setItem(BLOG_NEXT_TOPIC_DEFAULTS_STORAGE_KEY, JSON.stringify(readBlogNextTopicSettings()));
  } catch (_error) {
    // 저장소가 차단되어도 글감 등록은 계속할 수 있어야 한다.
  }
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
    publishButton.textContent = runnerActive ? '포스팅 진행 중...'
      : busy && action === 'publish-now' ? '준비 중...'
        : '바로 포스팅';
  }
  syncBlogNextTopicActionAvailability();
}

function setBlogNextTopicResult(message, level = '') {
  const result = document.getElementById('blog-next-topic-result');
  if (!result) return;
  result.textContent = String(message || '');
  result.dataset.level = level;
}

function restoreBlogNextTopicFormHome() {
  const home = document.getElementById('blog-next-topic-form-home');
  const modal = document.getElementById('blog-next-editor-modal');
  const form = document.getElementById('blog-next-topic-form');
  const actions = document.querySelector('#blog-next-editor-actions-slot .blog-next-form-actions');
  if (form && actions) form.appendChild(actions);
  if (home && form && form.parentElement !== home) home.appendChild(form);
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    modal.hidden = true;
  }
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
  modal.hidden = false;
  slot.appendChild(form);
  const actions = form.querySelector('.blog-next-form-actions');
  if (actions) actionsSlot.appendChild(actions);
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
  if (blogNextTopicSubmitting) return;
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

function parseBlogNextQueueCategory(item = {}) {
  const raw = String(item.category || '');
  return {
    naver: String(item.options?.naver_category || raw.match(/(?:^|,)\s*N:\s*([^,]*)/i)?.[1] || '').trim(),
    wordpress: String(item.options?.wordpress_category || raw.match(/(?:^|,)\s*W:\s*([^,]*)/i)?.[1] || '').trim()
  };
}

function isBlogNextQueueRunnerLocked() {
  return (typeof blogNextRunnerActive !== 'undefined' && blogNextRunnerActive)
    || (typeof blogNextRunnerRequesting !== 'undefined' && blogNextRunnerRequesting)
    || document.querySelector('#blog-next-queue-list [data-blog-next-queue-server-running="true"]') !== null;
}

function showBlogNextQueueRunnerLockedNotice() {
  showUiToast({
    level: 'warning',
    title: '다른 글감 처리 중',
    message: '현재 실행이 끝난 뒤 발행 대기열을 변경하거나 다음 글감을 실행해 주세요.'
  });
}

function populateBlogNextTopicForm(item = {}, sourceStatus) {
  if (sourceStatus === '발행 준비 완료' && isBlogNextQueueRunnerLocked()) {
    showBlogNextQueueRunnerLockedNotice();
    return;
  }
  const rowIndex = Number(item.rowIndex);
  if (!Number.isInteger(rowIndex)) return;
  blogNextEditingRowIndex = rowIndex;
  blogNextEditingSourceStatus = sourceStatus;
  const categories = parseBlogNextQueueCategory(item);
  const platforms = Array.isArray(item.options?.platforms) ? item.options.platforms : [];
  document.getElementById('blog-next-subject').value = item.subject || '';
  document.getElementById('blog-next-title').value = item.title || item.options?.title || '';
  document.getElementById('blog-next-keywords').value = Array.isArray(item.keywords) ? item.keywords.join(', ') : item.keywordsRaw || '';
  document.getElementById('blog-next-instruction').value = item.content_guide?.additional_instructions || '';
  document.getElementById('blog-next-reference-url').value = Array.isArray(item.content_guide?.reference_urls) ? item.content_guide.reference_urls.join(', ') : '';
  document.getElementById('blog-next-target-naver').checked = platforms.includes('naver');
  document.getElementById('blog-next-target-wordpress').checked = platforms.includes('wordpress');
  document.getElementById('blog-next-naver-category').value = categories.naver;
  document.getElementById('blog-next-wordpress-category').value = categories.wordpress;
  document.getElementById('blog-next-writing-strategy').value = item.writing_strategy || item.options?.writing_strategy || 'search';
  document.getElementById('blog-next-image-mode').value = item.image_mode || item.options?.image_mode || 'prompt_only';
  document.getElementById('blog-next-post-status').value = item.postStatus || item.options?.post_status || 'publish';
  document.getElementById('blog-next-schedule-date').value = String(item.scheduleDate || item.options?.schedule_date || '').replace(' ', 'T').slice(0, 16);
  document.getElementById('blog-next-external-reference').checked = item.external_reference === true;
  applyBlogNextWritingOverrides(item.content_guide?.writing_overrides || item.writing_overrides || item.options?.writing_overrides);
  syncBlogNextProviderDependentFields();
  if (String(item.source || '') === 'naver_trend' && String(item.trendDate || '').trim()) {
    blogNextTrendContext = {
      id: String(item.id || ''),
      keyword: String(item.subject || item.keywordsRaw || ''),
      trendDate: String(item.trendDate),
      source: 'naver_trend'
    };
  } else if (typeof clearBlogNextTrendContext === 'function') {
    clearBlogNextTrendContext();
  }
  const saveButton = document.getElementById('blog-next-save-topic');
  const enqueueButton = document.getElementById('blog-next-enqueue-topic');
  const publishButton = document.getElementById('blog-next-publish-now');
  const recoverableSlot = document.querySelector('.blog-next-form-actions .blog-next-recoverable-action-slot');
  const editorTitle = document.getElementById('blog-next-editor-title');
  if (recoverableSlot) recoverableSlot.hidden = true;
  if (saveButton) {
    saveButton.hidden = false;
    saveButton.classList.remove('secondary');
    saveButton.classList.add('primary');
  }
  if (enqueueButton) {
    enqueueButton.hidden = true;
  }
  if (publishButton) {
    publishButton.hidden = true;
  }
  if (editorTitle) editorTitle.textContent = sourceStatus === '대기' ? '보관한 글감 수정' : '발행 계획 수정';
  syncBlogNextScheduleField();
  syncBlogNextTopicClearAction();
  setBlogNextTopicBusy(false);
  activateBlogNextInputMode('ai');
  moveBlogNextTopicFormToQueueEditor();
  blogNextEditingInitialSnapshot = snapshotBlogNextEditingPayload();
  syncBlogNextTopicActionAvailability();
  setBlogNextTopicResult('');
  document.getElementById('blog-next-subject')?.focus();
}

function setBlogNextQueueActionsBusy(busy) {
  document.querySelectorAll('#blog-next-queue-list button, #blog-next-saved-list button').forEach((button) => {
    if (busy) {
      if (Object.hasOwn(button.dataset, 'blogNextPreviouslyDisabled')) return;
      button.dataset.blogNextPreviouslyDisabled = button.disabled ? 'true' : 'false';
      button.disabled = true;
      return;
    }
    if (!Object.hasOwn(button.dataset, 'blogNextPreviouslyDisabled')) return;
    button.disabled = button.dataset.blogNextPreviouslyDisabled === 'true';
    delete button.dataset.blogNextPreviouslyDisabled;
  });
  const refreshButton = document.getElementById('blog-next-queue-refresh');
  if (!refreshButton) return;
  if (busy) {
    if (!Object.hasOwn(refreshButton.dataset, 'blogNextPreviouslyDisabled')) {
      refreshButton.dataset.blogNextPreviouslyDisabled = refreshButton.disabled ? 'true' : 'false';
    }
    refreshButton.disabled = true;
  } else if (Object.hasOwn(refreshButton.dataset, 'blogNextPreviouslyDisabled')) {
    refreshButton.disabled = refreshButton.dataset.blogNextPreviouslyDisabled === 'true';
    delete refreshButton.dataset.blogNextPreviouslyDisabled;
  }
}

function setBlogNextQueueOperationBusy(busy) {
  blogNextQueueOperationBusy = busy;
  setBlogNextQueueListsBusy(busy);
  setBlogNextQueueActionsBusy(busy);
}

function syncBlogNextQueueRunnerState(status = {}) {
  const state = String(status.state || 'idle');
  const serverRunning = document.querySelector('#blog-next-queue-list [data-blog-next-queue-server-running="true"]') !== null;
  const active = status.busy === true || state === 'selecting' || state === 'running' || serverRunning;
  const activeRowIndex = Number(status.rowIndex);
  const progressMessage = String(status.message || '').trim();
  document.querySelectorAll('#blog-next-queue-list .blog-next-queue-item').forEach((article) => {
    const rowIndex = Number(article.dataset.blogNextQueueRowIndex);
    const running = (active && Number.isInteger(activeRowIndex) && rowIndex === activeRowIndex)
      || article.dataset.blogNextQueueServerRunning === 'true';
    article.classList.toggle('is-running', running);
    article.setAttribute('aria-busy', running ? 'true' : 'false');
    const copy = article.querySelector('.blog-next-queue-copy');
    if (copy) {
      copy.disabled = active;
      copy.setAttribute('aria-disabled', active ? 'true' : 'false');
      copy.title = active ? '다른 글감을 처리하는 동안에는 수정할 수 없습니다.' : '';
    }
    const meta = article.querySelector('.blog-next-queue-meta');
    const runningStatus = article.querySelector('.blog-next-queue-running');
    if (meta) meta.hidden = running;
    if (runningStatus) runningStatus.hidden = !running;
    const runningText = article.querySelector('[data-blog-next-queue-running-text]');
    const planText = String(meta?.dataset.planText || '').trim();
    if (runningText) runningText.textContent = running
      ? `${planText ? `${planText} · ` : ''}처리 중${progressMessage ? ` · ${progressMessage}` : ''}`
      : '';
    article.querySelectorAll('.blog-next-queue-actions button').forEach((button) => {
      const defaultDisabled = button.dataset.blogNextQueueDefaultDisabled === 'true';
      if (!Object.hasOwn(button.dataset, 'blogNextQueueDefaultTitle')) {
        button.dataset.blogNextQueueDefaultTitle = button.title || '';
      }
      button.disabled = active || defaultDisabled;
      button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
      button.title = active
        ? '다른 글감을 처리하는 동안에는 사용할 수 없습니다.'
        : button.dataset.blogNextQueueDefaultTitle;
    });
  });
}

async function reorderBlogNextQueueItem(item = {}, direction) {
  if (isBlogNextQueueRunnerLocked()) {
    showBlogNextQueueRunnerLockedNotice();
    return;
  }
  if (blogNextQueueReordering) return;
  const rowIndex = Number(item.rowIndex);
  if (!Number.isInteger(rowIndex)) return;
  const previousQueue = {
    ...blogNextQueueState,
    items: [...blogNextQueueState.items],
    saved_items: [...blogNextQueueState.saved_items],
    status_summary: { ...blogNextQueueState.status_summary }
  };
  const sourcePosition = previousQueue.items.findIndex(candidate => Number(candidate.rowIndex) === rowIndex);
  const targetPosition = direction === 'up' ? sourcePosition - 1 : sourcePosition + 1;
  if (sourcePosition < 0 || targetPosition < 0 || targetPosition >= previousQueue.items.length) return;
  const optimisticItems = [...previousQueue.items];
  [optimisticItems[sourcePosition], optimisticItems[targetPosition]] = [
    optimisticItems[targetPosition],
    optimisticItems[sourcePosition]
  ];
  blogNextQueueReordering = true;
  renderBlogNextQueue({ ...previousQueue, items: optimisticItems });
  setBlogNextQueueOperationBusy(true);
  try {
    const queue = await postJson('/api/v1/continuous-publishing/queue/reorder', { rowIndex, direction });
    renderBlogNextQueue(queue);
  } catch (error) {
    renderBlogNextQueue(previousQueue);
    showUiToast({ level: 'error', title: '순서 변경 실패', message: error.message || '새로고침 후 다시 시도해 주세요.' });
    await loadBlogNextQueue({ force: true, showRefreshProgress: false });
  } finally {
    blogNextQueueReordering = false;
    setBlogNextQueueOperationBusy(false);
    if (typeof blogNextRunnerLastStatus !== 'undefined') syncBlogNextQueueRunnerState(blogNextRunnerLastStatus);
  }
}

async function deleteBlogNextSavedItem(item = {}, button) {
  const rowIndex = Number(item.rowIndex);
  if (!Number.isInteger(rowIndex)) return;
  const confirmed = await showUiConfirm('보관한 글감을 삭제할까요? 삭제한 글감은 복구할 수 없습니다.', {
    title: '보관한 글감 삭제', confirmText: '삭제', cancelText: '취소'
  });
  if (!confirmed) return;
  setBlogNextQueueOperationBusy(true);
  if (button) button.textContent = '삭제 중...';
  try {
    await postJson('/api/v1/continuous-publishing/topics/delete', { rowIndex });
    showUiToast({ level: 'success', title: '글감 삭제 완료', message: '보관한 글감을 삭제했습니다.' });
    await loadBlogNextQueue({ force: true, showRefreshProgress: false });
  } catch (error) {
    showUiToast({ level: 'error', title: '글감 삭제 실패', message: error.message || '잠시 후 다시 시도해 주세요.' });
  } finally {
    setBlogNextQueueOperationBusy(false);
    if (button?.isConnected) button.textContent = '삭제';
  }
}

async function removeBlogNextQueueItem(item = {}, button) {
  if (isBlogNextQueueRunnerLocked()) {
    showBlogNextQueueRunnerLockedNotice();
    return;
  }
  const rowIndex = Number(item.rowIndex);
  if (!Number.isInteger(rowIndex)) return;
  setBlogNextQueueOperationBusy(true);
  if (button) button.textContent = '이동 중...';
  try {
    await postJson('/api/v1/continuous-publishing/queue/remove', { rowIndex });
    showUiToast({ level: 'success', title: '보관으로 이동 완료', message: '글감을 보관한 글감으로 옮겼습니다.' });
    await loadBlogNextQueue({ force: true, showRefreshProgress: false });
  } catch (error) {
    showUiToast({ level: 'error', title: '대기열 변경 실패', message: error.message || '잠시 후 다시 시도해 주세요.' });
  } finally {
    setBlogNextQueueOperationBusy(false);
    if (button?.isConnected) button.textContent = '보관으로 이동';
  }
}

async function addBlogNextSavedItemToQueue(item = {}, button) {
  if (isBlogNextQueueRunnerLocked()) {
    showBlogNextQueueRunnerLockedNotice();
    return;
  }
  const rowIndex = Number(item.rowIndex);
  if (!Number.isInteger(rowIndex)) return;
  setBlogNextQueueOperationBusy(true);
  if (button) button.textContent = '이동 중...';
  try {
    await postJson('/api/v1/continuous-publishing/queue/add', { rowIndex });
    showUiToast({ level: 'success', title: '대기열로 이동 완료', message: '글감을 발행 대기열로 옮겼습니다.' });
    await loadBlogNextQueue({ force: true, showRefreshProgress: false });
  } catch (error) {
    showUiToast({ level: 'error', title: '대기열로 이동 실패', message: error.message || '잠시 후 다시 시도해 주세요.' });
  } finally {
    setBlogNextQueueOperationBusy(false);
    if (button?.isConnected) button.textContent = '대기열로 이동';
  }
}

async function runBlogNextQueueItemNow(item = {}, button) {
  if (isBlogNextQueueRunnerLocked()) {
    showBlogNextQueueRunnerLockedNotice();
    return;
  }
  const rowIndex = Number(item.rowIndex);
  if (!Number.isInteger(rowIndex)) return;
  const actionCopy = getBlogNextQueueRunActionCopy(item);
  const platforms = formatBlogPlatformList(item.options?.platforms) || '포스팅 대상 확인 필요';
  const postStatus = formatBlogNextPostStatus(item);
  const confirmed = await showUiConfirm(`${platforms} · ${postStatus}\n${actionCopy.question}`, {
    title: actionCopy.confirmTitle, confirmText: actionCopy.confirmText, cancelText: '취소'
  });
  if (!confirmed) return;
  setBlogNextQueueOperationBusy(true);
  if (button) button.textContent = actionCopy.busyLabel;
  let accepted = false;
  try {
    await startBlogNextRunner({ rowIndex, platforms: item.options?.platforms });
    accepted = true;
  } catch (_error) {
    // Runner가 공통 실패 상태와 안내를 표시한다.
  } finally {
    setBlogNextQueueOperationBusy(false);
    if (!accepted && button?.isConnected) button.textContent = actionCopy.label;
    if (typeof blogNextRunnerLastStatus !== 'undefined') syncBlogNextQueueRunnerState(blogNextRunnerLastStatus);
  }
}

async function refreshBlogNextQueue() {
  if (blogNextQueueOperationBusy) return;
  setBlogNextQueueOperationBusy(true);
  try {
    await loadBlogNextQueue({ force: true });
  } finally {
    setBlogNextQueueOperationBusy(false);
    if (typeof blogNextRunnerLastStatus !== 'undefined') syncBlogNextQueueRunnerState(blogNextRunnerLastStatus);
  }
}

function formatBlogNextQueueEstimate(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function renderBlogNextQueue(data = {}) {
  const readyList = document.getElementById('blog-next-queue-list');
  const savedList = document.getElementById('blog-next-saved-list');
  const readyCount = document.getElementById('blog-next-queue-count');
  const savedCount = document.getElementById('blog-next-saved-count');
  if (!readyList || !savedList || !readyCount || !savedCount) return;
  const readyItems = Array.isArray(data.items) ? data.items : [];
  const savedItems = Array.isArray(data.saved_items) ? data.saved_items : [];
  const summary = data.status_summary || {};
  blogNextQueueState = {
    ...data,
    items: readyItems,
    saved_items: savedItems,
    status_summary: summary
  };
  blogNextQueueHasLoaded = true;
  readyCount.textContent = `${Number(summary.ready ?? data.total ?? readyItems.length) + Number(summary.running || 0)}건`;
  savedCount.textContent = `${Number(summary.saved ?? savedItems.length)}건`;
  readyList.dataset.state = readyItems.length > 0 ? 'results' : 'empty';
  savedList.dataset.state = savedItems.length > 0 ? 'results' : 'empty';
  readyList.setAttribute('aria-busy', 'false');
  savedList.setAttribute('aria-busy', 'false');
  readyList.replaceChildren();
  savedList.replaceChildren();
  if (savedItems.length === 0) renderBlogNextEmptyState(savedList, '보관한 글감이 없습니다.', '빠른 글 작성에서 떠오른 아이디어를 먼저 보관해 보세요.');
  else savedItems.forEach((item, index) => savedList.appendChild(createBlogNextListItem(item, index, true)));
  if (readyItems.length === 0) renderBlogNextEmptyState(readyList, '아직 준비된 글감이 없습니다.', '발행 계획을 완성해 대기열에 추가해 보세요.');
  else readyItems.forEach((item, index) => readyList.appendChild(createBlogNextListItem({
    ...item,
    queueSize: readyItems.length
  }, index, false)));
  if (typeof blogNextRunnerLastStatus !== 'undefined') syncBlogNextQueueRunnerState(blogNextRunnerLastStatus);
  if (blogNextQueueOperationBusy) {
    setBlogNextQueueListsBusy(true);
    setBlogNextQueueActionsBusy(true);
  }
  if (typeof scheduleGlobalPublishingStatusRefresh === 'function') scheduleGlobalPublishingStatusRefresh(50);
}

async function loadBlogNextQueue(options = {}) {
  if (blogNextQueueLoading && options.force !== true) return;
  blogNextQueueLoading = true;
  const refreshButton = document.getElementById('blog-next-queue-refresh');
  const showRefreshProgress = options.showRefreshProgress !== false;
  setBlogNextManagementStatus('idle');
  setBlogNextQueueListsBusy(true);
  if (refreshButton) {
    refreshButton.disabled = true;
    if (showRefreshProgress) {
      refreshButton.textContent = '불러오는 중...';
      refreshButton.setAttribute('aria-busy', 'true');
    }
  }
  try {
    renderBlogNextQueue(await fetchJson('/api/v1/continuous-publishing/queue?limit=50'));
    setBlogNextManagementStatus('ready');
  } catch (error) {
    const message = error.message || '발행 대기열을 불러오지 못했습니다.';
    if (blogNextQueueHasLoaded) {
      setBlogNextManagementStatus('error', `${message} 기존 목록은 그대로 유지했습니다.`);
    } else {
      setBlogNextManagementStatus('idle');
      renderBlogNextQueueInitialError('새로고침으로 다시 시도해 주세요.');
    }
  } finally {
    blogNextQueueLoading = false;
    setBlogNextQueueListsBusy(false);
    if (refreshButton) {
      refreshButton.disabled = blogNextQueueOperationBusy;
      refreshButton.textContent = '새로고침';
      refreshButton.setAttribute('aria-busy', 'false');
    }
  }
}

function initBlogNextQuickQueue() {
  const form = document.getElementById('blog-next-topic-form');
  if (!form || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';
  initBlogNextHelpPlacement(form);
  applyBlogNextTopicSettings(loadBlogNextTopicDefaults());
  void loadBlogNextWritingDefaults();
  if (typeof syncPlatformUiState === 'function') {
    syncPlatformUiState('naver', typeof uiNaverReady === 'undefined' || uiNaverReady === true);
    syncPlatformUiState('wordpress', typeof uiWpReady === 'undefined' || uiWpReady === true);
  }
  activateBlogNextManagementTab(blogNextActiveManagementTab);
  form.addEventListener('submit', (event) => { event.preventDefault(); submitBlogNextTopic('enqueue'); });
  document.getElementById('blog-next-save-topic')?.addEventListener('click', () => submitBlogNextTopic('save'));
  document.getElementById('blog-next-publish-now')?.addEventListener('click', async () => {
    const confirmed = await showUiConfirm('현재 발행 계획으로 이 글을 바로 처리할까요?', {
      title: '바로 포스팅', confirmText: '실행', cancelText: '취소'
    });
    if (confirmed) submitBlogNextTopic('publish-now');
  });
  document.getElementById('blog-next-clear-topic')?.addEventListener('click', async () => {
    const snapshot = captureBlogNextClearableContent();
    blogNextClearedTopicSnapshot = hasBlogNextClearableContent(snapshot) ? snapshot : null;
    clearBlogNextTopicContent({ preserveUndo: true });
    setBlogNextClearUndoAvailable(Boolean(blogNextClearedTopicSnapshot));
    setBlogNextTopicResult('');
    document.getElementById('blog-next-clear-undo')?.focus();
  });
  document.getElementById('blog-next-cancel-edit')?.addEventListener('click', () => closeBlogNextEditor());
  document.getElementById('blog-next-clear-undo')?.addEventListener('click', restoreBlogNextClearedTopicContent);
  document.getElementById('blog-next-post-status')?.addEventListener('change', syncBlogNextScheduleField);
  document.getElementById('blog-next-writing-settings-open')?.addEventListener('click', async () => {
    await closeBlogNextEditor();
    if (blogNextEditingRowIndex !== null) return;
    await navigateTo('settings-next', 'writing');
  });
  form.addEventListener('change', (event) => {
    if (['blog-next-target-naver', 'blog-next-target-wordpress'].includes(event.target?.id)) {
      syncBlogNextProviderDependentFields();
    }
    syncBlogNextQuickFlowSummaries();
    syncBlogNextTopicActionAvailability();
  });
  form.addEventListener('input', (event) => {
    syncBlogNextQuickFlowSummaries();
    if (blogNextClearedTopicSnapshot && event.target?.id !== 'blog-next-clear-undo') {
      setBlogNextClearUndoAvailable(false);
    }
    syncBlogNextTopicClearAction();
  });
  syncBlogNextQuickFlowSummaries();
  syncBlogNextTopicClearAction();
  document.getElementById('blog-next-queue-refresh')?.addEventListener('click', refreshBlogNextQueue);
  document.querySelectorAll('[data-blog-next-management-tab]').forEach((button) => {
    button.addEventListener('click', () => { void requestActivateBlogNextManagementTab(button.dataset.blogNextManagementTab); });
    button.addEventListener('keydown', (event) => void handleUiTabNavigationKeydown(event, { selector: '[data-blog-next-management-tab]', dataKey: 'blogNextManagementTab', activate: requestActivateBlogNextManagementTab }));
  });
  document.getElementById('blog-next-editor-close')?.addEventListener('click', () => closeBlogNextEditor());
  document.getElementById('blog-next-editor-modal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeBlogNextEditor();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && blogNextEditingRowIndex !== null) closeBlogNextEditor();
    if (event.key === 'Escape' && event.target?.matches?.('.blog-next-help-trigger')) event.target.blur();
  });
  document.getElementById('blog-next-topic-recommend')?.addEventListener('click', () => {
    setQuickDiscoveryInputTarget('blogNext');
    const query = document.getElementById('quick-topic-recommendations-query');
    if (query) query.value = document.getElementById('blog-next-subject')?.value || '';
    setQuickDiscoveryTab('topic'); setQuickDiscoveryModalOpen(true);
  });
  document.getElementById('blog-next-keyword-recommend')?.addEventListener('click', () => {
    setQuickDiscoveryInputTarget('blogNext');
    const query = document.getElementById('quick-keyword-discovery-query');
    if (query) query.value = document.getElementById('blog-next-keywords')?.value || '';
    syncQuickKeywordDiscoveryControls(); setQuickDiscoveryTab('keyword'); setQuickDiscoveryModalOpen(true);
  });
  syncBlogNextScheduleField();
}
