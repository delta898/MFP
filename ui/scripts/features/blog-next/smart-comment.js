let blogNextSmartCommentItems = [];
let blogNextSmartCommentSavedSettings = null;
let blogNextSmartCommentDirty = false;
let blogNextSmartCommentRunning = false;
let blogNextSmartCommentLoading = false;
let blogNextSmartCommentSaving = false;
let blogNextSmartCommentRedraftingIndex = null;
let blogNextSmartCommentLoaded = false;
let blogNextSmartCommentBound = false;
let blogNextSmartCommentProgressTimer = null;
let blogNextSmartCommentEnvironment = '';
const blogNextSmartCommentSeenPostUrls = new Set();
const BLOG_NEXT_SMART_COMMENT_TONE_LABELS = Object.freeze({
  empathetic: '공감형',
  friendly: '친근형',
  calm: '담백형'
});

function normalizeBlogNextSmartCommentSettings(settings = {}) {
  const requestedFetchLimit = Number.parseInt(String(settings.fetchLimit ?? settings.fetch_limit ?? '3'), 10);
  const fetchLimit = Number.isFinite(requestedFetchLimit) ? Math.min(10, Math.max(1, requestedFetchLimit)) : 3;
  const requestedMaxChars = Number.parseInt(String(settings.maxChars ?? settings.max_chars ?? '60'), 10);
  const maxChars = Number.isFinite(requestedMaxChars) ? Math.min(200, Math.max(20, requestedMaxChars)) : 60;
  return {
    aiMode: String(settings.aiMode ?? settings.ai_mode ?? 'default') === 'custom' ? 'custom' : 'default',
    fetchLimit,
    maxChars,
    headless: settings.headless !== false
  };
}

function serializeBlogNextSmartCommentSettings(settings = {}) {
  return JSON.stringify(normalizeBlogNextSmartCommentSettings(settings));
}

function readBlogNextSmartCommentForm() {
  const showBrowser = document.getElementById('blog-next-smart-comment-show-browser');
  return normalizeBlogNextSmartCommentSettings({
    aiMode: document.getElementById('blog-next-smart-comment-ai-mode')?.value,
    fetchLimit: document.getElementById('blog-next-smart-comment-fetch-limit')?.value,
    maxChars: document.getElementById('blog-next-smart-comment-max-chars')?.value,
    headless: blogNextSmartCommentEnvironment === 'production' || showBrowser?.checked !== true
  });
}

function fillBlogNextSmartCommentForm(settings = {}) {
  const normalized = normalizeBlogNextSmartCommentSettings(settings);
  const ensureOption = (id, value, label) => {
    const select = document.getElementById(id);
    if (!select || Array.from(select.options).some((option) => option.value === String(value))) return;
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = label;
    option.dataset.legacyValue = 'true';
    select.appendChild(option);
  };
  ensureOption('blog-next-smart-comment-fetch-limit', normalized.fetchLimit, `${normalized.fetchLimit}개 · 기존 설정`);
  ensureOption('blog-next-smart-comment-max-chars', normalized.maxChars, `${normalized.maxChars}자 · 기존 설정`);
  const values = {
    'blog-next-smart-comment-ai-mode': normalized.aiMode,
    'blog-next-smart-comment-fetch-limit': String(normalized.fetchLimit),
    'blog-next-smart-comment-max-chars': String(normalized.maxChars)
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value;
  });
  const showBrowser = document.getElementById('blog-next-smart-comment-show-browser');
  if (showBrowser) showBrowser.checked = normalized.headless === false;
}

