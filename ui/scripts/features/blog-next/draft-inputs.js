const BLOG_NEXT_DRAFT_TYPES = Object.freeze(['folder', 'paste']);
const BLOG_NEXT_DRAFT_PREVIEW_DELAY_MS = 350;

const blogNextDraftState = {
  folder: { files: [], folderName: '', preview: null, previewTimer: null, requestId: 0, publishing: false, imageObjectUrls: {} },
  paste: { files: [], folderName: '', preview: null, previewTimer: null, requestId: 0, publishing: false }
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
    headless: blogNextDraftField(type, 'headless')?.checked !== false,
    imageMode: blogNextDraftField(type, 'image-mode')?.value || 'prompt_only'
  };
}

function syncBlogNextDraftSchedule(type) {
  const container = blogNextDraftContainer(type);
  const field = container?.querySelector('[data-draft-schedule-field]');
  const input = blogNextDraftField(type, 'schedule-date');
  const scheduled = blogNextDraftField(type, 'post-status')?.value === 'schedule';
  if (field) field.hidden = !scheduled;
  if (input) input.required = scheduled;
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

function setBlogNextDraftValidation(type, validation = null, fallback = '') {
  const element = document.querySelector(`[data-blog-next-draft-validation="${type}"]`);
  if (!element) return;
  element.classList.remove('has-error', 'has-warning', 'is-ok');
  const errors = Array.isArray(validation?.errors) ? validation.errors : [];
  const warnings = Array.isArray(validation?.warnings) ? validation.warnings : [];
  if (errors.length > 0) {
    element.classList.add('has-error');
    element.textContent = errors.join('\n');
  } else if (warnings.length > 0) {
    element.classList.add('has-warning');
    element.textContent = warnings.join('\n');
  } else if (validation?.ok === true) {
    element.classList.add('is-ok');
    element.textContent = '검증을 통과했습니다. 현재 원고를 바로 포스팅할 수 있습니다.';
  } else {
    element.textContent = fallback;
  }
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
      const previewUrl = image?.exists ? getBlogNextDraftImageUrl(type, image.imagePath) : '';
      const imageBody = previewUrl
        ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(image?.title || item.text || '')}" loading="lazy">`
        : '<div class="local-markdown-inline-image-missing">매칭되는 로컬 이미지가 없습니다.</div>';
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
  return fragments.join('') || '<div class="local-markdown-empty">본문 Preview를 표시할 내용이 없습니다.</div>';
}

function renderBlogNextDraftImages(type, preview = {}) {
  const imageItems = Array.isArray(preview.images) ? preview.images : [];
  if (imageItems.length === 0) return '<div class="local-markdown-empty">이미지 블록이 없습니다.</div>';
  return imageItems.map((image) => {
    const previewUrl = image.exists ? getBlogNextDraftImageUrl(type, image.imagePath) : '';
    const previewContent = previewUrl
      ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(image.title || '')}" loading="lazy">`
      : '<div class="local-markdown-image-card-placeholder">매칭되는 로컬 이미지가 없습니다.</div>';
    return `<article class="local-markdown-image-card">
      <div class="local-markdown-image-card-header">
        <div>
          <div class="local-markdown-image-card-title">IMAGE_${escapeHtml(String(image.index))} ${escapeHtml(image.title || '')}</div>
          <div class="local-markdown-image-card-meta">${escapeHtml(image.fileName || '파일 미매칭')}</div>
        </div>
        <span class="local-markdown-image-card-status ${image.exists ? 'ok' : 'missing'}">${image.exists ? '매칭됨' : '누락'}</span>
      </div>
      <div class="local-markdown-image-card-preview">${previewContent}</div>
      <p class="local-markdown-image-card-prompt">${escapeHtml(image.prompt || '')}</p>
    </article>`;
  }).join('');
}

function renderBlogNextDraftPreview(type, preview = null) {
  const container = document.querySelector(`[data-blog-next-draft-preview="${type}"]`);
  blogNextDraftState[type].preview = preview;
  syncBlogNextDraftExecutionState();
  if (!container || !preview) {
    if (container) container.hidden = true;
    return;
  }
  container.hidden = false;
  const title = container.querySelector('[data-draft-preview-title]');
  const meta = container.querySelector('[data-draft-preview-meta]');
  const body = container.querySelector('[data-draft-preview-body]');
  const images = container.querySelector('[data-draft-preview-images]');
  if (title) title.textContent = preview.title || '제목 없음';
  if (meta) {
    const stats = preview.stats || {};
    meta.textContent = [
      preview.source?.folderName || preview.source?.fileName || '',
      `본문 ${stats.contentCount || 0}개`,
      `이미지 ${stats.imageResolvedCount || 0}/${stats.imageBlockCount || 0}개`
    ].filter(Boolean).join(' · ');
  }
  if (body) body.innerHTML = renderBlogNextDraftBodyHtml(type, preview);
  if (images) images.innerHTML = renderBlogNextDraftImages(type, preview);
  setLocalMarkdownPreviewDensity(container, body, images, preview.stats || {});
  setBlogNextDraftValidation(type, preview.validation);
}

