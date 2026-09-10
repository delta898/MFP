function getCardNewsPlatformLabel(platform) {
  const feedSource = cardNewsViewState.feedSources.find((source) => source.source_platform === platform);
  if (feedSource?.label) return feedSource.label;
  if (platform === 'wordpress') return 'WordPress';
  if (platform === 'naver') return '네이버';
  if (platform === 'local') return '로컬 작업';
  return platform || '직접 입력';
}

function isCardNewsSourcePublished(article = {}) {
  return article.management?.status_key === 'published'
    || article.management?.publishing_status === '발행 완료';
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
    return `<button type="button" role="tab" class="card-news-platform-tab ui-segmented-tab${selected ? ' active' : ''}" data-card-news-platform="${escapeHtml(platform)}" aria-selected="${selected ? 'true' : 'false'}">${escapeHtml(getCardNewsPlatformLabel(platform))}<span class="ui-count-badge">${count}</span></button>`;
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
      const status = article.management?.generation_id ? article.management?.status : '';
      const statusTone = article.management?.status_tone || 'neutral';
      return `
      <button class="card-news-feed-item card-news-entry-item" type="button" data-card-news-article-index="${index}" aria-pressed="false">
        <span class="card-news-entry-title"><strong>${escapeHtml(article.title || '제목 없는 글')}</strong></span>
        <span class="card-news-entry-status">${status ? `<span class="ui-status-badge" data-state="${escapeHtml(statusTone)}">${escapeHtml(status)}</span>` : ''}</span>
        <small class="card-news-entry-date">${escapeHtml(article.published_at ? formatCardNewsDate(article.published_at) : '발행일 정보 없음')}</small>
        <span class="card-news-entry-summary">${escapeHtml(article.preview_text || '글을 열어 내용을 확인합니다.')}</span>
      </button>`;
    }).join('');
  }
  note.hidden = visibleFailures.length === 0 || visibleArticles.length === 0;
  note.textContent = visibleFailures.length ? '이 플랫폼의 일부 글을 불러오지 못했습니다.' : '';
  list.querySelectorAll('[data-card-news-article-index]').forEach((button) => {
    button.addEventListener('click', () => {
      cardNewsViewState.selectedArticleIndex = Number(button.dataset.cardNewsArticleIndex);
      const article = cardNewsViewState.articles[cardNewsViewState.selectedArticleIndex];
      list.querySelectorAll('[data-card-news-article-index]').forEach((item) => {
        const selected = item === button;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
      void previewCardNewsSource(article);
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
    const selected = cardNewsViewState.managedDetailOpen
      && item.generation_id === cardNewsViewState.managedWorkflowContext?.generation?.id;
    const selectable = Boolean(item.local_available);
    return `
      <article class="card-news-managed-item card-news-entry-item${selected ? ' is-selected' : ''}${selectable ? '' : ' is-unavailable'}" data-status="${escapeHtml(item.status)}" data-generation-id="${escapeHtml(item.generation_id)}" data-card-news-open-generation="${selectable ? escapeHtml(item.generation_id) : ''}" role="button" tabindex="${selectable ? '0' : '-1'}" aria-pressed="${selected ? 'true' : 'false'}" aria-disabled="${selectable ? 'false' : 'true'}">
        <span class="card-news-entry-title"><strong>${escapeHtml(item.title || '제목 없는 카드뉴스')}</strong></span>
        <span class="card-news-entry-status"><span class="card-news-managed-status ui-status-badge" data-state="${escapeHtml(item.status_tone || 'neutral')}">${escapeHtml(item.status)}</span></span>
        <small class="card-news-entry-date">${escapeHtml(item.updated_at ? formatCardNewsDate(item.updated_at) : (selectable ? '작업일 정보 없음' : '로컬 결과 없음'))}</small>
        <span class="card-news-entry-summary">${escapeHtml(item.last_error || `${getCardNewsPlatformLabel(item.source_platform)} · 카드 ${Number(item.card_count || 0)}장 · 이미지 ${Number(item.image_count || 0)}장`)}</span>
      </article>`;
  }).join('');
  list.querySelectorAll('[data-card-news-open-generation]').forEach((item) => {
    const open = () => {
      const generationId = item.dataset.cardNewsOpenGeneration;
      if (generationId) void openManagedCardNewsGeneration(generationId);
    };
    item.addEventListener('click', (event) => {
      if (event.target.closest('a')) return;
      open();
    });
    item.addEventListener('keydown', (event) => {
      if (event.target.closest('a')) return;
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      open();
    });
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
  const dialog = document.getElementById('card-news-zip-dialog');
  const input = document.getElementById('card-news-zip-file');
  const preview = document.getElementById('card-news-zip-preview');
  const title = document.getElementById('card-news-zip-name');
  const sourceUrl = document.getElementById('card-news-zip-source-url');
  const sourceMatch = document.getElementById('card-news-zip-source-match');
  const status = document.getElementById('card-news-zip-status');
  const importButton = document.getElementById('card-news-zip-import');
  if (dialog?.open) dialog.close();
  if (input) input.value = '';
  if (preview) preview.innerHTML = '';
  if (title) title.value = '';
  if (sourceUrl) sourceUrl.value = '';
  if (sourceMatch) {
    sourceMatch.textContent = '같은 원문 URL이 있으면 기존 관리 항목에 연결합니다.';
    sourceMatch.dataset.state = '';
  }
  if (status) {
    status.textContent = '이미지 순서를 확인한 뒤 가져오세요.';
    status.dataset.state = '';
  }
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
  ['card-news-zip-select', 'card-news-zip-file', 'card-news-zip-name', 'card-news-zip-source-url', 'card-news-zip-cancel'].forEach((id) => {
    const control = document.getElementById(id);
    if (control) control.disabled = importing;
  });
  const button = document.getElementById('card-news-zip-import');
  if (button) {
    button.disabled = importing || !cardNewsViewState.zipImport;
    button.textContent = importing ? '가져오는 중…' : '가져오기';
  }
  const selectButton = document.getElementById('card-news-zip-select');
  const previewing = importing && !document.getElementById('card-news-zip-dialog')?.open;
  selectButton?.classList.toggle('is-loading', previewing);
  selectButton?.setAttribute('aria-busy', String(previewing));
}

async function previewCardNewsZip(file) {
  if (!file || cardNewsViewState.zipImporting) return;
  const dialog = document.getElementById('card-news-zip-dialog');
  const status = document.getElementById('card-news-zip-status');
  const preview = document.getElementById('card-news-zip-preview');
  const title = document.getElementById('card-news-zip-name');
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
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    title?.focus();
  } catch (error) {
    const message = error.message || 'ZIP 파일을 확인하지 못했습니다.';
    resetCardNewsZipImport();
    if (typeof showUiToast === 'function') {
      showUiToast({ level: 'error', title: 'ZIP 확인 실패', message, dedupeKey: 'card-news-zip-preview-error' });
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
    showManagedCardNewsGeneration({ generation: result.generation, source_snapshot: null });
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

function moveCardNewsSharedWorkflow(workspace) {
  const workflow = document.getElementById('card-news-shared-workflow');
  const slot = document.getElementById(workspace === 'managed'
    ? 'card-news-managed-workflow-slot'
    : 'card-news-create-workflow-slot');
  if (workflow && slot && workflow.parentElement !== slot) slot.appendChild(workflow);
}

function renderManagedCardNewsSource(snapshot, item = {}) {
  const panel = document.getElementById('card-news-managed-source');
  if (!panel) return;
  const empty = document.getElementById('card-news-managed-source-empty');
  const content = document.getElementById('card-news-managed-source-content');
  const badge = document.getElementById('card-news-managed-source-badge');
  const relatedLinks = document.getElementById('card-news-managed-source-links');
  if (empty) empty.hidden = Boolean(snapshot);
  if (content) content.hidden = !snapshot;
  if (badge) {
    badge.hidden = !snapshot;
    badge.textContent = snapshot ? '확인 완료' : '선택 전';
    badge.dataset.state = snapshot ? 'ready' : 'idle';
  }
  if (!snapshot) {
    if (empty) empty.innerHTML = '';
    if (relatedLinks) relatedLinks.innerHTML = '';
    return;
  }
  const source = snapshot.source || {};
  const link = document.getElementById('card-news-managed-source-link');
  const canonicalUrl = safeCardNewsExternalUrl(snapshot.canonical_url || source.canonical_url || '');
  document.getElementById('card-news-managed-source-kind').textContent = cardNewsSourceLabel(source.kind, source);
  document.getElementById('card-news-managed-source-title').textContent = snapshot.title || '제목 없는 내용';
  document.getElementById('card-news-managed-source-excerpt').textContent = snapshot.excerpt || snapshot.text || '';
  document.getElementById('card-news-managed-source-meta').textContent = [
    snapshot.retrieved_at ? `${formatCardNewsDate(snapshot.retrieved_at)} 저장` : ''
  ].filter(Boolean).join(' · ');
  if (link) {
    const sourceUrl = canonicalUrl || safeCardNewsExternalUrl(item.source_url);
    link.hidden = !sourceUrl;
    link.href = sourceUrl || '#';
  }
  if (relatedLinks) {
    relatedLinks.innerHTML = (item.post_links || []).map((postLink, index) => {
      const safeLink = safeCardNewsExternalUrl(postLink);
      if (!safeLink) return '';
      const channel = item.channels?.[index] || '게시물';
      return `<a href="${escapeHtml(safeLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(channel)} 열기 ↗</a>`;
    }).filter(Boolean).join('');
  }
}

function showManagedCardNewsGeneration(result = {}) {
  const generation = result.generation;
  if (!generation) return;
  cardNewsViewState.preview = result.source_snapshot || null;
  cardNewsViewState.previewSourceKey = result.source_snapshot ? `project:${generation.project_id || generation.id}` : '';
  cardNewsViewState.projectId = generation.project_id || '';
  cardNewsViewState.publishingConfig = null;
  cardNewsViewState.publishingOutcome = '';
  cardNewsViewState.publishedChannelIds.clear();
  cardNewsViewState.managedDetailOpen = true;
  const detail = document.getElementById('card-news-managed-detail');
  if (detail) detail.hidden = false;
  moveCardNewsSharedWorkflow('managed');
  const managedItem = cardNewsViewState.managedItems.find((item) => item.generation_id === generation.id) || {};
  renderManagedCardNewsSource(result.source_snapshot || null, managedItem);
  renderCardNewsGeneration(generation, {
    scroll: false,
    allowCompositionRegeneration: Boolean(result.source_snapshot && generation.project_id)
  });
  updateCardNewsGenerationAvailability();
  cardNewsViewState.managedWorkflowContext = captureCardNewsWorkflowContext();
  document.querySelectorAll('.card-news-managed-item').forEach((item) => {
    const selected = item.dataset.generationId === generation.id;
    item.classList.toggle('is-selected', selected);
    item.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
}

function activateCardNewsWorkspace(workspace) {
  const nextWorkspace = workspace === 'managed' ? 'managed' : 'create';
  if (cardNewsViewState.generating && cardNewsViewState.workspace !== nextWorkspace) return false;
  if (cardNewsViewState.workspace !== nextWorkspace) {
    cardNewsViewState.publishingRequestId += 1;
    if (cardNewsViewState.workspace === 'create') {
      cardNewsViewState.createWorkflowContext = captureCardNewsWorkflowContext();
    } else if (cardNewsViewState.managedDetailOpen) {
      cardNewsViewState.managedWorkflowContext = captureCardNewsWorkflowContext();
    }
    cardNewsViewState.workspace = nextWorkspace;
    moveCardNewsSharedWorkflow(nextWorkspace);
    restoreCardNewsWorkflowContext(nextWorkspace === 'managed'
      ? cardNewsViewState.managedWorkflowContext
      : cardNewsViewState.createWorkflowContext);
  }
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
    showManagedCardNewsGeneration(result);
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
  document.getElementById('card-news-zip-cancel')?.addEventListener('click', resetCardNewsZipImport);
  document.getElementById('card-news-zip-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void importCardNewsZip();
  });
  document.getElementById('card-news-zip-dialog')?.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (cardNewsViewState.zipImporting) return;
    resetCardNewsZipImport();
  });
  document.getElementById('card-news-zip-import')?.addEventListener('click', () => void importCardNewsZip());
  document.getElementById('card-news-zip-source-url')?.addEventListener('input', updateCardNewsZipSourceMatch);
}