function syncBlogNextSmartCommentButtons() {
  const saveButton = document.getElementById('blog-next-smart-comment-save');
  const runButton = document.getElementById('blog-next-smart-comment-run');
  const busy = blogNextSmartCommentLoading
    || blogNextSmartCommentRunning
    || blogNextSmartCommentSaving
    || blogNextSmartCommentRedraftingIndex !== null;
  if (saveButton) {
    saveButton.disabled = busy || !blogNextSmartCommentDirty;
    saveButton.setAttribute('aria-disabled', saveButton.disabled ? 'true' : 'false');
    saveButton.setAttribute('aria-busy', blogNextSmartCommentSaving ? 'true' : 'false');
    saveButton.textContent = blogNextSmartCommentSaving ? '저장 중...' : '설정 저장';
  }
  if (runButton) {
    runButton.disabled = busy;
    runButton.setAttribute('aria-busy', blogNextSmartCommentRunning ? 'true' : 'false');
    runButton.textContent = blogNextSmartCommentRunning
      ? '댓글 준비 중...'
      : (blogNextSmartCommentSeenPostUrls.size > 0 ? '새 이웃 글 더 찾기' : '댓글 초안 만들기');
  }
}

function isBlogNextSmartCommentOperationBusy() {
  return blogNextSmartCommentLoading
    || blogNextSmartCommentRunning
    || blogNextSmartCommentSaving
    || blogNextSmartCommentRedraftingIndex !== null;
}

function syncBlogNextSmartCommentModelRole() {
  const custom = document.getElementById('blog-next-smart-comment-ai-mode')?.value === 'custom';
  const label = custom ? 'Chat Model' : '글쓰기 모델';
  const summary = document.getElementById('blog-next-smart-comment-settings-summary');
  if (summary) summary.textContent = `${label} 사용`;
}

function setBlogNextSmartCommentFormDisabled(disabled) {
  const form = document.getElementById('blog-next-smart-comment-form');
  form?.querySelectorAll('select, input').forEach((control) => {
    control.disabled = disabled;
  });
  form?.setAttribute('aria-busy', disabled ? 'true' : 'false');
  syncBlogNextSmartCommentButtons();
}

function setBlogNextSmartCommentRedraftActionsBusy(busy, activeItemIndex = null) {
  document.querySelectorAll('[data-blog-next-smart-comment-redraft]').forEach((button) => {
    if (busy) {
      if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent;
      button.disabled = true;
      const itemIndex = Number(button.dataset.blogNextSmartCommentRedraft);
      const active = Number.isInteger(activeItemIndex) && itemIndex === activeItemIndex;
      button.setAttribute('aria-busy', active ? 'true' : 'false');
      if (active) button.textContent = '만드는 중...';
      return;
    }
    button.disabled = false;
    button.setAttribute('aria-busy', 'false');
    if (button.dataset.idleLabel) button.textContent = button.dataset.idleLabel;
    delete button.dataset.idleLabel;
  });
  document.querySelectorAll('[data-blog-next-smart-comment-card]').forEach((card) => {
    const itemIndex = Number(card.dataset.blogNextSmartCommentCard);
    const active = busy && Number.isInteger(activeItemIndex) && itemIndex === activeItemIndex;
    card.setAttribute('aria-busy', active ? 'true' : 'false');
  });
}

function updateBlogNextSmartCommentDirtyState() {
  syncBlogNextSmartCommentModelRole();
  blogNextSmartCommentDirty = Boolean(blogNextSmartCommentSavedSettings)
    && serializeBlogNextSmartCommentSettings(readBlogNextSmartCommentForm())
      !== serializeBlogNextSmartCommentSettings(blogNextSmartCommentSavedSettings);
  syncBlogNextSmartCommentButtons();
  return blogNextSmartCommentDirty;
}

function setBlogNextSmartCommentSavedSettings(settings = {}) {
  blogNextSmartCommentSavedSettings = normalizeBlogNextSmartCommentSettings(settings);
  blogNextSmartCommentDirty = false;
  syncBlogNextSmartCommentButtons();
}

function discardBlogNextSmartCommentChanges() {
  if (blogNextSmartCommentSavedSettings) fillBlogNextSmartCommentForm(blogNextSmartCommentSavedSettings);
  blogNextSmartCommentDirty = false;
  syncBlogNextSmartCommentButtons();
}

