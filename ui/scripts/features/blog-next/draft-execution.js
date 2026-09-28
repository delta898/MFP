function getBlogNextDraftPublishCopy(postStatus = 'publish') {
  if (postStatus === 'draft') {
    return {
      buttonLabel: '블로그에 임시 저장',
      actionLabel: '임시 저장',
      busyLabel: '임시 저장 중...',
      completionLabel: '임시 저장했습니다.'
    };
  }
  if (postStatus === 'schedule') {
    return {
      buttonLabel: '예약 발행',
      actionLabel: '예약 발행',
      busyLabel: '예약 등록 중...',
      completionLabel: '예약 발행을 등록했습니다.'
    };
  }
  return {
    buttonLabel: '즉시 발행',
    actionLabel: '즉시 발행',
    busyLabel: '발행 중...',
    completionLabel: '발행했습니다.'
  };
}

function isBlogNextDraftPublishCompleted(type) {
  const state = blogNextDraftState[type];
  const target = readBlogNextDraftSettings(type).targets[0];
  return Boolean(target && state?.preview?.publishedTargets?.includes(target));
}

function isBlogNextDraftResultPublished(type) {
  return Array.isArray(blogNextDraftState[type]?.preview?.publishedTargets)
    && blogNextDraftState[type].preview.publishedTargets.length > 0;
}

function syncBlogNextDraftOperationControls() {
  const busy = Boolean(blogNextTopicSubmitting || BLOG_NEXT_DRAFT_TYPES.some((type) => {
    const state = blogNextDraftState[type];
    return state.publishing || state.generating || state.imageWorking;
  }) || (typeof blogNextRunnerActive !== 'undefined' && blogNextRunnerActive)
    || (typeof blogNextRunnerRequesting !== 'undefined' && blogNextRunnerRequesting));
  const controls = document.querySelectorAll('#blog-next-topic-form input, #blog-next-topic-form select, '
    + '#blog-next-topic-form textarea, #blog-next-topic-form button:not([data-blog-next-draft-publish]):not(#blog-next-publish-now):not(#blog-next-regenerate-draft), '
    + '[data-blog-next-mode-panel] input, [data-blog-next-mode-panel] select, '
    + '[data-blog-next-mode-panel] textarea, [data-blog-next-mode-panel] button:not([data-blog-next-draft-publish]):not(#blog-next-publish-now):not(#blog-next-regenerate-draft), '
    + '[data-blog-next-input-mode], #blog-next-publish-settings input, #blog-next-publish-settings select');
  controls.forEach((control) => {
    if (busy) {
      const ownerType = control.closest('[data-blog-next-mode-panel]')?.dataset.blogNextModePanel;
      const imageOperation = ownerType ? blogNextDraftState[ownerType]?.imageOperation : null;
      const imageStopControl = imageOperation && (
        (control.matches('[data-manuscript-generate-missing]') && imageOperation.action === 'generate-missing')
        || (control.matches('[data-manuscript-image-action="generate"]')
          && imageOperation.action === 'generate' && control.dataset.slotId === imageOperation.slotId)
      );
      if (imageStopControl) {
        control.disabled = imageOperation.state === 'cancel_requested';
        return;
      }
      if (control.matches('[data-manuscript-image-continue]') && imageOperation?.confirmingStop === true) {
        control.disabled = false;
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(control.dataset, 'beforeExecutionDisabled')) {
        control.dataset.beforeExecutionDisabled = String(control.disabled);
      }
      control.disabled = true;
    } else if (Object.prototype.hasOwnProperty.call(control.dataset, 'beforeExecutionDisabled')) {
      control.disabled = control.dataset.beforeExecutionDisabled === 'true';
      delete control.dataset.beforeExecutionDisabled;
    }
  });
}

function syncBlogNextPublishMutationControls() {
  syncBlogNextDraftOperationControls();
}

