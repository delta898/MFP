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
      busyLabel: '예약 발행 중...',
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
  if (isBlogNextSiteHostingTarget(type)) return state?.siteHostingPosted === true;
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
    return state.publishing || state.generating || state.imageWorking || state.promptGenerating;
  }) || (typeof blogNextRunnerActive !== 'undefined' && blogNextRunnerActive)
    || (typeof blogNextRunnerRequesting !== 'undefined' && blogNextRunnerRequesting));
  BLOG_NEXT_DRAFT_TYPES.forEach((type) => {
    blogNextDraftState[type]?.editor?.setEditable(!busy);
  });
  document.querySelectorAll('[data-blog-next-mode-panel] summary').forEach((summary) => {
    if (busy) {
      if (!Object.prototype.hasOwnProperty.call(summary.dataset, 'beforeExecutionInert')) {
        summary.dataset.beforeExecutionInert = String(summary.inert);
        summary.dataset.beforeExecutionAriaDisabled = summary.getAttribute('aria-disabled') ?? '__none__';
      }
      summary.inert = true;
      summary.setAttribute('aria-disabled', 'true');
    } else if (Object.prototype.hasOwnProperty.call(summary.dataset, 'beforeExecutionInert')) {
      summary.inert = summary.dataset.beforeExecutionInert === 'true';
      if (summary.dataset.beforeExecutionAriaDisabled === '__none__') summary.removeAttribute('aria-disabled');
      else summary.setAttribute('aria-disabled', summary.dataset.beforeExecutionAriaDisabled);
      delete summary.dataset.beforeExecutionInert;
      delete summary.dataset.beforeExecutionAriaDisabled;
    }
  });
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
  if (typeof blogNextEditingRowIndex !== 'undefined' && blogNextEditingRowIndex !== null) return;
  const anotherRunnerActive = typeof runnerActive === 'boolean'
    ? runnerActive
    : ((typeof blogNextRunnerActive !== 'undefined' && blogNextRunnerActive)
      || (typeof blogNextRunnerRequesting !== 'undefined' && blogNextRunnerRequesting));
  const manuscriptActive = BLOG_NEXT_DRAFT_TYPES.some(type => blogNextDraftState[type].publishing
    || blogNextDraftState[type].imageWorking || blogNextDraftState[type].generating || blogNextDraftState[type].promptGenerating);
  const executionActive = anotherRunnerActive || manuscriptActive;
  const activeType = BLOG_NEXT_DRAFT_TYPES.includes(blogNextActiveInputMode) ? blogNextActiveInputMode : 'ai';
  const activeSettings = readBlogNextDraftSettings(activeType);
  const siteHostingTarget = isBlogNextSiteHostingTarget(activeType);
  const publishCapability = typeof getUiPublishCapability === 'function'
    ? getUiPublishCapability(activeSettings.targets)
    : 'publish.any';
  const publishBlocked = !siteHostingTarget && typeof isUiCapabilityUnavailable === 'function'
    && isUiCapabilityUnavailable(publishCapability);
  BLOG_NEXT_DRAFT_TYPES.forEach((type) => {
    const state = blogNextDraftState[type];
    const button = document.querySelector(`[data-blog-next-draft-publish="${type}"]`);
    if (!button) return;
    const completed = isBlogNextDraftPublishCompleted(type);
    const typeSiteTarget = isBlogNextSiteHostingTarget(type);
    button.disabled = completed || executionActive || (!typeSiteTarget && publishBlocked) || state.previewSyncFailed || !state.preview?.validation?.ok;
    button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
    const selectedStatus = readBlogNextDraftSettings(type).postStatus;
    const publishCopy = getBlogNextDraftPublishCopy(selectedStatus);
    const siteActionLabel = selectedStatus === 'draft' ? '사이트에 임시 저장' : '사이트 포스팅';
    button.textContent = completed
      ? `${typeSiteTarget ? '내 사이트' : readBlogNextDraftSettings(type).targets[0] === 'wordpress' ? '워드프레스' : '네이버'} 처리 완료`
      : state.publishing
      ? typeSiteTarget ? (selectedStatus === 'draft' ? '사이트에 임시 저장 중...' : '사이트 빌드·배포 중...') : publishCopy.busyLabel
      : state.promptGenerating ? '프롬프트 생성 중...'
      : state.imageWorking ? '이미지 작업 중...'
      : executionActive ? '다른 작업 실행 중...'
      : typeSiteTarget ? siteActionLabel : publishCopy.buttonLabel;
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
    const siteTarget = isBlogNextSiteHostingTarget(type);
    notice.hidden = !blocked || siteTarget || type !== activeType;
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
  if (createButton) setUiAiActionButton(createButton, generating ? '원고 만드는 중…' : '원고 만들기');
  if (regenerateButton) setUiAiActionButton(regenerateButton, generating ? '원고 만드는 중…' : '원고 다시 만들기');
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
  if (status.stage === 'preparing') return '원고 생성을 준비하고 있습니다.';
  if (status.stage === 'writing') return '원고 내용을 작성하고 있습니다.';
  if (status.stage === 'images') {
    const current = Number(status.progress?.current);
    const total = Number(status.progress?.total);
    if (Number.isInteger(current) && Number.isInteger(total) && total > 0 && current > 0 && current <= total) {
      return `이미지를 만들고 있습니다. (${current}/${total})`;
    }
    return '이미지를 만들고 있습니다.';
  }
  if (status.stage === 'finalizing') return '원고와 이미지를 저장하고 있습니다.';
  return '원고 생성을 준비하고 있습니다.';
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
  // Queue/editor screens render their own settings instance and own action footer.
  // This workflow arranger only owns the quick-writing form composition.
  if (options.editing === true || (typeof blogNextEditingRowIndex !== 'undefined' && blogNextEditingRowIndex !== null)) return;
  const form = document.getElementById('blog-next-topic-form');
  const disclosures = form?.querySelector('.blog-next-disclosures');
  const previewDisclosure = document.getElementById('blog-next-ai-preview');
  const publishDisclosure = document.getElementById('blog-next-ai-publish');
  const publishSettings = getBlogNextSettingsElement('blog-next-publish-settings');
  const publishTitle = getBlogNextSettingsElement('blog-next-publish-settings-title');
  const previewStep = document.querySelector('[data-blog-next-ai-step="preview"]');
  const publishStep = document.querySelector('[data-blog-next-ai-step="publish"]');
  const save = document.getElementById('blog-next-save-topic');
  const prepareActions = document.querySelector('.blog-next-ai-prepare-actions');
  const ideaActions = document.querySelector('[data-blog-next-ai-idea-actions]');
  const previewActions = document.querySelector('[data-blog-next-ai-preview-actions]');
  const publishActions = document.querySelector('[data-blog-next-draft-actions="ai"]');
  const hint = document.getElementById('blog-next-queue-action-hint');
  const hasDraft = Boolean(blogNextDraftState.ai.draftId);
  if (publishDisclosure) publishDisclosure.hidden = false;
  if (publishSettings) {
    const publishSlot = document.querySelector('[data-blog-next-publish-settings-slot="ai-publish"]');
    if (publishSlot) publishSlot.appendChild(publishSettings);
    if (typeof setBlogNextPublishSettingsContext === 'function') setBlogNextPublishSettingsContext('ai');
    else if (publishTitle) publishTitle.textContent = '포스팅 설정';
  }

  if (previewStep) previewStep.hidden = false;
  if (publishStep) publishStep.hidden = false;
  if (publishSettings) publishSettings.hidden = false;
  if (prepareActions) prepareActions.hidden = hasDraft;
  if (ideaActions) ideaActions.hidden = hasDraft;
  if (previewActions) previewActions.hidden = !hasDraft;
  if (publishActions) publishActions.hidden = false;
  if (save) save.hidden = hasDraft;
  if (hint) hint.hidden = hasDraft;
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
  if (state.generating || state.publishing || state.imageWorking || state.promptGenerating || blogNextAiOperationId) return;
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
    if (getBlogNextSettingsElement('blog-next-image-mode')?.value === 'generate'
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
      subject: getBlogNextSettingsElement('blog-next-subject')?.value || '바로 생성 원고',
      message: '원고 생성을 준비하고 있습니다.'
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
        subject: getBlogNextSettingsElement('blog-next-subject')?.value || '바로 생성 원고',
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
  const publishSettings = getBlogNextSettingsElement('blog-next-publish-settings');
  publishSettings?.addEventListener('change', (event) => {
    const type = BLOG_NEXT_DRAFT_TYPES.includes(blogNextActiveInputMode) ? blogNextActiveInputMode : 'ai';
    if (['blog-next-post-status', 'blog-next-schedule-date', 'blog-next-category'].includes(event.target?.id)) {
      captureBlogNextPublishingTargetSettings(type);
    }
    if (form.contains(event.target)) return;
    if (typeof rememberBlogNextTopicDefaultsForSetting === 'function') {
      rememberBlogNextTopicDefaultsForSetting(event.target?.id);
    }
    if (['blog-next-target-naver', 'blog-next-target-wordpress', 'blog-next-target-site-hosting'].includes(event.target?.id)) {
      syncBlogNextDraftProviderFields(type);
    }
    if (event.target?.id === 'blog-next-post-status') {
      syncBlogNextSiteHostingOptions(type);
      if (blogNextDraftState[type]) blogNextDraftState[type].siteHostingPosted = false;
    }
    if (typeof persistBlogNextPublishingDefaults === 'function') persistBlogNextPublishingDefaults(type);
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
  let siteHostingTarget = isBlogNextSiteHostingTarget(type);
  const focusSitePicker = () => {
    const picker = getBlogNextSettingsElement('blog-next-site-hosting-select');
    const disclosure = picker?.closest('details');
    if (disclosure) disclosure.open = true;
    getBlogNextSettingsElement('blog-next-site-hosting-field').hidden = false;
    picker?.focus();
  };
  if (siteHostingTarget) {
    const availableSites = await loadBlogNextSiteHostingTargets({ preserveSelection: true });
    settings = readBlogNextDraftSettings(type);
    siteHostingTarget = isBlogNextSiteHostingTarget(type);
    if (!Array.isArray(availableSites)) {
      setBlogNextDraftValidation(type, { errors: ['사이트 목록을 확인하지 못했습니다. 다시 시도해 주세요.'] }, '', state.preview);
      focusSitePicker();
      return;
    }
  }
  if (siteHostingTarget && settings.postStatus === 'schedule') {
    setBlogNextDraftValidation(type, { errors: ['내 사이트 포스팅은 임시 저장 또는 즉시 발행만 지원합니다.'] }, '', state.preview);
    return;
  }
  if (siteHostingTarget && (!settings.siteProjectId || !settings.siteId)) {
    setBlogNextDraftValidation(type, { errors: ['포스팅할 사이트를 선택해 주세요. 선택한 사이트가 없거나 포스팅 조건을 충족하지 않으면 목록에서 다시 선택해야 합니다.'] }, '', state.preview);
    focusSitePicker();
    return;
  }
  if (siteHostingTarget && settings.siteKind === 'vault' && !settings.destinationPath) {
    setBlogNextDraftValidation(type, { errors: ['저장할 Vault 폴더를 선택해 주세요.'] }, '', state.preview);
    getBlogNextSettingsElement('blog-next-vault-folder-select')?.focus();
    return;
  }
  if (!siteHostingTarget && typeof ensureUiCapabilityReady === 'function') {
    const capability = typeof getUiPublishCapability === 'function'
      ? getUiPublishCapability(settings.targets)
      : 'publish.any';
    if (!await ensureUiCapabilityReady(capability)) {
      syncBlogNextDraftExecutionState();
      setBlogNextDraftValidation(type, { errors: [getUiCapabilityMessage(capability)] }, '', state.preview);
      document.querySelector(`[data-blog-next-publish-settings-btn="${type}"]`)?.focus();
      return;
    }
  } else if (!siteHostingTarget && typeof guardUiConfigReady === 'function' && !guardUiConfigReady('원고 포스팅')) return;
  const publishCopy = siteHostingTarget
    ? settings.postStatus === 'draft'
      ? { buttonLabel: '사이트에 임시 저장', actionLabel: '사이트 임시 저장', busyLabel: '사이트에 임시 저장 중...', completionLabel: '임시 저장했습니다.' }
      : { buttonLabel: '사이트 포스팅', actionLabel: '사이트 포스팅', busyLabel: '사이트 빌드·배포 중...', completionLabel: '사이트를 공개했습니다.' }
    : getBlogNextDraftPublishCopy(settings.postStatus);
  const targetLabel = siteHostingTarget
    ? getBlogNextSettingsElement('blog-next-site-hosting-select')?.selectedOptions?.[0]?.textContent?.trim() || '선택한 사이트'
    : formatBlogPlatformList(settings.targets, ' + ') || '선택한 블로그';
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
  if (!siteHostingTarget && typeof startBlogNextLocalPublishProgress === 'function') {
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
      message: siteHostingTarget
        ? settings.postStatus === 'draft' ? '사이트에 글을 임시 저장하고 있습니다.' : '사이트를 전체 빌드하고 배포하고 있습니다.'
        : '원고와 포스팅 설정을 확인하고 있습니다.',
      startedAt: new Date().toISOString()
    });
  }
  if (typeof showBlogNextExecutionStatusAtTop === 'function') {
    const publishSettingsHeading = document.querySelector('#blog-next-publish-settings > summary');
    const publishActions = document.querySelector(`[data-blog-next-draft-actions="${type}"]`);
    showBlogNextExecutionStatusAtTop(publishSettingsHeading || publishActions, publishActions);
  }
  try {
    if (siteHostingTarget) {
      const selectedProjectId = settings.siteProjectId;
      const selectedSiteId = settings.siteId;
      const availableSites = await loadBlogNextSiteHostingTargets({ preserveSelection: true });
      settings = readBlogNextDraftSettings(type);
      if (!Array.isArray(availableSites)) {
        throw new Error('사이트 목록을 다시 확인하지 못했습니다. 다시 불러온 뒤 포스팅해 주세요.');
      }
      if (settings.siteProjectId !== selectedProjectId || settings.siteId !== selectedSiteId) {
        throw Object.assign(new Error('선택한 사이트가 삭제되었거나 포스팅 조건을 충족하지 않습니다. 사이트를 다시 선택해 주세요.'), { code: 'SITE_HOSTING_TARGET_STALE' });
      }
    }
    const syncedPreview = await loadBlogNextDraftPreview(type);
    if (!syncedPreview || state.previewSyncFailed || !state.draftId || !state.preview?.validation?.ok) {
      throw new Error('최신 원고 미리보기를 준비하지 못했습니다.');
    }
    const publishResult = siteHostingTarget
      ? await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(settings.siteProjectId)}/sites/${encodeURIComponent(settings.siteId)}/posts`, {
        markdownText: document.getElementById('blog-next-ai-markdown')?.value || state.preview.rawMarkdown || '',
        postStatus: settings.postStatus,
        draftId: state.draftId,
        revision: state.revision,
        ...(settings.siteKind === 'vault' ? { destinationPath: settings.destinationPath } : {})
      })
      : await postJson(`/api/v1/blog/manuscript-drafts/${encodeURIComponent(state.draftId)}/publish`, {
        draftId: state.draftId,
        revision: state.revision,
        postStatus: settings.postStatus,
        scheduleDate: settings.scheduleDate
      });
    if (siteHostingTarget) state.siteHostingPosted = true;
    if (Number.isInteger(Number(publishResult?.revision))) state.revision = Number(publishResult.revision);
    if (!siteHostingTarget && publishResult?.manuscriptPreview) renderBlogNextDraftPreview(type, publishResult.manuscriptPreview);
    const actualPostStatus = publishResult?.postStatus || settings.postStatus;
    const actualPublishCopy = getBlogNextDraftPublishCopy(actualPostStatus);
    const wordpressImageUploadFailures = Array.isArray(publishResult?.results?.wordpress?.warnings)
      ? publishResult.results.wordpress.warnings.filter(warning => /^이미지 \d+번 업로드 실패$/.test(String(warning || ''))).length
      : 0;
    const archiveFailed = publishResult?.archiveSnapshot?.success === false;
    const completionMessage = siteHostingTarget
      ? (actualPostStatus === 'draft' ? '내 사이트에 임시 저장했습니다. 아직 빌드하거나 배포하지 않았습니다.' : '내 사이트를 빌드하고 배포했습니다.')
      : `${targetLabel}에 ${actualPublishCopy.completionLabel}${wordpressImageUploadFailures > 0
      ? `. 이미지 ${wordpressImageUploadFailures}개를 올리지 못했습니다. 워드프레스에서 확인해 주세요.`
      : ''}${archiveFailed
        ? ' 게시에는 성공했지만 로컬 결과물 저장에 실패했습니다. 원고가 만료되기 전에 백업해 주세요.'
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
        completionLinks: siteHostingTarget && publishResult?.post_url
          ? [{
            label: '공개한 글', url: publishResult.post_url, platform: 'site-hosting', kind: 'post',
            projectId: settings.siteProjectId,
            siteId: settings.siteId,
            postId: publishResult.post_id
          }]
          : Array.isArray(publishResult?.completionLinks) ? publishResult.completionLinks : [],
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
