const BLOG_NEXT_DRAFT_TYPES = Object.freeze(['ai', 'folder', 'paste']);
const BLOG_NEXT_DRAFT_PREVIEW_DELAY_MS = 350;

const blogNextDraftState = {
  ai: { preview: null, requestId: 0, publishing: false, generating: false, draftId: '', revision: 0, imageWorking: false, imageOperation: null, imageOperationNotice: null, imageSafetyLocked: false, previewSyncFailed: false },
  folder: { files: [], folderName: '', preview: null, previewTimer: null, requestId: 0, publishing: false, imageObjectUrls: {}, draftId: '', revision: 0, imageWorking: false, imageOperation: null, imageOperationNotice: null, imageSafetyLocked: false, previewSyncFailed: false },
  paste: { files: [], folderName: '', preview: null, previewTimer: null, requestId: 0, publishing: false, clearSnapshot: null, draftId: '', revision: 0, imageWorking: false, imageOperation: null, imageOperationNotice: null, imageSafetyLocked: false, previewSyncFailed: false }
};

function blogNextDraftContainer(type) {
  return document.querySelector(`[data-blog-next-mode-panel="${type}"]`);
}

function blogNextDraftField(type, name) {
  const fieldIds = {
    'target-naver': 'blog-next-target-naver',
    'target-wordpress': 'blog-next-target-wordpress',
    'naver-category': 'blog-next-naver-category',
    'wordpress-category': 'blog-next-wordpress-category',
    'post-status': 'blog-next-post-status',
    'schedule-date': 'blog-next-schedule-date',
    headless: 'blog-next-runner-headless'
  };
  return document.getElementById(fieldIds[name] || '') || null;
}

function normalizeBlogNextDraftPath(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

function isBlogNextMarkdownFile(file = {}) {
  return /\.(md|markdown)$/i.test(String(file.name || ''));
}

function isBlogNextImageFile(file = {}) {
  return String(file.type || '').toLowerCase().startsWith('image/')
    || /\.(png|jpe?g|webp|avif)$/i.test(String(file.name || ''));
}

function readBlogNextFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error(`${file?.name || '파일'}을 읽지 못했습니다.`));
    reader.readAsDataURL(file);
  });
}

function readBlogNextDraftSettings(type) {
  const targets = [];
  if (blogNextDraftField(type, 'target-naver')?.checked) targets.push('naver');
  if (blogNextDraftField(type, 'target-wordpress')?.checked) targets.push('wordpress');
  return {
    targets,
    naverCategory: blogNextDraftField(type, 'naver-category')?.value?.trim() || '',
    wordpressCategory: blogNextDraftField(type, 'wordpress-category')?.value?.trim() || '',
    postStatus: blogNextDraftField(type, 'post-status')?.value || 'publish',
    scheduleDate: blogNextDraftField(type, 'schedule-date')?.value || '',
    headless: targets.includes('naver') && blogNextDraftField(type, 'headless')?.checked !== false,
    imageMode: 'prompt_only'
  };
}

function syncBlogNextDraftSettingsSummary(type) {
  const summary = document.getElementById('blog-next-publish-settings-summary');
  if (!summary) return;
  const settings = readBlogNextDraftSettings(type);
  const statusLabel = settings.postStatus === 'draft' ? '임시 저장'
    : settings.postStatus === 'schedule' ? '예약 발행' : '즉시 발행';
  const parts = [formatBlogPlatformList(settings.targets, ' + ') || '발행 대상 없음', statusLabel];
  if (settings.targets.includes('naver')) {
    parts.push(settings.headless ? '보이지 않게 실행' : '브라우저 표시');
  }
  summary.textContent = parts.join(' · ');
}

