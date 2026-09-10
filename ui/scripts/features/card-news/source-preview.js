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
  previewCache: new Map(),
  previewRequestId: 0,
  busy: false,
  loadingSources: false,
  sourcesStale: true,
  generating: false,
  publishing: false,
  publishingConfig: null,
  publishingOutcome: '',
  publishedChannelIds: new Set(),
  generation: null,
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
  try {
    return cardNewsViewState.previewSourceKey === cardNewsSourceKey(readCardNewsSource());
  } catch (_) {
    return false;
  }
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
}

function setCardNewsGenerationStatus(message = '', state = '') {
  const status = document.getElementById('card-news-generation-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
  status.hidden = !message;
  status.title = message;
  status.setAttribute('aria-busy', String(state === 'loading'));
}

function handleCardNewsGenerationSettingChange() {
  saveCardNewsGenerationSettings();
  if (cardNewsViewState.generation && !cardNewsViewState.generating) {
    setCardNewsGenerationStatus('설정이 변경되었습니다. 다시 만들면 새 설정이 적용됩니다.', 'warning');
  }
}

function renderCardNewsGeneration(generation, options = {}) {
  const previousGenerationId = cardNewsViewState.generation?.id || '';
  cardNewsViewState.generation = generation;
  if (previousGenerationId && previousGenerationId !== generation?.id) {
    const publishingPanel = document.getElementById('card-news-publishing-panel');
    if (publishingPanel) publishingPanel.hidden = true;
    const publishingText = document.getElementById('card-news-publishing-text');
    if (publishingText) publishingText.value = '';
    cardNewsViewState.publishingConfig = null;
    cardNewsViewState.publishingOutcome = '';
    cardNewsViewState.publishedChannelIds.clear();
  }
  const panel = document.getElementById('card-news-result-panel');
  const grid = document.getElementById('card-news-result-grid');
  if (!panel || !grid) return;
  panel.hidden = false;
  panel.dataset.aspectRatio = generation.settings?.aspect_ratio || '4:5';
  document.getElementById('card-news-result-title').textContent = generation.title || '만든 카드뉴스';
  const imageCount = (generation.cards || []).filter((card) => card.image_url).length;
  const importedGeneration = generation.image_mode === 'imported';
  const bulkImageAction = document.getElementById('card-news-bulk-image-action');
  const regenerate = document.getElementById('card-news-regenerate');
  if (regenerate) regenerate.hidden = importedGeneration || options.allowCompositionRegeneration === false;
  if (bulkImageAction) {
    bulkImageAction.hidden = importedGeneration;
    bulkImageAction.textContent = imageCount === 0
      ? '이미지 모두 만들기'
      : (imageCount < (generation.cards?.length || 0) ? '빈 이미지 모두 만들기' : '이미지 모두 다시 만들기');
    bulkImageAction.classList.toggle('primary', imageCount < (generation.cards?.length || 0));
    bulkImageAction.classList.toggle('secondary', imageCount === (generation.cards?.length || 0));
  }
  const exportAll = document.getElementById('card-news-export-all');
  const publishOpen = document.getElementById('card-news-publish-open');
  if (exportAll) {
    const complete = imageCount > 0 && imageCount === (generation.cards?.length || 0);
    exportAll.hidden = !complete;
    exportAll.href = complete
      ? `/api/v1/card-news/exports/${encodeURIComponent(generation.id)}.zip`
      : '#';
  }
  if (publishOpen) publishOpen.hidden = !(imageCount > 0 && imageCount === (generation.cards?.length || 0));
  document.getElementById('card-news-result-summary').textContent = imageCount > 0
    ? `${generation.cards?.length || 0}장의 구성과 ${imageCount}장의 이미지가 준비되었습니다.`
    : `${generation.cards?.length || 0}장의 구성과 이미지 프롬프트가 준비되었습니다.`;
  grid.innerHTML = (generation.cards || []).map((card) => `
    <article class="card-news-result-item" data-card-news-result-index="${card.index}">
      <div class="card-news-result-image-wrap${card.image_url ? '' : ' is-empty'}">
        ${card.image_url
          ? `<img src="${escapeHtml(card.image_url)}" alt="${escapeHtml(`${card.index}번째 카드: ${card.headline}`)}">`
          : '<div class="card-news-result-image-empty"><span>이미지 미지정</span><small>AI로 만들거나 내 이미지로 채울 수 있습니다.</small></div>'}
        <div class="card-news-media-actions${card.image_url ? '' : ' is-empty'}">
          ${importedGeneration ? '' : `<button class="${card.image_url ? 'secondary' : 'primary'} compact" type="button" data-card-news-image-action="${card.index}">${card.image_url ? 'AI 재생성' : 'AI 이미지 만들기'}</button>`}
          <button class="secondary compact" type="button" data-card-news-local-picker="${card.index}">${card.image_url ? '이미지 교체' : '＋ 내 이미지 선택'}</button>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" data-card-news-local-image="${card.index}" hidden>
          ${card.download_url ? `<a class="ui-button-link secondary compact" href="${escapeHtml(card.download_url)}" download>받기</a>` : ''}
        </div>
        <span class="ui-sequence-badge">${card.index}</span>
        <div class="card-news-image-working" data-card-news-image-working hidden>
          <span class="card-news-image-working-spinner" aria-hidden="true"></span>
          <strong>이미지 만드는 중…</strong>
        </div>
      </div>
      <div class="card-news-result-copy">
        <strong>${escapeHtml(card.headline)}</strong>
        <p>${escapeHtml(card.body || '')}</p>
        ${card.image_prompt ? `<div class="card-news-prompt-section">
          <details class="card-news-prompt-details">
            <summary>프롬프트 보기</summary>
            <p>${escapeHtml(card.image_prompt || '')}</p>
          </details>
          <button class="ui-text-action compact card-news-prompt-copy" type="button" data-card-news-prompt-copy="${card.index}">복사</button>
        </div>` : ''}
      </div>
    </article>`).join('');
  grid.querySelectorAll('[data-card-news-prompt-copy]').forEach((button) => {
    button.addEventListener('click', () => void copyCardNewsPrompt(Number(button.dataset.cardNewsPromptCopy), button));
  });
  grid.querySelectorAll('[data-card-news-image-action]').forEach((button) => {
    button.addEventListener('click', () => void runCardNewsImageGeneration({
      mode: 'single',
      cardIndex: Number(button.dataset.cardNewsImageAction)
    }));
  });
  grid.querySelectorAll('[data-card-news-local-image]').forEach((input) => {
    input.addEventListener('change', () => void importCardNewsLocalImage(Number(input.dataset.cardNewsLocalImage), input));
  });
  grid.querySelectorAll('[data-card-news-local-picker]').forEach((button) => {
    button.addEventListener('click', () => {
      grid.querySelector(`[data-card-news-local-image="${button.dataset.cardNewsLocalPicker}"]`)?.click();
    });
  });
  if (options.scroll !== false) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function selectedCardNewsPublishingChannels() {
  return [...document.querySelectorAll('[data-card-news-publish-channel]:checked')]
    .map((input) => input.value)
    .filter(Boolean);
}

function syncCardNewsPublishButton() {
  const button = document.getElementById('card-news-publish-button');
  if (!button) return;
  const outcome = cardNewsViewState.publishingOutcome;
  button.textContent = cardNewsViewState.publishing
    ? '발행 중…'
    : (outcome === 'completed'
      ? '발행 완료'
      : (outcome === 'accepted' ? '발행 요청 완료' : (outcome === 'partial' ? '실패 채널 다시 시도' : (outcome === 'failed' ? '다시 시도' : '지금 발행'))));
  button.disabled = cardNewsViewState.publishing
    || outcome === 'completed'
    || outcome === 'accepted'
    || selectedCardNewsPublishingChannels().length === 0;
}

function renderCardNewsPublishingConfig(config = {}) {
  cardNewsViewState.publishingConfig = config;
  const notice = document.getElementById('card-news-publishing-notice');
  const channels = document.getElementById('card-news-publishing-channels');
  const text = document.getElementById('card-news-publishing-text');
  if (!notice || !channels || !text) return;
  const issues = [];
  if (!config.buffer_configured) issues.push('설정 > SNS에서 Buffer 연결과 채널을 먼저 설정해 주세요.');
  if (!config.media_transport) issues.push('카드 이미지를 Buffer에 전달하려면 설정에서 Google 계정을 연결해 주세요.');
  notice.textContent = issues.join(' ');
  notice.dataset.state = issues.length ? 'warning' : 'ready';
  channels.innerHTML = (config.channels || []).map((channel) => {
    const completed = cardNewsViewState.publishedChannelIds.has(String(channel.id || ''));
    const compatible = channel.compatible && !issues.length;
    return `
    <label class="card-news-publishing-channel${compatible && !completed ? '' : ' is-disabled'}" title="${escapeHtml(channel.reason || '')}">
      <input type="checkbox" value="${escapeHtml(channel.id)}" data-card-news-publish-channel data-card-news-publish-compatible="${compatible ? 'true' : 'false'}" data-card-news-publish-completed="${completed ? 'true' : 'false'}" ${compatible && !completed ? '' : 'disabled'}>
      <span><strong>${escapeHtml(channel.name || channel.service)}</strong><small>${escapeHtml(completed ? '발행 완료' : (channel.compatible ? `${channel.max_assets}장까지` : channel.reason))}</small></span>
    </label>`;
  }).join('') || '<p>설정된 Buffer 채널이 없습니다.</p>';
  if (!text.value.trim()) text.value = String(config.default_text || [config.title, config.source_url].filter(Boolean).join('\n\n'));
  channels.querySelectorAll('[data-card-news-publish-channel]').forEach((input) => {
    input.addEventListener('change', syncCardNewsPublishButton);
  });
  syncCardNewsPublishButton();
}

async function openCardNewsPublishing() {
  const generation = cardNewsViewState.generation;
  const panel = document.getElementById('card-news-publishing-panel');
  if (!generation || !panel || cardNewsViewState.generating) return;
  panel.hidden = false;
  const notice = document.getElementById('card-news-publishing-notice');
  if (notice) {
    notice.textContent = '발행 가능한 채널을 확인하고 있습니다.';
    notice.dataset.state = 'loading';
  }
  try {
    const config = await fetchJson(`/api/v1/card-news/publishing/config?generation_id=${encodeURIComponent(generation.id)}`);
    renderCardNewsPublishingConfig(config);
  } catch (error) {
    if (notice) {
      notice.textContent = error.message || 'SNS 발행 설정을 확인하지 못했습니다.';
      notice.dataset.state = 'error';
    }
  }
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setCardNewsPublishing(publishing) {
  cardNewsViewState.publishing = publishing;
  cardNewsViewState.generating = publishing;
  const button = document.getElementById('card-news-publish-button');
  const status = document.getElementById('card-news-publishing-status');
  document.querySelectorAll('#card-news-regenerate, #card-news-bulk-image-action, #card-news-export-all, [data-card-news-image-action], [data-card-news-local-image], #card-news-publishing-close').forEach((control) => {
    if ('disabled' in control) control.disabled = publishing;
    control.classList?.toggle('is-disabled', publishing);
  });
  document.querySelectorAll('[data-card-news-publish-channel]').forEach((control) => {
    control.disabled = publishing
      || control.dataset.cardNewsPublishCompatible !== 'true'
      || control.dataset.cardNewsPublishCompleted === 'true';
  });
  if (status && publishing) {
    status.textContent = '이미지를 준비하고 SNS에 발행하고 있습니다.';
    status.dataset.state = 'loading';
  }
  button?.classList.toggle('is-loading', publishing);
  button?.setAttribute('aria-busy', String(publishing));
  syncCardNewsPublishButton();
}

async function publishCardNews() {
  const generation = cardNewsViewState.generation;
  const channelIds = selectedCardNewsPublishingChannels();
  const text = document.getElementById('card-news-publishing-text')?.value?.trim() || '';
  if (!generation || !channelIds.length || cardNewsViewState.publishing) return;
  const confirmed = await showUiConfirm(
    `완성된 카드 ${generation.cards?.length || 0}장을 선택한 ${channelIds.length}개 채널에 지금 발행할까요?`,
    { title: '카드뉴스 발행', confirmText: '지금 발행', cancelText: '취소' }
  );
  if (confirmed === false) return;
  setCardNewsPublishing(true);
  const status = document.getElementById('card-news-publishing-status');
  const resultElement = document.getElementById('card-news-publishing-result');
  if (resultElement) {
    resultElement.hidden = true;
    resultElement.innerHTML = '';
  }
  try {
    const result = await postJson('/api/v1/card-news/publishing/publish', {
      generation_id: generation.id,
      channel_ids: channelIds,
      text
    });
    if (status) {
      status.textContent = result.success
        ? (result.confirmed ? `${result.success_count}개 채널에 발행했습니다.` : `${result.success_count}개 채널에 발행 요청을 전달했습니다.`)
        : `성공 ${result.success_count}개, 실패 ${result.failure_count}개입니다.`;
      status.dataset.state = result.success ? 'ready' : 'warning';
    }
    cardNewsViewState.publishingOutcome = result.success
      ? (result.confirmed ? 'completed' : 'accepted')
      : (Number(result.success_count || 0) > 0 ? 'partial' : 'failed');
    const successfulChannelIds = new Set((result.results || [])
      .filter((item) => item.success)
      .map((item) => String(item.channel_id || '')));
    successfulChannelIds.forEach((channelId) => cardNewsViewState.publishedChannelIds.add(channelId));
    document.querySelectorAll('[data-card-news-publish-channel]').forEach((input) => {
      if (!successfulChannelIds.has(input.value)) return;
      input.checked = false;
      input.dataset.cardNewsPublishCompleted = 'true';
    });
    if (resultElement) {
      resultElement.hidden = false;
      resultElement.innerHTML = (result.results || []).map((item) => `
        <div class="card-news-publishing-result-item" data-state="${item.success ? 'ready' : 'error'}">
          <strong>${escapeHtml(item.channel_name || item.service)}</strong>
          <span>${escapeHtml(item.success ? (item.status === 'sent' ? '발행 완료' : '발행 요청 완료') : (item.message || '발행 실패'))}</span>
          ${item.external_link ? `<a href="${escapeHtml(item.external_link)}" target="_blank" rel="noopener noreferrer">게시물 열기 ↗</a>` : ''}
        </div>`).join('');
    }
  } catch (error) {
    cardNewsViewState.publishingOutcome = 'failed';
    if (status) {
      status.textContent = error.message || '카드뉴스를 발행하지 못했습니다.';
      status.dataset.state = 'error';
    }
  } finally {
    setCardNewsPublishing(false);
  }
}

function setCardNewsImageWorking(working, message = '', options = {}) {
  cardNewsViewState.generating = working;
  setCardNewsResultControlsDisabled(working);
  document.getElementById('card-news-result-panel')?.setAttribute('aria-busy', String(working));
  const targetIndexes = new Set((options.cardIndexes || []).map(Number));
  document.querySelectorAll('[data-card-news-result-index]').forEach((cardElement) => {
    const isTarget = working && targetIndexes.has(Number(cardElement.dataset.cardNewsResultIndex));
    const overlay = cardElement.querySelector('[data-card-news-image-working]');
    if (!overlay) return;
    overlay.hidden = !isTarget;
    const label = overlay.querySelector('strong');
    if (label && isTarget) label.textContent = options.replacing ? '새 이미지 만드는 중…' : '이미지 만드는 중…';
  });
  if (working && message) setCardNewsGenerationStatus(message, 'loading');
  updateCardNewsGenerationAvailability();
}

async function runCardNewsImageGeneration({ mode = 'missing', cardIndex = 0 } = {}) {
  const generation = cardNewsViewState.generation;
  if (cardNewsViewState.generating || !generation) return;
  const card = generation.cards?.find((item) => Number(item.index) === Number(cardIndex));
  const replacing = mode === 'all' || (mode === 'single' && Boolean(card?.image_url));
  if (replacing) {
    const message = mode === 'all'
      ? '현재 이미지를 모두 다시 만들까요? 새 이미지가 완성된 카드부터 교체됩니다.'
      : '이 카드의 이미지를 다시 만들까요? 새 이미지가 완성된 후 교체됩니다.';
    const confirmed = await showUiConfirm(message, {
      title: '이미지 다시 만들기', confirmText: '다시 만들기', cancelText: '취소'
    });
    if (confirmed === false) return;
  }
  const targetCards = mode === 'single'
    ? (card ? [card] : [])
    : generation.cards.filter((item) => mode === 'all' || !item.image_url);
  setCardNewsImageWorking(
    true,
    mode === 'single' ? '카드 이미지를 만들고 있습니다.' : '카드 이미지를 차례로 만들고 있습니다.',
    { cardIndexes: targetCards.map((item) => item.index), replacing }
  );
  try {
    const result = await postJson('/api/v1/card-news/images/generate', {
      generation_id: generation.id,
      mode,
      card_index: cardIndex || undefined
    });
    renderCardNewsGeneration(result.generation, { scroll: false });
    setCardNewsGenerationStatus(
      result.generation.status === 'partial'
        ? (result.generation.message || '완성한 이미지는 유지했습니다. 만들지 못한 이미지는 다시 시도해 주세요.')
        : '카드 이미지를 준비했습니다.',
      result.generation.status === 'partial' ? 'warning' : 'ready'
    );
  } catch (error) {
    setCardNewsGenerationStatus(error.message || '카드 이미지를 만들지 못했습니다. 다시 시도해 주세요.', 'error');
  } finally {
    setCardNewsImageWorking(false);
  }
}

function readCardNewsFileAsDataUrl(file, label = '이미지') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`${label} 파일을 읽지 못했습니다.`));
    reader.readAsDataURL(file);
  });
}