async function prepareBlogNextNewWriting() {
  const busy = Boolean(blogNextAiOperationId || blogNextTopicSubmitting
    || BLOG_NEXT_DRAFT_TYPES.some((type) => blogNextDraftState[type].publishing
      || blogNextDraftState[type].generating || blogNextDraftState[type].imageWorking));
  if (busy) return false;
  const ai = blogNextDraftState.ai;
  const hasCurrentWork = hasBlogNextClearableContent(captureBlogNextClearableContent())
    || Boolean(ai.draftId) || blogNextEditingRowIndex !== null;
  if (hasCurrentWork) {
    const completed = isBlogNextDraftResultPublished('ai');
    const confirmed = await showUiConfirm(completed
      ? '현재 원고를 닫고 다음 글을 작성할까요? 블로그에 저장된 글은 그대로 유지됩니다.'
      : '작성 중인 내용과 원고 미리보기를 지우고 새 글을 작성할까요?', {
      title: '다음 글 작성', confirmText: '새 글 작성', cancelText: '계속 보기'
    });
    if (!confirmed) return false;
  }
  if (blogNextEditingRowIndex !== null) await closeBlogNextEditor({ force: true });
  clearBlogNextTopicContent();
  resetBlogNextAiDraftUi();
  setBlogNextTopicResult('');
  if (typeof dismissBlogNextStatusForNewWriting === 'function') dismissBlogNextStatusForNewWriting();
  syncBlogNextDraftExecutionState();
  return true;
}

function formatBlogNextDraftScheduleDate(value) {
  const parts = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!parts) return '';
  return `${Number(parts[1])}년 ${Number(parts[2])}월 ${Number(parts[3])}일 ${parts[4]}:${parts[5]}`;
}

function buildBlogNextDraftPublishConfirmation(settings, targetLabel) {
  let question;
  if (settings.postStatus === 'draft') {
    question = `${targetLabel}에 임시 저장할까요?`;
  } else if (settings.postStatus === 'schedule') {
    const scheduleAt = formatBlogNextDraftScheduleDate(settings.scheduleDate);
    question = `${targetLabel}에 ${scheduleAt ? `${scheduleAt}에 ` : ''}예약 발행할까요?`;
  } else {
    question = `${targetLabel}에 지금 발행할까요?`;
  }
  return question;
}

function syncBlogNextDraftExecutionState(runnerActive) {
  const anotherRunnerActive = typeof runnerActive === 'boolean'
    ? runnerActive
    : ((typeof blogNextRunnerActive !== 'undefined' && blogNextRunnerActive)
      || (typeof blogNextRunnerRequesting !== 'undefined' && blogNextRunnerRequesting));
  const manuscriptActive = BLOG_NEXT_DRAFT_TYPES.some(type => blogNextDraftState[type].publishing
    || blogNextDraftState[type].imageWorking || blogNextDraftState[type].generating);
  const executionActive = anotherRunnerActive || manuscriptActive;
  const activeType = BLOG_NEXT_DRAFT_TYPES.includes(blogNextActiveInputMode) ? blogNextActiveInputMode : 'ai';
  const activeSettings = readBlogNextDraftSettings(activeType);
  const publishCapability = typeof getUiPublishCapability === 'function'
    ? getUiPublishCapability(activeSettings.targets)
    : 'publish.any';
  const publishBlocked = typeof isUiCapabilityUnavailable === 'function'
    && isUiCapabilityUnavailable(publishCapability);
  BLOG_NEXT_DRAFT_TYPES.forEach((type) => {
    const state = blogNextDraftState[type];
    const button = document.querySelector(`[data-blog-next-draft-publish="${type}"]`);
    if (!button) return;
    const completed = isBlogNextDraftPublishCompleted(type);
    button.disabled = completed || executionActive || publishBlocked || state.previewSyncFailed || !state.preview?.validation?.ok;
    button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
    const selectedStatus = readBlogNextDraftSettings(type).postStatus;
    const publishCopy = getBlogNextDraftPublishCopy(selectedStatus);
    button.textContent = completed
      ? `${readBlogNextDraftSettings(type).targets[0] === 'wordpress' ? '워드프레스' : '네이버'} 처리 완료`
      : state.publishing
      ? publishCopy.busyLabel
      : state.imageWorking ? '이미지 작업 중...'
      : executionActive ? '다른 작업 실행 중...'
      : publishCopy.buttonLabel;
  });
  syncBlogNextPublishMutationControls();
  syncBlogNextPublishReadinessNotice(publishCapability);
}

