const BLOG_NEXT_WRITING_INTENT_FIELD_IDS = new Set([
  'blog-next-subject',
  'blog-next-title',
  'blog-next-keywords',
  'blog-next-instruction',
  'blog-next-reference-url'
]);

function hasBlogNextWritingWork() {
  const ai = typeof blogNextDraftState !== 'undefined' ? blogNextDraftState.ai : null;
  return hasBlogNextClearableContent(captureBlogNextClearableContent())
    || Boolean(ai?.draftId || ai?.preview)
    || (typeof blogNextEditingRowIndex !== 'undefined' && blogNextEditingRowIndex !== null);
}

function isBlogNextWritingTransitionBusy() {
  const draftTypes = typeof BLOG_NEXT_DRAFT_TYPES !== 'undefined' ? BLOG_NEXT_DRAFT_TYPES : ['ai'];
  return Boolean(
    (typeof blogNextAiOperationId !== 'undefined' && blogNextAiOperationId)
    || (typeof blogNextTopicSubmitting !== 'undefined' && blogNextTopicSubmitting)
    || draftTypes.some((type) => {
      const state = typeof blogNextDraftState !== 'undefined' ? blogNextDraftState[type] : null;
      return state?.generating || state?.publishing || state?.imageWorking || state?.promptGenerating;
    })
    || (typeof blogNextRunnerActive !== 'undefined' && blogNextRunnerActive)
    || (typeof blogNextRunnerRequesting !== 'undefined' && blogNextRunnerRequesting)
  );
}

function revealBlogNextWritingDestination(focusFieldId) {
  const preparation = document.getElementById('blog-next-ai-preparation');
  const topicSettings = document.getElementById('blog-next-topic-settings');
  if (preparation) {
    preparation.open = true;
    preparation.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }
  if (topicSettings) topicSettings.open = true;
  if (typeof blogNextDisclosureState !== 'undefined' && blogNextDisclosureState.quick) {
    blogNextDisclosureState.quick.preparation = true;
    blogNextDisclosureState.quick.topic = true;
  }
  document.getElementById(focusFieldId)?.focus({ preventScroll: true });
}

async function applyBlogNextWritingIntent({
  values = {},
  applySourceContext = null,
  confirmation = {},
  focusFieldId = 'blog-next-subject',
  prepareDestination = null,
  focusAfterFrame = false
} = {}) {
  if (isBlogNextWritingTransitionBusy()) return false;

  if (hasBlogNextWritingWork()) {
    const confirmationOptions = typeof confirmation === 'function' ? confirmation() : confirmation;
    const confirmed = await showUiConfirm(
      confirmationOptions.message || '작성 중인 글감을 지우고 새 글을 시작할까요?',
      {
        title: confirmationOptions.title || '새 글 작성',
        confirmText: confirmationOptions.confirmText || '새 글 작성',
        cancelText: confirmationOptions.cancelText || '계속 작성'
      }
    );
    if (!confirmed) return false;
  }

  if (typeof prepareDestination === 'function' && !await prepareDestination()) return false;

  if (typeof blogNextEditingRowIndex !== 'undefined' && blogNextEditingRowIndex !== null) {
    await closeBlogNextEditor({ force: true });
  }

  activateBlogNextTab('quick');
  activateBlogNextInputMode('ai');
  clearBlogNextTopicContent();
  resetBlogNextAiDraftUi();

  Object.entries(values || {}).forEach(([fieldId, value]) => {
    if (!BLOG_NEXT_WRITING_INTENT_FIELD_IDS.has(fieldId)) return;
    const field = document.getElementById(fieldId);
    if (field) field.value = String(value ?? '');
  });
  if (typeof applySourceContext === 'function') applySourceContext();

  const preparation = document.getElementById('blog-next-ai-preparation');
  if (preparation) {
    preparation.open = true;
    if (typeof blogNextDisclosureState !== 'undefined' && blogNextDisclosureState.quick) {
      blogNextDisclosureState.quick.preparation = true;
    }
  }
  const topicSettings = document.getElementById('blog-next-topic-settings');
  if (topicSettings) topicSettings.open = true;
  if (typeof blogNextDisclosureState !== 'undefined' && blogNextDisclosureState.quick) {
    blogNextDisclosureState.quick.topic = true;
  }
  syncBlogNextQuickFlowSummaries();
  setBlogNextTopicResult('');
  syncBlogNextTopicClearAction();
  if (typeof dismissBlogNextStatusForNewWriting === 'function') dismissBlogNextStatusForNewWriting();
  syncBlogNextDraftExecutionState();
  const reveal = () => revealBlogNextWritingDestination(focusFieldId);
  if (focusAfterFrame && typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(reveal));
  } else reveal();
  return true;
}
