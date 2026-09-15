function syncBlogNextDraftExecutionState(runnerActive) {
  const anotherRunnerActive = typeof runnerActive === 'boolean'
    ? runnerActive
    : ((typeof blogNextRunnerActive !== 'undefined' && blogNextRunnerActive)
      || (typeof blogNextRunnerRequesting !== 'undefined' && blogNextRunnerRequesting));
  const manuscriptActive = BLOG_NEXT_DRAFT_TYPES.some(type => blogNextDraftState[type].publishing
    || blogNextDraftState[type].imageWorking || blogNextDraftState[type].generating);
  const executionActive = anotherRunnerActive || manuscriptActive;
  BLOG_NEXT_DRAFT_TYPES.forEach((type) => {
    const state = blogNextDraftState[type];
    const button = document.querySelector(`[data-blog-next-draft-publish="${type}"]`);
    if (!button) return;
    button.disabled = executionActive || state.previewSyncFailed || !state.preview?.validation?.ok;
    button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
    const selectedStatus = readBlogNextDraftSettings(type).postStatus;
    button.textContent = state.publishing
      ? '포스팅 진행 중...'
      : state.imageWorking ? '이미지 작업 중...'
      : executionActive ? '다른 작업 실행 중...'
      : selectedStatus === 'draft' ? '임시 저장'
      : selectedStatus === 'schedule' ? '예약 발행' : '즉시 발행';
  });
}

function setBlogNextAiGenerating(generating) {
  const state = blogNextDraftState.ai;
  state.generating = generating;
  const button = document.getElementById('blog-next-publish-now');
  if (button) {
    button.disabled = generating;
    button.setAttribute('aria-busy', generating ? 'true' : 'false');
    button.textContent = generating ? '원고 만드는 중...'
      : blogNextDraftState.ai.draftId ? '원고 다시 만들기' : '원고 만들기';
  }
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
  const hint = document.getElementById('blog-next-queue-action-hint');
  const hasDraft = Boolean(blogNextDraftState.ai.draftId) && options.sourceDirty !== true;
  const editing = options.editing === true;

  if (editing || !hasDraft) {
    if (disclosures && publishSettings) disclosures.appendChild(publishSettings);
    if (publishTitle) publishTitle.textContent = editing ? '발행 계획' : '글감 대기열 설정';
  } else if (publishStep && publishSettings) {
    publishStep.after(publishSettings);
    if (publishTitle) publishTitle.textContent = '발행 설정';
  }

  if (previewStep) previewStep.hidden = editing || !hasDraft;
  if (publishStep) publishStep.hidden = editing || !hasDraft;
  if (publishSettings) publishSettings.hidden = !editing && !hasDraft;
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
  if (typeof guardUiConfigReady === 'function' && !guardUiConfigReady('AI 원고 생성')) return;
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
    if (['blog-next-target-naver', 'blog-next-target-wordpress'].includes(event.target?.id)) syncBlogNextProviderDependentFields();
    if (event.target?.id === 'blog-next-post-status') syncBlogNextScheduleField();
    syncBlogNextQuickFlowSummaries();
    syncBlogNextTopicActionAvailability();
  });
}