function syncBlogNextDraftSchedule(type) {
  const field = document.getElementById('blog-next-schedule-field');
  const input = blogNextDraftField(type, 'schedule-date');
  const requiredIndicator = document.getElementById('blog-next-schedule-required');
  const scheduled = blogNextDraftField(type, 'post-status')?.value === 'schedule';
  if (field) field.dataset.dependencyActive = String(scheduled);
  if (input) {
    input.disabled = !scheduled;
    input.required = scheduled;
  }
  if (requiredIndicator) requiredIndicator.hidden = !scheduled;
}

function syncBlogNextDraftProviderFields(type) {
  const settings = document.getElementById('blog-next-publish-settings');
  if (!settings) return;
  const naverSelected = blogNextDraftField(type, 'target-naver')?.checked === true;
  const wordpressSelected = blogNextDraftField(type, 'target-wordpress')?.checked === true;
  settings.querySelectorAll('[data-draft-provider-field]').forEach((field) => {
    const active = field.dataset.draftProviderField === 'naver' ? naverSelected : wordpressSelected;
    field.dataset.dependencyActive = String(active);
    field.querySelectorAll('input, select, textarea').forEach((control) => {
      control.disabled = !active;
    });
  });
  syncBlogNextDraftSettingsSummary(type);
}

function syncBlogNextDraftImageSafety(type, preview = null) {
  const state = blogNextDraftState[type];
  const select = blogNextDraftField(type, 'post-status');
  const hint = document.getElementById('blog-next-publish-safety-hint');
  const message = document.getElementById('blog-next-publish-safety-message');
  const imageAction = document.getElementById('blog-next-publish-image-action');
  if (!state || !select) return;
  const unresolvedImageCount = Array.isArray(preview?.images)
    ? preview.images.filter((image) => !image.excluded && !image.exists && String(image.prompt || '').trim()).length
    : 0;
  const imagePreparationRequired = BLOG_NEXT_DRAFT_TYPES.includes(type) && unresolvedImageCount > 0;
  Array.from(select.options).forEach((option) => {
    if (option.value === 'publish' || option.value === 'schedule') {
      option.disabled = imagePreparationRequired;
    }
  });
  if (imagePreparationRequired && select.value !== 'draft') select.value = 'draft';
  if (hint) {
    const hintText = imagePreparationRequired
      ? `이미지 ${unresolvedImageCount}개를 처리해야 발행할 수 있어요. 지금은 임시저장만 가능해요.`
      : '';
    if (message) message.textContent = hintText;
    else hint.textContent = hintText;
    hint.hidden = unresolvedImageCount === 0;
  }
  if (imageAction) {
    imageAction.hidden = !imagePreparationRequired;
    const details = document.querySelector(`[data-blog-next-draft-preview="${type}"] [data-draft-preview-image-details]`);
    if (details?.id) imageAction.setAttribute('aria-controls', details.id);
  }
  state.imageSafetyLocked = imagePreparationRequired;
  syncBlogNextDraftSchedule(type);
  syncBlogNextDraftSettingsSummary(type);
}

function focusBlogNextDraftImages() {
  const type = document.getElementById('blog-next-publish-settings')?.dataset.blogNextDraftSettings || 'ai';
  const details = document.querySelector(`[data-blog-next-draft-preview="${type}"] [data-draft-preview-image-details]`);
  if (!details || details.hidden || details.closest('[hidden]')) return;
  details.open = true;
  details.scrollIntoView({ behavior: 'smooth', block: 'center' });
  requestAnimationFrame(() => details.querySelector('summary')?.focus({ preventScroll: true }));
}

async function serializeBlogNextFolderFiles(files = [], options = {}) {
  const includeImages = options.includeImages === true;
  const serialized = [];
  for (const file of files) {
    if (!isBlogNextMarkdownFile(file) && !isBlogNextImageFile(file)) continue;
    const entry = {
      relativePath: normalizeBlogNextDraftPath(file.webkitRelativePath || file.name),
      name: file.name || '',
      contentType: file.type || '',
      size: Number(file.size || 0)
    };
    if (isBlogNextMarkdownFile(file)) entry.textContent = await file.text();
    else if (includeImages) entry.base64Data = await readBlogNextFileAsDataUrl(file);
    serialized.push(entry);
  }
  return serialized;
}

