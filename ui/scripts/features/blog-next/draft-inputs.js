const BLOG_NEXT_DRAFT_TYPES = Object.freeze(['ai']);
const BLOG_NEXT_DRAFT_PREVIEW_DELAY_MS = 350;
// Keep the legacy preview image manager available in code, but dormant while the workspace owns image editing.
const BLOG_NEXT_LEGACY_PREVIEW_IMAGE_MANAGER_ENABLED = false;
let blogNextDraftInputsBound = false;

const blogNextDraftState = {
  ai: { preview: null, previewTimer: null, requestId: 0, publishing: false, generating: false, draftId: '', revision: 0, imageWorking: false, imageOperation: null, imageOperationNotice: null, imageSafetyLocked: false, previewSyncFailed: false, workspaceMode: 'block', editor: null, previewPromise: null, syncedPreviewKey: '' }
};

function blogNextDraftField(type, name) {
  const fieldIds = {
    'target-naver': 'blog-next-target-naver',
    'target-wordpress': 'blog-next-target-wordpress',
    'target-site-hosting': 'blog-next-target-site-hosting',
    'naver-category': 'blog-next-naver-category',
    'wordpress-category': 'blog-next-wordpress-category',
    'post-status': 'blog-next-post-status',
    'schedule-date': 'blog-next-schedule-date',
    headless: 'blog-next-runner-headless'
  };
  return getBlogNextSettingsElement(fieldIds[name] || '') || null;
}

