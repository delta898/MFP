function getCardNewsPlatformLabel(platform) {
  const feedSource = cardNewsViewState.feedSources.find((source) => source.source_platform === platform);
  if (feedSource?.label) return feedSource.label;
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
    .filter(({ article }) => !isCardNewsSourcePublished(article));
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
      : (onlyPublished ? '새로 만들 글이 없습니다.' : (hasConfiguredSource ? '공개된 글을 찾지 못했습니다.' : '등록된 피드가 없습니다.'));
    const message = visibleFailures.length
      ? '잠시 후 새로고침해 주세요.'
      : (onlyPublished
        ? '발행한 카드뉴스는 만든 카드뉴스에서 확인할 수 있습니다.'
        : (hasConfiguredSource ? 'RSS 주소를 확인한 뒤 새로고침해 주세요.' : '설정에서 블로그를 연결하거나 RSS를 추가해 주세요.'));
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
  cardNewsViewState.feedSources = Array.isArray(result.feed_sources) ? result.feed_sources : [];
  cardNewsViewState.configuredSources = Array.isArray(result.configured_sources)
    ? [...new Set(result.configured_sources.filter(Boolean))]
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
  if (cardNewsViewState.loadingSources) return;
  const list = document.getElementById('card-news-feed-list');
  if (list) list.innerHTML = '<div class="card-news-empty-state">공개 글 목록을 불러오는 중입니다.</div>';
  setCardNewsSourceLoading(true);
  try {
    renderCardNewsArticles(await fetchJson('/api/v1/card-news/sources'));
    cardNewsViewState.sourcesStale = false;
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

function resetCardNewsZipImport() {
  cardNewsViewState.zipImport = null;
  cardNewsViewState.zipImporting = false;
  const panel = document.getElementById('card-news-zip-panel');
  const input = document.getElementById('card-news-zip-file');
  const preview = document.getElementById('card-news-zip-preview');
  const title = document.getElementById('card-news-zip-name');
  const sourceUrl = document.getElementById('card-news-zip-source-url');
  const importButton = document.getElementById('card-news-zip-import');
  if (panel) panel.hidden = true;
  if (input) input.value = '';
  if (preview) preview.innerHTML = '';
  if (title) title.value = '';
  if (sourceUrl) sourceUrl.value = '';
  if (importButton) {
    importButton.disabled = true;
    importButton.textContent = '가져오기';
  }
}

function updateCardNewsZipSourceMatch() {
  const note = document.getElementById('card-news-zip-source-match');
  const value = safeCardNewsExternalUrl(document.getElementById('card-news-zip-source-url')?.value || '');
  if (!note) return;
  const existing = value && cardNewsViewState.managedItems.find((item) => safeCardNewsExternalUrl(item.source_url) === value);
  note.textContent = existing
    ? `기존 관리 항목 ‘${existing.title || '제목 없는 카드뉴스'}’에 연결합니다.`
    : '같은 원문 URL이 있으면 기존 관리 항목에 연결합니다.';
  note.dataset.state = existing ? 'matched' : '';
}

function setCardNewsZipImporting(importing) {
  cardNewsViewState.zipImporting = importing;
  ['card-news-zip-select', 'card-news-zip-file', 'card-news-zip-name', 'card-news-zip-source-url', 'card-news-zip-close', 'card-news-zip-cancel'].forEach((id) => {
    const control = document.getElementById(id);
    if (control) control.disabled = importing;
  });
  const button = document.getElementById('card-news-zip-import');
  if (button) {
    button.disabled = importing || !cardNewsViewState.zipImport;
    button.textContent = importing ? '가져오는 중…' : '가져오기';
  }
}

async function previewCardNewsZip(file) {
  if (!file || cardNewsViewState.zipImporting) return;
  const panel = document.getElementById('card-news-zip-panel');
  const status = document.getElementById('card-news-zip-status');
  const preview = document.getElementById('card-news-zip-preview');
  const title = document.getElementById('card-news-zip-name');
  if (panel) panel.hidden = false;
  cardNewsViewState.zipImport = null;
  setCardNewsZipImporting(true);
  if (status) {
    status.textContent = 'ZIP 안의 카드 이미지를 확인하고 있습니다.';
    status.dataset.state = 'loading';
  }
  if (preview) preview.innerHTML = '<div class="card-news-empty-state">이미지 순서를 확인하는 중입니다.</div>';
  if (title) title.value = file.name.replace(/\.zip$/i, '').trim() || '가져온 카드뉴스';
  try {
    if (file.size > 40 * 1024 * 1024) throw new Error('ZIP 파일은 최대 40MB까지 가져올 수 있습니다.');
    const base64Data = await readCardNewsFileAsDataUrl(file, 'ZIP');
    const result = await postJson('/api/v1/card-news/zip/preview', { file_name: file.name, base64_data: base64Data });
    cardNewsViewState.zipImport = { file_name: file.name, base64_data: base64Data, preview: result };
    if (title && result.title) title.value = result.title;
    const sourceUrl = document.getElementById('card-news-zip-source-url');
    if (sourceUrl && result.source_url) sourceUrl.value = result.source_url;
    if (preview) preview.innerHTML = (result.images || []).map((image) => `
      <figure class="card-news-zip-preview-item">
        <img src="${escapeHtml(image.data_url)}" alt="${escapeHtml(`${image.index}번째 카드 ${image.file_name}`)}">
        <figcaption><strong>${image.index}</strong><span>${escapeHtml(image.file_name)}</span></figcaption>
      </figure>`).join('');
    if (status) {
      status.textContent = `${result.card_count || 0}장의 이미지를 파일명 순서대로 가져옵니다.`;
      status.dataset.state = 'ready';
    }
    updateCardNewsZipSourceMatch();
  } catch (error) {
    if (preview) preview.innerHTML = '';
    if (status) {
      status.textContent = error.message || 'ZIP 파일을 확인하지 못했습니다.';
      status.dataset.state = 'error';
    }
  } finally {
    setCardNewsZipImporting(false);
  }
}

async function importCardNewsZip() {
  const pending = cardNewsViewState.zipImport;
  if (!pending || cardNewsViewState.zipImporting) return;
  const title = document.getElementById('card-news-zip-name')?.value?.trim() || '';
  const sourceUrl = document.getElementById('card-news-zip-source-url')?.value?.trim() || '';
  const status = document.getElementById('card-news-zip-status');
  if (!title) {
    if (status) { status.textContent = '카드뉴스 제목을 입력해 주세요.'; status.dataset.state = 'error'; }
    document.getElementById('card-news-zip-name')?.focus();
    return;
  }
  setCardNewsZipImporting(true);
  if (status) { status.textContent = '카드뉴스를 로컬 작업 공간에 가져오고 있습니다.'; status.dataset.state = 'loading'; }
  try {
    const result = await postJson('/api/v1/card-news/zip/import', {
      file_name: pending.file_name,
      base64_data: pending.base64_data,
      title,
      source_url: sourceUrl
    });
    resetCardNewsZipImport();
    await loadCardNewsManagedItems();
    activateCardNewsWorkspace('create');
    renderCardNewsGeneration(result.generation, { scroll: false, allowCompositionRegeneration: false });
    setCardNewsGenerationStatus('ZIP 카드뉴스를 가져왔습니다.', 'ready');
    document.getElementById('card-news-result-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    if (status) { status.textContent = error.message || 'ZIP 카드뉴스를 가져오지 못했습니다.'; status.dataset.state = 'error'; }
  } finally {
    setCardNewsZipImporting(false);
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
    button.setAttribute('tabindex', active ? '0' : '-1');
  });
  document.querySelectorAll('[data-card-news-workspace-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.cardNewsWorkspacePanel !== cardNewsViewState.workspace;
  });
  if (cardNewsViewState.workspace === 'managed') void loadCardNewsManagedItems();
  return true;
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
    button.addEventListener('keydown', (event) => void handleUiTabNavigationKeydown(event, {
      selector: '[data-card-news-workspace]',
      dataKey: 'cardNewsWorkspace',
      activate: activateCardNewsWorkspace
    }));
  });
  const activateManagedFilter = (filter) => {
    cardNewsViewState.managedFilter = filter || '전체';
    document.querySelectorAll('[data-card-news-managed-filter]').forEach((item) => {
      const active = item.dataset.cardNewsManagedFilter === cardNewsViewState.managedFilter;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', active ? 'true' : 'false');
      item.setAttribute('tabindex', active ? '0' : '-1');
    });
    renderCardNewsManagedItems();
    return true;
  };
  document.querySelectorAll('[data-card-news-managed-filter]').forEach((button) => {
    button.addEventListener('click', () => activateManagedFilter(button.dataset.cardNewsManagedFilter));
    button.addEventListener('keydown', (event) => void handleUiTabNavigationKeydown(event, {
      selector: '[data-card-news-managed-filter]',
      dataKey: 'cardNewsManagedFilter',
      activate: activateManagedFilter
    }));
  });
  document.getElementById('card-news-managed-refresh')?.addEventListener('click', () => void loadCardNewsManagedItems());
  document.getElementById('card-news-zip-select')?.addEventListener('click', () => document.getElementById('card-news-zip-file')?.click());
  document.getElementById('card-news-zip-file')?.addEventListener('change', (event) => void previewCardNewsZip(event.currentTarget.files?.[0]));
  document.getElementById('card-news-zip-close')?.addEventListener('click', resetCardNewsZipImport);
  document.getElementById('card-news-zip-cancel')?.addEventListener('click', resetCardNewsZipImport);
  document.getElementById('card-news-zip-import')?.addEventListener('click', () => void importCardNewsZip());
  document.getElementById('card-news-zip-source-url')?.addEventListener('input', updateCardNewsZipSourceMatch);
}
