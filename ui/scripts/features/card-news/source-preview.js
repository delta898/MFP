const cardNewsViewState = {
  initialized: false,
  sourceKind: 'feed_item',
  articles: [],
  selectedArticleIndex: -1,
  configuredSources: [],
  feedSources: [],
  failures: [],
  activePlatform: '',
  preview: null,
  previewSourceKey: '',
  previewFromManaged: false,
  previewCache: new Map(),
  previewRequestId: 0,
  busy: false,
  loadingSources: false,
  sourcesStale: true,
  generating: false,
  compositionOperation: null,
  imageOperation: null,
  publishing: false,
  publishingRequestId: 0,
  publishingWorkspaceLoading: false,
  publishingConfig: null,
  signaturePolicy: null,
  signaturePolicyRequestId: 0,
  signaturePreviewEffectiveSignature: '',
  signaturePreviewResolved: false,
  publishingOutcome: '',
  publishedChannelIds: new Set(),
  projectId: '',
  generation: null,
  createWorkflowContext: null,
  managedWorkflowContext: null,
  managedDetailOpen: false,
  workspace: 'create',
  managedItems: [],
  managedFilter: '전체',
  managedLoading: false,
  zipImport: null,
  zipImporting: false,
  scrollTop: 0
};

const CARD_NEWS_PLATFORM_STORAGE_KEY = 'bloggenius.cardNews.sourcePlatform';
const CARD_NEWS_GENERATION_SETTINGS_STORAGE_KEY = 'bloggenius.cardNews.generationSettings';
async function loadCardNewsSignaturePolicy(options = {}) {
  const requestId = ++cardNewsViewState.signaturePolicyRequestId;
  const previousEffectiveSignature = cardNewsViewState.signaturePreviewEffectiveSignature;
  let policy;
  try {
    const query = new URLSearchParams();
    const enabled = document.getElementById('card-news-signature-enabled');
    const signature = enabled && !enabled.checked ? '' : readCardNewsSignature();
    if (signature) query.set('signature', signature);
    policy = await fetchJson(`/api/v1/card-news/signature-policy${query.size ? `?${query}` : ''}`);
  } catch (_) {
    policy = { editable: false, default_signature: 'BlogGenius.kr', effective_signature: 'BlogGenius.kr' };
  }
  if (requestId !== cardNewsViewState.signaturePolicyRequestId) return;
  cardNewsViewState.signaturePolicy = policy;
  const input = document.getElementById('card-news-signature');
  const enabledInput = document.getElementById('card-news-signature-enabled');
  const helpTrigger = document.querySelector('[data-card-news-signature-help]');
  const helpText = document.getElementById('card-news-signature-help-text');
  const editable = policy?.editable === true;
  if (enabledInput) {
    enabledInput.checked = editable ? readCardNewsSignatureEnabled() : true;
    enabledInput.disabled = !editable;
  }
  if (input) {
    input.disabled = !editable || !enabledInput?.checked;
    input.value = editable ? readCardNewsSignature() : 'BlogGenius.kr';
  }
  if (helpTrigger) {
    helpTrigger.hidden = editable;
    helpTrigger.setAttribute('aria-label', policy?.plan_verified === true && policy?.plan_code === 'free'
      ? 'Free 플랜 서명 안내'
      : '플랜 확인 실패 안내');
  }
  if (helpText) {
    helpText.textContent = policy?.plan_verified === true && policy?.plan_code === 'free'
      ? 'Free 플랜에서는 BlogGenius.kr 서명이 고정 적용됩니다.'
      : '플랜을 확인하지 못해 Free 기준으로 BlogGenius.kr 서명이 적용됩니다.';
  }
  const previousResolved = cardNewsViewState.signaturePreviewResolved;
  const changed = Boolean(cardNewsViewState.generation)
    && previousResolved
    && previousEffectiveSignature !== policy?.effective_signature;
  cardNewsViewState.signaturePreviewEffectiveSignature = String(policy?.effective_signature ?? 'BlogGenius.kr');
  cardNewsViewState.signaturePreviewResolved = true;
  if (cardNewsViewState.generation && (changed || !previousResolved)) {
    renderCardNewsGeneration(cardNewsViewState.generation, { scroll: false });
  }
  if (changed && options.notifyOnChange === true) {
    showUiToast({
      level: 'warning',
      title: '미리보기 갱신 필요',
      message: '플랜 또는 서명이 바뀌어 미리보기를 갱신했습니다. 확인한 뒤 다시 진행해 주세요.',
      timeoutMs: 8000,
      dedupeKey: 'card-news-signature-preview-changed'
    });
  }
  return { policy, changed };
}

