const BLOG_NEXT_DRAFT_TYPES = Object.freeze(['folder', 'paste']);
const BLOG_NEXT_DRAFT_PREVIEW_DELAY_MS = 350;

const blogNextDraftState = {
  folder: { files: [], folderName: '', preview: null, previewTimer: null, requestId: 0, publishing: false, imageObjectUrls: {}, draftId: '', revision: 0, imageWorking: false },
  paste: { files: [], folderName: '', preview: null, previewTimer: null, requestId: 0, publishing: false, clearSnapshot: null }
};

function blogNextDraftContainer(type) {
  return document.querySelector(`[data-blog-next-mode-panel="${type}"]`);
}

function blogNextDraftField(type, name) {
  return blogNextDraftContainer(type)?.querySelector(`[data-draft-field="${name}"]`) || null;
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
    imageMode: blogNextDraftField(type, 'image-mode')?.value || 'prompt_only'
  };
}

function syncBlogNextDraftSettingsSummary(type) {
  const summary = document.querySelector(`[data-blog-next-draft-settings-summary="${type}"]`);
  if (!summary) return;
  const settings = readBlogNextDraftSettings(type);
  const statusLabel = settings.postStatus === 'draft' ? '임시 저장'
    : settings.postStatus === 'schedule' ? '예약 발행' : '즉시 발행';
  const imageLabel = settings.imageMode === 'generate' ? '이미지 생성'
    : settings.imageMode === 'none' ? '이미지 없음' : '이미지 프롬프트';
  const parts = [formatBlogPlatformList(settings.targets, ' + ') || '발행 대상 없음', statusLabel, imageLabel];
  if (settings.targets.includes('naver')) {
    parts.push(settings.headless ? '보이지 않게 실행' : '브라우저 표시');
  }
  summary.textContent = parts.join(' · ');
}

function syncBlogNextDraftSchedule(type) {
  const container = blogNextDraftContainer(type);
  const field = container?.querySelector('[data-draft-schedule-field]');
  const input = blogNextDraftField(type, 'schedule-date');
  const requiredIndicator = container?.querySelector('[data-draft-schedule-required]');
  const scheduled = blogNextDraftField(type, 'post-status')?.value === 'schedule';
  if (field) field.dataset.dependencyActive = String(scheduled);
  if (input) {
    input.disabled = !scheduled;
    input.required = scheduled;
  }
  if (requiredIndicator) requiredIndicator.hidden = !scheduled;
}

function syncBlogNextDraftProviderFields(type) {
  const container = blogNextDraftContainer(type);
  if (!container) return;
  const naverSelected = blogNextDraftField(type, 'target-naver')?.checked === true;
  const wordpressSelected = blogNextDraftField(type, 'target-wordpress')?.checked === true;
  container.querySelectorAll('[data-draft-provider-field]').forEach((field) => {
    const active = field.dataset.draftProviderField === 'naver' ? naverSelected : wordpressSelected;
    field.dataset.dependencyActive = String(active);
    field.querySelectorAll('input, select, textarea').forEach((control) => {
      control.disabled = !active;
    });
  });
  syncBlogNextDraftSettingsSummary(type);
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
  const missingCount = Number(preview?.stats?.imageMissingCount || 0);
  if (!BLOG_NEXT_DRAFT_TYPES.includes(type) || missingCount === 0) return warnings;

  const imageWarningPattern = /^\d+_image 규칙의 이미지 파일을 찾지 못했습니다\./;
  const imageWarnings = warnings.filter(message => imageWarningPattern.test(String(message || '')));
  if (imageWarnings.length === 0) return warnings;

  return [
    `이미지 ${missingCount}개를 확인해 주세요.`,
    ...warnings.filter(message => !imageWarningPattern.test(String(message || '')))
  ];
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
        ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(image?.title || item.text || '')}" loading="lazy">`
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

