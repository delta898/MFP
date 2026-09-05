function getCardNewsPlatformLabel(platform) {
  if (platform === 'wordpress') return 'WordPress';
  if (platform === 'naver') return '네이버';
  return platform || '직접 입력';
}

function isCardNewsSourcePublished(article = {}) {
  return article.management?.publishing_status === '발행 완료';
}

function visibleCardNewsArticlesForPlatform(platform = '') {
  return cardNewsViewState.articles
    .map((article, index) => ({ article, index }))
    .filter(({ article }) => !platform || article.source_platform === platform)
    .filter(({ article }) => cardNewsViewState.includePublished || !isCardNewsSourcePublished(article));
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
    const count = visibleCardNewsArticlesForPlatform(platform).length;
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
  const platformArticles = cardNewsViewState.articles.filter((article) => !activePlatform || article.source_platform === activePlatform);
  const visibleArticles = visibleCardNewsArticlesForPlatform(activePlatform);
  const visibleFailures = cardNewsViewState.failures.filter((failure) => !activePlatform || failure.source_platform === activePlatform);

  if (!visibleArticles.length) {
    const hasConfiguredSource = sources.length > 0;
    const onlyPublished = platformArticles.length > 0 && platformArticles.every(isCardNewsSourcePublished);
    const title = visibleFailures.length
      ? `${getCardNewsPlatformLabel(activePlatform)} 글을 불러오지 못했습니다.`
      : (onlyPublished ? '새로 만들 글이 없습니다.' : (hasConfiguredSource ? '공개된 글을 찾지 못했습니다.' : '연결된 블로그가 없습니다.'));
    const message = visibleFailures.length
      ? '잠시 후 새로고침해 주세요.'
      : (onlyPublished
        ? '발행 완료 포함을 선택하면 이전 글도 다시 볼 수 있습니다.'
        : (hasConfiguredSource ? '블로그 RSS를 확인한 뒤 새로고침해 주세요.' : '설정에서 네이버 또는 WordPress 블로그를 먼저 연결해 주세요.'));
    list.innerHTML = `<div class="card-news-empty-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>`;
  } else {
    list.innerHTML = visibleArticles.map(({ article, index }) => {
      const status = article.management?.publishing_status === '발행 완료'
        ? '발행 완료'
        : (article.management?.generation_id ? '구성 있음' : '');
      return `
      <button class="card-news-feed-item" type="button" data-card-news-article-index="${index}" aria-pressed="false">
        <strong>${escapeHtml(article.title || '제목 없는 글')}${status ? `<em>${escapeHtml(status)}</em>` : ''}</strong>
        <small>${escapeHtml(article.published_at ? formatCardNewsDate(article.published_at) : '발행일 정보 없음')}</small>
        <span>${escapeHtml(article.preview_text || '글을 열어 내용을 확인합니다.')}</span>
      </button>`;
    }).join('');
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
  const publishedToggle = document.querySelector('.card-news-published-toggle');
  if (publishedToggle) publishedToggle.hidden = !cardNewsViewState.articles.some(isCardNewsSourcePublished);
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

function safeCardNewsExternalUrl(value = '') {
  try {
    const parsed = new URL(String(value || ''));
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch (_) {
    return '';
  }
}

function cardNewsManagedActionLabel(item = {}) {
  return Number(item.image_count || 0) < Number(item.card_count || 0) ? '계속 만들기' : '결과 보기';
}

function renderCardNewsManagedItems() {
  const list = document.getElementById('card-news-managed-list');
  if (!list) return;
  const items = cardNewsViewState.managedItems.filter((item) => (
    cardNewsViewState.managedFilter === '전체' || item.status === cardNewsViewState.managedFilter
  ));
  if (!items.length) {
    list.innerHTML = '<div class="card-news-empty-state"><strong>해당하는 카드뉴스가 없습니다.</strong><span>카드 구성을 만들면 이곳에 자동으로 표시됩니다.</span></div>';
    return;
  }
  list.innerHTML = items.map((item) => {
    const sourceUrl = safeCardNewsExternalUrl(item.source_url);
    const links = (item.post_links || []).map((link, index) => {
      const safeLink = safeCardNewsExternalUrl(link);
      if (!safeLink) return '';
      const channel = item.channels?.[index] || '게시물';
      return `<a href="${escapeHtml(safeLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(channel)} 열기 ↗</a>`;
    }).filter(Boolean).join('');
    return `
      <article class="card-news-managed-item" data-status="${escapeHtml(item.status)}">
        <div class="card-news-managed-copy">
          <div class="card-news-managed-title-row">
            <strong>${escapeHtml(item.title || '제목 없는 카드뉴스')}</strong>
            <span class="card-news-managed-status">${escapeHtml(item.status)}</span>
          </div>
          <p>${escapeHtml(getCardNewsPlatformLabel(item.source_platform))} · 카드 ${Number(item.card_count || 0)}장 · 이미지 ${Number(item.image_count || 0)}장</p>
          ${item.last_error ? `<small>${escapeHtml(item.last_error)}</small>` : ''}
          <div class="card-news-managed-links">${links}${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">원문 열기 ↗</a>` : ''}</div>
        </div>
        <div class="card-news-managed-actions">
          ${item.local_available
            ? `<button class="primary compact" type="button" data-card-news-open-generation="${escapeHtml(item.generation_id)}">${cardNewsManagedActionLabel(item)}</button>`
            : '<span>로컬 결과 없음</span>'}
        </div>
      </article>`;
  }).join('');
  list.querySelectorAll('[data-card-news-open-generation]').forEach((button) => {
    button.addEventListener('click', () => void openManagedCardNewsGeneration(button.dataset.cardNewsOpenGeneration));
  });
}

function setCardNewsManagedLoading(loading) {
  cardNewsViewState.managedLoading = loading;
  const refresh = document.getElementById('card-news-managed-refresh');
  if (refresh) {
    refresh.disabled = loading;
    refresh.classList.toggle('is-loading', loading);
  }
}

async function loadCardNewsManagedItems() {
  if (cardNewsViewState.managedLoading) return;
  const list = document.getElementById('card-news-managed-list');
  if (list) list.innerHTML = '<div class="card-news-empty-state">만든 카드뉴스를 불러오는 중입니다.</div>';
  setCardNewsManagedLoading(true);
  try {
    const result = await fetchJson('/api/v1/card-news/managed');
    cardNewsViewState.managedItems = Array.isArray(result.items) ? result.items : [];
    renderCardNewsManagedItems();
  } catch (error) {
    if (list) list.innerHTML = `<div class="card-news-empty-state"><strong>목록을 불러오지 못했습니다.</strong><span>${escapeHtml(error.message || '잠시 후 다시 시도해 주세요.')}</span></div>`;
  } finally {
    setCardNewsManagedLoading(false);
  }
}

function activateCardNewsWorkspace(workspace) {
  cardNewsViewState.workspace = workspace === 'managed' ? 'managed' : 'create';
  document.querySelectorAll('[data-card-news-workspace]').forEach((button) => {
    const active = button.dataset.cardNewsWorkspace === cardNewsViewState.workspace;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('[data-card-news-workspace-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.cardNewsWorkspacePanel !== cardNewsViewState.workspace;
  });
  if (cardNewsViewState.workspace === 'managed') void loadCardNewsManagedItems();
}

async function openManagedCardNewsGeneration(generationId) {
  if (!generationId || cardNewsViewState.generating) return;
  try {
    const result = await fetchJson(`/api/v1/card-news/generations/${encodeURIComponent(generationId)}`);
    activateCardNewsWorkspace('create');
    renderCardNewsGeneration(result.generation, { scroll: false, allowCompositionRegeneration: false });
    document.getElementById('card-news-result-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    const list = document.getElementById('card-news-managed-list');
    if (list) list.insertAdjacentHTML('afterbegin', `<p class="card-news-managed-error">${escapeHtml(error.message || '카드뉴스 결과를 열지 못했습니다.')}</p>`);
  }
}

function bindCardNewsManagementView() {
  document.querySelectorAll('[data-card-news-workspace]').forEach((button) => {
    button.addEventListener('click', () => activateCardNewsWorkspace(button.dataset.cardNewsWorkspace));
  });
  document.querySelectorAll('[data-card-news-managed-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      cardNewsViewState.managedFilter = button.dataset.cardNewsManagedFilter || '전체';
      document.querySelectorAll('[data-card-news-managed-filter]').forEach((item) => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      renderCardNewsManagedItems();
    });
  });
  document.getElementById('card-news-managed-refresh')?.addEventListener('click', () => void loadCardNewsManagedItems());
  document.getElementById('card-news-include-published')?.addEventListener('change', (event) => {
    cardNewsViewState.includePublished = Boolean(event.currentTarget.checked);
    cardNewsViewState.selectedArticleIndex = -1;
    renderCardNewsPlatformTabs();
    renderCardNewsVisibleArticles();
    markCardNewsPreviewStale();
  });
}
