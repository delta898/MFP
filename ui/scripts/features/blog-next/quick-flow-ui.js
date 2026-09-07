function readBlogNextSelectedText(id, fallback = '') {
  const select = document.getElementById(id);
  return String(select?.selectedOptions?.[0]?.textContent || fallback).trim();
}

function syncBlogNextQuickFlowSummaries() {
  const contentSummary = document.getElementById('blog-next-content-settings-summary');
  const publishSummary = document.getElementById('blog-next-publish-settings-summary');
  const externalReference = document.getElementById('blog-next-external-reference')?.checked === true;
  const platforms = [];
  if (document.getElementById('blog-next-target-naver')?.checked) platforms.push('네이버');
  if (document.getElementById('blog-next-target-wordpress')?.checked) platforms.push('워드프레스');
  if (contentSummary) {
    contentSummary.textContent = [
      externalReference ? '외부 참고 사용' : '외부 참고 안 함',
      readBlogNextSelectedText('blog-next-writing-strategy', '검색 중심'),
      readBlogNextSelectedText('blog-next-image-mode', '이미지 프롬프트만 포함')
    ].join(' · ');
  }
  if (publishSummary) {
    const summaryParts = [
      platforms.length > 0 ? platforms.join('+') : '발행 대상 없음',
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
  const busy = typeof blogNextTopicSubmitting !== 'undefined' && blogNextTopicSubmitting;
  const editing = typeof blogNextEditingRowIndex !== 'undefined' && blogNextEditingRowIndex !== null;
  const editingReady = typeof blogNextEditingSourceStatus !== 'undefined'
    && blogNextEditingSourceStatus === '발행 준비 완료';
  const runnerActive = (typeof blogNextRunnerActive !== 'undefined' && blogNextRunnerActive)
    || (typeof blogNextRunnerRequesting !== 'undefined' && blogNextRunnerRequesting);
  const save = document.getElementById('blog-next-save-topic');
  const enqueue = document.getElementById('blog-next-enqueue-topic');
  const publish = document.getElementById('blog-next-publish-now');
  if (save) save.disabled = busy || editingReady || !ideaValid;
  if (enqueue) enqueue.disabled = busy || !readyValid;
  if (publish) publish.disabled = busy || runnerActive || (editing && !editingReady) || !readyValid;
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