async function buildBlogNextDraftPayload(type, options = {}) {
  const settings = readBlogNextDraftSettings(type);
  if (type === 'ai') {
    const input = readBlogNextTopicPayload('generate-draft');
    return {
      ...input,
      ...settings,
      imageMode: input.imageMode,
      targets: settings.targets,
      platforms: undefined
    };
  }
  if (type === 'paste') {
    return {
      ...settings,
      markdownText: document.getElementById('blog-next-paste-markdown')?.value || ''
    };
  }
  const state = blogNextDraftState.folder;
  return {
    ...settings,
    folderName: state.folderName,
    selectedFiles: await serializeBlogNextFolderFiles(state.files, options)
  };
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

function revokeBlogNextDraftImageUrls() {
  const state = blogNextDraftState.folder;
  Object.values(state.imageObjectUrls || {}).forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch (_error) { }
  });
  state.imageObjectUrls = {};
}

function getBlogNextDraftImageUrl(type, relativePath) {
  if (type !== 'folder' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return '';
  const normalizedPath = normalizeBlogNextDraftPath(relativePath);
  const state = blogNextDraftState.folder;
  if (!normalizedPath) return '';
  if (state.imageObjectUrls[normalizedPath]) return state.imageObjectUrls[normalizedPath];
  const file = state.files.find((entry) => (
    normalizeBlogNextDraftPath(entry.webkitRelativePath || entry.name) === normalizedPath
    && isBlogNextImageFile(entry)
  ));
  if (!file) return '';
  const url = URL.createObjectURL(file);
  state.imageObjectUrls[normalizedPath] = url;
  return url;
}

function renderBlogNextDraftBodyHtml(type, preview = {}) {
  const items = Array.isArray(preview.contentItems) ? preview.contentItems : [];
  const imageMap = new Map((Array.isArray(preview.images) ? preview.images : [])
    .map((image) => [Number(image.index), image]));
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
      const previewUrl = image?.exists ? (image.imageUrl || getBlogNextDraftImageUrl(type, image.imagePath)) : '';
      const imageBody = previewUrl
        ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(image?.title || item.text || '')}" loading="lazy" data-manuscript-preview-image>`
        : '<div class="local-markdown-inline-image-missing">이미지 파일 없음</div>';
      fragments.push(`<figure>${imageBody}<figcaption>
        <div class="image-caption-title">${escapeHtml(image?.title || item.text || `IMAGE_${item.index}`)}</div>
        ${image?.prompt || item.prompt ? `<div class="image-caption-prompt">${escapeHtml(image?.prompt || item.prompt || '')}</div>` : ''}
      </figcaption></figure>`);
    } else if (itemType === 'separator') {
      fragments.push('<div class="local-markdown-preview-separator" role="separator" aria-label="구분선"></div>');
    } else if (itemType === 'newline') fragments.push('<div style="height:8px"></div>');
    else fragments.push(`<p>${text}</p>`);
  });

  closeList();
  return fragments.join('') || '<div class="local-markdown-empty">미리볼 본문이 없습니다.</div>';
}