async function confirmDiscardUnsavedBlogNextSmartCommentSettings() {
  if (!blogNextSmartCommentDirty) return true;
  const shouldDiscard = await showUiConfirm(
    '저장되지 않은 스마트 댓글 설정이 있습니다.\n저장하지 않고 이동하면 변경사항이 사라집니다.',
    {
      title: '스마트 댓글 설정 변경사항',
      confirmText: '저장 안 하고 이동',
      cancelText: '계속 편집'
    }
  );
  if (!shouldDiscard) return false;
  discardBlogNextSmartCommentChanges();
  return true;
}

function renderBlogNextSmartCommentStatus({ state = 'idle', title = '', message = '', completedCount = 0, totalCount = 0 } = {}) {
  const panel = document.getElementById('blog-next-smart-comment-status');
  const titleElement = document.getElementById('blog-next-smart-comment-status-title');
  const messageElement = document.getElementById('blog-next-smart-comment-status-message');
  const progress = document.getElementById('blog-next-smart-comment-progress');
  const progressBar = document.getElementById('blog-next-smart-comment-progress-bar');
  if (!panel || !titleElement || !messageElement) return;
  panel.hidden = state === 'idle';
  panel.dataset.state = state;
  titleElement.textContent = title;
  messageElement.textContent = message;
  const hasProgress = Number(totalCount) > 0 && ['running', 'waiting'].includes(state);
  if (progress) progress.hidden = !hasProgress;
  if (progressBar) {
    const percent = hasProgress ? Math.min(100, Math.max(0, (Number(completedCount) / Number(totalCount)) * 100)) : 0;
    progressBar.style.width = `${percent}%`;
  }
}

function renderBlogNextSmartCommentProgress(progress = {}) {
  const phase = String(progress.phase || '');
  const completedCount = Number(progress.completedCount || 0);
  const totalCount = Number(progress.totalCount || 0);
  if (phase === 'session') {
    renderBlogNextSmartCommentStatus({ state: 'running', title: '네이버 연결 확인 중', message: '로그인 상태를 확인하고 있습니다.' });
    return;
  }
  if (phase === 'collecting') {
    renderBlogNextSmartCommentStatus({ state: 'running', title: '이웃의 새 글을 찾는 중', message: '댓글을 남기기 좋은 글을 살펴보고 있습니다.' });
    return;
  }
  if (phase === 'rate_limited') {
    const seconds = Number(progress.retryRemainingSeconds || 0);
    renderBlogNextSmartCommentStatus({
      state: 'waiting',
      title: 'AI 사용 한도 대기 중',
      message: seconds > 0 ? `약 ${seconds}초 후 자동으로 다시 시도합니다.` : '잠시 후 자동으로 다시 시도합니다.',
      completedCount,
      totalCount
    });
    return;
  }
  if (phase === 'generating') {
    renderBlogNextSmartCommentStatus({
      state: 'running',
      title: '댓글 초안 작성 중',
      message: totalCount > 0 ? `${completedCount}/${totalCount}개 후보를 처리했습니다.` : '글의 맥락에 맞는 댓글을 작성하고 있습니다.',
      completedCount,
      totalCount
    });
  }
}

function safeBlogNextSmartCommentUrl(value) {
  const text = String(value || '').trim();
  return /^https?:\/\//i.test(text) ? text : '';
}

function normalizeBlogNextSmartCommentDraft(draft, index = 0) {
  const fallbackTone = Object.keys(BLOG_NEXT_SMART_COMMENT_TONE_LABELS)[index] || '';
  if (draft && typeof draft === 'object' && !Array.isArray(draft)) {
    const tone = String(draft.tone || fallbackTone);
    return {
      tone,
      label: BLOG_NEXT_SMART_COMMENT_TONE_LABELS[tone] || '댓글 제안',
      text: String(draft.text || '')
    };
  }
  return {
    tone: fallbackTone,
    label: BLOG_NEXT_SMART_COMMENT_TONE_LABELS[fallbackTone] || '댓글 제안',
    text: String(draft || '')
  };
}

