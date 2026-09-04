const cardNewsViewState = {
  initialized: false,
  sourceKind: 'feed_item',
  articles: [],
  selectedArticleIndex: -1,
  configuredSources: [],
  failures: [],
  activePlatform: '',
  preview: null,
  previewSourceKey: '',
  previewCache: new Map(),
  previewRequestId: 0,
  busy: false,
  loadingSources: false,
  generating: false,
  generation: null
};

const CARD_NEWS_PLATFORM_STORAGE_KEY = 'bloggenius.cardNews.sourcePlatform';
const CARD_NEWS_GENERATION_SETTINGS_STORAGE_KEY = 'bloggenius.cardNews.generationSettings';

function cardNewsSourceLabel(kind) {
  if (kind === 'feed_item') return '내 블로그 글';
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
    include_korean_text: Boolean(document.getElementById('card-news-include-korean-text')?.checked)
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

function setCardNewsGenerating(generating, imageMode = 'generate') {
  cardNewsViewState.generating = generating;
  const compose = document.getElementById('card-news-compose-button');
  const primary = document.getElementById('card-news-generate-button');
  const regenerate = document.getElementById('card-news-regenerate');
  const bulkImage = document.getElementById('card-news-bulk-image-action');
  [compose, primary, regenerate, bulkImage].forEach((button) => { if (button) button.disabled = generating; });
  if (compose) compose.textContent = generating && imageMode === 'prompt_only' ? '카드 구성 만드는 중…' : '카드 구성만 만들기';
  if (primary) primary.textContent = generating && imageMode === 'generate' ? '이미지까지 만드는 중…' : '이미지까지 만들기';
  updateCardNewsGenerationAvailability();
}

function setCardNewsGenerationStatus(message = '', state = '') {
  const status = document.getElementById('card-news-generation-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function renderCardNewsGeneration(generation) {
  cardNewsViewState.generation = generation;
  const panel = document.getElementById('card-news-result-panel');
  const grid = document.getElementById('card-news-result-grid');
  if (!panel || !grid) return;
  panel.hidden = false;
  panel.dataset.aspectRatio = generation.settings?.aspect_ratio || '4:5';
  document.getElementById('card-news-result-title').textContent = generation.title || '만든 카드뉴스';
  const imageCount = (generation.cards || []).filter((card) => card.image_url).length;
  const bulkImageAction = document.getElementById('card-news-bulk-image-action');
  if (bulkImageAction) {
    bulkImageAction.textContent = imageCount === 0
      ? '이미지 모두 만들기'
      : (imageCount < (generation.cards?.length || 0) ? '빈 이미지 모두 만들기' : '이미지 모두 다시 만들기');
  }
  document.getElementById('card-news-result-summary').textContent = imageCount > 0
    ? `${generation.cards?.length || 0}장의 구성과 ${imageCount}장의 이미지가 준비되었습니다.`
    : `${generation.cards?.length || 0}장의 구성과 이미지 프롬프트가 준비되었습니다.`;
  grid.innerHTML = (generation.cards || []).map((card) => `
    <article class="card-news-result-item">
      <div class="card-news-result-image-wrap">
        ${card.image_url
          ? `<img src="${escapeHtml(card.image_url)}" alt="${escapeHtml(`${card.index}번째 카드: ${card.headline}`)}">`
          : '<div class="card-news-result-image-empty"><span>이미지 미지정</span><small>다음 단계에서 AI 또는 로컬 이미지로 채울 수 있습니다.</small></div>'}
        <span>${card.index}</span>
      </div>
      <div class="card-news-result-copy">
        <strong>${escapeHtml(card.headline)}</strong>
        <p>${escapeHtml(card.body || '')}</p>
        <div class="card-news-result-card-actions">
          <button class="secondary compact" type="button" data-card-news-prompt-copy="${card.index}">프롬프트 복사</button>
          <button class="primary compact" type="button" data-card-news-image-action="${card.index}">${card.image_url ? '이미지 다시 만들기' : '이미지 만들기'}</button>
          ${card.download_url ? `<a href="${escapeHtml(card.download_url)}" download>이미지 받기</a>` : ''}
        </div>
        <details class="card-news-prompt-details">
          <summary>프롬프트 보기</summary>
          <p>${escapeHtml(card.image_prompt || '')}</p>
        </details>
      </div>
    </article>`).join('');
  grid.querySelectorAll('[data-card-news-prompt-copy]').forEach((button) => {
    button.addEventListener('click', () => void copyCardNewsPrompt(Number(button.dataset.cardNewsPromptCopy), button));
  });
  grid.querySelectorAll('[data-card-news-image-action]').forEach((button) => {
    button.addEventListener('click', showCardNewsImageActionPreview);
  });
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showCardNewsImageActionPreview() {
  const message = '이미지 생성 기능은 다음 단계에서 연결할 예정입니다.';
  if (typeof showUiToast === 'function') {
    showUiToast({ level: 'info', title: '이미지 기능 준비 중', message });
    return;
  }
  setCardNewsGenerationStatus(message, 'warning');
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

function getCardNewsPlatformLabel(platform) {
  return platform === 'wordpress' ? 'WordPress' : '네이버';
}

function renderCardNewsPlatformTabs() {
  const container = document.getElementById('card-news-platform-tabs');
  if (!container) return;
  const sources = cardNewsViewState.configuredSources;
  container.hidden = sources.length < 2;
  if (sources.length < 2) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = sources.map((platform) => {
    const count = cardNewsViewState.articles.filter((article) => article.source_platform === platform).length;
    const selected = platform === cardNewsViewState.activePlatform;
    return `<button type="button" role="tab" class="card-news-platform-tab${selected ? ' active' : ''}" data-card-news-platform="${escapeHtml(platform)}" aria-selected="${selected ? 'true' : 'false'}">${escapeHtml(getCardNewsPlatformLabel(platform))}<span>${count}</span></button>`;
  }).join('');
  container.querySelectorAll('[data-card-news-platform]').forEach((button) => {
    button.addEventListener('click', () => {
      const platform = button.dataset.cardNewsPlatform;
      if (platform === cardNewsViewState.activePlatform) return;
      cardNewsViewState.activePlatform = platform;
      cardNewsViewState.selectedArticleIndex = -1;
      cardNewsViewState.previewRequestId += 1;
      setCardNewsBusy(false);
      try { localStorage.setItem(CARD_NEWS_PLATFORM_STORAGE_KEY, platform); } catch (_) { }
      renderCardNewsPlatformTabs();
      renderCardNewsVisibleArticles();
      setCardNewsStatus('', '');
      markCardNewsPreviewStale();
    });
  });
}

function renderCardNewsVisibleArticles() {
  const list = document.getElementById('card-news-feed-list');
  const note = document.getElementById('card-news-feed-note');
  if (!list || !note) return;
  const sources = cardNewsViewState.configuredSources;
  const activePlatform = sources.length > 1 ? cardNewsViewState.activePlatform : (sources[0] || '');
  const visibleArticles = cardNewsViewState.articles
    .map((article, index) => ({ article, index }))
    .filter(({ article }) => !activePlatform || article.source_platform === activePlatform);
  const visibleFailures = cardNewsViewState.failures.filter((failure) => !activePlatform || failure.source_platform === activePlatform);

  if (!visibleArticles.length) {
    const hasConfiguredSource = sources.length > 0;
    const title = visibleFailures.length
      ? `${getCardNewsPlatformLabel(activePlatform)} 글을 불러오지 못했습니다.`
      : (hasConfiguredSource ? '공개된 글을 찾지 못했습니다.' : '연결된 블로그가 없습니다.');
    const message = visibleFailures.length
      ? '잠시 후 새로고침해 주세요.'
      : (hasConfiguredSource ? '블로그 RSS를 확인한 뒤 새로고침해 주세요.' : '설정에서 네이버 또는 WordPress 블로그를 먼저 연결해 주세요.');
    list.innerHTML = `<div class="card-news-empty-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>`;
  } else {
    list.innerHTML = visibleArticles.map(({ article, index }) => `
      <button class="card-news-feed-item" type="button" data-card-news-article-index="${index}" aria-pressed="false">
        <strong>${escapeHtml(article.title || '제목 없는 글')}</strong>
        <small>${escapeHtml(article.published_at ? formatCardNewsDate(article.published_at) : '발행일 정보 없음')}</small>
        <span>${escapeHtml(article.preview_text || '글을 열어 내용을 확인합니다.')}</span>
      </button>`).join('');
  }
  note.hidden = visibleFailures.length === 0 || visibleArticles.length === 0;
  note.textContent = visibleFailures.length ? '이 플랫폼의 일부 글을 불러오지 못했습니다.' : '';
  list.querySelectorAll('[data-card-news-article-index]').forEach((button) => {
    button.addEventListener('click', () => {
      cardNewsViewState.selectedArticleIndex = Number(button.dataset.cardNewsArticleIndex);
      list.querySelectorAll('[data-card-news-article-index]').forEach((item) => {
        const selected = item === button;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
      void previewCardNewsSource(cardNewsViewState.articles[cardNewsViewState.selectedArticleIndex]);
    });
  });
}

function renderCardNewsArticles(result = {}) {
  cardNewsViewState.articles = Array.isArray(result.articles) ? result.articles : [];
  cardNewsViewState.failures = Array.isArray(result.failures) ? result.failures : [];
  cardNewsViewState.configuredSources = Array.isArray(result.configured_sources)
    ? [...new Set(result.configured_sources.filter((source) => source === 'naver' || source === 'wordpress'))]
    : [...new Set(cardNewsViewState.articles.map((article) => article.source_platform).filter(Boolean))];
  cardNewsViewState.selectedArticleIndex = -1;
  let savedPlatform = '';
  try { savedPlatform = localStorage.getItem(CARD_NEWS_PLATFORM_STORAGE_KEY) || ''; } catch (_) { }
  if (!cardNewsViewState.configuredSources.includes(cardNewsViewState.activePlatform)) {
    cardNewsViewState.activePlatform = cardNewsViewState.configuredSources.includes(savedPlatform)
      ? savedPlatform
      : (cardNewsViewState.configuredSources[0] || '');
  }
  renderCardNewsPlatformTabs();
  renderCardNewsVisibleArticles();
  markCardNewsPreviewStale();
}

async function loadCardNewsSources() {
  const list = document.getElementById('card-news-feed-list');
  if (list) list.innerHTML = '<div class="card-news-empty-state">공개 글 목록을 불러오는 중입니다.</div>';
  setCardNewsSourceLoading(true);
  try {
    renderCardNewsArticles(await fetchJson('/api/v1/card-news/sources'));
  } catch (error) {
    if (list) list.innerHTML = `<div class="card-news-empty-state"><strong>글 목록을 불러오지 못했습니다.</strong><span>${escapeHtml(error.message || '잠시 후 다시 시도해 주세요.')}</span></div>`;
  } finally {
    setCardNewsSourceLoading(false);
  }
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
  document.getElementById('card-news-preview-kind').textContent = cardNewsSourceLabel(snapshot?.source?.kind);
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
  });
  document.querySelectorAll('[data-card-news-source-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.cardNewsSourcePanel !== kind;
  });
  const actions = document.getElementById('card-news-source-actions');
  if (actions) actions.hidden = kind === 'feed_item';
  setCardNewsStatus('', '');
  markCardNewsPreviewStale();
}

function bindCardNewsView() {
  document.querySelectorAll('[data-card-news-source-kind]').forEach((button) => {
    button.addEventListener('click', () => activateCardNewsSourceKind(button.dataset.cardNewsSourceKind));
  });
  document.getElementById('card-news-source-refresh')?.addEventListener('click', () => void loadCardNewsSources());
  document.getElementById('card-news-preview-button')?.addEventListener('click', () => void previewCardNewsSource());
  document.getElementById('card-news-compose-button')?.addEventListener('click', () => void generateCardNews({ imageMode: 'prompt_only' }));
  document.getElementById('card-news-generate-button')?.addEventListener('click', () => void generateCardNews({ imageMode: 'generate' }));
  document.getElementById('card-news-regenerate')?.addEventListener('click', () => void regenerateCardNewsComposition());
  document.getElementById('card-news-bulk-image-action')?.addEventListener('click', showCardNewsImageActionPreview);
  ['card-news-slide-count', 'card-news-aspect-ratio', 'card-news-style', 'card-news-include-korean-text'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', saveCardNewsGenerationSettings);
  });
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
    void loadCardNewsSources();
  }
}