function stripBlogNextMarkdownForCounts(markdown = '') {
  return String(markdown || '')
    .replace(/^\s*\[\[IMAGE(?:_\d+)?\b[\s\S]*?^\]\]\s*$/gm, '\n')
    .replace(/^\s*---\s*$\n[\s\S]*?^\s*---\s*$/m, '')
    .replace(/^\s*#\s+.*(?:\n|$)/m, '')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/^```[^\n]*\n?|```$/g, ''))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`)([\s\S]*?)\1/g, '$2')
    .replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '$1')
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function countBlogNextKeywordOccurrences(text, keyword) {
  const normalizedKeyword = String(keyword || '').trim();
  if (!normalizedKeyword) return 0;
  let count = 0;
  let offset = 0;
  const source = String(text || '').toLocaleLowerCase();
  const needle = normalizedKeyword.toLocaleLowerCase();
  while ((offset = source.indexOf(needle, offset)) !== -1) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

function updateBlogNextManuscriptCounts(type, markdown = '') {
  const container = document.querySelector(`[data-manuscript-counts="${type}"]`);
  if (!container) return;
  const source = String(markdown || '');
  const heading = source.match(/^\s*#\s+(.+?)\s*$/m)?.[1] || '';
  const previewTitle = blogNextDraftState[type]?.preview?.title || '';
  const title = heading || previewTitle;
  const body = stripBlogNextMarkdownForCounts(source);
  const titleCount = Array.from(title).length;
  const bodyCount = Array.from(body).length;
  const wordCount = body.trim() ? body.trim().split(/\s+/u).length : 0;
  container.querySelector('[data-count-title]').textContent = `제목 ${titleCount}자`;
  container.querySelector('[data-count-body]').textContent = `본문 ${bodyCount.toLocaleString()}자`;
  container.querySelector('[data-count-words]').textContent = `${wordCount.toLocaleString()}어절`;

  const keywords = type === 'ai'
    ? String(getBlogNextSettingsElement('blog-next-keywords')?.value || '').split(/[,\n]/u).map(value => value.trim()).filter(Boolean)
    : [];
  const keywordArea = container.querySelector('[data-count-keywords]');
  if (keywords.length) {
    keywordArea.textContent = `키워드별 본문 출현 횟수 · ${keywords.map(keyword => `${keyword} ${countBlogNextKeywordOccurrences(body, keyword)}회`).join(' · ')}`;
    container.classList.add('has-keywords');
  } else {
    keywordArea.textContent = '키워드 통계가 없습니다.';
    container.classList.remove('has-keywords');
  }
}

function syncBlogNextDraftImageSafety(type, preview = null) {
  const state = blogNextDraftState[type];
  const select = blogNextDraftField(type, 'post-status');
  const hint = getBlogNextSettingsElement('blog-next-publish-safety-hint');
  const message = getBlogNextSettingsElement('blog-next-publish-safety-message');
  const imageAction = getBlogNextSettingsElement('blog-next-publish-image-action');
  if (!state || !select) return;
  const unresolvedImageCount = Array.isArray(preview?.images)
    ? preview.images.filter((image) => !image.excluded && !image.exists && String(image.prompt || '').trim()).length
    : 0;
  const imagePreparationRequired = BLOG_NEXT_DRAFT_TYPES.includes(type) && unresolvedImageCount > 0;
  Array.from(select.options).forEach((option) => {
    if (option.value === 'publish' || option.value === 'schedule') {
      option.disabled = imagePreparationRequired || (option.value === 'schedule' && isBlogNextSiteHostingTarget(type));
    }
  });
  if (imagePreparationRequired && select.value !== 'draft') select.value = 'draft';
  if (hint) {
    const hintText = imagePreparationRequired
      ? `미지정 이미지 ${unresolvedImageCount}개가 있습니다. 지금은 임시 저장만 가능합니다.`
      : '';
    if (message) message.textContent = hintText;
    else hint.textContent = hintText;
    hint.hidden = unresolvedImageCount === 0;
  }
  if (imageAction) {
    imageAction.hidden = !imagePreparationRequired;
    imageAction.textContent = '이미지 블록으로 이동 ↑';
    imageAction.setAttribute('aria-controls', 'blog-next-ai-editor');
  }
  state.imageSafetyLocked = imagePreparationRequired;
  syncBlogNextDraftSchedule(type);
  syncBlogNextDraftSettingsSummary(type);
}

function focusBlogNextDraftImages() {
  const state = blogNextDraftState.ai;
  if (state.workspaceMode !== 'block') document.querySelector('[data-ai-workspace-mode="block"]')?.click();
  requestAnimationFrame(() => {
    const firstUnassigned = document.getElementById('blog-next-ai-editor')?.querySelector('.manuscript-image-block:has(.manuscript-image-block-placeholder)');
    if (!firstUnassigned) return;
    firstUnassigned.scrollIntoView({ behavior: 'smooth', block: 'center' });
    requestAnimationFrame(() => firstUnassigned.querySelector('[aria-label="이미지 생성 프롬프트 편집"]')?.focus({ preventScroll: true }));
  });
}

async function buildBlogNextDraftPayload() {
  const type = 'ai';
  const settings = readBlogNextDraftSettings(type);
  const input = readBlogNextTopicPayload('generate-draft');
  return {
    ...input,
    ...settings,
    ...(blogNextDraftState.ai.draftId ? { markdownText: document.getElementById('blog-next-ai-markdown')?.value || '' } : {}),
    imageMode: input.imageMode,
    targets: settings.targets,
    platforms: undefined
  };
}

function mergeCanonicalRelatedPostsMarkdown(currentMarkdown, requestedMarkdown, canonicalMarkdown, decision) {
  const current = String(currentMarkdown || '');
  const requested = String(requestedMarkdown || '');
  const canonical = String(canonicalMarkdown || '');
  if (decision !== 'automatic' || !canonical || canonical === requested) return current;
  if (current === requested) return canonical;

  const requestedLines = requested.split('\n');
  const canonicalLines = canonical.split('\n');
  let prefixLength = 0;
  while (prefixLength < requestedLines.length
    && prefixLength < canonicalLines.length
    && requestedLines[prefixLength] === canonicalLines[prefixLength]) prefixLength += 1;
  let suffixLength = 0;
  while (suffixLength < requestedLines.length - prefixLength
    && suffixLength < canonicalLines.length - prefixLength
    && requestedLines[requestedLines.length - 1 - suffixLength] === canonicalLines[canonicalLines.length - 1 - suffixLength]) suffixLength += 1;
  const section = canonicalLines.slice(prefixLength, canonicalLines.length - suffixLength).join('\n').trim();
  if (!section) return current;
  if (current.includes(section)) return current;
  const sectionHeading = section.split('\n').find((line) => /^#{2,6}\s+/.test(line))?.trim();
  if (sectionHeading && current.split('\n').some((line) => line.trim() === sectionHeading)) return current;
  const lines = current.replace(/\s+$/, '').split('\n');
  let insertAt = lines.length;
  while (insertAt > 0 && /^#[\p{L}\p{N}_]+(?:\s+#[\p{L}\p{N}_]+)*$/u.test(lines[insertAt - 1].trim())) insertAt -= 1;
  lines.splice(insertAt, 0, ...(insertAt < lines.length ? ['', section, ''] : ['', section]));
  return lines.join('\n').replace(/\n*$/, '\n');
}

function summarizeBlogNextDraftWarnings(type, validation = null, preview = null) {
  const warnings = Array.isArray(validation?.warnings) ? validation.warnings : [];
  const notices = warnings.slice();
  if (BLOG_NEXT_DRAFT_TYPES.includes(type) && preview?.draftId) {
    const relatedStatus = String(preview?.relatedPosts?.status || '');
    if (relatedStatus === 'unavailable') {
      notices.push('연결된 블로그에서 함께 보여줄 글을 찾지 못해 연관글을 넣지 않았습니다.');
    } else if (relatedStatus === 'failed') {
      notices.push('연관글을 가져오지 못해 넣지 않았습니다. 다시 저장하면 시도합니다.');
    }
  }
  const missingCount = Number(preview?.stats?.imageMissingCount || 0);
  if (!BLOG_NEXT_DRAFT_TYPES.includes(type) || missingCount === 0) return notices;

  const imageWarningPattern = /^\d+_image 규칙의 이미지 파일을 찾지 못했습니다\./;
  const imageWarnings = notices.filter(message => imageWarningPattern.test(String(message || '')));
  if (imageWarnings.length === 0) return notices;
  return notices.filter(message => !imageWarningPattern.test(String(message || '')));
}

function setBlogNextDraftValidation(type, validation = null, fallback = '', preview = null) {
  const element = document.querySelector(`[data-blog-next-draft-validation="${type}"]`);
  if (!element) return;
  element.classList.remove('has-error', 'has-warning', 'is-ok');
  const errors = Array.isArray(validation?.errors) ? validation.errors : [];
  const warnings = summarizeBlogNextDraftWarnings(type, validation, preview);
  let message = '';
  if (errors.length > 0) {
    element.classList.add('has-error');
    message = errors.join('\n');
  } else if (warnings.length > 0) {
    element.classList.add('has-warning');
    message = warnings.join('\n');
  } else {
    message = fallback;
  }
  element.textContent = message;
  element.hidden = !message;
}





function renderBlogNextDraftBodyHtml(preview = {}) {
  const items = Array.isArray(preview.contentItems) ? preview.contentItems : [];
  const imageMap = new Map((Array.isArray(preview.images) ? preview.images : []).map((image) => [Number(image.index), image]));
  const fragments = [];
  let activeListType = '';
  const closeList = () => {
    if (!activeListType) return;
    fragments.push(activeListType === 'ordered' ? '</ol>' : '</ul>');
    activeListType = '';
  };
  items.forEach((item) => {
    const itemType = String(item?.type || 'paragraph');
    const text = renderInlinePreviewHtml(item?.text || '', item?.boldRanges);
    if (itemType !== 'list-item') closeList();
    if (itemType === 'header-h2') fragments.push(`<h2>${text}</h2>`);
    else if (itemType === 'header-h3') fragments.push(`<h3>${text}</h3>`);
    else if (itemType === 'quote') fragments.push(`<blockquote><p>${text}</p></blockquote>`);
    else if (itemType === 'list-item') {
      const nextListType = item?.listType === 'ordered' ? 'ordered' : 'unordered';
      if (activeListType !== nextListType) {
        closeList();
        fragments.push(nextListType === 'ordered' ? '<ol>' : '<ul>');
        activeListType = nextListType;
      }
      fragments.push(`<li>${text}</li>`);
    } else if (itemType === 'image') {
      const image = imageMap.get(Number(item.index));
      const imageUrl = image?.exists ? image.imageUrl || '' : '';
      const imageTitle = image?.title || item.text || `IMAGE_${item.index}`;
      const prompt = image?.prompt || item.prompt || '';
      fragments.push(imageUrl
        ? `<figure><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(imageTitle)}" loading="lazy" data-manuscript-preview-image></figure>`
        : prompt ? `<div class="local-markdown-image-source-text"><div class="image-caption-prompt" aria-label="이미지 프롬프트 원문">${escapeHtml(prompt)}</div></div>` : '');
    } else if (itemType === 'separator') fragments.push('<div class="local-markdown-preview-separator" role="separator" aria-label="구분선"></div>');
    else if (itemType === 'newline') fragments.push('<div style="height:8px"></div>');
    else fragments.push(`<p>${text}</p>`);
  });
  closeList();
  return fragments.join('') || '<div class="local-markdown-empty">미리볼 본문이 없습니다.</div>';
}

function renderBlogNextDraftPreview(type, preview = null) {
  if (type !== 'ai') return;
  const container = document.querySelector('[data-blog-next-draft-preview="ai"]');
  const state = blogNextDraftState.ai;
  state.preview = preview;
  const markdownInput = document.getElementById('blog-next-ai-markdown');
  updateBlogNextManuscriptCounts('ai', markdownInput?.value || '');
  syncBlogNextDraftImageSafety('ai', preview);
  syncBlogNextDraftExecutionState();
  if (!container || !preview) {
    if (container) container.hidden = true;
    document.querySelector('[data-ai-editor-rail]')?.removeAttribute('hidden');
    document.querySelector('[data-ai-editor-workspace]')?.removeAttribute('hidden');
    const actions = document.querySelector('[data-blog-next-draft-actions="ai"]');
    if (actions) actions.hidden = typeof blogNextEditingRowIndex !== 'undefined' && blogNextEditingRowIndex !== null;
    return;
  }
  container.hidden = state.workspaceMode !== 'view';
  document.querySelector('[data-ai-editor-workspace]')?.removeAttribute('hidden');
  document.querySelector('[data-ai-editor-rail]')?.removeAttribute('hidden');
  state.editor?.syncImages?.(preview.images || [], state.imageOperation);
  const actions = document.querySelector('[data-blog-next-draft-actions="ai"]');
  if (actions) actions.hidden = false;
  const title = container.querySelector('[data-draft-preview-title]');
  const body = container.querySelector('[data-draft-preview-body]');
  const images = container.querySelector('[data-draft-preview-images]');
  const imageDetails = container.querySelector('[data-draft-preview-image-details]');
  const imageSummary = container.querySelector('[data-draft-preview-image-summary]');
  if (title) title.textContent = preview.title || '제목 없음';
  const stats = preview.stats || {};
  if (body) body.innerHTML = renderBlogNextDraftBodyHtml(preview);
  if (body) bindBlogNextManuscriptBodyImageFallback(body);
  if (images) images.replaceChildren();
  if (imageDetails) imageDetails.hidden = true;
  if (imageSummary) imageSummary.textContent = `누락 ${stats.imageMissingCount || 0}개`;
  setLocalMarkdownPreviewDensity(container, body, images, stats);
  if (typeof arrangeBlogNextAiWorkflow === 'function') arrangeBlogNextAiWorkflow();
  setBlogNextDraftValidation('ai', preview.validation, '', preview);
  if (typeof syncBlogNextPublishMutationControls === 'function') syncBlogNextPublishMutationControls();
  syncBlogNextImageAiReadiness();
}

async function loadBlogNextDraftPreview(type = 'ai') {
  if (type !== 'ai') return null;
  const state = blogNextDraftState.ai;
  clearTimeout(state.previewTimer);
  const markdownInput = document.getElementById('blog-next-ai-markdown');
  if (!markdownInput?.value?.trim()) {
    renderBlogNextDraftPreview('ai', null);
    setBlogNextDraftValidation('ai');
    return null;
  }
  const syncKey = getBlogNextAiSyncKey();
  if (state.previewPromise) {
    await state.previewPromise;
    if (state.preview && !state.previewSyncFailed && state.syncedPreviewKey === getBlogNextAiSyncKey()) return state.preview;
    return loadBlogNextDraftPreview('ai');
  }
  if (state.preview && !state.previewSyncFailed && state.syncedPreviewKey === syncKey) return state.preview;
  const requestId = ++state.requestId;
  const markdownAtRequest = markdownInput.value;
  const request = (async () => {
    try {
      if (!state.preview) setBlogNextDraftValidation('ai', null, '원고를 확인하고 있습니다.');
      const payload = await buildBlogNextDraftPayload('ai');
      const preview = state.draftId
        ? await postJson(`/api/v1/blog/manuscript-drafts/${encodeURIComponent(state.draftId)}/markdown`, { ...payload, revision: state.revision })
        : await postJson('/api/v1/blog/manuscript-drafts/paste', {
          ...readBlogNextDraftSettings('ai'), markdownText: markdownAtRequest
        });
      if (requestId !== state.requestId) return null;
      state.draftId = preview.draftId;
      state.revision = preview.revision;
      const currentMarkdown = markdownInput.value;
      const changedDuringRequest = currentMarkdown !== markdownAtRequest;
      const canonicalMarkdown = String(preview.rawMarkdown || '');
      if (canonicalMarkdown && canonicalMarkdown !== markdownAtRequest) {
        const nextMarkdown = mergeCanonicalRelatedPostsMarkdown(currentMarkdown, markdownAtRequest, canonicalMarkdown, preview.relatedPosts?.decision);
        if (nextMarkdown !== currentMarkdown) {
          markdownInput.value = nextMarkdown;
          state.editor?.setMarkdown(nextMarkdown);
        }
      }
      state.syncedPreviewKey = changedDuringRequest ? syncKey : getBlogNextAiSyncKey();
      if (preview.draftId !== state.preview?.draftId) state.imageOperationNotice = null;
      state.previewSyncFailed = false;
      renderBlogNextDraftPreview('ai', preview);
      return preview;
    } catch (error) {
      if (requestId !== state.requestId) return null;
      state.previewSyncFailed = true;
      renderBlogNextDraftPreview('ai', state.preview);
      setBlogNextDraftValidation('ai', { errors: [error.message || '원고를 확인하지 못했습니다.'] }, '', state.preview);
      syncBlogNextDraftExecutionState();
      return null;
    }
  })();
  state.previewPromise = request;
  try { return await request; }
  finally { if (state.previewPromise === request) state.previewPromise = null; }
}

function getBlogNextAiSyncKey() {
  return JSON.stringify({
    markdownText: document.getElementById('blog-next-ai-markdown')?.value || '',
    settings: readBlogNextDraftSettings('ai')
  });
}

async function generateBlogNextManuscriptImagePrompt(type, values) {
  if (type !== 'ai') throw new Error('지원하지 않는 원고 작성 방식입니다.');
  const state = blogNextDraftState.ai;
  if (state.imageWorking || state.promptGenerating || state.publishing) throw new Error('다른 작업이 진행 중입니다.');
  state.promptGenerating = true;
  if (typeof syncBlogNextDraftExecutionState === 'function') syncBlogNextDraftExecutionState();
  try {
    if (typeof ensureUiCapabilityReady === 'function' && !await ensureUiCapabilityReady('ai.text')) throw new Error('AI 글쓰기 모델 설정이 필요합니다.');
    if (!await flushBlogNextAiDraftBeforeImageGeneration()) throw new Error('변경한 원고를 저장하지 못해 생성을 시작하지 않았습니다.');
    if (!state.draftId) throw new Error('원고 작업공간을 준비하지 못했습니다.');
    return await postJson(`/api/v1/blog/manuscript-drafts/${encodeURIComponent(state.draftId)}/image-slots/${encodeURIComponent(values.slotId)}/prompt`, {
      title: values.title, prompt: values.prompt, instruction: values.instruction
    });
  } finally {
    state.promptGenerating = false;
    if (typeof syncBlogNextDraftExecutionState === 'function') syncBlogNextDraftExecutionState();
  }
}

async function flushBlogNextAiDraftBeforeImageGeneration() {
  const state = blogNextDraftState.ai;
  const input = document.getElementById('blog-next-ai-markdown');
  if (!input?.value.trim()) return false;
  clearTimeout(state.previewTimer);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const expectedKey = getBlogNextAiSyncKey();
    if (state.previewPromise) await state.previewPromise;
    if (state.preview && !state.previewSyncFailed && state.syncedPreviewKey === getBlogNextAiSyncKey()) return true;
    if (getBlogNextAiSyncKey() !== expectedKey) continue;
    await loadBlogNextDraftPreview('ai');
    if (state.preview && !state.previewSyncFailed && state.syncedPreviewKey === getBlogNextAiSyncKey()) return true;
  }
  setBlogNextDraftValidation('ai', { errors: ['변경한 원고를 저장하지 못해 이미지 생성을 시작하지 않았습니다. 잠시 후 다시 시도해 주세요.'] }, '', state.preview);
  return false;
}

function restoreBlogNextEditorImages(state) {
  const preview = state?.preview;
  state?.editor?.syncImages?.(
    preview?.images || [],
    state?.imageOperation || null,
    state?.imageMutationSlotId || ''
  );
}

function setBlogNextAiWorkspaceMode(mode, state, editorRoot, markdownInput) {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const activeModeControl = document.activeElement?.matches?.('[data-ai-workspace-mode]') ? document.activeElement : null;
  const modeControlTop = activeModeControl?.getBoundingClientRect().top;
  state.workspaceMode = mode;
  document.querySelectorAll('[data-ai-workspace-mode]').forEach((control) => {
    control.setAttribute('aria-pressed', String(control.dataset.aiWorkspaceMode === mode));
  });
  editorRoot.hidden = mode !== 'block';
  markdownInput.hidden = mode !== 'markdown';
  document.querySelector('[data-ai-formatting-toolbar]')?.toggleAttribute('hidden', mode !== 'block');
  const preview = document.querySelector('[data-blog-next-draft-preview="ai"]');
  if (preview) preview.hidden = mode !== 'view' || !state.preview;
  if (mode === 'markdown') requestAnimationFrame(() => resizeBlogNextMarkdownEditor(markdownInput));
  requestAnimationFrame(() => {
    window.scrollTo(scrollX, scrollY);
    if (activeModeControl && Number.isFinite(modeControlTop)) {
      const main = document.querySelector('.main');
      if (main) main.scrollTop += activeModeControl.getBoundingClientRect().top - modeControlTop;
    }
  });
}

function resizeBlogNextMarkdownEditor(textarea) {
  if (!textarea || textarea.hidden) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.max(420, textarea.scrollHeight)}px`;
}

function scheduleBlogNextDraftPreview(type = 'ai') {
  if (type !== 'ai') return;
  const state = blogNextDraftState.ai;
  clearTimeout(state.previewTimer);
  state.previewTimer = setTimeout(() => loadBlogNextDraftPreview('ai'), BLOG_NEXT_DRAFT_PREVIEW_DELAY_MS);
}

function initManuscriptEditorStickyOffsets() {
  const main = document.querySelector('.main');
  const mobileTopbar = document.querySelector('.mobile-topbar');
  if (!main || !mobileTopbar || main.dataset.manuscriptStickyOffsetsBound === 'true') return;
  main.dataset.manuscriptStickyOffsetsBound = 'true';

  const syncOffset = () => {
    const height = getComputedStyle(mobileTopbar).display === 'none'
      ? 0
      : mobileTopbar.getBoundingClientRect().height;
    main.style.setProperty('--mobile-topbar-block-size', `${height}px`);
  };
  syncOffset();
  window.addEventListener('resize', syncOffset, { passive: true });
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(syncOffset);
    observer.observe(mobileTopbar);
    main._manuscriptStickyOffsetObserver = observer;
  }
}

function initBlogNextDraftInputs() {
  void loadBlogNextSiteHostingTargets({ preserveSelection: false });
  initManuscriptEditorStickyOffsets();
  if (blogNextDraftInputsBound) return;
  blogNextDraftInputsBound = true;
  document.addEventListener('click', (event) => {
    const retry = event.target?.closest?.('[data-blog-next-setting-key="blog-next-site-hosting-retry"], #blog-next-site-hosting-retry');
    if (!retry) return;
    void loadBlogNextSiteHostingTargets({ preserveSelection: true });
  });
  getBlogNextSettingsElement('blog-next-category')?.addEventListener('input', () => {
    const type = BLOG_NEXT_DRAFT_TYPES.includes(blogNextActiveInputMode) ? blogNextActiveInputMode : 'ai';
    captureBlogNextPublishingTargetSettings(type);
    if (typeof rememberBlogNextTopicDefaultsForSetting === 'function') rememberBlogNextTopicDefaultsForSetting('blog-next-category');
    syncBlogNextDraftSettingsSummary(type);
  });
  document.addEventListener('change', (event) => {
    if (event.target?.dataset.blogNextSettingKey !== 'blog-next-site-hosting-select'
      && event.target?.id !== 'blog-next-site-hosting-select') return;
    const type = BLOG_NEXT_DRAFT_TYPES.includes(blogNextActiveInputMode) ? blogNextActiveInputMode : 'ai';
    syncBlogNextPublishingTargetSettings(type, { force: true });
    persistBlogNextPublishingDefaults(type, { clearMissingSite: true });
    if (blogNextDraftState[type]) blogNextDraftState[type].siteHostingPosted = false;
    setBlogNextSiteHostingMessage('');
    syncBlogNextDraftSettingsSummary(type);
    syncBlogNextDraftExecutionState();
  });
  document.addEventListener('click', async (event) => {
    const button = event.target?.closest?.('[data-blog-next-setting-key="blog-next-vault-folder-choose"], #blog-next-vault-folder-choose');
    if (!button) return;
    const siteOption = getBlogNextSettingsElement('blog-next-site-hosting-select')?.selectedOptions?.[0];
    const folderSelect = getBlogNextSettingsElement('blog-next-vault-folder-select');
    if (!siteOption?.dataset.projectId || !siteOption?.dataset.siteId || siteOption.dataset.siteKind !== 'vault' || !folderSelect) return;
    const { projectId, siteId } = siteOption.dataset;
    const currentPath = getBlogNextVaultFolderValue()
      || blogNextPublishSettingsByTarget.get(`site-hosting:${projectId}/${siteId}`)?.category
      || '.';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    setBlogNextVaultFolderMessage('Vault 폴더 선택 창을 여는 중입니다.');
    try {
      const selection = await postJson(
        `/api/v1/site-hosting/projects/${encodeURIComponent(projectId)}/sites/${encodeURIComponent(siteId)}/vault-folder`,
        { currentPath }
      );
      if (selection?.cancelled) {
        if (selection.startPathReset) {
          await loadBlogNextVaultFolders({ preserveSelection: true });
          setBlogNextVaultFolderMessage('마지막으로 선택한 폴더를 찾지 못해 Vault root에서 열었습니다. 저장 폴더를 다시 선택해 주세요.', 'error');
        }
        return;
      }
      await loadBlogNextVaultFolders({ preserveSelection: false });
      let option = Array.from(folderSelect.options).find((candidate) => candidate.value === selection.path);
      if (!option && selection.path) {
        option = new Option(selection.path === '.' ? `${selection.name} (Vault root)` : selection.path, selection.path);
        folderSelect.add(option);
      }
      if (!option) throw new Error('선택한 Vault 폴더를 확인하지 못했습니다. 다시 선택해 주세요.');
      option.selected = true;
      folderSelect.dataset.siteKey = `${projectId}/${siteId}`;
      syncBlogNextVaultFolderDisplay(folderSelect);
      folderSelect.dispatchEvent(new Event('change', { bubbles: true }));
      if (selection.startPathReset) setBlogNextVaultFolderMessage('마지막 폴더가 없어 Vault root에서 선택 창을 열었습니다.');
    } catch (error) {
      setBlogNextVaultFolderMessage(error?.message || 'Vault 폴더를 선택하지 못했습니다.', 'error');
    } finally {
      button.setAttribute('aria-busy', 'false');
      button.disabled = getBlogNextSettingsElement('blog-next-target-site-hosting')?.checked !== true
        || siteOption.dataset.siteKind !== 'vault';
    }
  });
  document.addEventListener('change', (event) => {
    if (event.target?.dataset.blogNextSettingKey !== 'blog-next-vault-folder-select'
      && event.target?.id !== 'blog-next-vault-folder-select') return;
    const type = BLOG_NEXT_DRAFT_TYPES.includes(blogNextActiveInputMode) ? blogNextActiveInputMode : 'ai';
    syncBlogNextVaultFolderDisplay(getBlogNextSettingsElement('blog-next-vault-folder-select'));
    const key = getBlogNextPublishingTargetKey(type);
    if (key) {
      const current = blogNextPublishSettingsByTarget.get(key) || {};
      blogNextPublishSettingsByTarget.set(key, { ...current, category: getBlogNextVaultFolderValue() });
      try { sessionStorage.setItem(BLOG_NEXT_PUBLISH_SETTINGS_SESSION_KEY, JSON.stringify(Object.fromEntries(blogNextPublishSettingsByTarget))); }
      catch (_error) { /* Keep the current values in memory when session storage is unavailable. */ }
      if (!blogNextTopicEditingSettingsContext && blogNextEditingRowIndex === null) {
        const persistent = blogNextPersistentPublishSettingsByTarget.get(key) || {};
        blogNextPersistentPublishSettingsByTarget.set(key, { ...persistent, category: getBlogNextVaultFolderValue() });
      }
      persistBlogNextPublishingDefaults(type);
    }
    syncBlogNextDraftSettingsSummary(type);
    if (typeof syncBlogNextQuickFlowSummaries === 'function') syncBlogNextQuickFlowSummaries();
    if (typeof syncBlogNextTopicActionAvailability === 'function') syncBlogNextTopicActionAvailability();
    syncBlogNextDraftExecutionState();
  });
  getBlogNextSettingsElement('blog-next-publish-image-action')?.addEventListener('click', focusBlogNextDraftImages);
  const aiMarkdown = document.getElementById('blog-next-ai-markdown');
  getBlogNextSettingsElement('blog-next-keywords')?.addEventListener('input', () => {
    updateBlogNextManuscriptCounts('ai', aiMarkdown?.value || '');
  });
  const aiEditorRoot = document.getElementById('blog-next-ai-editor');
  if (aiMarkdown && aiEditorRoot && window.BlogGeniusManuscriptEditor?.mount) {
    blogNextDraftState.ai.editor = window.BlogGeniusManuscriptEditor.mount(aiEditorRoot, {
      onPromptGenerate(values) { return generateBlogNextManuscriptImagePrompt('ai', values); },
      onChange(markdown) {
        aiMarkdown.value = markdown;
        aiMarkdown.dispatchEvent(new Event('input', { bubbles: true }));
      },
      getImage(blockId, sourceKey) {
        const images = blogNextDraftState.ai.preview?.images || [];
        return images.find((image) => image.blockId && image.blockId === blockId)
          || images.find((image) => Number(image.index) === Number(sourceKey)) || null;
      },
      onImageAction(action, slotId) {
        if (action === 'continue') return continueBlogNextManuscriptImageGeneration('ai');
        if (action === 'generate') {
          const operation = blogNextDraftState.ai.imageOperation;
          if (operation?.action === 'generate' && operation.slotId === slotId) handleBlogNextManuscriptImageStop('ai');
          else void runBlogNextManuscriptImageAction('ai', 'generate', slotId);
        } else if (action === 'remove') void applyBlogNextManuscriptMutation('ai', 'remove', slotId);
      },
      onImageFile(slotId, input) { void importBlogNextManuscriptImage('ai', slotId, input); },
      canImportImage() { return !blogNextDraftState.ai.publishing && !blogNextDraftState.ai.imageWorking; },
      onImageInputError(message) { setBlogNextDraftValidation('ai', { errors: [message] }, '', blogNextDraftState.ai.preview); },
      onImageFileDrop(file, blockId) { return importBlogNextEditorImage('ai', file, blockId); }
    });
    aiEditorRoot.addEventListener('paste', () => {
      window.setTimeout(() => {
        aiMarkdown.value = blogNextDraftState.ai.editor?.getMarkdown() || '';
        aiMarkdown.dispatchEvent(new Event('input', { bubbles: true }));
      }, 0);
    });
    document.querySelectorAll('[data-ai-manuscript-command]').forEach((button) => {
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => blogNextDraftState.ai.editor?.command(button.dataset.aiManuscriptCommand));
    });
    document.querySelectorAll('[data-ai-workspace-mode]').forEach((button) => {
      button.addEventListener('click', async () => {
        const mode = ['block', 'markdown', 'view'].includes(button.dataset.aiWorkspaceMode) ? button.dataset.aiWorkspaceMode : 'block';
        const state = blogNextDraftState.ai;
        if (mode === 'view') {
          if (!aiMarkdown.value.trim()) return;
          setBlogNextAiWorkspaceMode(mode, state, aiEditorRoot, aiMarkdown);
          await loadBlogNextDraftPreview('ai');
          return;
        }
        if (mode === 'block' && state.workspaceMode === 'markdown') {
          state.editor?.setMarkdown(aiMarkdown.value);
          restoreBlogNextEditorImages(state);
        }
        setBlogNextAiWorkspaceMode(mode, state, aiEditorRoot, aiMarkdown);
      });
    });
    aiMarkdown.addEventListener('input', () => {
      resizeBlogNextMarkdownEditor(aiMarkdown);
      updateBlogNextManuscriptCounts('ai', aiMarkdown.value);
      scheduleBlogNextDraftPreview('ai');
    });
  } else if (aiEditorRoot) {
    aiEditorRoot.hidden = true;
    setBlogNextDraftValidation('ai', { errors: ['원고 편집기를 불러오지 못했습니다. 앱을 다시 시작해 주세요.'] });
  }
  document.querySelector('[data-blog-next-draft-publish="ai"]')?.addEventListener('click', () => publishBlogNextDraft('ai'));
}
