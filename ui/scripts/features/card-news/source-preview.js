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
  loadingSources: false
};

const CARD_NEWS_PLATFORM_STORAGE_KEY = 'bloggenius.cardNews.sourcePlatform';

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
    bindCardNewsView();
    void loadCardNewsSources();
  }
}
