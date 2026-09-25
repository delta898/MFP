// Blog Beta queue editing, execution controls, and queue management.
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
  const singlePlatform = platforms.length === 1 ? platforms[0] : '';
  document.getElementById('blog-next-subject').value = item.subject || '';
  document.getElementById('blog-next-title').value = item.title || item.options?.title || '';
  document.getElementById('blog-next-keywords').value = Array.isArray(item.keywords) ? item.keywords.join(', ') : item.keywordsRaw || '';
  document.getElementById('blog-next-instruction').value = item.content_guide?.additional_instructions || '';
  document.getElementById('blog-next-reference-url').value = Array.isArray(item.content_guide?.reference_urls) ? item.content_guide.reference_urls.join(', ') : '';
  document.getElementById('blog-next-target-naver').checked = singlePlatform === 'naver';
  document.getElementById('blog-next-target-wordpress').checked = singlePlatform === 'wordpress';
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
  setBlogNextTopicResult(platforms.length > 1
    ? '기존 글감에 발행 대상이 여러 개 저장되어 있습니다. 하나를 선택한 뒤 저장해 주세요.'
    : '', platforms.length > 1 ? 'error' : '');
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
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const publishSettings = document.getElementById('blog-next-publish-settings');
    if (blogNextEditingRowIndex === null && publishSettings?.hidden) {
      publishSettings.hidden = false;
      publishSettings.open = true;
      document.getElementById('blog-next-enqueue-topic')?.setAttribute('aria-expanded', 'true');
      setBlogNextTopicResult('발행 계획을 확인한 뒤 발행 대기열에 추가해 주세요.', 'editing');
      publishSettings.querySelector('summary')?.focus();
      return;
    }
    submitBlogNextTopic('enqueue');
  });
  document.getElementById('blog-next-save-topic')?.addEventListener('click', () => submitBlogNextTopic('save'));
  ['blog-next-publish-now', 'blog-next-regenerate-draft'].forEach((id) =>
    document.getElementById(id)?.addEventListener('click', () => generateBlogNextAiDraft(id === 'blog-next-regenerate-draft' ? 'regenerate' : 'create')));
  document.querySelectorAll('[data-blog-next-execution-stop]').forEach((button) => button.addEventListener('click', () => {
    handleBlogNextExecutionStopClick();
  }));
  document.querySelectorAll('[data-blog-next-execution-continue]').forEach((button) => button.addEventListener('click', continueBlogNextExecution));
  document.getElementById('blog-next-cancel-edit')?.addEventListener('click', () => closeBlogNextEditor());
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
    rememberBlogNextTopicDefaultsForSetting(event.target?.id);
    syncBlogNextQuickFlowSummaries();
    syncBlogNextTopicActionAvailability();
    markBlogNextAiDraftSourceChanged(event.target?.id || '');
  });
  form.addEventListener('input', (event) => {
    syncBlogNextQuickFlowSummaries();
    syncBlogNextTopicClearAction();
    markBlogNextAiDraftSourceChanged(event.target?.id || '');
  });
  bindBlogNextDetachedPublishSettings(form);
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
  if (typeof arrangeBlogNextAiWorkflow === 'function') arrangeBlogNextAiWorkflow();
}