async function importCardNewsLocalImage(cardIndex, input) {
  const file = input?.files?.[0];
  const generation = cardNewsViewState.generation;
  if (!file || !generation || cardNewsViewState.generating) return;
  if (file.size > 10 * 1024 * 1024) {
    setCardNewsGenerationStatus('이미지는 최대 10MB까지 선택할 수 있습니다.', 'error');
    input.value = '';
    return;
  }
  setCardNewsImageWorking(true, '선택한 이미지를 적용하고 있습니다.', { cardIndexes: [cardIndex], replacing: true });
  try {
    const base64Data = await readCardNewsFileAsDataUrl(file);
    const result = await postJson('/api/v1/card-news/images/import', {
      generation_id: generation.id,
      card_index: cardIndex,
      file_name: file.name,
      mime_type: file.type || '',
      base64_data: base64Data
    });
    renderCardNewsGeneration(result.generation, { scroll: false });
    setCardNewsGenerationStatus('선택한 이미지를 카드에 적용했습니다.', 'ready');
  } catch (error) {
    setCardNewsGenerationStatus(error.message || '선택한 이미지를 적용하지 못했습니다.', 'error');
  } finally {
    input.value = '';
    setCardNewsImageWorking(false);
  }
}

async function copyCardNewsPrompt(cardIndex, button) {
  const card = cardNewsViewState.generation?.cards?.find((item) => Number(item.index) === Number(cardIndex));
  const prompt = String(card?.image_prompt || '').trim();
  if (!prompt) return;
  try {
    await navigator.clipboard.writeText(prompt);
    const original = button.textContent;
    button.textContent = '복사됨';
    window.setTimeout(() => { button.textContent = original; }, 1200);
  } catch (error) {
    if (typeof showUiToast === 'function') {
      showUiToast({ level: 'error', title: '프롬프트 복사 실패', message: '프롬프트를 열어 직접 복사해 주세요.' });
    } else {
      setCardNewsGenerationStatus('프롬프트를 복사하지 못했습니다. 내용을 열어 직접 복사해 주세요.', 'error');
    }
  }
}