function renderBlogNextDraftImages(type, preview = {}) {
  const imageItems = Array.isArray(preview.images) ? preview.images : [];
  if (imageItems.length === 0) return '<div class="local-markdown-empty">이미지 블록이 없습니다.</div>';
  const visibleItems = type === 'folder' && preview.draftId ? imageItems : imageItems.filter(image => !image.exists);
  const bulkAction = type === 'folder' && preview.draftId && imageItems.some((image) => !image.exists && image.prompt)
    ? '<div class="local-markdown-image-bulk-actions"><button class="primary compact" type="button" data-manuscript-generate-missing>빈 이미지 모두 만들기</button></div>'
    : '';
  return bulkAction + visibleItems.map((image) => {
    const exists = Boolean(image.exists);
    const imageUrl = exists ? (image.imageUrl || getBlogNextDraftImageUrl(type, image.imagePath)) : '';
    return `<article class="local-markdown-image-card${exists ? '' : ' is-missing'}" data-manuscript-image-slot="${escapeHtml(image.slotId || '')}">
      <div class="local-markdown-image-card-header">
        <div class="local-markdown-image-card-title">IMAGE_${escapeHtml(String(image.index))} ${escapeHtml(image.title || '')}</div>
        <span class="local-markdown-image-card-status ${exists ? 'ok' : 'missing'}">${exists ? '이미지 준비됨' : '파일 없음'}</span>
      </div>
      ${imageUrl ? `<div class="local-markdown-image-card-preview"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(image.title || `IMAGE_${image.index}`)}"></div>` : ''}
      ${image.prompt ? `<p class="local-markdown-image-card-prompt">${escapeHtml(image.prompt)}</p>` : ''}
      ${type === 'folder' && preview.draftId ? `<div class="local-markdown-image-card-actions">
        <button class="${exists ? 'secondary' : 'primary'} compact" type="button" data-manuscript-image-action="generate" data-slot-id="${escapeHtml(image.slotId)}">${exists ? 'AI 다시 만들기' : 'AI 이미지 만들기'}</button>
        <button class="secondary compact" type="button" data-manuscript-image-picker data-slot-id="${escapeHtml(image.slotId)}">${exists ? '이미지 교체' : '내 이미지 선택'}</button>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" data-manuscript-image-file data-slot-id="${escapeHtml(image.slotId)}" hidden>
        ${exists ? `<button class="ghost compact" type="button" data-manuscript-image-action="exclude" data-slot-id="${escapeHtml(image.slotId)}">이미지 제외</button>` : ''}
        ${image.canRestore ? `<button class="ghost compact" type="button" data-manuscript-image-action="restore" data-slot-id="${escapeHtml(image.slotId)}">원래 이미지 복원</button>` : ''}
      </div>` : ''}
    </article>`;
  }).join('');
}

function bindBlogNextManuscriptImageActions(type, container) {
  if (type !== 'folder' || !container) return;
  container.querySelectorAll('[data-manuscript-image-picker]').forEach((button) => {
    button.addEventListener('click', () => container.querySelector(`[data-manuscript-image-file][data-slot-id="${button.dataset.slotId}"]`)?.click());
  });
  container.querySelectorAll('[data-manuscript-image-file]').forEach((input) => {
    input.addEventListener('change', () => void importBlogNextManuscriptImage(input.dataset.slotId, input));
  });
  container.querySelectorAll('[data-manuscript-image-action]').forEach((button) => {
    button.addEventListener('click', () => void runBlogNextManuscriptImageAction(button.dataset.manuscriptImageAction, button.dataset.slotId));
  });
  container.querySelector('[data-manuscript-generate-missing]')?.addEventListener('click', () => void generateMissingBlogNextManuscriptImages());
}

async function generateMissingBlogNextManuscriptImages() {
  const state = blogNextDraftState.folder;
  if (!state.draftId || state.imageWorking) return;
  await applyBlogNextManuscriptMutation('generate-missing', '');
}

async function applyBlogNextManuscriptMutation(action, slotId, payload = {}) {
  const state = blogNextDraftState.folder;
  if (!state.draftId || state.imageWorking) return null;
  state.imageWorking = true;
  syncBlogNextDraftExecutionState();
  const imageList = document.querySelector('[data-blog-next-mode-panel="folder"] [data-draft-preview-images]');
  imageList?.setAttribute('aria-busy', 'true');
  imageList?.querySelectorAll('button, input').forEach((control) => { control.disabled = true; });
  const targetStatus = slotId ? imageList?.querySelector(`[data-manuscript-image-slot="${slotId}"] .local-markdown-image-card-status`) : null;
  if (targetStatus) targetStatus.textContent = action === 'generate' ? 'AI 생성 중…' : '적용 중…';
  let failureMessage = '';
  try {
    const endpoint = action === 'generate-missing'
      ? `/api/v1/blog/manuscript-drafts/${encodeURIComponent(state.draftId)}/images/generate-missing`
      : `/api/v1/blog/manuscript-drafts/${encodeURIComponent(state.draftId)}/image-slots/${encodeURIComponent(slotId)}/${action}`;
    const draft = await postJson(endpoint, {
      revision: state.revision,
      ...payload
    });
    state.revision = draft.revision;
    state.preview = draft;
    return draft;
  } catch (error) {
    failureMessage = error.message || '이미지 작업을 적용하지 못했습니다.';
    return null;
  } finally {
    state.imageWorking = false;
    imageList?.removeAttribute('aria-busy');
    renderBlogNextDraftPreview('folder', state.preview);
    syncBlogNextDraftExecutionState();
    if (failureMessage) setBlogNextDraftValidation('folder', { errors: [failureMessage] }, '', state.preview);
    else if (state.preview?.imageOperationWarning) setBlogNextDraftValidation('folder', { warnings: [state.preview.imageOperationWarning] }, '', state.preview);
  }
}

async function runBlogNextManuscriptImageAction(action, slotId) {
  const image = blogNextDraftState.folder.preview?.images?.find((item) => item.slotId === slotId);
  if (action === 'generate' && image?.exists) {
    const confirmed = await showUiConfirm('현재 이미지를 AI가 새로 만든 이미지로 교체할까요? 기존 이미지는 새 이미지가 완성된 후 교체됩니다.', {
      title: 'AI 이미지 다시 만들기', confirmText: '다시 만들기', cancelText: '취소'
    });
    if (!confirmed) return;
  }
  await applyBlogNextManuscriptMutation(action, slotId);
}

async function importBlogNextManuscriptImage(slotId, input) {
  const file = input?.files?.[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    setBlogNextDraftValidation('folder', { errors: ['이미지는 최대 10MB까지 선택할 수 있습니다.'] }, '', blogNextDraftState.folder.preview);
    input.value = '';
    return;
  }
  const base64Data = await readBlogNextFileAsDataUrl(file);
  await applyBlogNextManuscriptMutation('import', slotId, { fileName: file.name, mimeType: file.type || '', base64Data });
  input.value = '';
}

function renderBlogNextDraftPreview(type, preview = null) {
  const container = document.querySelector(`[data-blog-next-draft-preview="${type}"]`);
  const imageDetailsWasOpen = container?.querySelector('[data-draft-preview-image-details]')?.open === true;
  blogNextDraftState[type].preview = preview;
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
  if (images) images.innerHTML = renderBlogNextDraftImages(type, preview);
  if (images) bindBlogNextManuscriptImageActions(type, images);
  if (imageDetails) imageDetails.hidden = type === 'folder' && preview.draftId
    ? Number(stats.imageBlockCount || 0) === 0
    : Number(stats.imageMissingCount || 0) === 0;
  if (imageDetails && imageDetailsWasOpen && !imageDetails.hidden) imageDetails.open = true;
  if (imageSummary) {
    imageSummary.textContent = type === 'folder' && preview.draftId
      ? `준비 ${stats.imageResolvedCount || 0}/${stats.imageBlockCount || 0}`
      : `누락 ${stats.imageMissingCount || 0}개`;
  }
  setLocalMarkdownPreviewDensity(container, body, images, stats);
  setBlogNextDraftValidation(type, preview.validation, '', preview);
}

async function loadBlogNextDraftPreview(type) {
  const state = blogNextDraftState[type];
  const requestId = ++state.requestId;
  const hasSource = type === 'paste'
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
    if (type === 'folder') {
      preview = state.draftId
        ? await postJson(`/api/v1/blog/manuscript-drafts/${encodeURIComponent(state.draftId)}/settings`, { ...payload, selectedFiles: undefined, revision: state.revision })
        : await postJson('/api/v1/blog/manuscript-drafts/folder', payload);
      state.draftId = preview.draftId;
      state.revision = preview.revision;
    } else {
      preview = await postJson('/api/v1/blog/local-markdown/preview', payload);
    }
    if (requestId !== state.requestId) return null;
    renderBlogNextDraftPreview(type, preview);
    return preview;
  } catch (error) {
    if (requestId !== state.requestId) return null;
    renderBlogNextDraftPreview(type, null);
    setBlogNextDraftValidation(type, { errors: [error.message || '원고를 확인하지 못했습니다.'] });
    return null;
  }
}

function scheduleBlogNextDraftPreview(type) {
  const state = blogNextDraftState[type];
  state.requestId += 1;
  clearTimeout(state.previewTimer);
  state.previewTimer = setTimeout(() => loadBlogNextDraftPreview(type), BLOG_NEXT_DRAFT_PREVIEW_DELAY_MS);
}

function setBlogNextDraftPublishing(type, publishing) {
  const state = blogNextDraftState[type];
  state.publishing = publishing;
  syncBlogNextDraftExecutionState();
}

function syncBlogNextDraftExecutionState(runnerActive) {
  const anotherRunnerActive = typeof runnerActive === 'boolean'
    ? runnerActive
    : ((typeof blogNextRunnerActive !== 'undefined' && blogNextRunnerActive)
      || (typeof blogNextRunnerRequesting !== 'undefined' && blogNextRunnerRequesting));
  const manuscriptActive = BLOG_NEXT_DRAFT_TYPES.some(type => blogNextDraftState[type].publishing || blogNextDraftState[type].imageWorking);
  const executionActive = anotherRunnerActive || manuscriptActive;
  BLOG_NEXT_DRAFT_TYPES.forEach((type) => {
    const state = blogNextDraftState[type];
    const button = document.querySelector(`[data-blog-next-draft-publish="${type}"]`);
    if (!button) return;
    button.disabled = executionActive || !state.preview?.validation?.ok;
    button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
    button.textContent = state.publishing
      ? '포스팅 진행 중...'
      : state.imageWorking ? '이미지 작업 중...'
      : executionActive ? '다른 작업 실행 중...' : '포스팅 실행';
  });
}

async function publishBlogNextDraft(type) {
  const state = blogNextDraftState[type];
  if (state.publishing || !state.preview?.validation?.ok) return;
  if (typeof guardUiConfigReady === 'function' && !guardUiConfigReady('원고 포스팅')) return;
  const settings = readBlogNextDraftSettings(type);
  const action = settings.postStatus === 'draft' ? '임시 저장'
    : settings.postStatus === 'schedule' ? '예약 포스팅 등록' : '즉시 발행';
  const confirmed = await showUiConfirm(
    `현재 원고를 ${action}할까요?\nQueue에 추가하지 않고 바로 실행합니다.`,
    { title: '원고 포스팅', confirmText: '실행', cancelText: '취소' }
  );
  if (!confirmed) return;

  const result = document.querySelector(`[data-blog-next-draft-result="${type}"]`);
  setBlogNextDraftPublishing(type, true);
  if (typeof renderBlogNextRunnerStatus === 'function') {
    renderBlogNextRunnerStatus({
      state: 'running',
      busy: true,
      source: 'local_markdown',
      subject: type === 'paste' ? '원고 붙여넣기' : '원고 폴더',
      message: `원고 ${action}을 처리하고 있습니다.`,
      startedAt: new Date().toISOString()
    });
  }
  try {
    if (type === 'folder') await loadBlogNextDraftPreview('folder');
    const payload = type === 'folder'
      ? { draftId: state.draftId, revision: state.revision }
      : await buildBlogNextDraftPayload(type, { includeImages: true });
    const publishResult = await runWithLiveProgress({
      targetEl: result,
      requestLabel: `원고 ${action}`,
      requestFn: () => postJson(type === 'folder'
        ? `/api/v1/blog/manuscript-drafts/${encodeURIComponent(state.draftId)}/publish`
        : '/api/v1/blog/local-markdown/publish', payload)
    });
    if (typeof renderBlogNextRunnerStatus === 'function') {
      renderBlogNextRunnerStatus({
        state: 'completed',
        busy: false,
        subject: type === 'paste' ? '원고 붙여넣기' : '원고 폴더',
        message: `원고 ${action}을 완료했습니다.`,
        resultStatus: settings.postStatus === 'draft' ? '임시 저장 완료'
          : settings.postStatus === 'schedule' ? '예약 발행 완료' : '발행 완료',
        completionLinks: Array.isArray(publishResult?.completionLinks) ? publishResult.completionLinks : [],
        finishedAt: new Date().toISOString()
      });
    }
    showUiToast({ level: 'success', title: `원고 ${action} 완료`, message: 'Queue를 거치지 않고 원고를 처리했습니다.' });
    if (typeof showPostingCompletionCelebration === 'function') {
      showPostingCompletionCelebration(settings.postStatus);
    }
  } catch (error) {
    // runWithLiveProgress renders the detailed failure.
    if (typeof renderBlogNextRunnerStatus === 'function') {
      renderBlogNextRunnerStatus({
        state: 'failed',
        busy: false,
        subject: type === 'paste' ? '원고 붙여넣기' : '원고 폴더',
        message: error.message || `원고 ${action}에 실패했습니다.`,
        finishedAt: new Date().toISOString()
      });
    }
  } finally {
    setBlogNextDraftPublishing(type, false);
  }
}

function clearBlogNextFolderDraft() {
  const state = blogNextDraftState.folder;
  revokeBlogNextDraftImageUrls();
  state.files = [];
  state.folderName = '';
  state.preview = null;
  state.draftId = '';
  state.revision = 0;
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
  const container = blogNextDraftContainer(type);
  container?.querySelectorAll('[data-draft-field]').forEach((field) => {
    field.addEventListener('change', () => {
      if (field.dataset.draftField === 'post-status') syncBlogNextDraftSchedule(type);
      if (field.dataset.draftField === 'target-naver' || field.dataset.draftField === 'target-wordpress') {
        syncBlogNextDraftProviderFields(type);
      }
      syncBlogNextDraftSettingsSummary(type);
      scheduleBlogNextDraftPreview(type);
    });
  });
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
      if (blogNextDraftState.paste.clearSnapshot !== null) discardBlogNextPastedClearSnapshot();
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
  BLOG_NEXT_DRAFT_TYPES.forEach(bindBlogNextDraftOptions);
}