function renderBlogNextDraftPreview(type, preview = null) {
  const container = document.querySelector(`[data-blog-next-draft-preview="${type}"]`);
  const imageDetailsWasOpen = container?.querySelector('[data-draft-preview-image-details]')?.open === true;
  const focusedImageControl = container?.contains(document.activeElement)
    ? document.activeElement.closest('[data-manuscript-generate-missing], [data-manuscript-image-action="generate"], [data-manuscript-image-continue]')
    : null;
  const focusedImageControlKey = focusedImageControl
    ? focusedImageControl.hasAttribute('data-manuscript-generate-missing') ? 'bulk'
      : focusedImageControl.hasAttribute('data-manuscript-image-continue') ? 'continue'
        : `slot:${focusedImageControl.dataset.slotId || ''}`
    : '';
  blogNextDraftState[type].preview = preview;
  syncBlogNextDraftImageSafety(type, preview);
  syncBlogNextDraftExecutionState();
  if (!container || !preview) {
    if (container) container.hidden = true;
    return;
  }
  container.hidden = false;
  const title = container.querySelector('[data-draft-preview-title]');
  const body = container.querySelector('[data-draft-preview-body]');
  const images = container.querySelector('[data-draft-preview-images]');
  const imageDetails = container.querySelector('[data-draft-preview-image-details]');
  const imageSummary = container.querySelector('[data-draft-preview-image-summary]');
  if (title) title.textContent = preview.title || '제목 없음';
  const stats = preview.stats || {};
  if (body) body.innerHTML = renderBlogNextDraftBodyHtml(type, preview);
  if (body) bindBlogNextManuscriptBodyImageFallback(body);
  if (images) {
    images.innerHTML = renderBlogNextDraftImages(type, preview);
    UiGridTailSpacers.sync(images, {
      itemSelector: '.local-markdown-image-card',
      spacerClass: 'ui-grid-tail-spacer local-markdown-image-grid-spacer'
    });
  }
  if (images) bindBlogNextManuscriptImageActions(type, images);
  if (images && focusedImageControlKey) {
    const nextFocus = focusedImageControlKey === 'bulk' ? images.querySelector('[data-manuscript-generate-missing]')
      : focusedImageControlKey === 'continue'
        ? (blogNextDraftState[type].imageOperation?.action === 'generate-missing'
          ? images.querySelector('[data-manuscript-generate-missing]')
          : images.querySelector(`[data-manuscript-image-action="generate"][data-slot-id="${blogNextDraftState[type].imageOperation?.slotId || ''}"]`))
        : images.querySelector(`[data-manuscript-image-action="generate"][data-slot-id="${focusedImageControlKey.slice(5)}"]`);
    nextFocus?.focus({ preventScroll: true });
  }
  if (imageDetails) imageDetails.hidden = preview.draftId
    ? Number(stats.imageBlockCount || 0) === 0
    : Number(stats.imageMissingCount || 0) === 0;
  if (imageDetails && imageDetailsWasOpen && !imageDetails.hidden) imageDetails.open = true;
  if (imageSummary) {
    imageSummary.textContent = preview.draftId
      ? `준비 ${stats.imageResolvedCount || 0}/${stats.imageTargetCount ?? stats.imageBlockCount ?? 0}${Number(stats.imageExcludedCount || 0) > 0 ? ` · 제외 ${stats.imageExcludedCount}` : ''}`
      : `누락 ${stats.imageMissingCount || 0}개`;
  }
  setLocalMarkdownPreviewDensity(container, body, images, stats);
  setBlogNextDraftValidation(type, preview.validation, '', preview);
  if (typeof syncBlogNextPublishMutationControls === 'function') syncBlogNextPublishMutationControls();
  syncBlogNextImageAiReadiness();
}

