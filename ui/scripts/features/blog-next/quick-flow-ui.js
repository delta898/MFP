function readBlogNextSelectedText(id, fallback = '') {
  const select = document.getElementById(id);
  return String(select?.selectedOptions?.[0]?.textContent || fallback).trim();
}

function setBlogNextPublishSettingsContext(type, titleText = '발행 설정') {
  const settings = document.getElementById('blog-next-publish-settings');
  const summary = document.getElementById('blog-next-publish-settings-summary');
  const options = settings?.querySelector('.blog-next-draft-options');
  const title = document.getElementById('blog-next-publish-settings-title');
  if (settings) settings.dataset.blogNextDraftSettings = type;
  if (summary) summary.dataset.blogNextDraftSettingsSummary = type;
  if (options) options.dataset.blogNextDraftOptions = type;
  if (title) title.textContent = titleText;
}

function mountBlogNextPublishSettings(type = 'ai') {
  const target = BLOG_NEXT_INPUT_MODES.includes(type) ? type : 'ai';
  if (target === 'ai') {
    const editing = typeof blogNextEditingRowIndex !== 'undefined' && blogNextEditingRowIndex !== null;
    if (typeof arrangeBlogNextAiWorkflow === 'function') arrangeBlogNextAiWorkflow({ editing });
    if (typeof syncBlogNextDraftImageSafety === 'function') {
      syncBlogNextDraftImageSafety(target, blogNextDraftState?.[target]?.preview || null);
    }
    syncBlogNextProviderDependentFields();
    syncBlogNextScheduleField();
    return;
  }
  const settings = document.getElementById('blog-next-publish-settings');
  const slot = document.querySelector(`[data-blog-next-publish-settings-slot="${target}"]`);
  if (slot && settings) slot.appendChild(settings);
  if (settings) settings.hidden = false;
  setBlogNextPublishSettingsContext(target);
  if (typeof syncBlogNextDraftImageSafety === 'function') {
    syncBlogNextDraftImageSafety(target, blogNextDraftState?.[target]?.preview || null);
  }
  syncBlogNextProviderDependentFields();
  syncBlogNextScheduleField();
}

function syncBlogNextQuickFlowSummaries() {
  const contentSummary = document.getElementById('blog-next-content-settings-summary');
  const publishSummary = document.getElementById('blog-next-publish-settings-summary');
  const externalReference = document.getElementById('blog-next-external-reference')?.checked === true;
  const platforms = [];
  if (document.getElementById('blog-next-target-naver')?.checked) platforms.push('naver');
  if (document.getElementById('blog-next-target-wordpress')?.checked) platforms.push('wordpress');
  if (contentSummary) {
    contentSummary.textContent = [
      externalReference ? '외부 참고 사용' : '외부 참고 안 함',
      readBlogNextSelectedText('blog-next-writing-strategy', '검색 중심'),
      readBlogNextSelectedText('blog-next-image-mode', '이미지 프롬프트만 포함')
    ].join(' · ');
  }
  if (publishSummary) {
    const summaryParts = [
      formatBlogPlatformList(platforms, ' + ') || '발행 대상 없음',
      readBlogNextSelectedText('blog-next-post-status', '즉시 발행')
    ];
    if (document.getElementById('blog-next-target-naver')?.checked) {
      summaryParts.push(document.getElementById('blog-next-runner-headless')?.checked === true ? '보이지 않게 실행' : '브라우저 표시');
    }
    publishSummary.textContent = summaryParts.join(' · ');
  }
}

function syncBlogNextScheduleField() {
  const scheduled = (document.getElementById('blog-next-post-status')?.value || 'publish') === 'schedule';
  const field = document.getElementById('blog-next-schedule-field');
  const input = document.getElementById('blog-next-schedule-date');
  const requiredIndicator = document.getElementById('blog-next-schedule-required');
  if (field) field.dataset.dependencyActive = String(scheduled);
  if (input) {
    input.disabled = !scheduled;
    input.required = scheduled;
  }
  if (requiredIndicator) requiredIndicator.hidden = !scheduled;
  syncBlogNextQuickFlowSummaries();
}