async function ensureCardNewsSignaturePreviewCurrent() {
  const previewWasResolved = cardNewsViewState.signaturePreviewResolved;
  const { changed } = await loadCardNewsSignaturePolicy();
  if (!changed && previewWasResolved) return true;
  showUiToast({
    level: 'warning',
    title: '미리보기 갱신 필요',
    message: '미리보기를 최신 플랜과 서명 기준으로 갱신했습니다. 이미지를 확인한 뒤 다시 진행해 주세요.',
    timeoutMs: 8000,
    dedupeKey: 'card-news-signature-preview-changed'
  });
  return false;
}

async function handleCardNewsSignaturePreviewStale() {
  await loadCardNewsSignaturePolicy();
  showUiToast({
    level: 'warning',
    title: '미리보기 갱신 필요',
    message: '플랜 또는 서명이 바뀌어 작업을 진행하지 않았습니다. 갱신된 미리보기를 확인한 뒤 다시 진행해 주세요.',
    timeoutMs: 8000,
    dedupeKey: 'card-news-signature-preview-changed'
  });
}

async function downloadCardNewsArtifact(link) {
  if (!await ensureCardNewsSignaturePreviewCurrent()) return;
  try {
    const response = await fetch(link.href, { cache: 'no-store' });
    if (!response.ok) {
      const body = await readJsonResponseSafely(response);
      const error = new Error(body?.error?.message || `HTTP ${response.status}`);
      error.code = body?.error?.code || '';
      throw error;
    }
    const blobUrl = URL.createObjectURL(await response.blob());
    const filenameHeader = response.headers.get('Content-Disposition') || '';
    const encodedFilename = filenameHeader.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const plainFilename = filenameHeader.match(/filename="([^"]+)"/i)?.[1];
    let filename = link.download || plainFilename || 'card-news-image';
    if (encodedFilename) {
      try { filename = decodeURIComponent(encodedFilename); } catch (_) { }
    }
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (error) {
    if (error.code === 'CARD_NEWS_SIGNATURE_PREVIEW_STALE') {
      await handleCardNewsSignaturePreviewStale();
      return;
    }
    showUiToast({ level: 'error', title: '다운로드 실패', message: error.message || '카드뉴스 이미지를 받지 못했습니다.' });
  }
}

function saveCardNewsSignature() {
  const input = document.getElementById('card-news-signature');
  if (!input || input.disabled) return;
  const signature = String(input.value || '').trim().slice(0, 48);
  try { localStorage.setItem(CARD_NEWS_SIGNATURE_STORAGE_KEY, signature); } catch (_) { }
}

function saveCardNewsSignatureEnabled() {
  const toggle = document.getElementById('card-news-signature-enabled');
  if (!toggle || toggle.disabled) return;
  try { localStorage.setItem(CARD_NEWS_SIGNATURE_ENABLED_STORAGE_KEY, String(toggle.checked)); } catch (_) { }
  const input = document.getElementById('card-news-signature');
  if (input) input.disabled = !toggle.checked;
}

function refreshCardNewsSignaturePreview() {
  saveCardNewsSignature();
  void loadCardNewsSignaturePolicy();
}

function cardNewsSourceLabel(kind, source = {}) {
  if (kind === 'feed_item') return source.feed_label || 'RSS 피드';
  if (kind === 'url') return '웹 URL';
  return '직접 입력 내용';
}

function formatCardNewsDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value || '');
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(date);
}

function cardNewsSourceKey(source = {}) {
  if (source.kind === 'feed_item') return `feed:${source.item_key || source.canonical_url || ''}`;
  if (source.kind === 'url') return `url:${String(source.canonical_url || '').trim()}`;
  return `manuscript:${String(source.title || '').trim()}\n${String(source.text || '').trim()}`;
}

function readCardNewsSource() {
  if (cardNewsViewState.sourceKind === 'feed_item') {
    const article = cardNewsViewState.articles[cardNewsViewState.selectedArticleIndex];
    if (!article) throw new Error('카드뉴스로 만들 블로그 글을 선택해 주세요.');
    return article;
  }
  if (cardNewsViewState.sourceKind === 'url') {
    const canonicalUrl = document.getElementById('card-news-url')?.value?.trim() || '';
    if (!canonicalUrl) throw new Error('카드뉴스로 만들 공개 글 주소를 입력해 주세요.');
    return { kind: 'url', canonical_url: canonicalUrl };
  }
  const title = document.getElementById('card-news-manuscript-title')?.value?.trim() || '';
  const text = document.getElementById('card-news-manuscript-text')?.value?.trim() || '';
  if (!text) throw new Error('카드뉴스로 만들 내용을 입력해 주세요.');
  return { kind: 'manuscript', title, text };
}