async function loadBlogNextDraftPreview(type) {
  const state = blogNextDraftState[type];
  clearTimeout(state.previewTimer);
  const requestId = ++state.requestId;
  const hasSource = type === 'ai'
    ? Boolean(state.draftId)
    : type === 'paste'
    ? Boolean(document.getElementById('blog-next-paste-markdown')?.value?.trim())
    : state.files.length > 0;
  if (!hasSource) {
    renderBlogNextDraftPreview(type, null);
    setBlogNextDraftValidation(type);
    return null;
  }
  try {
    if (!state.preview) {
      setBlogNextDraftValidation(type, null, '원고를 확인하고 있습니다.');
    }
    const payload = await buildBlogNextDraftPayload(type, { includeImages: type === 'folder' && !state.draftId });
    let preview;
    if (type === 'ai') {
      preview = await postJson(`/api/v1/blog/manuscript-drafts/${encodeURIComponent(state.draftId)}/settings`, { ...payload, revision: state.revision });
    } else if (type === 'folder') {
      preview = state.draftId
        ? await postJson(`/api/v1/blog/manuscript-drafts/${encodeURIComponent(state.draftId)}/settings`, { ...payload, selectedFiles: undefined, revision: state.revision })
        : await postJson('/api/v1/blog/manuscript-drafts/folder', payload);
    } else {
      preview = state.draftId
        ? await postJson(`/api/v1/blog/manuscript-drafts/${encodeURIComponent(state.draftId)}/markdown`, { ...payload, revision: state.revision })
        : await postJson('/api/v1/blog/manuscript-drafts/paste', payload);
    }
    if (requestId !== state.requestId) return null;
    state.draftId = preview.draftId;
    state.revision = preview.revision;
    if (preview.draftId !== state.preview?.draftId) state.imageOperationNotice = null;
    state.previewSyncFailed = false;
    renderBlogNextDraftPreview(type, preview);
    return preview;
  } catch (error) {
    if (requestId !== state.requestId) return null;
    state.previewSyncFailed = true;
    renderBlogNextDraftPreview(type, state.preview);
    setBlogNextDraftValidation(type, { errors: [error.message || '원고를 확인하지 못했습니다.'] }, '', state.preview);
    syncBlogNextDraftExecutionState();
    return null;
  }
}

function scheduleBlogNextDraftPreview(type) {
  const state = blogNextDraftState[type];
  state.requestId += 1;
  clearTimeout(state.previewTimer);
  state.previewTimer = setTimeout(() => loadBlogNextDraftPreview(type), BLOG_NEXT_DRAFT_PREVIEW_DELAY_MS);
}

function clearBlogNextFolderDraft() {
  const state = blogNextDraftState.folder;
  revokeBlogNextDraftImageUrls();
  state.files = [];
  state.folderName = '';
  state.preview = null;
  state.draftId = '';
  state.revision = 0;
  state.imageOperationNotice = null;
  state.requestId += 1;
  const input = document.getElementById('blog-next-folder-input');
  if (input) input.value = '';
  syncBlogNextFolderSelection();
  renderBlogNextDraftPreview('folder', null);
  setBlogNextDraftValidation('folder');
}

function syncBlogNextFolderSelection(folderName = '') {
  const selection = document.querySelector('.blog-next-folder-selection');
  const path = document.getElementById('blog-next-folder-path');
  const clear = document.getElementById('blog-next-folder-clear');
  const select = document.getElementById('blog-next-folder-select');
  const selected = Boolean(folderName);
  if (selection) {
    selection.dataset.empty = String(!selected);
    selection.title = selected ? folderName : '';
  }
  if (path) path.textContent = selected ? folderName : '아직 선택하지 않았습니다';
  if (clear) clear.hidden = !selected;
  if (select) select.textContent = selected ? '원고 폴더 변경' : '원고 폴더 선택';
}

function clearBlogNextPastedDraft() {
  const input = document.getElementById('blog-next-paste-markdown');
  const currentValue = input?.value || '';
  if (!currentValue) return;
  blogNextDraftState.paste.clearSnapshot = currentValue;
  if (input) input.value = '';
  localStorage.removeItem('blog_next_pasted_markdown_draft');
  blogNextDraftState.paste.preview = null;
  blogNextDraftState.paste.imageOperationNotice = null;
  blogNextDraftState.paste.requestId += 1;
  renderBlogNextDraftPreview('paste', null);
  setBlogNextDraftValidation('paste');
  syncBlogNextPastedDraftActions();
  const undo = document.getElementById('blog-next-paste-clear-undo');
  if (undo) {
    undo.hidden = false;
    undo.focus();
  }
}

function discardBlogNextPastedClearSnapshot() {
  blogNextDraftState.paste.clearSnapshot = null;
  const undo = document.getElementById('blog-next-paste-clear-undo');
  if (undo) undo.hidden = true;
}

function resetBlogNextPasteDraftConnection() {
  const state = blogNextDraftState.paste;
  state.draftId = '';
  state.revision = 0;
  state.preview = null;
  state.previewSyncFailed = false;
  state.imageOperationNotice = null;
}