function renderBlogNextSmartCommentItems(items = [], summary = null) {
  const list = document.getElementById('blog-next-smart-comment-list');
  const results = document.querySelector('.blog-next-smart-comment-results');
  const resultsHead = document.querySelector('.blog-next-smart-comment-results-head');
  const summaryElement = document.getElementById('blog-next-smart-comment-summary');
  if (!list) return;
  blogNextSmartCommentItems = Array.isArray(items) ? items.map((item) => ({ ...(item || {}) })) : [];
  list.dataset.state = blogNextSmartCommentItems.length > 0 ? 'results' : 'empty';
  if (results) results.dataset.state = list.dataset.state;
  if (resultsHead) resultsHead.hidden = false;
  const successCount = summary?.successCount ?? blogNextSmartCommentItems.filter((item) => Array.isArray(item.drafts) && item.drafts.length > 0).length;
  const failureCount = summary?.failureCount ?? Math.max(0, blogNextSmartCommentItems.length - successCount);
  if (summaryElement) {
    summaryElement.textContent = blogNextSmartCommentItems.length === 0
      ? '아직 만든 댓글이 없습니다.'
      : (failureCount > 0 ? `${successCount}개 준비 · ${failureCount}개 미완료` : `${successCount}개 후보의 댓글을 준비했습니다.`);
  }
  if (blogNextSmartCommentItems.length === 0) {
    list.innerHTML = `
      <div class="blog-next-empty-state blog-next-smart-comment-empty ui-empty-state">
        <strong>조건에 맞는 이웃 글을 찾지 못했습니다.</strong>
        <p>잠시 후 다시 실행하거나 후보 수를 조정해 보세요.</p>
      </div>`;
    return;
  }
  list.innerHTML = blogNextSmartCommentItems.map((item, itemIndex) => {
    const drafts = Array.isArray(item.drafts) ? item.drafts : [];
    const title = String(item.title || '제목 없음');
    const originalPostUrl = safeBlogNextSmartCommentUrl(item.postUrl);
    const commentUrl = safeBlogNextSmartCommentUrl(item.commentUrl || item.postUrl);
    const titleMarkup = originalPostUrl
      ? `<h4><a class="blog-next-smart-comment-title-link" href="${escapeHtml(originalPostUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(`${title} — 네이버 원문 새 창에서 보기`)}">${escapeHtml(title)}</a></h4>`
      : `<h4>${escapeHtml(title)}</h4>`;
    const postAction = commentUrl
      ? `<a class="blog-next-smart-comment-post-action" href="${escapeHtml(commentUrl)}" target="_blank" rel="noopener noreferrer">네이버에서 댓글 쓰기</a>`
      : '';
    const draftRows = drafts.length > 0
      ? drafts.map((draft, draftIndex) => {
        const normalizedDraft = normalizeBlogNextSmartCommentDraft(draft, draftIndex);
        return `
          <div class="blog-next-smart-comment-draft">
            <span class="blog-next-smart-comment-tone">${escapeHtml(normalizedDraft.label)}</span>
            <p title="${escapeHtml(normalizedDraft.text)}">${escapeHtml(normalizedDraft.text)}</p>
            <div class="blog-next-smart-comment-draft-actions">
              <button class="secondary compact" type="button" data-blog-next-smart-comment-copy="${itemIndex}:${draftIndex}">댓글 복사</button>
            </div>
          </div>`;
      }).join('')
      : `<div class="blog-next-smart-comment-failure">
          <span>${escapeHtml(item.error || '댓글 초안을 만들지 못했습니다.')}</span>
          <button class="secondary compact" type="button" data-blog-next-smart-comment-redraft="${itemIndex}">다시 시도</button>
        </div>`;
    return `
      <article class="blog-next-smart-comment-card" data-blog-next-smart-comment-card="${itemIndex}">
        <div class="blog-next-smart-comment-card-head">
          <div class="blog-next-smart-comment-card-copy">
            <span>${escapeHtml(item.authorName || '작성자 미상')}</span>
            ${titleMarkup}
          </div>
        </div>
        <p class="blog-next-smart-comment-excerpt">${escapeHtml(item.excerpt || '본문 내용을 불러오지 못했습니다.')}</p>
        <div class="blog-next-smart-comment-drafts">${draftRows}</div>
        ${drafts.length > 0 ? `<div class="blog-next-smart-comment-card-actions">
          <button class="secondary compact blog-next-smart-comment-redraft" type="button" data-blog-next-smart-comment-redraft="${itemIndex}">이 글의 댓글 다시 만들기</button>
          ${postAction}
        </div>` : ''}
      </article>`;
  }).join('');
}