function setCardNewsStatus(message = '', state = '') {
  const element = document.getElementById('card-news-source-status');
  if (!element) return;
  element.textContent = message;
  element.dataset.state = state;
}

function setCardNewsBusy(busy, action = '') {
  cardNewsViewState.busy = busy;
  const previewButton = document.getElementById('card-news-preview-button');
  const refreshButton = document.getElementById('card-news-source-refresh');
  if (previewButton) {
    previewButton.disabled = busy;
    previewButton.textContent = busy && action === 'preview' ? '내용 확인 중…' : '내용 확인';
  }
  if (refreshButton) refreshButton.disabled = busy || cardNewsViewState.loadingSources;
}

function setCardNewsSourceLoading(loading) {
  cardNewsViewState.loadingSources = loading;
  const refreshButton = document.getElementById('card-news-source-refresh');
  if (!refreshButton) return;
  refreshButton.disabled = loading || cardNewsViewState.busy;
  refreshButton.classList.toggle('is-loading', loading);
}

function cardNewsPreviewMatchesCurrentSource() {
  if (cardNewsViewState.previewFromManaged && cardNewsViewState.workspace === 'create') {
    return Boolean(cardNewsViewState.preview);
  }
  if (cardNewsViewState.workspace === 'managed' && cardNewsViewState.managedDetailOpen) {
    return Boolean(cardNewsViewState.preview && cardNewsViewState.projectId);
  }
  try {
    return cardNewsViewState.previewSourceKey === cardNewsSourceKey(readCardNewsSource());
  } catch (_) {
    return false;
  }
}

function captureCardNewsWorkflowContext() {
  return {
    preview: cardNewsViewState.preview,
    previewSourceKey: cardNewsViewState.previewSourceKey,
    previewFromManaged: cardNewsViewState.previewFromManaged,
    projectId: cardNewsViewState.projectId,
    generation: cardNewsViewState.generation,
    publishingConfig: cardNewsViewState.publishingConfig,
    publishingOutcome: cardNewsViewState.publishingOutcome,
    publishedChannelIds: new Set(cardNewsViewState.publishedChannelIds)
  };
}

function restoreCardNewsWorkflowContext(context = {}) {
  context = context || {};
  cardNewsViewState.preview = context.preview || null;
  cardNewsViewState.previewSourceKey = context.previewSourceKey || '';
  cardNewsViewState.previewFromManaged = context.previewFromManaged === true;
  cardNewsViewState.projectId = context.projectId || '';
  cardNewsViewState.publishingConfig = context.publishingConfig || null;
  cardNewsViewState.publishingOutcome = context.publishingOutcome || '';
  cardNewsViewState.publishedChannelIds = new Set(context.publishedChannelIds || []);
  if (context.generation) {
    renderCardNewsGeneration(context.generation, { scroll: false });
  } else {
    cardNewsViewState.generation = null;
    const resultPanel = document.getElementById('card-news-result-panel');
    if (resultPanel) resultPanel.hidden = true;
    const publishingPanel = document.getElementById('card-news-publishing-panel');
    if (publishingPanel) publishingPanel.hidden = true;
  }
  updateCardNewsGenerationAvailability();
}

function markCardNewsPreviewStale() {
  if (!cardNewsViewState.preview) return;
  const badge = document.getElementById('card-news-preview-badge');
  if (badge) {
    badge.textContent = cardNewsPreviewMatchesCurrentSource() ? '확인 완료' : '다시 확인 필요';
    badge.dataset.state = cardNewsPreviewMatchesCurrentSource() ? 'ready' : 'stale';
  }
  updateCardNewsGenerationAvailability();
}

function readCardNewsGenerationSettings() {
  return {
    slide_count: Number.parseInt(document.getElementById('card-news-slide-count')?.value || '5', 10),
    aspect_ratio: document.getElementById('card-news-aspect-ratio')?.value || '4:5',
    style: document.getElementById('card-news-style')?.value || 'ai_recommended',
    include_korean_text: Boolean(document.getElementById('card-news-include-korean-text')?.checked),
    additional_request: document.getElementById('card-news-additional-request')?.value?.trim() || ''
  };
}

