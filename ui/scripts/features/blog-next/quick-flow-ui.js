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
    if (typeof syncBlogNextDraftProviderFields === 'function') syncBlogNextDraftProviderFields(target);
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
  if (typeof syncBlogNextDraftProviderFields === 'function') syncBlogNextDraftProviderFields(target);
  syncBlogNextProviderDependentFields();
  syncBlogNextScheduleField();
}

function syncBlogNextQuickFlowSummaries() {
  const topicSummary = document.getElementById('blog-next-topic-settings-summary');
  const contentSummary = document.getElementById('blog-next-content-settings-summary');
  const publishSummary = document.getElementById('blog-next-publish-settings-summary');
  const topicParts = [
    ['주제', 'blog-next-subject'],
    ['키워드', 'blog-next-keywords'],
    ['제목', 'blog-next-title'],
    ['경험·방향', 'blog-next-instruction']
  ].flatMap(([label, id]) => {
    const value = String(document.getElementById(id)?.value || '').replace(/\s+/g, ' ').trim();
    if (!value) return [];
    const excerpt = value.length > 32 ? `${value.slice(0, 32).trimEnd()}…` : value;
    return [`${label}: ${excerpt}`];
  });
  const externalReference = document.getElementById('blog-next-external-reference')?.checked === true;
  const platforms = [];
  if (document.getElementById('blog-next-target-naver')?.checked) platforms.push('naver');
  if (document.getElementById('blog-next-target-wordpress')?.checked) platforms.push('wordpress');
  if (document.getElementById('blog-next-target-site-hosting')?.checked) platforms.push('site-hosting');
  if (contentSummary) {
    contentSummary.textContent = [
      externalReference ? '외부 참고 사용' : '외부 참고 안 함',
      readBlogNextSelectedText('blog-next-writing-strategy', '검색 중심'),
      readBlogNextSelectedText('blog-next-image-mode', '이미지 프롬프트만 포함')
    ].join(' · ');
  }
  if (topicSummary) {
    topicSummary.textContent = topicParts.join(' · ') || '주제·키워드·제목과 담고 싶은 경험·방향을 정리합니다.';
  }
  if (publishSummary) {
    const siteOption = document.getElementById('blog-next-site-hosting-select')?.selectedOptions?.[0];
    const siteSelected = Boolean(siteOption?.dataset.projectId && siteOption?.dataset.siteId && !siteOption.disabled);
    const targetLabel = platforms.includes('site-hosting')
      ? siteSelected ? siteOption.textContent.trim() : '사이트 선택 필요'
      : formatBlogPlatformList(platforms, ' + ') || '발행 대상 없음';
    const vaultFolder = document.getElementById('blog-next-vault-folder-select');
    const siteKey = siteSelected ? `${siteOption.dataset.projectId}/${siteOption.dataset.siteId}` : '';
    const vaultNeedsFolder = siteSelected && siteOption.dataset.siteKind === 'vault';
    const folderSelected = vaultNeedsFolder && vaultFolder?.dataset.siteKey === siteKey && Boolean(vaultFolder.value);
    const summaryParts = [vaultNeedsFolder && !folderSelected ? '저장 폴더 선택 필요' : targetLabel];
    if ((!platforms.includes('site-hosting') || siteSelected) && (!vaultNeedsFolder || folderSelected)) {
      if (folderSelected) summaryParts[0] += ` · ${vaultFolder.selectedOptions[0].textContent.trim()}`;
      summaryParts.push(readBlogNextSelectedText('blog-next-post-status', '즉시 발행'));
    }
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
  const draftType = typeof blogNextActiveInputMode !== 'undefined' && BLOG_NEXT_DRAFT_TYPES.includes(blogNextActiveInputMode)
    ? blogNextActiveInputMode : 'ai';
  if (typeof syncBlogNextDraftProviderFields === 'function') syncBlogNextDraftProviderFields(draftType);
  const naverSelected = document.getElementById('blog-next-target-naver')?.checked === true;
  const field = document.getElementById('blog-next-headless-field');
  const input = document.getElementById('blog-next-runner-headless');
  const runnerBusy = (typeof blogNextRunnerActive !== 'undefined' && blogNextRunnerActive)
    || (typeof blogNextRunnerRequesting !== 'undefined' && blogNextRunnerRequesting);
  if (field) field.dataset.dependencyActive = String(naverSelected);
  if (input) input.disabled = !naverSelected || runnerBusy;
  const siteSelected = document.getElementById('blog-next-target-site-hosting')?.checked === true;
  const category = document.getElementById('blog-next-category');
  const siteKind = document.getElementById('blog-next-site-hosting-select')?.selectedOptions?.[0]?.dataset.siteKind;
  if (category && typeof syncBlogNextDraftProviderFields !== 'function') category.disabled = siteSelected && siteKind !== 'vault';
}

function readBlogNextTopicActionValidity() {
  const subject = String(document.getElementById('blog-next-subject')?.value || '').trim();
  const references = String(document.getElementById('blog-next-reference-url')?.value || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  const referencesValid = references.every(value => /^https?:\/\//i.test(value));
  const hasTarget = document.getElementById('blog-next-target-naver')?.checked === true
    || document.getElementById('blog-next-target-wordpress')?.checked === true
    || document.getElementById('blog-next-target-site-hosting')?.checked === true;
  const siteHostingSelected = document.getElementById('blog-next-target-site-hosting')?.checked === true;
  const siteOption = document.getElementById('blog-next-site-hosting-select')?.selectedOptions?.[0];
  let siteTargetReady = !siteHostingSelected
    || Boolean(siteOption?.dataset.projectId && siteOption?.dataset.siteId && !siteOption.disabled);
  if (siteTargetReady && siteHostingSelected && siteOption?.dataset.siteKind === 'vault') {
    const folderSelect = document.getElementById('blog-next-vault-folder-select');
    const siteKey = `${siteOption.dataset.projectId}/${siteOption.dataset.siteId}`;
    siteTargetReady = folderSelect?.dataset.siteKey === siteKey && Boolean(folderSelect.value);
  }
  const scheduled = document.getElementById('blog-next-post-status')?.value === 'schedule';
  const scheduleValid = !scheduled || Boolean(document.getElementById('blog-next-schedule-date')?.value);
  return {
    ideaValid: Boolean(subject) && referencesValid,
    siteTargetReady,
    readyValid: Boolean(subject) && referencesValid && hasTarget && siteTargetReady && scheduleValid
  };
}

function syncBlogNextTopicActionAvailability() {
  const { ideaValid, readyValid, siteTargetReady } = readBlogNextTopicActionValidity();
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
  if (enqueue) {
    // New quick-flow queue entries collect their publishing target in the dialog.
    enqueue.disabled = busy || sheetBlocked || !(editing ? readyValid : ideaValid);
    enqueue.removeAttribute('title');
  }
  if (publish) {
    const siteTargetMissing = document.getElementById('blog-next-target-site-hosting')?.checked === true && !siteTargetReady;
    publish.disabled = busy || runnerActive || (editing && !editingReady) || !ideaValid || siteTargetMissing || aiBlocked || imageAiBlocked;
    if (aiBlocked || imageAiBlocked) publish.title = aiBlocked
      ? 'AI 글쓰기 모델 설정이 필요합니다.' : 'AI 이미지 모델 설정이 필요합니다.';
    else if (siteTargetMissing) publish.title = '발행하려면 사이트를 선택해 주세요.';
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
  const cancel = document.getElementById('blog-next-cancel-edit');
  if (cancel) cancel.hidden = !editing;
  syncBlogNextTopicActionAvailability();
}

function clearBlogNextTopicContent() {
  BLOG_NEXT_CLEARABLE_FIELD_IDS
    .forEach((id) => { const element = document.getElementById(id); if (element) element.value = ''; });
  if (typeof clearBlogNextTrendContext === 'function') clearBlogNextTrendContext();
  syncBlogNextScheduleField();
  syncBlogNextQuickFlowSummaries();
  syncBlogNextTopicClearAction();
}