async function loadBlogNextDraftPreview(type) {
  const state = blogNextDraftState[type];
  const requestId = ++state.requestId;
  const hasSource = type === 'paste'
    ? Boolean(document.getElementById('blog-next-paste-markdown')?.value?.trim())
    : state.files.length > 0;
  if (!hasSource) {
    renderBlogNextDraftPreview(type, null);
    setBlogNextDraftValidation(type, null, type === 'paste'
      ? 'Markdown 원고를 붙여넣어 주세요.'
      : '원고 폴더를 선택해 주세요.');
    return null;
  }
  try {
    const payload = await buildBlogNextDraftPayload(type);
    const preview = await postJson('/api/v1/blog/local-markdown/preview', payload);
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
  const manuscriptActive = BLOG_NEXT_DRAFT_TYPES.some(type => blogNextDraftState[type].publishing);
  const executionActive = anotherRunnerActive || manuscriptActive;
  BLOG_NEXT_DRAFT_TYPES.forEach((type) => {
    const state = blogNextDraftState[type];
    const button = document.querySelector(`[data-blog-next-draft-publish="${type}"]`);
    if (!button) return;
    button.disabled = executionActive || !state.preview?.validation?.ok;
    button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
    button.textContent = state.publishing
      ? '포스팅 진행 중...'
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
    const payload = await buildBlogNextDraftPayload(type, { includeImages: true });
    await runWithLiveProgress({
      targetEl: result,
      requestLabel: `원고 ${action}`,
      requestFn: () => postJson('/api/v1/blog/local-markdown/publish', payload)
    });
    if (typeof renderBlogNextRunnerStatus === 'function') {
      renderBlogNextRunnerStatus({
        state: 'completed',
        busy: false,
        subject: type === 'paste' ? '원고 붙여넣기' : '원고 폴더',
        message: `원고 ${action}을 완료했습니다.`,
        resultStatus: settings.postStatus === 'draft' ? '임시 저장 완료'
          : settings.postStatus === 'schedule' ? '예약 발행 완료' : '발행 완료',
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
  state.requestId += 1;
  const input = document.getElementById('blog-next-folder-input');
  const path = document.getElementById('blog-next-folder-path');
  const clear = document.getElementById('blog-next-folder-clear');
  if (input) input.value = '';
  if (path) path.value = '';
  if (clear) clear.hidden = true;
  renderBlogNextDraftPreview('folder', null);
  setBlogNextDraftValidation('folder', null, '원고 폴더를 선택해 주세요.');
}

function clearBlogNextPastedDraft() {
  const input = document.getElementById('blog-next-paste-markdown');
  if (input) input.value = '';
  localStorage.removeItem('blog_next_pasted_markdown_draft');
  blogNextDraftState.paste.preview = null;
  blogNextDraftState.paste.requestId += 1;
  renderBlogNextDraftPreview('paste', null);
  setBlogNextDraftValidation('paste', null, 'Markdown 원고를 붙여넣어 주세요.');
}

function bindBlogNextDraftOptions(type) {
  const container = blogNextDraftContainer(type);
  container?.querySelectorAll('[data-draft-field]').forEach((field) => {
    field.addEventListener('change', () => {
      if (field.dataset.draftField === 'post-status') syncBlogNextDraftSchedule(type);
      scheduleBlogNextDraftPreview(type);
    });
  });
  document.querySelector(`[data-blog-next-draft-publish="${type}"]`)
    ?.addEventListener('click', () => publishBlogNextDraft(type));
  syncBlogNextDraftSchedule(type);
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
    const path = document.getElementById('blog-next-folder-path');
    const clear = document.getElementById('blog-next-folder-clear');
    if (path) path.value = folderName;
    if (clear) clear.hidden = files.length === 0;
    event.target.value = '';
    await loadBlogNextDraftPreview('folder');
  });

  const pastedInput = document.getElementById('blog-next-paste-markdown');
  if (pastedInput) {
    pastedInput.value = localStorage.getItem('blog_next_pasted_markdown_draft') || '';
    pastedInput.addEventListener('input', () => {
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
  BLOG_NEXT_DRAFT_TYPES.forEach(bindBlogNextDraftOptions);
}
