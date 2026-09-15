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
    button.textContent = generating ? '원고 만드는 중...' : '원고 만들기';
  }
  if (typeof syncBlogNextTopicActionAvailability === 'function') syncBlogNextTopicActionAvailability();
  syncBlogNextDraftExecutionState();
}

async function generateBlogNextAiDraft() {
  const state = blogNextDraftState.ai;
  if (state.generating || state.publishing || state.imageWorking) return;
  const validity = readBlogNextTopicActionValidity();
  if (!validity.readyValid) return;
  if (typeof guardUiConfigReady === 'function' && !guardUiConfigReady('AI 원고 생성')) return;
  const result = document.querySelector('[data-blog-next-draft-result="ai"]');
  setBlogNextAiGenerating(true);
  setBlogNextTopicResult('AI가 원고를 만들고 있습니다.');
  try {
    const payload = await buildBlogNextDraftPayload('ai');
    const preview = await runWithLiveProgress({
      targetEl: result,
      requestLabel: 'AI 원고 생성',
      requestFn: () => postJson('/api/v1/blog/manuscript-drafts/ai', payload)
    });
    state.draftId = preview.draftId;
    state.revision = preview.revision;
    state.previewSyncFailed = false;
    renderBlogNextDraftPreview('ai', preview);
    const actions = document.querySelector('[data-blog-next-draft-actions="ai"]');
    if (actions) actions.hidden = false;
    setBlogNextTopicResult('원고를 만들었습니다. 미리보기와 이미지를 확인해 주세요.', 'success');
  } catch (error) {
    renderBlogNextDraftPreview('ai', state.preview);
    setBlogNextDraftValidation('ai', {
      errors: [error.message || 'AI 원고를 만들지 못했습니다. 기존 원고는 유지했습니다.']
    }, '', state.preview);
    setBlogNextTopicResult(error.message || 'AI 원고를 만들지 못했습니다.', 'error');
  } finally {
    setBlogNextAiGenerating(false);
  }
}

function markBlogNextAiDraftSourceChanged(fieldId = '') {
  const sourceFields = new Set([
    'blog-next-subject', 'blog-next-title', 'blog-next-keywords', 'blog-next-instruction',
    'blog-next-reference-url', 'blog-next-writing-strategy', 'blog-next-image-mode',
    'blog-next-target-naver', 'blog-next-target-wordpress'
  ]);
  const state = blogNextDraftState.ai;
  if (!state.draftId || !sourceFields.has(fieldId)) return;
  state.previewSyncFailed = true;
  setBlogNextDraftValidation('ai', {
    warnings: ['입력 또는 발행 플랫폼이 변경되었습니다. 새 조건으로 원고를 다시 만들어 주세요.']
  }, '', state.preview);
  syncBlogNextDraftExecutionState();
}