function renderBlogNextSmartCommentCompletion(summary = {}) {
  const successCount = Number(summary.successCount || 0);
  const candidateCount = Number(summary.candidateCount || 0);
  const failureCount = Number(summary.failureCount || 0);
  if (summary.status === 'rate_limited') {
    renderBlogNextSmartCommentStatus({ state: 'warning', title: '일부 댓글 준비 완료', message: `${successCount}/${candidateCount}개를 만들었습니다. 완성된 댓글은 그대로 사용할 수 있습니다.` });
  } else if (summary.status === 'partial_success') {
    renderBlogNextSmartCommentStatus({ state: 'warning', title: '일부 댓글 준비 완료', message: `${successCount}개 완료 · ${failureCount}개는 다시 시도할 수 있습니다.` });
  } else if (summary.status === 'draft_generation_failed') {
    renderBlogNextSmartCommentStatus({ state: 'error', title: '댓글을 만들지 못했습니다', message: 'AI 사용 상태를 확인한 뒤 다시 시도해 주세요.' });
  } else if (summary.status === 'no_candidates') {
    renderBlogNextSmartCommentStatus({ state: 'warning', title: '후보 글을 찾지 못했습니다', message: '새로운 이웃 글이 올라온 뒤 다시 시도해 주세요.' });
  } else {
    renderBlogNextSmartCommentStatus({ state: 'success', title: '댓글 준비 완료', message: `${successCount}개 후보의 댓글 초안을 만들었습니다.` });
  }
}

async function loadBlogNextSmartCommentSettings(options = {}) {
  if (blogNextSmartCommentDirty && options.force !== true) return null;
  if (blogNextSmartCommentLoaded && options.force !== true) return blogNextSmartCommentSavedSettings;
  blogNextSmartCommentLoading = true;
  setBlogNextSmartCommentFormDisabled(true);
  if (!blogNextSmartCommentLoaded) {
    renderBlogNextSmartCommentStatus({ state: 'running', title: '설정 확인 중', message: '사용할 댓글 설정을 불러오고 있습니다.' });
  }
  try {
    const data = await fetchJson('/api/v1/blog/naver-comment-draft/settings');
    const settings = normalizeBlogNextSmartCommentSettings(data?.settings || {});
    blogNextSmartCommentEnvironment = String(data?.runtime?.environment || '');
    const diagnostic = document.getElementById('blog-next-smart-comment-diagnostic');
    if (diagnostic) diagnostic.hidden = blogNextSmartCommentEnvironment === 'production';
    fillBlogNextSmartCommentForm(settings);
    setBlogNextSmartCommentSavedSettings(settings);
    syncBlogNextSmartCommentModelRole();
    blogNextSmartCommentLoaded = true;
    renderBlogNextSmartCommentStatus({ state: 'idle' });
    return settings;
  } catch (error) {
    renderBlogNextSmartCommentStatus({ state: 'error', title: '설정을 불러오지 못했습니다', message: error.message || '잠시 후 다시 시도해 주세요.' });
    return null;
  } finally {
    blogNextSmartCommentLoading = false;
    setBlogNextSmartCommentFormDisabled(false);
  }
}

