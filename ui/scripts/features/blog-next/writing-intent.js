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
  const ai = typeof blogNextDraftState !== 'undefined' ? blogNextDraftState.ai : null;
  return Boolean(
    (typeof blogNextAiOperationId !== 'undefined' && blogNextAiOperationId)
    || (typeof blogNextTopicSubmitting !== 'undefined' && blogNextTopicSubmitting)
    || ai?.generating || ai?.publishing || ai?.imageWorking || ai?.promptGenerating
    || (typeof blogNextRunnerActive !== 'undefined' && blogNextRunnerActive)
    || (typeof blogNextRunnerRequesting !== 'undefined' && blogNextRunnerRequesting)
  );
}

async function applyBlogNextWritingIntent({
  values = {},
  applySourceContext = null,
  confirmation = {},
  focusFieldId = 'blog-next-subject'
} = {}) {
  if (isBlogNextWritingTransitionBusy()) return false;

  if (hasBlogNextWritingWork()) {
    const confirmed = await showUiConfirm(
      confirmation.message || '작성 중인 글감을 지우고 새 글을 시작할까요?',
      {
        title: confirmation.title || '새 글 작성',
        confirmText: confirmation.confirmText || '새 글 작성',
        cancelText: confirmation.cancelText || '계속 작성'
      }
    );
    if (!confirmed) return false;
  }

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
  if (preparation) preparation.open = true;
  syncBlogNextQuickFlowSummaries();
  setBlogNextTopicResult('');
  syncBlogNextTopicClearAction();
  if (typeof dismissBlogNextStatusForNewWriting === 'function') dismissBlogNextStatusForNewWriting();
  syncBlogNextDraftExecutionState();
  document.getElementById(focusFieldId)?.focus();
  return true;
}