function syncBlogNextPublishReadinessNotice(capability) {
  const activeType = BLOG_NEXT_DRAFT_TYPES.includes(blogNextActiveInputMode) ? blogNextActiveInputMode : 'ai';
  const blocked = typeof isUiCapabilityUnavailable === 'function'
    && isUiCapabilityUnavailable(capability);
  document.querySelectorAll('[data-blog-next-publish-readiness]').forEach((notice) => {
    const type = notice.dataset.blogNextPublishReadiness;
    notice.hidden = !blocked || type !== activeType;
    const message = notice.querySelector('[data-blog-next-publish-readiness-message]');
    if (message && typeof getUiCapabilityMessage === 'function') {
      message.textContent = getUiCapabilityMessage(capability);
    }
    const settingsBtn = notice.querySelector('[data-blog-next-publish-settings-btn]');
    if (settingsBtn) {
      settingsBtn.dataset.capability = capability;
      if (!settingsBtn.dataset.bound) {
        settingsBtn.dataset.bound = 'true';
        settingsBtn.addEventListener('click', () => {
          if (typeof goToUiCapabilitySettings === 'function') {
            void goToUiCapabilitySettings(settingsBtn.dataset.capability || 'publish.any');
          }
        });
      }
    }
  });
}

const BLOG_NEXT_AI_OPERATION_STORAGE_KEY = 'blog-next-ai-generation-operation';
let blogNextAiOperationId = '';
let blogNextAiOperationToken = 0;
let blogNextAiPollTimer = null;
let blogNextAiCancelRequesting = false;
let blogNextAiOperationStatus = null;

function setBlogNextAiGenerating(generating) {
  const state = blogNextDraftState.ai;
  state.generating = generating;
  const createButton = document.getElementById('blog-next-publish-now');
  const regenerateButton = document.getElementById('blog-next-regenerate-draft');
  [createButton, regenerateButton].filter(Boolean).forEach((button) => {
    button.disabled = generating;
    button.setAttribute('aria-busy', generating ? 'true' : 'false');
  });
  if (createButton) createButton.textContent = generating ? '원고 만드는 중...' : '원고 만들기';
  if (regenerateButton) regenerateButton.textContent = generating ? '다시 만드는 중...' : '원고 다시 만들기';
  if (typeof syncBlogNextExecutionStopButton === 'function') syncBlogNextExecutionStopButton();
  if (typeof syncBlogNextTopicActionAvailability === 'function') syncBlogNextTopicActionAvailability();
  syncBlogNextDraftExecutionState();
}

function saveBlogNextAiOperationId(operationId) {
  blogNextAiOperationId = String(operationId || '').trim();
  try {
    if (blogNextAiOperationId) sessionStorage.setItem(BLOG_NEXT_AI_OPERATION_STORAGE_KEY, blogNextAiOperationId);
    else sessionStorage.removeItem(BLOG_NEXT_AI_OPERATION_STORAGE_KEY);
  } catch (_) { /* Session storage may be unavailable. */ }
}