async function generateCardNews(options = {}) {
  if (cardNewsViewState.generating || !cardNewsViewState.preview || !cardNewsPreviewMatchesCurrentSource()) return;
  const imageMode = options.imageMode || cardNewsViewState.generation?.image_mode || 'generate';
  saveCardNewsGenerationSettings();
  setCardNewsGenerating(true, imageMode);
  setCardNewsGenerationStatus(
    imageMode === 'prompt_only'
      ? '카드 구성과 이미지 프롬프트를 만들고 있습니다.'
      : '카드 구성과 이미지를 만들고 있습니다. 카드 수에 따라 몇 분 정도 걸릴 수 있습니다.',
    'loading'
  );
  try {
    const payload = {
      source_snapshot: cardNewsViewState.preview,
      image_mode: imageMode,
      settings: readCardNewsGenerationSettings()
    };
    const result = await postJson('/api/v1/card-news/generations', payload);
    renderCardNewsGeneration(result.generation);
    if (result.generation.status === 'partial') {
      setCardNewsGenerationStatus(result.generation.message || '카드 구성은 완성했지만 일부 이미지를 만들지 못했습니다.', 'warning');
    } else {
      setCardNewsGenerationStatus(
        imageMode === 'prompt_only' ? '카드 구성과 프롬프트를 완성했습니다.' : '카드뉴스를 완성했습니다.',
        'ready'
      );
    }
  } catch (error) {
    setCardNewsGenerationStatus(error.message || '카드뉴스를 만들지 못했습니다. AI 설정을 확인한 뒤 다시 시도해 주세요.', 'error');
  } finally {
    setCardNewsGenerating(false, imageMode);
  }
}