function syncBlogNextProviderDependentFields() {
  const naverSelected = document.getElementById('blog-next-target-naver')?.checked === true;
  const wordpressSelected = document.getElementById('blog-next-target-wordpress')?.checked === true;
  const field = document.getElementById('blog-next-headless-field');
  const input = document.getElementById('blog-next-runner-headless');
  const runnerBusy = (typeof blogNextRunnerActive !== 'undefined' && blogNextRunnerActive)
    || (typeof blogNextRunnerRequesting !== 'undefined' && blogNextRunnerRequesting);
  if (field) field.dataset.dependencyActive = String(naverSelected);
  if (input) input.disabled = !naverSelected || runnerBusy;
  [
    ['blog-next-naver-category-field', 'blog-next-naver-category', naverSelected],
    ['blog-next-wordpress-category-field', 'blog-next-wordpress-category', wordpressSelected]
  ].forEach(([fieldId, inputId, selected]) => {
    const categoryField = document.getElementById(fieldId);
    const categoryInput = document.getElementById(inputId);
    if (categoryField) categoryField.dataset.dependencyActive = String(selected);
    if (categoryInput) categoryInput.disabled = !selected;
  });
}

function readBlogNextTopicActionValidity() {
  const values = ['blog-next-subject', 'blog-next-keywords', 'blog-next-instruction']
    .map(id => String(document.getElementById(id)?.value || '').trim());
  const references = String(document.getElementById('blog-next-reference-url')?.value || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  const hasIdea = values.some(Boolean) || references.length > 0;
  const referencesValid = references.every(value => /^https?:\/\//i.test(value));
  const hasTarget = document.getElementById('blog-next-target-naver')?.checked === true
    || document.getElementById('blog-next-target-wordpress')?.checked === true;
  const scheduled = document.getElementById('blog-next-post-status')?.value === 'schedule';
  const scheduleValid = !scheduled || Boolean(document.getElementById('blog-next-schedule-date')?.value);
  return {
    ideaValid: hasIdea && referencesValid,
    readyValid: hasIdea && referencesValid && hasTarget && scheduleValid
  };
}

function syncBlogNextTopicActionAvailability() {
  const { ideaValid, readyValid } = readBlogNextTopicActionValidity();
  const aiDraftGenerating = typeof blogNextDraftState !== 'undefined' && blogNextDraftState.ai?.generating === true;
  const busy = (typeof blogNextTopicSubmitting !== 'undefined' && blogNextTopicSubmitting) || aiDraftGenerating;
  const editing = typeof blogNextEditingRowIndex !== 'undefined' && blogNextEditingRowIndex !== null;
  const editingReady = typeof blogNextEditingSourceStatus !== 'undefined'
    && blogNextEditingSourceStatus === '발행 준비 완료';
  const editingChanged = !editing || (
    typeof blogNextEditingInitialSnapshot !== 'undefined'
    && Boolean(blogNextEditingInitialSnapshot)
    && typeof snapshotBlogNextEditingPayload === 'function'
    && snapshotBlogNextEditingPayload() !== blogNextEditingInitialSnapshot
  );
  const runnerActive = (typeof blogNextRunnerActive !== 'undefined' && blogNextRunnerActive)
    || (typeof blogNextRunnerRequesting !== 'undefined' && blogNextRunnerRequesting);
  const save = document.getElementById('blog-next-save-topic');
  const enqueue = document.getElementById('blog-next-enqueue-topic');
  const publish = document.getElementById('blog-next-publish-now');
  const regenerate = document.getElementById('blog-next-regenerate-draft');
  const aiBlocked = typeof isAiTextBlocked === 'function' && isAiTextBlocked();
  const imageAiBlocked = document.getElementById('blog-next-image-mode')?.value === 'generate'
    && typeof isUiCapabilityUnavailable === 'function'
    && isUiCapabilityUnavailable('ai.image');
  const sheetBlocked = typeof isUiCapabilityUnavailable === 'function'
    && isUiCapabilityUnavailable('content.sheet');
  if (save) save.disabled = busy || sheetBlocked || !editingChanged || (editingReady ? !readyValid : !ideaValid);
  if (enqueue) enqueue.disabled = busy || sheetBlocked || !readyValid;
  if (publish) {
    publish.disabled = busy || runnerActive || (editing && !editingReady) || !ideaValid || aiBlocked || imageAiBlocked;
    if (aiBlocked || imageAiBlocked) publish.title = aiBlocked
      ? 'AI 글쓰기 모델 설정이 필요합니다.' : 'AI 이미지 모델 설정이 필요합니다.';
    else publish.removeAttribute('title');
  }
  if (regenerate) regenerate.disabled = busy || runnerActive || !ideaValid || aiBlocked || imageAiBlocked;
  syncBlogNextAiReadinessNotice();
  syncBlogNextAiImageReadinessNotice();
  syncBlogNextSheetReadinessNotice();
}

function syncBlogNextAiImageReadinessNotice() {
  const notice = document.getElementById('blog-next-ai-image-readiness');
  if (!notice) return;
  const blocked = document.getElementById('blog-next-image-mode')?.value === 'generate'
    && typeof isUiCapabilityUnavailable === 'function'
    && isUiCapabilityUnavailable('ai.image');
  notice.hidden = !blocked;
  const settingsBtn = document.getElementById('blog-next-ai-image-settings-btn');
  if (settingsBtn && !settingsBtn.dataset.bound) {
    settingsBtn.dataset.bound = 'true';
    settingsBtn.addEventListener('click', () => {
      if (typeof goToUiCapabilitySettings === 'function') void goToUiCapabilitySettings('ai.image');
    });
  }
}

function syncBlogNextAiReadinessNotice() {
  const notice = document.getElementById('blog-next-ai-readiness');
  if (!notice) return;
  const blocked = typeof isUiCapabilityUnavailable === 'function'
    ? isUiCapabilityUnavailable('ai.text')
    : (typeof isAiTextBlocked === 'function' && isAiTextBlocked());
  notice.hidden = !blocked;
  const settingsBtn = document.getElementById('blog-next-ai-settings-btn');
  if (settingsBtn && !settingsBtn.dataset.bound) {
    settingsBtn.dataset.bound = 'true';
    settingsBtn.addEventListener('click', () => {
      if (typeof goToAiWritingModelSettings === 'function') void goToAiWritingModelSettings();
    });
  }
}

function syncBlogNextSheetReadinessNotice() {
  const notice = document.getElementById('blog-next-sheet-readiness');
  if (!notice) return;
  const blocked = typeof isUiCapabilityUnavailable === 'function'
    && isUiCapabilityUnavailable('content.sheet');
  notice.hidden = !blocked;
  const settingsBtn = document.getElementById('blog-next-sheet-settings-btn');
  if (settingsBtn && !settingsBtn.dataset.bound) {
    settingsBtn.dataset.bound = 'true';
    settingsBtn.addEventListener('click', () => {
      if (typeof goToUiCapabilitySettings === 'function') void goToUiCapabilitySettings('content.sheet');
    });
  }
}

async function ensureBlogNextTopicStorageReady() {
  if (typeof ensureUiCapabilityReady !== 'function'
    || await ensureUiCapabilityReady('content.sheet')) return true;
  syncBlogNextTopicActionAvailability();
  setBlogNextTopicResult('글감을 보관하거나 대기열에 추가하려면 Google Spreadsheet를 먼저 연결해 주세요.', 'error');
  document.getElementById('blog-next-sheet-settings-btn')?.focus();
  return false;
}

function syncBlogNextHelpPlacement(trigger) {
  const tooltip = trigger?.querySelector?.('.tooltip-text');
  if (!tooltip) return;
  delete trigger.dataset.helpPlacement;
  const triggerRect = trigger.getBoundingClientRect();
  const tooltipWidth = tooltip.getBoundingClientRect().width;
  const disclosureRect = trigger.closest('.blog-next-disclosure')?.getBoundingClientRect();
  const safeInset = 12;
  const leftBoundary = Math.max(safeInset, disclosureRect?.left ?? safeInset);
  const rightBoundary = Math.min(window.innerWidth - safeInset, disclosureRect?.right ?? window.innerWidth - safeInset);
  const triggerCenter = triggerRect.left + (triggerRect.width / 2);
  if (triggerCenter - (tooltipWidth / 2) < leftBoundary) trigger.dataset.helpPlacement = 'start';
  else if (triggerCenter + (tooltipWidth / 2) > rightBoundary) trigger.dataset.helpPlacement = 'end';
}

function initBlogNextHelpPlacement(form) {
  form.querySelectorAll('.blog-next-help-trigger').forEach((trigger) => {
    const syncPlacement = () => syncBlogNextHelpPlacement(trigger);
    trigger.addEventListener('mouseenter', syncPlacement);
    trigger.addEventListener('focus', syncPlacement);
  });
}

function setBlogNextClearUndoAvailable(available) {
  const button = document.getElementById('blog-next-clear-undo');
  if (button) button.hidden = !available;
  if (!available) blogNextClearedTopicSnapshot = null;
}

function captureBlogNextClearableContent() {
  const values = Object.fromEntries(BLOG_NEXT_CLEARABLE_FIELD_IDS.map((id) => [
    id,
    document.getElementById(id)?.value || ''
  ]));
  const trendContext = typeof blogNextTrendContext !== 'undefined' && blogNextTrendContext
    ? { ...blogNextTrendContext }
    : null;
  return { values, trendContext };
}

function hasBlogNextClearableContent(snapshot) {
  return Object.values(snapshot?.values || {}).some(value => String(value).length > 0)
    || snapshot?.trendContext !== null;
}

function syncBlogNextTopicClearAction() {
  const editing = typeof blogNextEditingRowIndex !== 'undefined' && blogNextEditingRowIndex !== null;
  const clear = document.getElementById('blog-next-clear-topic');
  const cancel = document.getElementById('blog-next-cancel-edit');
  if (clear) clear.hidden = editing || !hasBlogNextClearableContent(captureBlogNextClearableContent());
  if (cancel) cancel.hidden = !editing;
  syncBlogNextTopicActionAvailability();
}

function restoreBlogNextClearedTopicContent() {
  const snapshot = blogNextClearedTopicSnapshot;
  if (!snapshot) return;
  Object.entries(snapshot.values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value;
  });
  if (typeof blogNextTrendContext !== 'undefined') blogNextTrendContext = snapshot.trendContext;
  syncBlogNextScheduleField();
  syncBlogNextQuickFlowSummaries();
  setBlogNextClearUndoAvailable(false);
  syncBlogNextTopicClearAction();
  setBlogNextTopicResult('지운 내용을 되돌렸습니다.', 'success');
  document.getElementById('blog-next-subject')?.focus();
}

function clearBlogNextTopicContent(options = {}) {
  BLOG_NEXT_CLEARABLE_FIELD_IDS
    .forEach((id) => { const element = document.getElementById(id); if (element) element.value = ''; });
  if (typeof clearBlogNextTrendContext === 'function') clearBlogNextTrendContext();
  if (options.preserveUndo !== true) setBlogNextClearUndoAvailable(false);
  syncBlogNextScheduleField();
  syncBlogNextQuickFlowSummaries();
  syncBlogNextTopicClearAction();
}
