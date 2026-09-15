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
    button.disabled = executionActive || publishBlocked || state.previewSyncFailed || !state.preview?.validation?.ok;
    button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
    const selectedStatus = readBlogNextDraftSettings(type).postStatus;
    const publishCopy = getBlogNextDraftPublishCopy(selectedStatus);
    button.textContent = state.publishing
      ? publishCopy.busyLabel
      : state.imageWorking ? '이미지 작업 중...'
      : executionActive ? '다른 작업 실행 중...'
      : publishCopy.buttonLabel;
  });
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
  if (typeof syncBlogNextTopicActionAvailability === 'function') syncBlogNextTopicActionAvailability();
  syncBlogNextDraftExecutionState();
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
  const hasDraft = Boolean(blogNextDraftState.ai.draftId) && options.sourceDirty !== true;
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
  state.previewSyncFailed = false;
  const preview = document.querySelector('[data-blog-next-draft-preview="ai"]');
  const actions = document.querySelector('[data-blog-next-draft-actions="ai"]');
  if (preview) preview.hidden = true;
  if (actions) actions.hidden = true;
  setBlogNextDraftValidation('ai');
  arrangeBlogNextAiWorkflow();
}

async function generateBlogNextAiDraft() {
  const state = blogNextDraftState.ai;
  if (state.generating || state.publishing || state.imageWorking) return;
  const validity = readBlogNextTopicActionValidity();
  if (!validity.ideaValid) return;
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
  setBlogNextTopicResult('');
  if (typeof renderBlogNextRunnerStatus === 'function') {
    renderBlogNextRunnerStatus({
      state: 'running', busy: true, source: 'manuscript_generation', progressStage: 'writing',
      subject: document.getElementById('blog-next-subject')?.value || '바로 생성 원고',
      message: 'AI가 원고를 만들고 있습니다.'
    });
  }
  try {
    const payload = await buildBlogNextDraftPayload('ai');
    const preview = await postJson('/api/v1/blog/manuscript-drafts/ai', payload);
    state.draftId = preview.draftId;
    state.revision = preview.revision;
    state.previewSyncFailed = false;
    renderBlogNextDraftPreview('ai', preview);
    const actions = document.querySelector('[data-blog-next-draft-actions="ai"]');
    if (actions) actions.hidden = false;
    arrangeBlogNextAiWorkflow();
    setBlogNextTopicResult('원고를 만들었습니다. 미리보기와 이미지를 확인해 주세요.', 'success');
    if (typeof renderBlogNextRunnerStatus === 'function') {
      renderBlogNextRunnerStatus({
        state: 'completed', busy: false, source: 'manuscript_generation',
        subject: preview.title || payload.subject || '바로 생성 원고',
        message: '미리보기를 준비했습니다.', finishedAt: new Date().toISOString()
      });
    }
  } catch (error) {
    renderBlogNextDraftPreview('ai', state.preview);
    setBlogNextDraftValidation('ai', {
      errors: [error.message || 'AI 원고를 만들지 못했습니다. 기존 원고는 유지했습니다.']
    }, '', state.preview);
    setBlogNextTopicResult(error.message || 'AI 원고를 만들지 못했습니다.', 'error');
    if (typeof renderBlogNextRunnerStatus === 'function') {
      renderBlogNextRunnerStatus({
        state: 'failed', busy: false, source: 'manuscript_generation',
        subject: document.getElementById('blog-next-subject')?.value || '바로 생성 원고',
        message: error.message || 'AI 원고를 만들지 못했습니다.', finishedAt: new Date().toISOString()
      });
    }
  } finally {
    setBlogNextAiGenerating(false);
  }
}

function markBlogNextAiDraftSourceChanged(fieldId = '') {
  const sourceFields = new Set([
    'blog-next-subject', 'blog-next-title', 'blog-next-keywords', 'blog-next-instruction',
    'blog-next-reference-url', 'blog-next-writing-strategy', 'blog-next-image-mode'
  ]);
  const state = blogNextDraftState.ai;
  if (!state.draftId || !sourceFields.has(fieldId)) return;
  state.previewSyncFailed = true;
  arrangeBlogNextAiWorkflow({ sourceDirty: true });
  const preview = document.querySelector('[data-blog-next-draft-preview="ai"]');
  const actions = document.querySelector('[data-blog-next-draft-actions="ai"]');
  if (preview) preview.hidden = true;
  if (actions) actions.hidden = true;
  setBlogNextDraftValidation('ai', {
    warnings: ['원고 입력이 변경되었습니다. 새 조건으로 원고를 다시 만들어 주세요.']
  }, '', state.preview);
  syncBlogNextDraftExecutionState();
}