function saveCardNewsGenerationSettings() {
  try {
    localStorage.setItem(CARD_NEWS_GENERATION_SETTINGS_STORAGE_KEY, JSON.stringify(readCardNewsGenerationSettings()));
  } catch (_) { }
}

function restoreCardNewsGenerationSettings() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(CARD_NEWS_GENERATION_SETTINGS_STORAGE_KEY) || 'null'); } catch (_) { }
  if (!saved || typeof saved !== 'object') return;
  const values = {
    'card-news-slide-count': String(saved.slide_count || ''),
    'card-news-aspect-ratio': String(saved.aspect_ratio || ''),
    'card-news-style': String(saved.style || '')
  };
  Object.entries(values).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (field && [...field.options].some((option) => option.value === value)) field.value = value;
  });
  const koreanText = document.getElementById('card-news-include-korean-text');
  if (koreanText && typeof saved.include_korean_text === 'boolean') koreanText.checked = saved.include_korean_text;
  const additionalRequest = document.getElementById('card-news-additional-request');
  if (additionalRequest && typeof saved.additional_request === 'string') additionalRequest.value = saved.additional_request.slice(0, 500);
}

function updateCardNewsGenerationAvailability() {
  const panel = document.getElementById('card-news-generation-panel');
  const ready = Boolean(cardNewsViewState.preview && cardNewsPreviewMatchesCurrentSource());
  if (panel) panel.hidden = !ready;
  ['card-news-compose-button', 'card-news-generate-button'].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.disabled = !ready || cardNewsViewState.generating;
  });
}

function setCardNewsResultControlsDisabled(disabled) {
  document.querySelectorAll('#card-news-regenerate, #card-news-bulk-image-action, #card-news-publish-open, [data-card-news-image-action], [data-card-news-local-picker], [data-card-news-local-image]').forEach((control) => {
    control.disabled = disabled;
  });
  const exportAll = document.getElementById('card-news-export-all');
  exportAll?.classList.toggle('is-disabled', disabled);
  exportAll?.setAttribute('aria-disabled', String(disabled));
  if (exportAll) exportAll.tabIndex = disabled ? -1 : 0;
}