async function regenerateCardNewsComposition() {
  if (cardNewsViewState.generating || !cardNewsViewState.generation) return;
  const hasImages = (cardNewsViewState.generation.cards || []).some((card) => Boolean(card.image_url));
  if (hasImages) {
    const confirmed = await showUiConfirm(
      '구성을 다시 만들면 현재 이미지가 초기화됩니다. 계속할까요?',
      { title: '구성 다시 만들기', confirmText: '구성 다시 만들기', cancelText: '취소' }
    );
    if (confirmed === false) return;
  }
  await generateCardNews({ imageMode: 'prompt_only' });
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

async function previewCardNewsSource(sourceOverride = null) {
  if (cardNewsViewState.busy && !sourceOverride) return;
  let source;
  try {
    source = sourceOverride || readCardNewsSource();
  } catch (error) {
    setCardNewsStatus(error.message, 'error');
    return;
  }
  const sourceKey = cardNewsSourceKey(source);
  const requestId = ++cardNewsViewState.previewRequestId;
  const cachedSnapshot = cardNewsViewState.previewCache.get(sourceKey);
  if (cachedSnapshot) {
    cardNewsViewState.previewSourceKey = sourceKey;
    renderCardNewsPreview(cachedSnapshot);
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
    cardNewsViewState.previewSourceKey = sourceKey;
    cardNewsViewState.previewCache.set(sourceKey, result.source_snapshot);
    renderCardNewsPreview(result.source_snapshot);
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
  document.getElementById('card-news-compose-button')?.addEventListener('click', () => void generateCardNews({ imageMode: 'prompt_only' }));
  document.getElementById('card-news-generate-button')?.addEventListener('click', () => void generateCardNews({ imageMode: 'generate' }));
  document.getElementById('card-news-regenerate')?.addEventListener('click', () => void regenerateCardNewsComposition());
  document.getElementById('card-news-bulk-image-action')?.addEventListener('click', () => {
    const cards = cardNewsViewState.generation?.cards || [];
    const imageCount = cards.filter((card) => card.image_url).length;
    const mode = imageCount === cards.length && cards.length > 0 ? 'all' : 'missing';
    void runCardNewsImageGeneration({ mode });
  });
  document.getElementById('card-news-publish-open')?.addEventListener('click', () => void openCardNewsPublishing());
  document.getElementById('card-news-publishing-close')?.addEventListener('click', () => {
    document.getElementById('card-news-publishing-panel').hidden = true;
  });
  document.getElementById('card-news-publish-button')?.addEventListener('click', () => void publishCardNews());
  ['card-news-slide-count', 'card-news-aspect-ratio', 'card-news-style', 'card-news-include-korean-text'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', handleCardNewsGenerationSettingChange);
  });
  document.getElementById('card-news-additional-request')?.addEventListener('input', handleCardNewsGenerationSettingChange);
  ['card-news-url', 'card-news-manuscript-title', 'card-news-manuscript-text'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => {
      cardNewsViewState.previewRequestId += 1;
      setCardNewsBusy(false);
      markCardNewsPreviewStale();
    });
  });
}

function initCardNewsView() {
  if (!cardNewsViewState.initialized) {
    cardNewsViewState.initialized = true;
    restoreCardNewsGenerationSettings();
    bindCardNewsView();
  }
  if (cardNewsViewState.sourcesStale && !cardNewsViewState.loadingSources) {
    void loadCardNewsSources();
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