async function saveBlogNextSmartCommentSettings(event) {
  event?.preventDefault();
  if (isBlogNextSmartCommentOperationBusy() || !blogNextSmartCommentDirty) return;
  const settings = readBlogNextSmartCommentForm();
  blogNextSmartCommentSaving = true;
  setBlogNextSmartCommentFormDisabled(true);
  setBlogNextSmartCommentRedraftActionsBusy(true);
  try {
    const data = await postJson('/api/v1/blog/naver-comment-draft/settings', settings);
    setBlogNextSmartCommentSavedSettings(data?.settings || settings);
    showUiToast({ level: 'success', title: '스마트 댓글 설정 저장', message: '다음 실행에도 같은 설정을 사용합니다.' });
  } catch (error) {
    showUiToast({ level: 'error', title: '설정 저장 실패', message: error.message || '입력값을 확인해 주세요.' });
  } finally {
    blogNextSmartCommentSaving = false;
    setBlogNextSmartCommentFormDisabled(false);
    setBlogNextSmartCommentRedraftActionsBusy(false);
  }
}

function stopBlogNextSmartCommentProgressPolling() {
  if (blogNextSmartCommentProgressTimer) window.clearTimeout(blogNextSmartCommentProgressTimer);
  blogNextSmartCommentProgressTimer = null;
}

function pollBlogNextSmartCommentProgress() {
  stopBlogNextSmartCommentProgressPolling();
  const poll = async () => {
    if (!blogNextSmartCommentRunning) return;
    try {
      const data = await fetchJson('/api/v1/blog/naver-comment-draft/progress');
      if (blogNextSmartCommentRunning) renderBlogNextSmartCommentProgress(data?.progress || {});
    } catch (_error) {
      // 실행 요청의 최종 응답을 기준으로 판정하고 현재 상태는 유지한다.
    }
    if (blogNextSmartCommentRunning) blogNextSmartCommentProgressTimer = window.setTimeout(poll, 1000);
  };
  blogNextSmartCommentProgressTimer = window.setTimeout(poll, 250);
}

async function runBlogNextSmartComment() {
  if (isBlogNextSmartCommentOperationBusy()) return;
  const settings = readBlogNextSmartCommentForm();
  blogNextSmartCommentRunning = true;
  setBlogNextSmartCommentFormDisabled(true);
  setBlogNextSmartCommentRedraftActionsBusy(true);
  document.getElementById('blog-next-smart-comment-list')?.setAttribute('aria-busy', 'true');
  renderBlogNextSmartCommentStatus({ state: 'running', title: '댓글 준비 시작', message: '네이버 연결 상태를 확인하고 있습니다.' });
  pollBlogNextSmartCommentProgress();
  try {
    const data = await postJson('/api/v1/blog/naver-comment-draft/run', {
      ...settings,
      excludePostUrls: Array.from(blogNextSmartCommentSeenPostUrls)
    });
    const nextItems = Array.isArray(data?.items) ? data.items : [];
    nextItems.filter((item) => Array.isArray(item?.drafts) && item.drafts.length > 0).forEach((item) => {
      const postUrl = safeBlogNextSmartCommentUrl(item?.postUrl);
      if (postUrl) blogNextSmartCommentSeenPostUrls.add(postUrl);
    });
    if (nextItems.length > 0 || blogNextSmartCommentItems.length === 0) {
      renderBlogNextSmartCommentItems(nextItems, data?.summary || {});
    }
    renderBlogNextSmartCommentCompletion(data?.summary || {});
  } catch (error) {
    renderBlogNextSmartCommentStatus({
      state: 'error',
      title: '댓글 준비 실패',
      message: error.message || '잠시 후 다시 시도해 주세요.'
    });
  } finally {
    blogNextSmartCommentRunning = false;
    document.getElementById('blog-next-smart-comment-list')?.setAttribute('aria-busy', 'false');
    stopBlogNextSmartCommentProgressPolling();
    setBlogNextSmartCommentFormDisabled(false);
    setBlogNextSmartCommentRedraftActionsBusy(false);
  }
}