function syncCardNewsImageStopControls() {
  const operation = cardNewsViewState.imageOperation;
  const active = Boolean(operation);
  const compositionOperation = cardNewsViewState.compositionOperation;
  const compositionActive = Boolean(compositionOperation);
  const confirming = operation?.confirmingStop === true;
  const compositionConfirming = compositionOperation?.confirmingStop === true;
  const requested = operation?.state === 'cancel_requested';
  const canCancel = operation?.canCancel !== false;
  const bulk = operation && operation.mode !== 'single';
  const bulkButton = document.getElementById('card-news-bulk-image-action');
  const bulkContinue = document.getElementById('card-news-image-continue');
  syncCardNewsStopConfirmationMessage();
  syncCardNewsCompositionStopControls();
  if (bulkButton && active && bulk) {
    bulkButton.textContent = requested ? '중지 요청 중…' : (!canCancel ? '마무리 중…' : (confirming ? '중지 확인' : '중지'));
    bulkButton.classList.remove('primary', 'secondary');
    bulkButton.classList.add('ghost');
    bulkButton.classList.add('ui-danger-action');
    bulkButton.disabled = requested || !canCancel || !operation.operationId;
    bulkButton.title = confirming
      ? (operation.remoteJobPossible
        ? '중지를 확정합니다. 이미 접수된 외부 이미지 작업은 계속되거나 비용이 발생할 수 있습니다.'
        : '이미 완료된 이미지는 유지됩니다.')
      : '';
  } else if (bulkButton && !active) {
    const cards = cardNewsViewState.generation?.cards || [];
    const imageCount = cards.filter((card) => card.image_url).length;
    bulkButton.textContent = imageCount === 0
      ? '이미지 생성'
      : (imageCount < cards.length ? '누락 이미지 생성' : '전체 재생성');
    bulkButton.classList.remove('ghost', 'ui-danger-action');
    bulkButton.classList.toggle('primary', imageCount < cards.length);
    bulkButton.classList.toggle('secondary', imageCount === cards.length);
    bulkButton.removeAttribute('title');
  }
  if (bulkContinue) {
    bulkContinue.hidden = !(active && bulk && confirming) && !(compositionActive && compositionConfirming);
    bulkContinue.disabled = requested || compositionOperation?.state === 'cancel_requested';
  }
  document.querySelectorAll('[data-card-news-result-index]').forEach((cardElement) => {
    const cardIndex = Number(cardElement.dataset.cardNewsResultIndex);
    const isActiveCard = active && operation.mode === 'single' && cardIndex === Number(operation.cardIndex);
    const action = cardElement.querySelector('[data-card-news-image-action]');
    if (action && isActiveCard) {
      action.textContent = requested ? '중지 요청 중…' : (!canCancel ? '마무리 중…' : (confirming ? '중지 확인' : '중지'));
      action.classList.remove('primary', 'secondary');
      action.classList.add('ghost', 'ui-danger-action');
      action.disabled = requested || !canCancel || !operation.operationId;
      action.toggleAttribute('data-card-news-image-stop', true);
      action.title = confirming
        ? (operation.remoteJobPossible
          ? '중지를 확정합니다. 이미 접수된 외부 이미지 작업은 계속되거나 비용이 발생할 수 있습니다.'
          : '이미 완료된 이미지는 유지됩니다.')
        : '';
      action.closest('.card-news-media-actions')?.classList.add('is-working');
    } else if (action && !active) {
      const card = cardNewsViewState.generation?.cards?.find((item) => Number(item.index) === cardIndex);
      action.textContent = card?.image_url ? 'AI 재생성' : 'AI 이미지 만들기';
      action.classList.remove('ghost', 'ui-danger-action');
      action.classList.toggle('primary', !card?.image_url);
      action.classList.toggle('secondary', Boolean(card?.image_url));
      action.removeAttribute('data-card-news-image-stop');
      action.removeAttribute('title');
      action.closest('.card-news-media-actions')?.classList.remove('is-working');
    }
    let continueButton = cardElement.querySelector('[data-card-news-image-continue]');
    const actions = cardElement.querySelector('.card-news-media-actions');
    if (isActiveCard && actions && !continueButton) {
      continueButton = document.createElement('button');
      continueButton.className = 'ghost compact';
      continueButton.type = 'button';
      continueButton.dataset.cardNewsImageContinue = '';
      continueButton.textContent = '계속 진행';
      continueButton.hidden = true;
      continueButton.addEventListener('click', () => continueCardNewsImageGeneration());
      action?.after(continueButton);
    } else if (!isActiveCard && continueButton) {
      continueButton.remove();
      continueButton = null;
    }
    if (isActiveCard) {
      const overlay = cardElement.querySelector('[data-card-news-image-working]');
      if (overlay) overlay.hidden = false;
    }
    if (continueButton) {
      continueButton.hidden = !(isActiveCard && confirming);
      continueButton.disabled = requested;
    }
  });
}

function syncCardNewsCompositionStopControls() {
  const operation = cardNewsViewState.compositionOperation;
  const compose = document.getElementById('card-news-compose-button');
  const generate = document.getElementById('card-news-generate-button');
  const activeButton = operation?.imageMode === 'generate' ? generate : compose;
  const continueButton = document.getElementById('card-news-image-continue');
  const bulkButton = document.getElementById('card-news-bulk-image-action');
  if (operation?.confirmingStop && activeButton && continueButton) {
    activeButton.after(continueButton);
    continueButton.classList.remove('compact');
    continueButton.classList.add('card-news-composition-continue');
  } else if (continueButton && bulkButton) {
    bulkButton.after(continueButton);
    continueButton.classList.add('compact');
    continueButton.classList.remove('card-news-composition-continue');
  }
  [compose, generate].forEach((button) => {
    if (!button) return;
    const active = button === activeButton && Boolean(operation);
    if (active) {
      button.textContent = operation.state === 'cancel_requested'
        ? '중지 요청 중…'
        : (operation.canCancel === false ? '마무리 중…' : (operation.confirmingStop ? '중지 확인' : '중지'));
      button.classList.remove('primary', 'secondary', 'is-loading');
      button.classList.add('ghost', 'ui-danger-action');
      button.disabled = operation.state === 'cancel_requested' || operation.canCancel === false || !operation.operationId;
      button.setAttribute('aria-busy', String(operation.state !== 'cancel_requested'));
      button.title = operation.confirmingStop
        ? '중지를 확정합니다. 이미 처리된 AI 요청은 비용이 발생할 수 있습니다.'
        : '';
    } else {
      button.classList.remove('ghost', 'ui-danger-action');
      button.classList.toggle('primary', button === generate);
      button.classList.toggle('secondary', button === compose);
      button.textContent = button === generate ? '이미지까지 만들기' : '카드 구성만 만들기';
      button.disabled = cardNewsViewState.generating || !cardNewsViewState.preview || !cardNewsPreviewMatchesCurrentSource();
      button.setAttribute('aria-busy', 'false');
      button.removeAttribute('title');
    }
  });
}