async function fetchBlogNextAiOperationStatus(url) {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await readJsonResponseSafely(response);
  if (response.status === 404) return null;
  if (!response.ok || !body.success) {
    const error = new Error(body?.error?.message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body.data;
}

function blogNextAiOperationMessage(status) {
  if (status.state === 'cancel_requested') return '중지 요청을 처리하고 있습니다.';
  if (status.state === 'canceled') return '원고 생성을 중지했습니다.';
  if (status.state === 'failed') return status.error?.message || '원고를 만들지 못했습니다.';
  if (status.state === 'completed') return '원고와 미리보기를 준비했습니다.';
  if (status.stage === 'images') return '이미지를 준비하고 있습니다.';
  if (status.stage === 'finalizing') return '원고 미리보기를 마무리하고 있습니다.';
  return 'AI가 원고를 만들고 있습니다.';
}

function clearBlogNextAiOperation() {
  clearTimeout(blogNextAiPollTimer);
  blogNextAiPollTimer = null;
  blogNextAiOperationToken += 1;
  saveBlogNextAiOperationId('');
  blogNextAiCancelRequesting = false;
  blogNextAiOperationStatus = null;
  setBlogNextAiGenerating(false);
}

function applyBlogNextAiOperationStatus(status, token) {
  if (!status || token !== blogNextAiOperationToken || status.operationId !== blogNextAiOperationId) return;
  blogNextAiOperationStatus = status;
  const missingResult = status.state === 'completed' && !status.result?.draftId;
  const message = missingResult
    ? 'AI 원고 결과를 불러오지 못했습니다. 기존 원고는 유지했습니다.'
    : blogNextAiOperationMessage(status);
  if (typeof renderBlogNextRunnerStatus === 'function') {
    renderBlogNextRunnerStatus({
      state: missingResult ? 'failed' : status.state, busy: status.busy, source: 'manuscript_generation',
      progressStage: status.stage, subject: status.subject, message,
      finishedAt: status.finishedAt, remoteJobPossible: status.remoteJobPossible === true
    });
  }
  if (status.busy) {
    setBlogNextAiGenerating(true);
    return;
  }
  const state = blogNextDraftState.ai;
  if (status.state === 'completed' && status.result?.draftId) {
    const preview = status.result;
    state.draftId = preview.draftId;
    state.revision = preview.revision;
    state.previewSyncFailed = false;
    state.workspaceMode = 'block';
    state.syncedPreviewKey = '';
    const markdown = document.getElementById('blog-next-ai-markdown');
    const editor = document.getElementById('blog-next-ai-editor');
    const manuscript = String(preview.rawMarkdown || '');
    if (markdown) markdown.value = manuscript;
    state.editor?.setMarkdown(manuscript);
    if (editor && markdown) setBlogNextAiWorkspaceMode('block', state, editor, markdown);
    renderBlogNextDraftPreview('ai', preview);
    state.syncedPreviewKey = getBlogNextAiSyncKey();
    const actions = document.querySelector('[data-blog-next-draft-actions="ai"]');
    if (actions) actions.hidden = false;
    arrangeBlogNextAiWorkflow();
  }
  clearBlogNextAiOperation();
}

function scheduleBlogNextAiOperationPoll(token, delayMs = 800) {
  clearTimeout(blogNextAiPollTimer);
  blogNextAiPollTimer = setTimeout(async () => {
    const operationId = blogNextAiOperationId;
    if (!operationId || token !== blogNextAiOperationToken) return;
    try {
      const status = await fetchBlogNextAiOperationStatus(`/api/v1/blog/manuscript-drafts/ai/operations/${encodeURIComponent(operationId)}`);
      if (!status) {
        if (typeof renderBlogNextRunnerStatus === 'function') {
          renderBlogNextRunnerStatus({
            state: 'failed', busy: false, source: 'manuscript_generation',
            message: '진행 중이던 생성 작업을 찾지 못했습니다. 다시 시도해 주세요.',
            finishedAt: new Date().toISOString()
          });
        }
        clearBlogNextAiOperation();
        return;
      }
      applyBlogNextAiOperationStatus(status, token);
      if (token === blogNextAiOperationToken && blogNextAiOperationId) scheduleBlogNextAiOperationPoll(token);
    } catch (error) {
      if (token !== blogNextAiOperationToken) return;
      scheduleBlogNextAiOperationPoll(token, 2000);
    }
  }, delayMs);
}

async function cancelBlogNextAiDraftGeneration() {
  if (!blogNextAiOperationId || blogNextAiCancelRequesting || blogNextAiOperationStatus?.canCancel !== true) return;
  blogNextAiCancelRequesting = true;
  setBlogNextAiGenerating(true);
  const operationId = blogNextAiOperationId;
  const token = blogNextAiOperationToken;
  try {
    const status = await postJson(`/api/v1/blog/manuscript-drafts/ai/operations/${encodeURIComponent(operationId)}/cancel`);
    if (token === blogNextAiOperationToken) applyBlogNextAiOperationStatus(status, token);
  } catch (error) {
    if (token === blogNextAiOperationToken && typeof renderBlogNextRunnerStatus === 'function') {
      renderBlogNextRunnerStatus({
        state: 'running', busy: true, source: 'manuscript_generation',
        subject: blogNextAiOperationStatus?.subject || '',
        message: `${error.message || '중지 요청을 보내지 못했습니다.'} 생성은 계속되고 있습니다.`,
        remoteJobPossible: blogNextAiOperationStatus?.remoteJobPossible === true
      });
    }
  } finally {
    blogNextAiCancelRequesting = false;
    if (token === blogNextAiOperationToken) setBlogNextAiGenerating(true);
  }
}

async function restoreBlogNextAiDraftGeneration() {
  if (blogNextAiOperationId || blogNextDraftState.ai.generating) return;
  let storedId = '';
  try { storedId = sessionStorage.getItem(BLOG_NEXT_AI_OPERATION_STORAGE_KEY) || ''; } catch (_) { }
  let status = null;
  if (storedId) {
    try { status = await fetchBlogNextAiOperationStatus(`/api/v1/blog/manuscript-drafts/ai/operations/${encodeURIComponent(storedId)}`); }
    catch (_) { saveBlogNextAiOperationId(''); }
    if (!status) saveBlogNextAiOperationId('');
  }
  if (!status) {
    try { status = await fetchBlogNextAiOperationStatus('/api/v1/blog/manuscript-drafts/ai/operations/current'); }
    catch (_) { return; }
  }
  if (!status?.operationId || blogNextAiOperationId || blogNextDraftState.ai.generating) return;
  saveBlogNextAiOperationId(status.operationId);
  const token = ++blogNextAiOperationToken;
  applyBlogNextAiOperationStatus(status, token);
  if (blogNextAiOperationId) scheduleBlogNextAiOperationPoll(token);
}

function arrangeBlogNextAiWorkflow(options = {}) {
  const form = document.getElementById('blog-next-topic-form');
  const disclosures = form?.querySelector('.blog-next-disclosures');
  const publishSettings = document.getElementById('blog-next-publish-settings');
  const publishTitle = document.getElementById('blog-next-publish-settings-title');
  const previewStep = document.querySelector('[data-blog-next-ai-step="preview"]');
  const publishStep = document.querySelector('[data-blog-next-ai-step="publish"]');
  const save = document.getElementById('blog-next-save-topic');
  const enqueue = document.getElementById('blog-next-enqueue-topic');
  const prepareActions = document.querySelector('.blog-next-ai-prepare-actions');
  const ideaActions = document.querySelector('[data-blog-next-ai-idea-actions]');
  const previewActions = document.querySelector('[data-blog-next-ai-preview-actions]');
  const hint = document.getElementById('blog-next-queue-action-hint');
  const hasDraft = Boolean(blogNextDraftState.ai.draftId);
  const editing = options.editing === true;

  if (editing || !hasDraft) {
    const queueSlot = document.querySelector('[data-blog-next-publish-settings-slot="ai-queue"]');
    if (queueSlot && publishSettings) queueSlot.appendChild(publishSettings);
    if (typeof setBlogNextPublishSettingsContext === 'function') {
      setBlogNextPublishSettingsContext('ai', editing ? '발행 계획' : '발행 대기열 설정');
    } else if (publishTitle) publishTitle.textContent = editing ? '발행 계획' : '발행 대기열 설정';
  } else if (publishSettings) {
    const publishSlot = document.querySelector('[data-blog-next-publish-settings-slot="ai-publish"]');
    if (publishSlot) publishSlot.appendChild(publishSettings);
    if (typeof setBlogNextPublishSettingsContext === 'function') setBlogNextPublishSettingsContext('ai');
    else if (publishTitle) publishTitle.textContent = '발행 설정';
  }

  if (previewStep) previewStep.hidden = editing || !hasDraft;
  if (publishStep) publishStep.hidden = editing || !hasDraft;
  if (publishSettings) publishSettings.hidden = !editing && !hasDraft;
  if (prepareActions) prepareActions.hidden = !editing && hasDraft;
  if (ideaActions) ideaActions.hidden = !editing && hasDraft;
  if (previewActions) previewActions.hidden = editing || !hasDraft;
  if (!editing) {
    if (save) save.hidden = hasDraft;
    if (enqueue) {
      enqueue.hidden = hasDraft;
      enqueue.setAttribute('aria-expanded', 'false');
    }
    if (hint) hint.hidden = hasDraft;
  }
}

function resetBlogNextAiDraftUi() {
  const state = blogNextDraftState.ai;
  state.preview = null;
  state.draftId = '';
  state.revision = 0;
  state.imageOperation = null;
  state.imageOperationNotice = null;
  state.previewSyncFailed = false;
  state.workspaceMode = 'block';
  state.syncedPreviewKey = '';
  const markdown = document.getElementById('blog-next-ai-markdown');
  const editorRoot = document.getElementById('blog-next-ai-editor');
  if (markdown) markdown.value = '';
  state.editor?.setMarkdown('');
  if (editorRoot && markdown) setBlogNextAiWorkspaceMode('block', state, editorRoot, markdown);
  const preview = document.querySelector('[data-blog-next-draft-preview="ai"]');
  const actions = document.querySelector('[data-blog-next-draft-actions="ai"]');
  if (preview) preview.hidden = true;
  if (actions) actions.hidden = true;
  setBlogNextDraftValidation('ai');
  arrangeBlogNextAiWorkflow();
}

async function generateBlogNextAiDraft(origin = 'create') {
  const state = blogNextDraftState.ai;
  if (state.generating || state.publishing || state.imageWorking || blogNextAiOperationId) return;
  const validity = readBlogNextTopicActionValidity();
  if (!validity.ideaValid) return;
  setBlogNextTopicResult('');
  setBlogNextDraftValidation('ai');
  if (typeof ensureUiCapabilityReady === 'function') {
    const aiReady = await ensureUiCapabilityReady('ai.text');
    if (!aiReady) {
      if (typeof syncBlogNextTopicActionAvailability === 'function') syncBlogNextTopicActionAvailability();
      setBlogNextTopicResult('원고를 만들려면 AI 글쓰기 모델을 먼저 설정해 주세요.', 'error');
      document.getElementById('blog-next-ai-settings-btn')?.focus();
      return;
    }
    if (document.getElementById('blog-next-image-mode')?.value === 'generate'
      && !await ensureUiCapabilityReady('ai.image')) {
      if (typeof syncBlogNextTopicActionAvailability === 'function') syncBlogNextTopicActionAvailability();
      setBlogNextTopicResult('이미지를 생성하려면 AI 이미지 모델을 먼저 설정해 주세요.', 'error');
      document.getElementById('blog-next-ai-image-settings-btn')?.focus();
      return;
    }
  } else if (typeof guardUiConfigReady === 'function' && !guardUiConfigReady('AI 원고 생성')) return;
  setBlogNextAiGenerating(true);
  const returnTarget = origin === 'regenerate'
    ? document.querySelector('[data-blog-next-ai-preview-actions]')
    : document.querySelector('[data-blog-next-ai-generate-action]');
  const returnFallback = document.querySelector('[data-blog-next-ai-step="preview"]');
  if (typeof renderBlogNextRunnerStatus === 'function') {
    renderBlogNextRunnerStatus({
      state: 'running', busy: true, source: 'manuscript_generation', progressStage: 'writing',
      subject: document.getElementById('blog-next-subject')?.value || '바로 생성 원고',
      message: 'AI가 원고를 만들고 있습니다.'
    });
  }
  try {
    const payload = await buildBlogNextDraftPayload('ai');
    const operation = await postJson('/api/v1/blog/manuscript-drafts/ai/operations', payload);
    if (!operation?.operationId) throw new Error('AI 원고 작업 ID를 받지 못했습니다.');
    saveBlogNextAiOperationId(operation.operationId);
    const token = ++blogNextAiOperationToken;
    applyBlogNextAiOperationStatus(operation, token);
    if (typeof showBlogNextExecutionStatusAtTop === 'function') {
      showBlogNextExecutionStatusAtTop(returnTarget, returnFallback);
    }
    if (blogNextAiOperationId) scheduleBlogNextAiOperationPoll(token);
  } catch (error) {
    if (typeof renderBlogNextRunnerStatus === 'function') {
      renderBlogNextRunnerStatus({
        state: 'failed', busy: false, source: 'manuscript_generation',
        subject: document.getElementById('blog-next-subject')?.value || '바로 생성 원고',
        message: error.message || 'AI 원고를 만들지 못했습니다.', finishedAt: new Date().toISOString()
      });
    }
    if (typeof showBlogNextExecutionStatusAtTop === 'function') {
      showBlogNextExecutionStatusAtTop(returnTarget, returnFallback);
    }
    clearBlogNextAiOperation();
    void restoreBlogNextAiDraftGeneration();
  }
}

function markBlogNextAiDraftSourceChanged(fieldId = '') {
  const sourceFields = new Set([
    'blog-next-subject', 'blog-next-title', 'blog-next-keywords', 'blog-next-instruction',
    'blog-next-reference-url', 'blog-next-writing-strategy', 'blog-next-image-mode'
  ]);
  const state = blogNextDraftState.ai;
  if (!state.draftId || !sourceFields.has(fieldId)) return;
  // These fields are input for a future preview. They do not mutate the
  // already-created manuscript result until generation succeeds.
  arrangeBlogNextAiWorkflow();
  syncBlogNextDraftExecutionState();
}

function bindBlogNextDetachedPublishSettings(form) {
  const publishSettings = document.getElementById('blog-next-publish-settings');
  publishSettings?.addEventListener('change', (event) => {
    if (form.contains(event.target)) return;
    if (typeof rememberBlogNextTopicDefaultsForSetting === 'function') {
      rememberBlogNextTopicDefaultsForSetting(event.target?.id);
    }
    const type = BLOG_NEXT_DRAFT_TYPES.includes(blogNextActiveInputMode) ? blogNextActiveInputMode : 'ai';
    if (['blog-next-target-naver', 'blog-next-target-wordpress'].includes(event.target?.id)) {
      syncBlogNextDraftProviderFields(type);
    }
    if (event.target?.id === 'blog-next-post-status') syncBlogNextDraftSchedule(type);
    syncBlogNextDraftSettingsSummary(type);
    syncBlogNextTopicActionAvailability();
    syncBlogNextDraftExecutionState();
    if (type !== 'ai') scheduleBlogNextDraftPreview(type);
  });
}

function setBlogNextDraftPublishing(type, publishing) {
  const state = blogNextDraftState[type];
  state.publishing = publishing;
  syncBlogNextDraftExecutionState();
}

async function publishBlogNextDraft(type) {
  const state = blogNextDraftState[type];
  if (state.publishing || isBlogNextDraftPublishCompleted(type) || !state.preview?.validation?.ok) return;
  let settings = readBlogNextDraftSettings(type);
  if (typeof ensureUiCapabilityReady === 'function') {
    const capability = typeof getUiPublishCapability === 'function'
      ? getUiPublishCapability(settings.targets)
      : 'publish.any';
    if (!await ensureUiCapabilityReady(capability)) {
      syncBlogNextDraftExecutionState();
      setBlogNextDraftValidation(type, { errors: [getUiCapabilityMessage(capability)] }, '', state.preview);
      document.querySelector(`[data-blog-next-publish-settings-btn="${type}"]`)?.focus();
      return;
    }
  } else if (typeof guardUiConfigReady === 'function' && !guardUiConfigReady('원고 포스팅')) return;
  const publishCopy = getBlogNextDraftPublishCopy(settings.postStatus);
  const targetLabel = formatBlogPlatformList(settings.targets, ' + ') || '선택한 블로그';
  const confirmed = await showUiConfirm(
    buildBlogNextDraftPublishConfirmation(settings, targetLabel),
    { title: publishCopy.buttonLabel, confirmText: publishCopy.buttonLabel, cancelText: '취소' }
  );
  if (!confirmed) return;

  setBlogNextDraftValidation(type, state.preview?.validation, '', state.preview);
  setBlogNextDraftPublishing(type, true);
  // Start polling before the optimistic running status replaces the previous
  // execution snapshot; the poller uses that prior executionId to reject stale
  // terminal responses while the new server run is being acquired.
  if (typeof startBlogNextLocalPublishProgress === 'function') {
    startBlogNextLocalPublishProgress(() => state.preview?.title || '');
  }
  if (typeof renderBlogNextRunnerStatus === 'function') {
    renderBlogNextRunnerStatus({
      state: 'running',
      busy: true,
      source: 'local_markdown',
      progressStage: 'preparing',
      postStatus: settings.postStatus,
      subject: state.preview?.title || '',
      message: '원고와 발행 설정을 확인하고 있습니다.',
      startedAt: new Date().toISOString()
    });
  }
  if (typeof showBlogNextExecutionStatusAtTop === 'function') {
    const publishSettingsHeading = document.querySelector('#blog-next-publish-settings > summary');
    const publishActions = document.querySelector(`[data-blog-next-draft-actions="${type}"]`);
    showBlogNextExecutionStatusAtTop(publishSettingsHeading || publishActions, publishActions);
  }
  try {
    const syncedPreview = await loadBlogNextDraftPreview(type);
    if (!syncedPreview || state.previewSyncFailed || !state.draftId || !state.preview?.validation?.ok) {
      throw new Error('최신 원고 미리보기를 준비하지 못했습니다.');
    }
    const payload = { draftId: state.draftId, revision: state.revision };
    const publishResult = await postJson(`/api/v1/blog/manuscript-drafts/${encodeURIComponent(state.draftId)}/publish`, payload);
    if (Number.isInteger(Number(publishResult?.revision))) state.revision = Number(publishResult.revision);
    if (publishResult?.manuscriptPreview) renderBlogNextDraftPreview(type, publishResult.manuscriptPreview);
    const actualPostStatus = publishResult?.postStatus || settings.postStatus;
    const actualPublishCopy = getBlogNextDraftPublishCopy(actualPostStatus);
    const wordpressImageUploadFailures = Array.isArray(publishResult?.results?.wordpress?.warnings)
      ? publishResult.results.wordpress.warnings.filter(warning => /^이미지 \d+번 업로드 실패$/.test(String(warning || ''))).length
      : 0;
    const completionMessage = `${targetLabel}에 ${actualPublishCopy.completionLabel}${wordpressImageUploadFailures > 0
      ? `. 이미지 ${wordpressImageUploadFailures}개를 올리지 못했습니다. 워드프레스에서 확인해 주세요.`
      : ''}`;
    if (typeof renderBlogNextRunnerStatus === 'function') {
      renderBlogNextRunnerStatus({
        state: 'completed',
        busy: false,
        source: 'local_markdown',
        postStatus: actualPostStatus,
        subject: state.preview?.title || '',
        message: completionMessage,
        resultStatus: actualPostStatus === 'draft' ? '임시 저장 완료'
          : actualPostStatus === 'schedule' ? '예약 발행 완료' : '발행 완료',
        completionLinks: Array.isArray(publishResult?.completionLinks) ? publishResult.completionLinks : [],
        finishedAt: new Date().toISOString()
      });
    }
    if (typeof showPostingCompletionCelebration === 'function') showPostingCompletionCelebration(actualPostStatus);
  } catch (error) {
    setBlogNextDraftValidation(type, state.preview?.validation, '', state.preview);
    if (typeof renderBlogNextRunnerStatus === 'function') {
      const stopped = error.code === 'BLOG_NEXT_EXECUTION_STOPPED';
      renderBlogNextRunnerStatus({
        state: stopped ? 'stopped' : 'failed',
        busy: false,
        source: 'local_markdown',
        postStatus: settings.postStatus,
        subject: state.preview?.title || '',
        message: error.message || `${publishCopy.actionLabel}에 실패했습니다.`,
        finishedAt: new Date().toISOString()
      });
    }
  } finally {
    if (typeof stopBlogNextLocalPublishProgress === 'function') stopBlogNextLocalPublishProgress();
    setBlogNextDraftPublishing(type, false);
  }
}