function bindBlogNextDetachedPublishSettings(form) {
  const publishSettings = document.getElementById('blog-next-publish-settings');
  publishSettings?.addEventListener('change', (event) => {
    if (form.contains(event.target)) return;
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
  if (state.publishing || !state.preview?.validation?.ok) return;
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
  const autoGenerationCount = Array.isArray(state.preview?.images)
    ? state.preview.images.filter((image) => !image.excluded && !image.exists && String(image.prompt || '').trim()).length
    : 0;
  const automaticImages = supportsBlogNextDraftAutomaticImages(type);
  const publishCopy = getBlogNextDraftPublishCopy(settings.postStatus);
  const targetLabel = formatBlogPlatformList(settings.targets, ' + ') || '선택한 블로그';
  const safetyNotice = automaticImages && autoGenerationCount > 0
      ? `\n\n빈 이미지 ${autoGenerationCount}개는 먼저 AI로 만듭니다. 만들지 못한 이미지가 있으면 안전하게 임시 저장합니다.`
      : '';
  const confirmed = await showUiConfirm(
    `현재 원고를 ${targetLabel}에 ${publishCopy.actionLabel}할까요?${safetyNotice}\nQueue에 추가하지 않고 바로 실행합니다.`,
    { title: publishCopy.buttonLabel, confirmText: publishCopy.buttonLabel, cancelText: '취소' }
  );
  if (!confirmed) return;

  setBlogNextDraftPublishing(type, true);
  if (typeof renderBlogNextRunnerStatus === 'function') {
    renderBlogNextRunnerStatus({
      state: 'running',
      busy: true,
      source: 'local_markdown',
      subject: type === 'ai' ? '바로 생성 원고' : (type === 'paste' ? '원고 붙여넣기' : '원고 폴더'),
      message: automaticImages && autoGenerationCount > 0
        ? `빈 이미지 ${autoGenerationCount}개를 준비한 뒤 ${publishCopy.actionLabel}합니다.`
        : `원고를 ${publishCopy.actionLabel}하고 있습니다.`,
      startedAt: new Date().toISOString()
    });
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
    if (typeof renderBlogNextRunnerStatus === 'function') {
      renderBlogNextRunnerStatus({
        state: 'completed',
        busy: false,
        subject: type === 'ai' ? '바로 생성 원고' : (type === 'paste' ? '원고 붙여넣기' : '원고 폴더'),
        message: `${targetLabel}에 ${actualPublishCopy.completionLabel}`,
        resultStatus: actualPostStatus === 'draft' ? '임시 저장 완료'
          : actualPostStatus === 'schedule' ? '예약 발행 완료' : '발행 완료',
        completionLinks: Array.isArray(publishResult?.completionLinks) ? publishResult.completionLinks : [],
        finishedAt: new Date().toISOString()
      });
    }
    showUiToast({
      level: 'success',
      title: actualPublishCopy.buttonLabel,
      message: actualPostStatus === 'draft' && settings.postStatus !== 'draft'
        ? `이미지를 모두 만들지 못해 ${targetLabel}에 안전하게 임시 저장했습니다.`
        : `${targetLabel}에 ${actualPublishCopy.completionLabel}`
    });
    if (typeof showPostingCompletionCelebration === 'function') showPostingCompletionCelebration(actualPostStatus);
  } catch (error) {
    setBlogNextDraftValidation(type, { errors: [error.message || `${publishCopy.actionLabel}에 실패했습니다.`] }, '', state.preview);
    showUiToast({ level: 'error', title: `${publishCopy.buttonLabel} 실패`, message: error.message || '잠시 후 다시 시도해 주세요.' });
    if (typeof renderBlogNextRunnerStatus === 'function') {
      renderBlogNextRunnerStatus({
        state: 'failed',
        busy: false,
        subject: type === 'ai' ? '바로 생성 원고' : (type === 'paste' ? '원고 붙여넣기' : '원고 폴더'),
        message: error.message || `${publishCopy.actionLabel}에 실패했습니다.`,
        finishedAt: new Date().toISOString()
      });
    }
  } finally {
    setBlogNextDraftPublishing(type, false);
  }
}