function setCardNewsGenerating(generating, imageMode = 'generate') {
  cardNewsViewState.generating = generating;
  const compose = document.getElementById('card-news-compose-button');
  const primary = document.getElementById('card-news-generate-button');
  [compose, primary].forEach((button) => { if (button) button.disabled = generating; });
  document.querySelectorAll('#card-news-generation-panel select, #card-news-generation-panel textarea, #card-news-generation-panel input').forEach((control) => {
    control.disabled = generating;
  });
  compose?.classList.toggle('is-loading', generating && imageMode === 'prompt_only');
  primary?.classList.toggle('is-loading', generating && imageMode === 'generate');
  compose?.setAttribute('aria-busy', String(generating && imageMode === 'prompt_only'));
  primary?.setAttribute('aria-busy', String(generating && imageMode === 'generate'));
  setCardNewsResultControlsDisabled(generating);
  document.getElementById('card-news-result-panel')?.setAttribute('aria-busy', String(generating));
  if (compose) compose.textContent = generating && imageMode === 'prompt_only' ? '카드 구성 만드는 중…' : '카드 구성만 만들기';
  if (primary) primary.textContent = generating && imageMode === 'generate' ? '이미지까지 만드는 중…' : '이미지까지 만들기';
  updateCardNewsGenerationAvailability();
  syncCardNewsImageStopControls();
}

function setCardNewsGenerationStatus(message = '', state = '', options = {}) {
  const status = document.getElementById('card-news-generation-status');
  if (!status) return;
  const messageElement = status.querySelector('[data-card-news-generation-status-message]');
  if (messageElement) messageElement.textContent = message;
  else status.textContent = message;
  status.dataset.state = state;
  const stopConfirmation = status.querySelector('[data-card-news-stop-confirmation]');
  const publishingReadiness = status.querySelector('[data-card-news-publishing-readiness]');
  status.hidden = !message
    && (!stopConfirmation || stopConfirmation.hidden)
    && (!publishingReadiness || publishingReadiness.hidden);
  status.title = options.title || message;
  status.setAttribute('aria-busy', String(state === 'loading'));
  syncCardNewsStopConfirmationMessage();
}

function syncCardNewsStopConfirmationMessage() {
  const status = document.getElementById('card-news-generation-status');
  const note = status?.querySelector('[data-card-news-stop-confirmation]');
  if (!status || !note) return;
  const imageOperation = cardNewsViewState.imageOperation;
  const compositionOperation = cardNewsViewState.compositionOperation;
  if (imageOperation?.confirmingStop) {
    note.textContent = '중지를 확정하려면 버튼을 한 번 더 누르세요. 완성된 이미지는 유지됩니다.';
    note.title = imageOperation.remoteJobPossible
      ? '이미 접수된 외부 이미지 작업은 계속되거나 비용이 발생할 수 있습니다.'
      : '';
    note.hidden = false;
  } else if (compositionOperation?.confirmingStop) {
    note.textContent = '중지를 확정하려면 버튼을 한 번 더 누르세요.';
    note.title = '이미 처리된 AI 요청은 비용이 발생할 수 있습니다.';
    note.hidden = false;
  } else {
    note.textContent = '';
    note.title = '';
    note.hidden = true;
  }
  if (!note.hidden) status.hidden = false;
}

function renderCardNewsPreview(snapshot) {
  cardNewsViewState.preview = snapshot;
  const empty = document.getElementById('card-news-preview-empty');
  const content = document.getElementById('card-news-preview-content');
  const badge = document.getElementById('card-news-preview-badge');
  if (empty) empty.hidden = true;
  if (content) content.hidden = false;
  if (badge) {
    badge.textContent = '확인 완료';
    badge.dataset.state = 'ready';
  }
  document.getElementById('card-news-preview-kind').textContent = cardNewsSourceLabel(snapshot?.source?.kind, snapshot?.source);
  document.getElementById('card-news-preview-heading').textContent = snapshot?.title || '제목 없는 내용';
  document.getElementById('card-news-preview-excerpt').textContent = snapshot?.excerpt || snapshot?.text || '';
  const link = document.getElementById('card-news-preview-link');
  if (link) {
    link.hidden = !snapshot?.canonical_url;
    link.href = snapshot?.canonical_url || '#';
  }
  document.getElementById('card-news-preview-time').textContent = snapshot?.retrieved_at
    ? `${formatCardNewsDate(snapshot.retrieved_at)} 확인`
    : '';
  updateCardNewsGenerationAvailability();
}