async function redraftBlogNextSmartComment(itemIndex) {
  if (isBlogNextSmartCommentOperationBusy()) return;
  const item = blogNextSmartCommentItems[itemIndex];
  const button = document.querySelector(`[data-blog-next-smart-comment-redraft="${itemIndex}"]`);
  if (!item || button?.disabled) return;
  const settings = readBlogNextSmartCommentForm();
  blogNextSmartCommentRedraftingIndex = itemIndex;
  setBlogNextSmartCommentFormDisabled(true);
  setBlogNextSmartCommentRedraftActionsBusy(true, itemIndex);
  try {
    const data = await postJson('/api/v1/blog/naver-comment-draft/redraft', {
      ...settings,
      title: item.title || '',
      authorName: item.authorName || '',
      excerpt: item.excerpt || '',
      postUrl: item.postUrl || ''
    });
    const nextItems = blogNextSmartCommentItems.map((entry, index) => index === itemIndex
      ? { ...entry, drafts: Array.isArray(data?.drafts) ? data.drafts : [], error: '' }
      : entry);
    renderBlogNextSmartCommentItems(nextItems);
    showUiToast({ level: 'success', title: '댓글 다시 만들기 완료', message: '새로운 댓글 초안을 준비했습니다.' });
  } catch (error) {
    showUiToast({ level: 'error', title: '댓글 다시 만들기 실패', message: error.message || '기존 댓글은 그대로 유지했습니다.' });
  } finally {
    blogNextSmartCommentRedraftingIndex = null;
    setBlogNextSmartCommentFormDisabled(false);
    setBlogNextSmartCommentRedraftActionsBusy(false);
  }
}

async function handleBlogNextSmartCommentListClick(event) {
  const copyButton = event.target.closest('[data-blog-next-smart-comment-copy]');
  if (copyButton) {
    const [itemIndex, draftIndex] = String(copyButton.dataset.blogNextSmartCommentCopy || '').split(':').map(Number);
    const text = normalizeBlogNextSmartCommentDraft(
      blogNextSmartCommentItems[itemIndex]?.drafts?.[draftIndex],
      draftIndex
    ).text;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showUiToast({ level: 'success', title: '댓글 복사 완료', message: '네이버 댓글 입력창에 붙여넣을 수 있습니다.' });
    } catch (_error) {
      showUiToast({ level: 'error', title: '댓글 복사 실패', message: '댓글을 선택해 직접 복사해 주세요.' });
    }
    return;
  }
  const redraftButton = event.target.closest('[data-blog-next-smart-comment-redraft]');
  if (redraftButton) void redraftBlogNextSmartComment(Number(redraftButton.dataset.blogNextSmartCommentRedraft));
}

function initBlogNextSmartComment() {
  if (blogNextSmartCommentBound) return;
  const form = document.getElementById('blog-next-smart-comment-form');
  if (!form) return;
  form.addEventListener('submit', saveBlogNextSmartCommentSettings);
  form.addEventListener('input', updateBlogNextSmartCommentDirtyState);
  form.addEventListener('change', updateBlogNextSmartCommentDirtyState);
  document.getElementById('blog-next-smart-comment-run')?.addEventListener('click', runBlogNextSmartComment);
  document.getElementById('blog-next-smart-comment-list')?.addEventListener('click', handleBlogNextSmartCommentListClick);
  blogNextSmartCommentBound = true;
  syncBlogNextSmartCommentModelRole();
  syncBlogNextSmartCommentButtons();
}