function syncBlogNextPastedDraftActions() {
  const input = document.getElementById('blog-next-paste-markdown');
  const clear = document.getElementById('blog-next-paste-clear');
  if (clear) clear.hidden = !input?.value;
}

function restoreBlogNextPastedDraft() {
  const snapshot = blogNextDraftState.paste.clearSnapshot;
  const input = document.getElementById('blog-next-paste-markdown');
  if (!snapshot || !input) return;
  input.value = snapshot;
  try {
    localStorage.setItem('blog_next_pasted_markdown_draft', snapshot);
  } catch (_error) {
    // The restored live input remains usable when browser storage is full.
  }
  discardBlogNextPastedClearSnapshot();
  syncBlogNextPastedDraftActions();
  scheduleBlogNextDraftPreview('paste');
  input.focus();
}

function bindBlogNextDraftOptions(type) {
  document.querySelector(`[data-blog-next-draft-publish="${type}"]`)
    ?.addEventListener('click', () => publishBlogNextDraft(type));
  syncBlogNextDraftSchedule(type);
  syncBlogNextDraftProviderFields(type);
  syncBlogNextDraftSettingsSummary(type);
}

function initBlogNextDraftInputs() {
  const folderInput = document.getElementById('blog-next-folder-input');
  if (!folderInput || folderInput.dataset.bound === 'true') return;
  folderInput.dataset.bound = 'true';
  document.getElementById('blog-next-publish-image-action')?.addEventListener('click', focusBlogNextDraftImages);
  document.getElementById('blog-next-folder-select')?.addEventListener('click', () => folderInput.click());
  document.getElementById('blog-next-folder-clear')?.addEventListener('click', clearBlogNextFolderDraft);
  folderInput.addEventListener('change', async (event) => {
    const files = Array.from(event.target?.files || []);
    revokeBlogNextDraftImageUrls();
    const firstPath = normalizeBlogNextDraftPath(files[0]?.webkitRelativePath || files[0]?.name);
    const folderName = firstPath.includes('/') ? firstPath.split('/')[0] : '';
    blogNextDraftState.folder.files = files;
    blogNextDraftState.folder.folderName = folderName;
    blogNextDraftState.folder.draftId = '';
    blogNextDraftState.folder.revision = 0;
    syncBlogNextFolderSelection(folderName);
    event.target.value = '';
    renderBlogNextDraftPreview('folder', null);
    await loadBlogNextDraftPreview('folder');
  });

  const pastedInput = document.getElementById('blog-next-paste-markdown');
  if (pastedInput) {
    pastedInput.value = localStorage.getItem('blog_next_pasted_markdown_draft') || '';
    syncBlogNextPastedDraftActions();
    pastedInput.addEventListener('input', () => {
      if (blogNextDraftState.paste.clearSnapshot !== null) {
        resetBlogNextPasteDraftConnection();
        discardBlogNextPastedClearSnapshot();
      }
      if (!pastedInput.value.trim()) resetBlogNextPasteDraftConnection();
      syncBlogNextPastedDraftActions();
      try {
        localStorage.setItem('blog_next_pasted_markdown_draft', pastedInput.value);
      } catch (_error) {
        // Large pasted manuscripts can exceed browser storage. The live input remains usable.
      }
      scheduleBlogNextDraftPreview('paste');
    });
    if (pastedInput.value.trim()) scheduleBlogNextDraftPreview('paste');
  }
  document.getElementById('blog-next-paste-clear')?.addEventListener('click', clearBlogNextPastedDraft);
  document.getElementById('blog-next-paste-clear-undo')?.addEventListener('click', restoreBlogNextPastedDraft);
  ['folder', 'paste'].forEach(bindBlogNextDraftOptions);
  document.querySelector('[data-blog-next-draft-publish="ai"]')?.addEventListener('click', () => publishBlogNextDraft('ai'));
}