function clearCardNewsDownstreamContext() {
  cardNewsViewState.projectId = '';
  cardNewsViewState.generation = null;
  cardNewsViewState.publishingConfig = null;
  cardNewsViewState.publishingOutcome = '';
  cardNewsViewState.publishedChannelIds.clear();
  const resultPanel = document.getElementById('card-news-result-panel');
  const publishingPanel = document.getElementById('card-news-publishing-panel');
  if (resultPanel) resultPanel.hidden = true;
  if (publishingPanel) publishingPanel.hidden = true;
}

function commitCardNewsPreview(sourceKey, snapshot) {
  if (cardNewsViewState.generation && cardNewsViewState.previewSourceKey !== sourceKey) {
    clearCardNewsDownstreamContext();
  }
  cardNewsViewState.previewSourceKey = sourceKey;
  cardNewsViewState.previewFromManaged = false;
  cardNewsViewState.previewCache.set(sourceKey, snapshot);
  renderCardNewsPreview(snapshot);
}

async function previewCardNewsSource(sourceOverride = null) {
  if (cardNewsViewState.busy && !sourceOverride) return;
  let source;
  try {
    source = sourceOverride || readCardNewsSource();
  } catch (error) {
    setCardNewsStatus(error.message, 'error');
    return;
  }
  cardNewsViewState.previewFromManaged = false;
  const sourceKey = cardNewsSourceKey(source);
  const requestId = ++cardNewsViewState.previewRequestId;
  const cachedSnapshot = cardNewsViewState.previewCache.get(sourceKey);
  if (cachedSnapshot) {
    commitCardNewsPreview(sourceKey, cachedSnapshot);
    setCardNewsStatus('', '');
    setCardNewsBusy(false);
    return;
  }
  setCardNewsBusy(true, 'preview');
  setCardNewsStatus('', '');
  const badge = document.getElementById('card-news-preview-badge');
  if (badge) {
    badge.textContent = '확인 중';
    badge.dataset.state = 'loading';
  }
  try {
    const result = await postJson('/api/v1/card-news/source-preview', { source });
    if (requestId !== cardNewsViewState.previewRequestId) return;
    commitCardNewsPreview(sourceKey, result.source_snapshot);
    setCardNewsStatus('', '');
  } catch (error) {
    if (requestId !== cardNewsViewState.previewRequestId) return;
    setCardNewsStatus(error.message || '내용을 확인하지 못했습니다.', 'error');
    if (cardNewsViewState.preview) {
      const badge = document.getElementById('card-news-preview-badge');
      if (badge) {
        badge.textContent = '이전 미리보기';
        badge.dataset.state = 'stale';
      }
    }
  } finally {
    if (requestId === cardNewsViewState.previewRequestId) setCardNewsBusy(false);
  }
}

function activateCardNewsSourceKind(kind) {
  cardNewsViewState.sourceKind = kind;
  cardNewsViewState.previewFromManaged = false;
  cardNewsViewState.previewRequestId += 1;
  setCardNewsBusy(false);
  document.querySelectorAll('[data-card-news-source-kind]').forEach((button) => {
    const active = button.dataset.cardNewsSourceKind === kind;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.setAttribute('tabindex', active ? '0' : '-1');
  });
  document.querySelectorAll('[data-card-news-source-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.cardNewsSourcePanel !== kind;
  });
  const actions = document.getElementById('card-news-source-actions');
  if (actions) actions.hidden = kind === 'feed_item';
  setCardNewsStatus('', '');
  markCardNewsPreviewStale();
  return true;
}

function bindCardNewsView() {
  bindCardNewsManagementView();
  bindCardNewsSourceManager();
  document.getElementById('card-news-result-grid')?.addEventListener('click', (event) => {
    const link = event.target.closest('a[download]');
    if (!link) return;
    event.preventDefault();
    void downloadCardNewsArtifact(link);
  });
  document.getElementById('card-news-export-all')?.addEventListener('click', (event) => {
    event.preventDefault();
    void downloadCardNewsArtifact(event.currentTarget);
  });
  document.querySelectorAll('[data-card-news-source-kind]').forEach((button) => {
    button.addEventListener('click', () => activateCardNewsSourceKind(button.dataset.cardNewsSourceKind));
    button.addEventListener('keydown', (event) => void handleUiTabNavigationKeydown(event, {
      selector: '[data-card-news-source-kind]',
      dataKey: 'cardNewsSourceKind',
      activate: activateCardNewsSourceKind
    }));
  });
  document.getElementById('card-news-source-refresh')?.addEventListener('click', () => void loadCardNewsSources());
  document.getElementById('card-news-preview-button')?.addEventListener('click', () => void previewCardNewsSource());
  document.getElementById('card-news-compose-button')?.addEventListener('click', () => {
    if (cardNewsViewState.compositionOperation || cardNewsViewState.imageOperation) void handleCardNewsStop();
    else void generateCardNews({ imageMode: 'prompt_only' });
  });
  document.getElementById('card-news-generate-button')?.addEventListener('click', () => {
    if (cardNewsViewState.compositionOperation || cardNewsViewState.imageOperation) void handleCardNewsStop();
    else void generateCardNews({ imageMode: 'generate' });
  });
  document.getElementById('card-news-regenerate')?.addEventListener('click', () => void regenerateCardNewsComposition());
  document.getElementById('card-news-bulk-image-action')?.addEventListener('click', () => {
    if (cardNewsViewState.imageOperation && cardNewsViewState.imageOperation.mode !== 'single') {
      void handleCardNewsImageStop();
      return;
    }
    const cards = cardNewsViewState.generation?.cards || [];
    const imageCount = cards.filter((card) => card.image_url).length;
    const mode = imageCount === cards.length && cards.length > 0 ? 'all' : 'missing';
    void runCardNewsImageGeneration({ mode });
  });
  document.getElementById('card-news-image-continue')?.addEventListener('click', () => {
    const compositionOperation = cardNewsViewState.compositionOperation;
    if (compositionOperation?.confirmingStop) {
      compositionOperation.confirmingStop = false;
      syncCardNewsImageStopControls();
      return;
    }
    continueCardNewsImageGeneration();
  });
  document.getElementById('card-news-publish-open')?.addEventListener('click', () => void openCardNewsPublishing({ scroll: true }));
  document.getElementById('card-news-publishing-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void publishCardNews();
  });
  document.getElementById('card-news-signature')?.addEventListener('input', saveCardNewsSignature);
  document.getElementById('card-news-signature')?.addEventListener('change', refreshCardNewsSignaturePreview);
  document.getElementById('card-news-signature')?.addEventListener('blur', refreshCardNewsSignaturePreview);
  document.getElementById('card-news-signature-enabled')?.addEventListener('change', () => {
    saveCardNewsSignatureEnabled();
    refreshCardNewsSignaturePreview();
  });
  ['card-news-slide-count', 'card-news-aspect-ratio', 'card-news-style', 'card-news-include-korean-text'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', handleCardNewsGenerationSettingChange);
  });
  document.getElementById('card-news-additional-request')?.addEventListener('input', handleCardNewsGenerationSettingChange);
  ['card-news-url', 'card-news-manuscript-title', 'card-news-manuscript-text'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => {
      cardNewsViewState.previewFromManaged = false;
      cardNewsViewState.previewRequestId += 1;
      setCardNewsBusy(false);
      markCardNewsPreviewStale();
    });
  });
}

function initCardNewsView() {
  void loadCardNewsSignaturePolicy({ notifyOnChange: true });
  if (!cardNewsViewState.initialized) {
    cardNewsViewState.initialized = true;
    restoreCardNewsGenerationSettings();
    bindCardNewsView();
  }
  if (cardNewsViewState.sourcesStale && !cardNewsViewState.loadingSources) {
    void loadCardNewsSources();
    void loadCardNewsManagedItems();
  }
}

function markCardNewsSourcesStale() {
  cardNewsViewState.sourcesStale = true;
}

function rememberCardNewsScrollPosition() {
  const main = document.querySelector('.main');
  if (main) cardNewsViewState.scrollTop = main.scrollTop;
}

function restoreCardNewsScrollPosition() {
  const main = document.querySelector('.main');
  if (!main) return;
  window.requestAnimationFrame(() => { main.scrollTop = cardNewsViewState.scrollTop || 0; });
}
