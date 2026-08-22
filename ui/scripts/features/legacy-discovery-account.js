function findTrendByRowIndex(rowIndex) {
  return (blogTrendsCache || []).find(item => item.rowIndex === rowIndex) || null;
}

function getPageInfo(type) {
  return blogPageState[type] || { limit: 50, offset: 0, total: 0 };
}

function setPageInfo(type, patch = {}) {
  const current = getPageInfo(type);
  blogPageState[type] = {
    ...current,
    ...patch
  };
}

function getPageSummary(total, limit, offset) {
  const safeTotal = Math.max(0, Number(total || 0));
  const safeLimit = Math.max(1, Number(limit || 50));
  const pageCount = Math.max(1, Math.ceil(safeTotal / safeLimit));
  const currentPage = Math.min(pageCount, Math.floor(Math.max(0, Number(offset || 0)) / safeLimit) + 1);
  return { pageCount, currentPage };
}

function renderTrendsPagination() {
  const infoEl = document.getElementById('blog-trends-page-info');
  const prevBtn = document.getElementById('blog-trends-page-prev');
  const nextBtn = document.getElementById('blog-trends-page-next');
  const pageInfo = getPageInfo('trends');
  const { pageCount, currentPage } = getPageSummary(pageInfo.total, pageInfo.limit, pageInfo.offset);
  if (infoEl) infoEl.textContent = `페이지 ${currentPage} / ${pageCount} (총 ${pageInfo.total || 0}건)`;
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= pageCount;
}

function renderTopicsPagination() {
  const infoEl = document.getElementById('blog-topics-page-info');
  const prevBtn = document.getElementById('blog-topics-page-prev');
  const nextBtn = document.getElementById('blog-topics-page-next');
  const pageInfo = getPageInfo('topics');
  const { pageCount, currentPage } = getPageSummary(pageInfo.total, pageInfo.limit, pageInfo.offset);
  if (infoEl) infoEl.textContent = `페이지 ${currentPage} / ${pageCount} (총 ${pageInfo.total || 0}건)`;
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= pageCount;
}

function renderShoppingPagination() {
  const infoEl = document.getElementById('shopping-page-info');
  const prevBtn = document.getElementById('shopping-page-prev');
  const nextBtn = document.getElementById('shopping-page-next');
  const pageInfo = getPageInfo('shopping');
  const { pageCount, currentPage } = getPageSummary(pageInfo.total, pageInfo.limit, pageInfo.offset);
  if (infoEl) infoEl.textContent = `페이지 ${currentPage} / ${pageCount} (총 ${pageInfo.total || 0}건)`;
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= pageCount;
}

function updateTrendsSelectionUi() {
  const countEl = document.getElementById('blog-trends-selected-count');
  if (countEl) countEl.textContent = `${blogTrendsSelectedRowIndices.size}건 선택`;
}

function clearTrendsSelections() {
  blogTrendsSelectedRowIndices.clear();
  const selectors = Array.from(document.querySelectorAll('input.trend-row-selector'));
  selectors.forEach(el => { el.checked = false; });
  updateTrendsSelectionUi();
}

function findShoppingByRowIndex(rowIndex) {
  return (blogShoppingCache || []).find(item => item.rowIndex === rowIndex) || null;
}

function updateShoppingSelectionUi() {
  const countEl = document.getElementById('shopping-selected-count');
  if (countEl) countEl.textContent = `${blogShoppingSelectedRowIndices.size}건 선택`;
}

function clearShoppingSelections() {
  blogShoppingSelectedRowIndices.clear();
  const selectors = Array.from(document.querySelectorAll('input.shopping-row-selector'));
  selectors.forEach(el => { el.checked = false; });
  updateShoppingSelectionUi();
}

function getSortState(tableName) {
  const target = String(tableName || '').trim();
  if (!tableSortState[target]) {
    tableSortState[target] = { key: 'rowNumber', direction: 'desc' };
  }
  return tableSortState[target];
}

function updateSortableHeadersUi() {
  const headers = Array.from(document.querySelectorAll('.data-table th.sortable'));
  headers.forEach((th) => {
    const tableName = String(th.dataset.sortTable || '').trim();
    const key = String(th.dataset.sortKey || '').trim();
    const state = getSortState(tableName);
    const isActive = state.key === key;
    th.classList.toggle('active-sort', isActive);
    th.setAttribute('data-sort-dir', isActive ? state.direction : '');
    th.setAttribute('aria-sort', isActive ? (state.direction === 'desc' ? 'descending' : 'ascending') : 'none');
    th.setAttribute('role', 'button');
    th.setAttribute('tabindex', '0');
  });
}

function toggleTableSort(tableName, key) {
  const state = getSortState(tableName);
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return;

  if (state.key === normalizedKey) {
    state.direction = state.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.key = normalizedKey;
    state.direction = 'asc';
  }
  updateSortableHeadersUi();

  if (tableName === 'trends') {
    setPageInfo('trends', { offset: 0 });
    loadBlogTrends();
    return;
  }
  if (tableName === 'topics') {
    setPageInfo('topics', { offset: 0 });
    loadBlogTopics();
    return;
  }
  if (tableName === 'shopping') {
    setPageInfo('shopping', { offset: 0 });
    loadBlogShopping();
    return;
  }
  if (tableName === 'trendPosting') {
    renderTrendPostingResults();
  }
}

function resetTableSort(tableName) {
  const state = getSortState(tableName);
  state.key = 'rowNumber';
  state.direction = 'desc';
  updateSortableHeadersUi();
}

function renderBlogTrendsTable(items) {
  const tbody = document.getElementById('blog-trends-table-body');
  if (!tbody) return;

  const sourceItems = Array.isArray(items) ? items : [];
  if (sourceItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">조회 결과가 없습니다.</td></tr>';
    updateTrendsSelectionUi();
    updateSortableHeadersUi();
    return;
  }

  tbody.innerHTML = sourceItems.map(item => {
    const checked = blogTrendsSelectedRowIndices.has(item.rowIndex) ? 'checked' : '';
    return `
      <tr data-row-index="${item.rowIndex}">
        <td><input type="checkbox" class="trend-row-selector" value="${item.rowIndex}" ${checked}></td>
        <td>${item.rowNumber}</td>
        <td>${escapeHtml(item.date || '-')}</td>
        <td>${escapeHtml(item.category || '-')}</td>
        <td>${escapeHtml(item.keyword || '-')}</td>
        <td>${escapeHtml(item.variation || '-')}</td>
        <td>${escapeHtml(item.status || '-')}</td>
      </tr>
    `;
  }).join('');
  const trendsSelectAll = document.getElementById('blog-trends-table-select-all');
  if (trendsSelectAll) trendsSelectAll.checked = false;
  updateTrendsSelectionUi();
  updateSortableHeadersUi();
}

async function loadBlogTrends(options = {}) {
  if (!guardUiConfigReady('Trends 조회')) return;
  const silent = Boolean(options.silent);
  const resultBox = document.getElementById('blog-trends-result');
  const pageInfo = getPageInfo('trends');
  const q = (document.getElementById('blog-trends-q-filter')?.value || '').trim();
  const params = new URLSearchParams();
  const sortState = getSortState('trends');
  if (q) params.set('q', q);
  params.set('limit', String(pageInfo.limit));
  params.set('offset', String(pageInfo.offset));
  params.set('sortBy', String(sortState.key || 'rowNumber'));
  params.set('sortDir', String(sortState.direction || 'desc'));
  if (resultBox && !silent) resultBox.textContent = 'Trends 조회 중...';

  try {
    const data = await fetchJson(`/api/v1/trends/items?${params.toString()}`);
    blogTrendsCache = Array.isArray(data.items) ? data.items : [];
    setPageInfo('trends', {
      total: Number(data.total || 0),
      limit: Number(data.limit || pageInfo.limit || 50),
      offset: Number(data.offset || 0)
    });
    renderBlogTrendsTable(blogTrendsCache);
    renderTrendsPagination();
    if (resultBox && !silent) resultBox.textContent = `조회 완료: ${data.total ?? blogTrendsCache.length}건`;
  } catch (e) {
    blogTrendsCache = [];
    renderBlogTrendsTable([]);
    renderTrendsPagination();
    if (resultBox && !silent) resultBox.textContent = `오류: ${e.message}`;
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatYmd(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getKstDateParts(baseDate = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(baseDate);

  const year = Number(parts.find(p => p.type === 'year')?.value || 0);
  const month = Number(parts.find(p => p.type === 'month')?.value || 0);
  const day = Number(parts.find(p => p.type === 'day')?.value || 0);
  return { year, month, day };
}

function isValidYmd(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year
    && d.getUTCMonth() + 1 === month
    && d.getUTCDate() === day;
}

function shiftKstDays(days) {
  const { year, month, day } = getKstDateParts(new Date());
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + Number(days || 0));
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
}

function resolveTrendCollectDateYmd(rawInput) {
  const input = String(rawInput || '').trim();
  if (!input) return shiftKstDays(-1);

  const lower = input.toLowerCase();
  if (lower === 'yesterday' || input === '어제') return shiftKstDays(-1);

  const relativeMatch = lower.match(/^-(\d{1,3})d$/);
  if (relativeMatch) {
    const days = Number(relativeMatch[1]);
    if (!Number.isInteger(days) || days < 1) {
      throw new Error('상대 날짜는 -1d, -2d 형식으로 입력하세요.');
    }
    return shiftKstDays(-days);
  }

  const compactMatch = input.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const year = Number(compactMatch[1]);
    const month = Number(compactMatch[2]);
    const day = Number(compactMatch[3]);
    if (!isValidYmd(year, month, day)) {
      throw new Error('유효하지 않은 날짜입니다.');
    }
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  const dashedMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dashedMatch) {
    const year = Number(dashedMatch[1]);
    const month = Number(dashedMatch[2]);
    const day = Number(dashedMatch[3]);
    if (!isValidYmd(year, month, day)) {
      throw new Error('유효하지 않은 날짜입니다.');
    }
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  throw new Error('날짜 형식이 올바르지 않습니다. (예: 2026-02-18, 20260218, yesterday, -1d)');
}

async function checkTrendDateAlreadyCollected(targetDateYmd) {
  const limit = 200;
  let offset = 0;
  let guard = 0;

  while (guard < 20) {
    const params = new URLSearchParams({
      q: targetDateYmd,
      limit: String(limit),
      offset: String(offset)
    });
    const data = await fetchJson(`/api/v1/trends/items?${params.toString()}`);
    const items = Array.isArray(data?.items) ? data.items : [];
    const exists = items.some(item => String(item?.date || '').trim() === targetDateYmd);
    if (exists) return true;

    const total = Number(data?.total || 0);
    if (items.length <= 0 || offset + items.length >= total) {
      return false;
    }
    offset += items.length;
    guard += 1;
  }
  return false;
}

async function runBlogTrendsCollect() {
  if (!guardUiConfigReady('트렌드 수집')) return;
  if (blogTrendsCollectInFlight) return;
  const resultBox = document.getElementById('blog-trends-result');
  const rawDateInput = String(document.getElementById('blog-trends-date')?.value || '').trim();
  let targetDateYmd = '';
  try {
    targetDateYmd = resolveTrendCollectDateYmd(rawDateInput);
    if (!targetDateYmd) throw new Error('날짜 해석에 실패했습니다.');
  } catch (e) {
    if (resultBox) resultBox.textContent = `오류: ${e.message}`;
    return;
  }

  let alreadyCollected = false;
  try {
    alreadyCollected = await checkTrendDateAlreadyCollected(targetDateYmd);
  } catch (e) {
    // 중복 확인 실패는 수집 자체를 막지 않는다.
    console.warn('트렌드 날짜 중복 확인 실패:', e);
  }
  const confirmLines = [`${targetDateYmd} 기준으로 트렌드 수집을 진행하시겠습니까?`];
  if (alreadyCollected) {
    confirmLines.push('');
    confirmLines.push('이미 수집된 날짜가 확인되었습니다. 계속 진행하면 중복 데이터가 추가될 수 있습니다.');
  }
  const confirmMessage = confirmLines.join('\n');

  const shouldProceed = await showUiConfirm(confirmMessage, {
    title: '트렌드 수집 확인',
    confirmText: '진행',
    cancelText: '취소'
  });
  if (shouldProceed !== true) {
    return;
  }

  blogTrendsCollectInFlight = true;
  if (resultBox) resultBox.textContent = `트렌드 수집 중... (기준일: ${targetDateYmd})`;
  try {
    const selectedCategories = Array.from(blogAutoCategorySelected.values())
      .map(v => String(v || '').trim())
      .filter(Boolean);
    const headless = Boolean(document.getElementById('blog-trends-headless')?.checked);
    const payload = {
      date: targetDateYmd,
      headless,
      ...(selectedCategories.length > 0 ? { categories: selectedCategories } : {})
    };
    const data = await postJson('/api/v1/trends/collect', payload);
    if (resultBox) resultBox.textContent = JSON.stringify(data, null, 2);
    clearTrendsSelections();
    setPageInfo('trends', { offset: 0 });
    await Promise.all([
      loadDashboard(),
      loadBlogTrends({ silent: true }),
      loadBlogAutoCategoryCatalog({ force: true, silent: true })
    ]);
  } catch (e) {
    if (resultBox) resultBox.textContent = `오류: ${e.message}`;
  } finally {
    blogTrendsCollectInFlight = false;
  }
}

async function runTrendsToTopics() {
  if (!guardUiConfigReady('Trends → Topics')) return;
  const resultBox = document.getElementById('blog-trends-result');
  const rowIndices = Array.from(blogTrendsSelectedRowIndices.values()).filter(v => Number.isInteger(v));
  if (rowIndices.length === 0) {
    if (resultBox) resultBox.textContent = '먼저 Topics에 보낼 Trends 행을 1개 이상 선택하세요.';
    return;
  }

  if (resultBox) resultBox.textContent = `Trends → Topics 처리 중... (${rowIndices.length}건)`;
  try {
    const data = await postJson('/api/v1/trends/to-topics', { rowIndices });
    if (resultBox) resultBox.textContent = JSON.stringify(data, null, 2);
    clearTrendsSelections();
    await Promise.all([loadBlogTrends({ silent: true }), loadBlogTopics({ silent: true })]);
  } catch (e) {
    if (resultBox) resultBox.textContent = `오류: ${e.message}`;
  }
}

function activateBlogTab(tabName, options = {}) {
  console.log("=== activateBlogTab CALLED ===", tabName);
  const allowed = ['quick', 'trend-posting', 'trends', 'topics', 'comment-draft', 'collect', 'auto'];
  const target = allowed.includes(String(tabName)) ? String(tabName) : 'quick';
  blogActiveTab = target;

  const tabButtons = Array.from(document.querySelectorAll('.blog-tab-btn'));
  const tabPanels = Array.from(document.querySelectorAll('.blog-tab-panel'));
  tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.blogTab === target));
  tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === `blog-tab-${target}`));
  syncScopedMajorSaveActions();

  const forceReload = options.forceReload !== false;
  if (!forceReload) return;

  if (target === 'quick') {
    return;
  }

  if (target === 'trend-posting') {
    void loadTrendPostingMeta();
    return;
  }
  if (target === 'trends') {
    loadBlogTrends();
    return;
  }
  if (target === 'topics') {
    console.log("activateBlogTab: calling loadBlogTopics()");
    loadBlogTopics();
    console.log("activateBlogTab: loading categories");
    fetchWpCategories().then(() => {
      populateFilterWpCategoryDropdown('blog-status-filter-wp-category', globalWpCategoryCache || categoryCache);
      console.log("activateBlogTab: categories populated");
    }).catch(e => console.error("WP Category Load Error:", e));
    return;
  }
  if (target === 'comment-draft') {
    loadNaverCommentDraftSettings();
    return;
  }
  if (target === 'collect') {
    loadBlogCollectSettings();
    return;
  }
  if (target === 'auto') {
    loadBlogAutoSettings();
    return;
  }
}

function applyQuickInputMode(mode) {
  const nextMode = ['ai', 'manuscript', 'pasted'].includes(mode) ? mode : 'ai';
  quickInputMode = nextMode;
  localStorage.setItem('quick_input_mode', quickInputMode);
  document.getElementById('quick-mode-ai-btn')?.classList.toggle('is-active', quickInputMode === 'ai');
  document.getElementById('quick-mode-manuscript-btn')?.classList.toggle('is-active', quickInputMode === 'manuscript');
  document.getElementById('quick-mode-pasted-btn')?.classList.toggle('is-active', quickInputMode === 'pasted');
  const aiPanel = document.getElementById('quick-ai-mode-panel');
  const manuscriptPanel = document.getElementById('quick-manuscript-mode-panel');
  const pastedPanel = document.getElementById('quick-pasted-mode-panel');
  if (aiPanel) aiPanel.hidden = quickInputMode !== 'ai';
  if (manuscriptPanel) manuscriptPanel.hidden = quickInputMode !== 'manuscript';
  if (pastedPanel) pastedPanel.hidden = quickInputMode !== 'pasted';
}

function getActiveQuickTrendContext() {
  if (!quickTrendTopicContext) return null;
  const subject = String(document.getElementById('quick-subject')?.value || '').trim();
  const keywords = String(document.getElementById('quick-keywords')?.value || '').trim();
  if (subject !== quickTrendTopicContext.subject || keywords !== quickTrendTopicContext.keyword) return null;
  return quickTrendTopicContext;
}

function getActiveQuickRecommendationContext() {
  if (!quickRecommendationTopicContext) return null;
  const subject = String(document.getElementById('quick-subject')?.value || '').trim();
  const keywords = String(document.getElementById('quick-keywords')?.value || '').trim();
  if (subject !== quickRecommendationTopicContext.subject || keywords !== quickRecommendationTopicContext.keywordsText) return null;
  return quickRecommendationTopicContext;
}

function syncQuickTopicOrigin() {
  const originEl = document.getElementById('quick-topic-origin');
  if (!originEl) return;
  const trendContext = getActiveQuickTrendContext();
  const recommendationContext = getActiveQuickRecommendationContext();
  const context = trendContext || recommendationContext;
  originEl.hidden = !context;
  originEl.textContent = trendContext
    ? `네이버 트렌드 글감 · ${trendContext.trendDate}`
    : (recommendationContext ? `추천 글감 · ${recommendationContext.topicSeed || recommendationContext.subject}` : '');
}

function handleQuickTopicIdentityInput() {
  if (quickTrendTopicContext && !getActiveQuickTrendContext()) {
    quickTrendTopicContext = null;
  }
  if (quickRecommendationTopicContext && !getActiveQuickRecommendationContext()) {
    quickRecommendationTopicContext = null;
  }
  syncQuickTopicOrigin();
}

function getQuickRecommendationSourceLabel(item = {}) {
  if (String(item?.source || '').trim() === 'fallback') return '기본 추천';
  const refs = Array.isArray(item?.recommendation?.source_refs) ? item.recommendation.source_refs : [];
  if (refs.some((ref) => String(ref?.kind || '').toLowerCase() === 'request')) return '입력 힌트 기반';
  if (refs.some((ref) => ['trends', 'knowledge'].includes(String(ref?.kind || '').toLowerCase()))) return '트렌드와 연결';
  if (refs.some((ref) => ['topic', 'facet'].includes(String(ref?.kind || '').toLowerCase()))) return '관심 주제와 연결';
  return '내 글쓰기 기반';
}

function setQuickDiscoveryModalOpen(open) {
  const modal = document.getElementById('quick-discovery-modal');
  if (!modal) return;
  if (open) {
    quickTopicRecommendationState.smartUsageSessionId = createSmartUsageSessionId();
    quickKeywordDiscoveryState.smartUsageSessionId = createSmartUsageSessionId();
    refreshSmartUsageHints();
  }
  modal.classList.toggle('hidden', !open);
  modal.setAttribute('aria-hidden', String(!open));
}

function createSmartUsageSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `smart-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getSmartUsageItem(capability) {
  const items = Array.isArray(lastAccountOverview?.smart_usage?.items)
    ? lastAccountOverview.smart_usage.items
    : [];
  return items.find((item) => String(item?.capability || '') === capability) || null;
}

function formatSmartUsageHint(capability) {
  const item = getSmartUsageItem(capability);
  if (!item || !Number.isFinite(Number(item.limit))) return '';
  return `${Math.max(0, Number(item.remaining) || 0)} / ${Math.max(0, Number(item.limit))}회 남음`;
}

function refreshSmartUsageHints() {
  setText('quick-topic-smart-usage', formatSmartUsageHint('content_idea'));
  setText('quick-keyword-smart-usage', formatSmartUsageHint('keyword_discovery'));
  setText('quick-title-smart-usage', formatSmartUsageHint('title_recommendation'));
}

function applySmartUsageUpdate(usage) {
  if (!usage?.capability || !lastAccountOverview?.smart_usage) return;
  const items = Array.isArray(lastAccountOverview.smart_usage.items)
    ? lastAccountOverview.smart_usage.items
    : [];
  const index = items.findIndex((item) => String(item?.capability || '') === String(usage.capability));
  const next = { ...usage };
  if (index >= 0) items[index] = { ...items[index], ...next };
  else items.push(next);
  lastAccountOverview.smart_usage.items = items;
  refreshSmartUsageHints();
}

function setQuickDiscoveryTab(tab) {
  const activeTab = tab === 'keyword' ? 'keyword' : 'topic';
  document.querySelectorAll('[data-quick-discovery-tab]').forEach((button) => {
    const selected = button.dataset.quickDiscoveryTab === activeTab;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  const topicPanel = document.getElementById('quick-discovery-topic-panel');
  const keywordPanel = document.getElementById('quick-discovery-keyword-panel');
  if (topicPanel) topicPanel.hidden = activeTab !== 'topic';
  if (keywordPanel) keywordPanel.hidden = activeTab !== 'keyword';
}

function diversifyQuickTopicRecommendations(items = [], limit = 3) {
  const sourceOrder = ['입력 힌트 기반', '트렌드와 연결', '관심 주제와 연결', '내 글쓰기 기반'];
  const remaining = Array.isArray(items) ? items.slice() : [];
  const selected = [];

  sourceOrder.forEach((source) => {
    const index = remaining.findIndex((item) => getQuickRecommendationSourceLabel(item) === source);
    if (index < 0) return;
    selected.push(remaining.splice(index, 1)[0]);
  });

  return selected.concat(remaining).slice(0, Math.max(1, Number(limit) || 3));
}

function renderQuickTopicRecommendations() {
  const statusEl = document.getElementById('quick-topic-recommendations-status');
  const progressEl = document.getElementById('quick-topic-recommendations-progress');
  const listEl = document.getElementById('quick-topic-recommendations-list');
  const refreshBtn = document.getElementById('quick-topic-recommendations-refresh');
  if (!statusEl || !listEl) return;
  if (refreshBtn) {
    refreshBtn.disabled = quickTopicRecommendationState.loading;
    refreshBtn.setAttribute('aria-busy', String(quickTopicRecommendationState.loading));
  }
  syncQuickDiscoveryClearControl({
    inputId: 'quick-topic-recommendations-query',
    clearId: 'quick-topic-recommendations-clear',
    loading: quickTopicRecommendationState.loading
  });
  if (quickTopicRecommendationState.loading) {
    statusEl.hidden = true;
    if (progressEl) progressEl.hidden = false;
    listEl.innerHTML = '';
    return;
  }
  if (progressEl) progressEl.hidden = true;
  const items = diversifyQuickTopicRecommendations(quickTopicRecommendationState.items);
  if (items.length === 0) {
    statusEl.hidden = false;
    if (refreshBtn) refreshBtn.textContent = quickTopicRecommendationState.loaded ? '다른 글감 추천' : '글감 추천';
    statusEl.textContent = quickTopicRecommendationState.error
      ? `추천을 불러오지 못했습니다: ${quickTopicRecommendationState.error}`
      : (quickTopicRecommendationState.loaded
      ? '지금 바로 드릴 추천이 없습니다. 다른 추천을 눌러 다시 살펴보세요.'
      : '버튼을 누르면 최근 글쓰기와 관심 주제를 바탕으로 글감을 찾아드립니다.');
    listEl.innerHTML = '';
    return;
  }
  if (refreshBtn) refreshBtn.textContent = '다른 글감 추천';
  statusEl.hidden = true;
  listEl.innerHTML = items.map((item, index) => {
    const keywords = Array.isArray(item.keywords) ? item.keywords.slice(0, 4).join(' · ') : '';
    return `
      <article class="quick-topic-recommendation-row" data-recommendation-id="${escapeHtml(item.id || String(index))}">
        <div class="quick-topic-recommendation-main">
          <span class="quick-topic-recommendation-source">${escapeHtml(getQuickRecommendationSourceLabel(item))}</span>
          <strong>${escapeHtml(item.title || '')}</strong>
          ${keywords ? `<span class="quick-topic-recommendation-keywords">${escapeHtml(keywords)}</span>` : ''}
          <button class="quick-topic-recommendation-reason-toggle" type="button" data-recommendation-action="reason" aria-expanded="false">추천 근거</button>
          <p class="quick-topic-recommendation-reason" hidden>${escapeHtml(item.reason || item.summary || '최근 활동과 관심 신호를 바탕으로 추천했습니다.')}</p>
        </div>
        <div class="quick-topic-recommendation-actions">
          <button class="primary" type="button" data-recommendation-action="quick">글감 선택</button>
          <button class="quick-topic-recommendation-dismiss" type="button" data-recommendation-action="dismiss" aria-label="이 추천이 도움되지 않음">×</button>
        </div>
      </article>`;
  }).join('');
}

function formatQuickKeywordMetric(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value))
    ? Number(value).toLocaleString()
    : '-';
}

function formatQuickKeywordRoundedMetric(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value))
    ? Math.round(Number(value)).toLocaleString()
    : '-';
}

function formatKeywordOpportunityMetric(item = {}) {
  const exact = item.opportunity?.estimated_weekly_searches_per_new_document;
  if (exact !== null && exact !== undefined && Number.isFinite(Number(exact))) {
    return Number(exact).toFixed(1);
  }
  const upperBound = item.opportunity?.max_estimated_weekly_searches_per_new_document;
  if (upperBound !== null && upperBound !== undefined && Number.isFinite(Number(upperBound))) {
    return `${Number(upperBound).toFixed(1)} 이하`;
  }
  return '-';
}

function getQuickKeywordSelectionKey(item = {}) {
  return String(item?.keyword || '').replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
}

function getQuickKeywordCompetition(item = {}) {
  const documents = item.weekly_new_blog_documents || {};
  if (documents.capped) return { label: '300+ 제외', className: 'capped' };
  const level = item.competition_strength?.level;
  if (!level) return { label: '측정 불가', className: 'incomplete' };
  return {
    label: level,
    className: level === '낮음' ? 'low' : (level === '높음' ? 'high' : 'medium')
  };
}

function renderQuickKeywordDiscovery() {
  const statusEl = document.getElementById('quick-keyword-discovery-status');
  const progressEl = document.getElementById('quick-keyword-discovery-progress');
  const contentEl = document.getElementById('quick-keyword-discovery-content');
  if (!statusEl || !contentEl) return;
  syncQuickKeywordDiscoveryControls();
  if (quickKeywordDiscoveryState.loading) {
    statusEl.hidden = true;
    if (progressEl) progressEl.hidden = false;
    contentEl.innerHTML = '';
    return;
  }
  if (progressEl) progressEl.hidden = true;
  const analysis = quickKeywordDiscoveryState.analysis;
  const items = analysis
    ? [...(analysis.input_keywords || []), ...(analysis.related_candidates || [])]
    : [];
  if (items.length === 0) {
    statusEl.hidden = false;
    statusEl.textContent = quickKeywordDiscoveryState.error
      ? `키워드 지표를 불러오지 못했습니다: ${quickKeywordDiscoveryState.error}`
      : (quickKeywordDiscoveryState.loaded
        ? '지금은 살펴볼 키워드가 없습니다. 잠시 후 다시 시도해 주세요.'
        : '키워드 탐색을 누르면 최근 신호와 네이버 지표를 불러옵니다.');
    contentEl.innerHTML = '';
    return;
  }
  statusEl.hidden = true;
  const selectedKeys = new Set(quickKeywordDiscoveryState.selectedKeywordKeys);
  const selectedItems = items.filter((item) => selectedKeys.has(getQuickKeywordSelectionKey(item)));
  contentEl.innerHTML = `
    <section class="quick-keyword-discovery-results">
      <div class="quick-keyword-discovery-selection-bar">
        <div>
          <strong>선택 키워드 <span>${selectedItems.length}/3</span></strong>
          <p>최근 7일 검색 수요와 신규 문서 수를 비교해 최대 3개까지 고를 수 있어요.</p>
        </div>
        <button id="quick-keyword-discovery-apply" class="primary" type="button" ${selectedItems.length === 0 ? 'disabled' : ''}>선택 키워드 적용</button>
      </div>
      <div class="keyword-metrics-table-wrap">
        <table class="keyword-metrics-table">
          <thead>
            <tr>
              <th class="quick-keyword-discovery-select-column">선택</th>
              <th>키워드</th>
              <th>출처</th>
              <th>월간 검색수 (모바일 / PC)</th>
              <th>주간 검색수 (추정)</th>
              <th>최근 7일 신규 문서</th>
              <th>경쟁강도</th>
              <th title="추정 주간 검색 수를 최근 7일 신규 문서 수로 나눈 값입니다. 문서 수가 300+이면 계산 가능한 최대값을 'N 이하'로 표시합니다.">기회지수</th>
              <th class="quick-keyword-discovery-action-column">탐색</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, index) => {
              const volume = item.monthly_search_volume || {};
              const documents = item.weekly_new_blog_documents || {};
              const competition = getQuickKeywordCompetition(item);
              const selectionKey = getQuickKeywordSelectionKey(item);
              return `
                <tr data-quick-discovery-keyword-index="${index}">
                  <td class="quick-keyword-discovery-select-column"><input class="quick-keyword-discovery-checkbox" type="checkbox" data-quick-discovery-keyword-index="${index}" ${selectedKeys.has(selectionKey) ? 'checked' : ''} aria-label="${escapeHtml(item.keyword || '')} 선택"></td>
                  <td><strong>${escapeHtml(item.keyword || '')}</strong>${item.is_input_keyword ? ' <span class="keyword-input-badge">시작</span>' : ''}</td>
                  <td><span class="quick-keyword-discovery-source">${item.is_input_keyword ? '직접' : '연관'}</span></td>
                  <td><strong>${formatQuickKeywordMetric(volume.total)}</strong> (${formatQuickKeywordMetric(volume.mobile)} / ${formatQuickKeywordMetric(volume.pc)})</td>
                  <td>${formatQuickKeywordRoundedMetric(item.estimated_weekly_search_volume)}</td>
                  <td>${documents.count !== null && documents.count !== undefined ? `${formatQuickKeywordMetric(documents.count)}${documents.capped ? '+' : ''}건` : '-'}</td>
                  <td><span class="comp-badge ${competition.className}">${escapeHtml(competition.label)}</span></td>
                  <td>${formatKeywordOpportunityMetric(item)}</td>
                  <td class="quick-keyword-discovery-action-column">
                    <div class="quick-keyword-discovery-actions">
                      <button class="quick-keyword-discovery-research" type="button" data-quick-discovery-keyword-index="${index}">재탐색</button>
                    </div>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </section>`;
  contentEl.querySelectorAll('.quick-keyword-discovery-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => {
      const index = Number(event.currentTarget.dataset.quickDiscoveryKeywordIndex);
      const item = items[index];
      const key = getQuickKeywordSelectionKey(item);
      if (!key) return;
      const nextKeys = new Set(quickKeywordDiscoveryState.selectedKeywordKeys);
      if (event.currentTarget.checked) {
        if (nextKeys.size >= 3) {
          event.currentTarget.checked = false;
          showUiPopup('키워드는 최대 3개까지 선택할 수 있습니다.');
          return;
        }
        nextKeys.add(key);
      } else {
        nextKeys.delete(key);
      }
      quickKeywordDiscoveryState.selectedKeywordKeys = [...nextKeys];
      renderQuickKeywordDiscovery();
    });
  });
  contentEl.querySelector('#quick-keyword-discovery-apply')?.addEventListener('click', async (event) => {
    const applyButton = event.currentTarget;
    if (selectedItems.length === 0) return;
    applyButton.disabled = true;
    try {
      const applied = await applyQuickKeywordDiscovery(selectedItems);
      if (applied) setQuickDiscoveryModalOpen(false);
    } finally {
      applyButton.disabled = false;
    }
  });
  contentEl.querySelectorAll('.quick-keyword-discovery-research').forEach((button) => {
    button.addEventListener('click', () => {
      const item = items[Number(button.dataset.quickDiscoveryKeywordIndex)];
      const keyword = String(item?.keyword || '').trim();
      if (!keyword) return;
      const input = document.getElementById('quick-keyword-discovery-query');
      if (input) input.value = keyword;
      syncQuickKeywordDiscoveryControls();
      void loadQuickKeywordDiscovery({ keywords: [keyword] });
    });
  });
}

function parseQuickKeywordDiscoveryInput(value) {
  const seen = new Set();
  return String(value || '')
    .split(',')
    .map((keyword) => keyword.trim())
    .filter((keyword) => {
      const key = keyword.replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

function syncQuickDiscoveryClearControl({ inputId, clearId, loading = false } = {}) {
  const input = document.getElementById(inputId);
  const clearButton = document.getElementById(clearId);
  const hasInput = Boolean(String(input?.value || '').trim());
  if (!clearButton) return hasInput;
  clearButton.disabled = Boolean(loading) || !hasInput;
  clearButton.hidden = !hasInput;
  return hasInput;
}

function syncQuickKeywordDiscoveryControls() {
  const findButton = document.getElementById('quick-keyword-discovery-search');
  const hasInput = syncQuickDiscoveryClearControl({
    inputId: 'quick-keyword-discovery-query',
    clearId: 'quick-keyword-discovery-clear',
    loading: quickKeywordDiscoveryState.loading
  });
  if (findButton) {
    findButton.disabled = quickKeywordDiscoveryState.loading;
    findButton.setAttribute('aria-busy', String(quickKeywordDiscoveryState.loading));
    findButton.textContent = hasInput
      ? '키워드 검색'
      : (quickKeywordDiscoveryState.loaded ? '다른 키워드 탐색' : '키워드 탐색');
    findButton.title = hasInput
      ? '입력한 키워드에서 연관 키워드와 네이버 지표를 찾습니다.'
      : '최근 트렌드, 관심 주제, 최근 글쓰기에서 자동으로 키워드를 찾습니다.';
  }
}

async function loadQuickKeywordDiscovery({ keywords = [], refresh = false } = {}) {
  if (quickKeywordDiscoveryState.loading) return;
  quickKeywordDiscoveryState.loading = true;
  quickKeywordDiscoveryState.error = '';
  quickKeywordDiscoveryState.selectedKeywordKeys = [];
  renderQuickKeywordDiscovery();
  try {
    const params = new URLSearchParams();
    const requestedKeywords = parseQuickKeywordDiscoveryInput(keywords);
    if (requestedKeywords.length > 0) {
      params.set('keywords', requestedKeywords.join(','));
    } else if (refresh) {
      const previousSeeds = Array.isArray(quickKeywordDiscoveryState.analysis?.discovery_seeds)
        ? quickKeywordDiscoveryState.analysis.discovery_seeds.map((seed) => String(seed?.keyword || '').trim()).filter(Boolean)
        : [];
      if (previousSeeds.length > 0) params.set('exclude', previousSeeds.join(','));
    }
    params.set('session_id', quickKeywordDiscoveryState.smartUsageSessionId || createSmartUsageSessionId());
    params.set('operation_id', createSmartUsageSessionId());
    const query = params.toString();
    quickKeywordDiscoveryState.analysis = await fetchJson(`/api/v1/blog/keyword-discovery${query ? `?${query}` : ''}`);
    quickKeywordDiscoveryState.smartUsageSessionId = quickKeywordDiscoveryState.analysis?.smart_usage_session_id
      || quickKeywordDiscoveryState.smartUsageSessionId;
    applySmartUsageUpdate(quickKeywordDiscoveryState.analysis?.smart_usage);
    quickKeywordDiscoveryState.loaded = true;
  } catch (error) {
    quickKeywordDiscoveryState.analysis = null;
    quickKeywordDiscoveryState.loaded = true;
    quickKeywordDiscoveryState.error = error.message;
  } finally {
    quickKeywordDiscoveryState.loading = false;
    renderQuickKeywordDiscovery();
  }
}

async function loadQuickTopicRecommendations({ refresh = false } = {}) {
  const topicQuery = String(document.getElementById('quick-topic-recommendations-query')?.value || '').trim();
  if (quickTopicRecommendationState.loading
    || (quickTopicRecommendationState.loaded && !refresh && quickTopicRecommendationState.query === topicQuery)) return;
  quickTopicRecommendationState.loading = true;
  document.getElementById('quick-topic-recommendations-refresh')?.setAttribute('disabled', '');
  quickTopicRecommendationState.error = '';
  renderQuickTopicRecommendations();
  try {
    const params = new URLSearchParams({ limit: '3' });
    if (refresh) params.set('refresh', '1');
    if (topicQuery) params.set('query', topicQuery);
    params.set('session_id', quickTopicRecommendationState.smartUsageSessionId || createSmartUsageSessionId());
    params.set('operation_id', createSmartUsageSessionId());
    const result = await fetchJson(`/api/v1/blog/topic-recommendations?${params.toString()}`);
    quickTopicRecommendationState.items = Array.isArray(result?.ideas) ? result.ideas.slice(0, 3) : [];
    quickTopicRecommendationState.loaded = true;
    quickTopicRecommendationState.query = topicQuery;
    quickTopicRecommendationState.smartUsageSessionId = result?.smart_usage_session_id
      || quickTopicRecommendationState.smartUsageSessionId;
    applySmartUsageUpdate(result?.smart_usage);
  } catch (error) {
    quickTopicRecommendationState.items = [];
    quickTopicRecommendationState.loaded = true;
    quickTopicRecommendationState.query = topicQuery;
    quickTopicRecommendationState.error = error.message;
  } finally {
    quickTopicRecommendationState.loading = false;
    renderQuickTopicRecommendations();
  }
}

async function recordQuickTopicRecommendationOutcome(item, stage, extra = {}) {
  if (!item?.recommendation?.run_id || !item?.recommendation?.candidate_id) return;
  try {
    await postJson('/api/v1/blog/topic-recommendations/outcome', {
      stage,
      subject: item.title,
      recommendation: item.recommendation,
      ...extra
    });
  } catch (error) {
    console.warn('[TopicRecommendation] outcome 저장 실패:', error.message);
  }
}

async function applyQuickTopicRecommendation(item) {
  if (!item) return false;
  const values = ['quick-subject', 'quick-keywords', 'quick-title', 'quick-instruction', 'quick-reference-url']
    .map((id) => String(document.getElementById(id)?.value || '').trim());
  const activeContext = getActiveQuickRecommendationContext();
  const same = activeContext?.id === String(item.id || '');
  if (!same && values.some(Boolean)) {
    const confirmed = await showUiConfirm(
      '빠른 포스팅에 작성 중인 내용이 있습니다. 선택한 추천 글감으로 교체할까요?',
      { title: '추천 글감으로 교체', confirmText: '교체', cancelText: '취소' }
    );
    if (!confirmed) return false;
  }
  applyQuickInputMode('ai');
  const keywordsText = Array.isArray(item.keywords) ? item.keywords.join(', ') : '';
  // A newly selected topic starts a new draft; do not keep a title from the previous one.
  document.getElementById('quick-title').value = '';
  document.getElementById('quick-subject').value = String(item.title || '').trim();
  document.getElementById('quick-keywords').value = keywordsText;
  document.getElementById('quick-instruction').value = String(item.summary || '').trim();
  document.getElementById('quick-reference-url').value = '';
  quickTrendTopicContext = null;
  quickRecommendationTopicContext = {
    id: String(item.id || ''),
    subject: String(item.title || '').trim(),
    keywordsText,
    topicSeed: String(item?.recommendation?.topic_seed || '').trim(),
    recommendation: item.recommendation
  };
  syncQuickTopicOrigin();
  await recordQuickTopicRecommendationOutcome(item, 'selected');
  document.getElementById('quick-subject')?.focus();
  return true;
}

async function applyQuickKeywordDiscovery(input) {
  const selectedItems = (Array.isArray(input) ? input : [input])
    .filter((item, index, values) => {
      const key = getQuickKeywordSelectionKey(item);
      return key && values.findIndex((value) => getQuickKeywordSelectionKey(value) === key) === index;
    })
    .slice(0, 3);
  const keywords = selectedItems.map((item) => String(item?.keyword || '').trim()).filter(Boolean);
  if (keywords.length === 0) return false;
  const values = ['quick-subject', 'quick-keywords', 'quick-title', 'quick-instruction', 'quick-reference-url']
    .map((id) => String(document.getElementById(id)?.value || '').trim());
  if (values.some(Boolean)) {
    const confirmed = await showUiConfirm(
      '빠른 포스팅에 작성 중인 내용이 있습니다. 선택한 키워드로 새 글을 시작할까요?',
      { title: '선택 키워드로 교체', confirmText: '교체', cancelText: '취소' }
    );
    if (!confirmed) return false;
  }
  applyQuickInputMode('ai');
  document.getElementById('quick-title').value = '';
  document.getElementById('quick-subject').value = keywords[0];
  document.getElementById('quick-keywords').value = keywords.join(', ');
  document.getElementById('quick-instruction').value = '';
  document.getElementById('quick-reference-url').value = '';
  quickTrendTopicContext = null;
  quickRecommendationTopicContext = null;
  syncQuickTopicOrigin();
  document.getElementById('quick-subject')?.focus();
  return true;
}

function formatTrendPostingDateLabel(value) {
  const parts = String(value || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return String(value || '');
  return `${parts[1]}월 ${parts[2]}일`;
}

function subtractTrendPostingDays(ymd, days) {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function getSelectedTrendPostingCategories() {
  return Array.from(document.querySelectorAll('[data-trend-posting-category].active'))
    .map((button) => String(button.dataset.category || '').trim())
    .filter(Boolean);
}

function syncTrendPostingCategoryLimit() {
  const selected = getSelectedTrendPostingCategories();
  const atLimit = selected.length >= 5;
  document.querySelectorAll('[data-trend-posting-category]').forEach((button) => {
    button.disabled = atLimit && !button.classList.contains('active');
  });
  const countEl = document.getElementById('trend-posting-category-count');
  const hintEl = document.getElementById('trend-posting-category-hint');
  if (countEl) countEl.textContent = `${selected.length}/5`;
  if (hintEl) hintEl.textContent = atLimit
    ? '최대 5개를 선택했습니다. 다른 카테고리를 선택하려면 하나를 해제하세요.'
    : '최대 5개까지 선택할 수 있습니다.';
}

function syncTrendPostingPeriodUi() {
  const isCustom = document.getElementById('trend-posting-period')?.value === 'custom';
  const customEl = document.getElementById('trend-posting-custom-dates');
  if (customEl) customEl.hidden = !isCustom;
}

function resolveTrendPostingDateRange() {
  const latest = String(trendPostingState.meta?.dateRange?.max || '').trim();
  const period = document.getElementById('trend-posting-period')?.value || 'latest';
  if (period === 'custom') {
    return {
      dateFrom: String(document.getElementById('trend-posting-date-from')?.value || '').trim(),
      dateTo: String(document.getElementById('trend-posting-date-to')?.value || '').trim()
    };
  }
  return {
    dateFrom: period === '7days' ? subtractTrendPostingDays(latest, 6) : latest,
    dateTo: latest
  };
}

function renderTrendPostingCategories(categories) {
  const container = document.getElementById('trend-posting-categories');
  if (!container) return;
  container.innerHTML = (Array.isArray(categories) ? categories : []).map((category, index) => `
    <button type="button" class="category-option-btn${index === 0 ? ' active' : ''}"
      data-trend-posting-category data-category="${escapeHtml(category)}"
      aria-pressed="${index === 0 ? 'true' : 'false'}">${escapeHtml(category)}</button>
  `).join('') || '<span class="category-hint">선택할 수 있는 카테고리가 없습니다.</span>';
  syncTrendPostingCategoryLimit();
}

function renderTrendPostingChange(change = {}) {
  const type = ['up', 'down', 'new', 'steady'].includes(change.type) ? change.type : 'steady';
  const fallback = { up: '상승', down: '하락', new: '신규', steady: '유지' }[type];
  return `<span class="trend-change trend-change-${type}">${escapeHtml(change.raw || fallback)}</span>`;
}

function getTrendPostingChangeSortValue(change = {}) {
  const type = String(change?.type || 'steady');
  const amount = Number(change?.amount);
  if (type === 'new') return Number.POSITIVE_INFINITY;
  if (type === 'up') return Number.isFinite(amount) ? Math.abs(amount) : 0;
  if (type === 'down') return Number.isFinite(amount) ? -Math.abs(amount) : 0;
  return 0;
}

function compareTrendPostingItems(left, right, key) {
  if (key === 'change') {
    const leftValue = getTrendPostingChangeSortValue(left?.change);
    const rightValue = getTrendPostingChangeSortValue(right?.change);
    if (leftValue !== rightValue) return leftValue < rightValue ? -1 : 1;
    return String(left?.change?.raw || '').localeCompare(String(right?.change?.raw || ''), 'ko');
  }
  if (key === 'categories') {
    const leftCategories = Array.isArray(left?.categories) ? left.categories.join(', ') : '';
    const rightCategories = Array.isArray(right?.categories) ? right.categories.join(', ') : '';
    return leftCategories.localeCompare(rightCategories, 'ko');
  }
  const leftValue = String(left?.[key] || '');
  const rightValue = String(right?.[key] || '');
  return leftValue.localeCompare(rightValue, 'ko');
}

function getTrendPostingFilterValues() {
  const keyword = String(document.getElementById('trend-posting-filter-keyword')?.value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ko-KR');
  const view = String(document.getElementById('trend-posting-filter-view')?.value || 'all');
  const excludeRecent = Boolean(document.getElementById('trend-posting-filter-exclude-recent')?.checked);
  return { keyword, view, excludeRecent };
}

function filterTrendPostingItems(items) {
  const { keyword, view, excludeRecent } = getTrendPostingFilterValues();
  let filtered = items.filter((item) => {
    const changeType = String(item?.change?.type || 'steady');
    const itemKey = String(item?.keyword || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ko-KR');
    if (keyword && !String(item?.keyword || '').toLocaleLowerCase('ko-KR').includes(keyword)) return false;
    if (excludeRecent && trendPostingState.recentTopicKeys.has(itemKey)) return false;
    if (view === 'all') return true;
    if (view === 'top10') return changeType === 'up' && Number.isFinite(Number(item?.change?.amount));
    return changeType === view;
  });
  if (view === 'top10') {
    filtered = filtered
      .map((item, index) => ({ item, index }))
      .sort((left, right) => {
        const difference = getTrendPostingChangeSortValue(right.item?.change) - getTrendPostingChangeSortValue(left.item?.change);
        return difference === 0 ? left.index - right.index : difference;
      })
      .slice(0, 10)
      .map(({ item }) => item);
  }
  return filtered;
}

async function loadRecentTrendPostingTopics() {
  if (trendPostingState.recentTopicsLoaded || trendPostingState.recentTopicsLoading) return;
  const checkbox = document.getElementById('trend-posting-filter-exclude-recent');
  const statusEl = document.getElementById('trend-posting-status');
  trendPostingState.recentTopicsLoading = true;
  if (checkbox) checkbox.disabled = true;
  try {
    const result = await fetchJson('/api/v1/trend-posting/recent-topics?days=15');
    trendPostingState.recentTopicKeys = new Set((Array.isArray(result?.keywords) ? result.keywords : [])
      .map((value) => String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ko-KR'))
      .filter(Boolean));
    trendPostingState.recentTopicsLoaded = true;
  } catch (error) {
    if (checkbox) checkbox.checked = false;
    if (statusEl) statusEl.textContent = `최근 저장 글감을 불러오지 못했습니다: ${error.message}`;
  } finally {
    trendPostingState.recentTopicsLoading = false;
    if (checkbox) checkbox.disabled = false;
    renderTrendPostingResults();
  }
}

function updateTrendPostingFilterCount(visibleCount) {
  const countEl = document.getElementById('trend-posting-filter-count');
  if (!countEl) return;
  const total = trendPostingState.items.length;
  countEl.textContent = total > 0
    ? `${total}개 중 ${visibleCount}개 표시`
    : (trendPostingState.queryRange ? '0개 중 0개 표시' : '조회 후 사용할 수 있습니다.');
}

function initTrendPostingStickyStack() {
  const panel = document.getElementById('blog-tab-trend-posting');
  const filters = document.getElementById('trend-posting-result-filters');
  if (!panel || !filters) return;
  const syncHeight = () => {
    panel.style.setProperty('--trend-posting-filter-height', `${filters.offsetHeight}px`);
  };
  syncHeight();
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(syncHeight);
    observer.observe(filters);
  } else {
    window.addEventListener('resize', syncHeight);
  }
}

function getSortedTrendPostingItems() {
  const sortState = getSortState('trendPosting');
  const direction = sortState.direction === 'desc' ? -1 : 1;
  return filterTrendPostingItems(trendPostingState.items)
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const compared = compareTrendPostingItems(left.item, right.item, sortState.key);
      return compared === 0 ? left.index - right.index : compared * direction;
    })
    .map(({ item }) => item);
}

function renderTrendPostingResults(items) {
  const body = document.getElementById('trend-posting-table-body');
  if (!body) return;
  if (Array.isArray(items)) {
    trendPostingState.items = items.slice();
    trendPostingState.itemsById = new Map(trendPostingState.items.map((item) => [String(item.id), item]));
  }
  if (trendPostingState.items.length === 0) {
    updateTrendPostingFilterCount(0);
    body.innerHTML = trendPostingState.queryRange
      ? '<tr><td colspan="5">조건에 맞는 트렌드 키워드가 없습니다.</td></tr>'
      : '<tr><td colspan="5">아직 조회하지 않았습니다.</td></tr>';
    return;
  }
  const visibleItems = getSortedTrendPostingItems();
  updateTrendPostingFilterCount(visibleItems.length);
  if (visibleItems.length === 0) {
    body.innerHTML = '<tr><td colspan="5">현재 결과 필터에 맞는 키워드가 없습니다.</td></tr>';
    return;
  }
  body.innerHTML = visibleItems.map((item) => {
    const id = String(item.id || '');
    const saved = trendPostingState.savedIds.has(`${id}:${String(item.latestTrendDate || '')}`);
    const categories = (Array.isArray(item.categories) ? item.categories : [])
      .map((category) => `<span class="trend-category-tag">${escapeHtml(category)}</span>`)
      .join('');
    return `
      <tr data-trend-posting-id="${escapeHtml(id)}">
        <td><div class="trend-category-tags">${categories}</div></td>
        <td>${escapeHtml(item.latestTrendDate)}</td>
        <td class="trend-keyword-cell">${escapeHtml(item.keyword)}</td>
        <td>${renderTrendPostingChange(item.change)}</td>
        <td>
          <div class="trend-posting-action-cell">
            <div class="trend-posting-row-actions">
              <button type="button" class="primary" data-trend-posting-action="write" data-item-id="${escapeHtml(id)}">빠른 포스팅</button>
              <button type="button" class="secondary" data-trend-posting-action="save" data-item-id="${escapeHtml(id)}"${saved ? ' disabled' : ''}>${saved ? '저장됨' : '글감 저장'}</button>
            </div>
            <span class="trend-topic-save-feedback${saved ? ' is-success' : ''}"
              data-trend-topic-save-feedback aria-live="polite">${saved ? '대기 상태로 저장됨' : ''}</span>
          </div>
        </td>
      </tr>`;
  }).join('');
}

async function loadTrendPostingMeta(options = {}) {
  if (trendPostingState.loading) return;
  if (trendPostingState.meta && options.force !== true) return;
  const statusEl = document.getElementById('trend-posting-status');
  trendPostingState.loading = true;
  if (statusEl) statusEl.textContent = '트렌드 조회 정보를 불러오는 중...';
  try {
    const meta = await fetchJson('/api/v1/trend-posting/meta');
    trendPostingState.meta = meta;
    const latest = String(meta?.dateRange?.max || '');
    const latestLabel = formatTrendPostingDateLabel(latest);
    const badge = document.getElementById('trend-posting-latest-badge');
    const period = document.getElementById('trend-posting-period');
    if (badge) badge.textContent = latestLabel ? `최신 데이터 ${latestLabel}` : '최신 날짜 없음';
    const latestOption = period?.querySelector('option[value="latest"]');
    if (latestOption) latestOption.textContent = latestLabel ? `최신 데이터 (${latestLabel})` : '최신 데이터';
    const fromEl = document.getElementById('trend-posting-date-from');
    const toEl = document.getElementById('trend-posting-date-to');
    if (fromEl) {
      fromEl.min = String(meta?.dateRange?.min || '');
      fromEl.max = latest;
      fromEl.value = latest;
    }
    if (toEl) {
      toEl.min = String(meta?.dateRange?.min || '');
      toEl.max = latest;
      toEl.value = latest;
    }
    renderTrendPostingCategories(meta?.categories || []);
    const queryBtn = document.getElementById('trend-posting-query-btn');
    if (queryBtn) queryBtn.disabled = !latest || !Array.isArray(meta?.categories) || meta.categories.length === 0;
    if (statusEl) statusEl.textContent = '기간과 트렌드 카테고리를 선택한 뒤 조회하세요.';
  } catch (error) {
    if (statusEl) statusEl.textContent = `조회 정보를 불러오지 못했습니다: ${error.message}`;
  } finally {
    trendPostingState.loading = false;
  }
}

async function queryTrendPostingKeywords() {
  if (trendPostingState.loading) return;
  const statusEl = document.getElementById('trend-posting-status');
  const queryBtn = document.getElementById('trend-posting-query-btn');
  const categories = getSelectedTrendPostingCategories();
  if (categories.length === 0) {
    await showUiPopup('트렌드 카테고리를 하나 이상 선택해 주세요.');
    return;
  }
  const { dateFrom, dateTo } = resolveTrendPostingDateRange();
  if (!dateFrom || !dateTo) {
    await showUiPopup('조회 기간을 입력해 주세요.');
    return;
  }
  const fromTime = Date.parse(`${dateFrom}T00:00:00.000Z`);
  const toTime = Date.parse(`${dateTo}T00:00:00.000Z`);
  const inclusiveDays = Math.floor((toTime - fromTime) / 86400000) + 1;
  if (!Number.isFinite(inclusiveDays) || inclusiveDays < 1) {
    await showUiPopup('시작일은 종료일보다 늦을 수 없습니다.');
    return;
  }
  if (inclusiveDays > 31) {
    await showUiPopup('직접 지정 기간은 최대 31일까지 조회할 수 있습니다.');
    return;
  }
  trendPostingState.loading = true;
  if (queryBtn) queryBtn.disabled = true;
  if (statusEl) statusEl.textContent = '트렌드 키워드를 조회하는 중...';
  try {
    const params = new URLSearchParams({ dateFrom, dateTo });
    categories.forEach((category) => params.append('categories[]', category));
    const result = await fetchJson(`/api/v1/trend-posting/keywords?${params.toString()}`);
    trendPostingState.queryRange = { dateFrom, dateTo };
    renderTrendPostingResults(result?.items || []);
    if (statusEl) statusEl.textContent = `${Number(result?.count || 0)}개의 키워드를 찾았습니다. (${dateFrom} ~ ${dateTo})`;
  } catch (error) {
    if (statusEl) statusEl.textContent = `트렌드 조회에 실패했습니다: ${error.message}`;
  } finally {
    trendPostingState.loading = false;
    if (queryBtn) queryBtn.disabled = false;
  }
}

async function openTrendTopicInQuickPosting(item) {
  if (!item) return;
  const perTopicValues = ['quick-subject', 'quick-keywords', 'quick-instruction', 'quick-reference-url']
    .map((id) => String(document.getElementById(id)?.value || '').trim());
  const activeContext = getActiveQuickTrendContext();
  const alreadyShowingSameTrend = activeContext?.id === String(item.id || '')
    && activeContext?.trendDate === String(item.latestTrendDate || '');
  if (!alreadyShowingSameTrend && perTopicValues.some(Boolean)) {
    const confirmed = await showUiConfirm(
      '빠른 포스팅에 작성 중인 글감이 있습니다. 선택한 트렌드 키워드로 교체할까요?',
      { title: '빠른 포스팅 글감 교체', confirmText: '교체', cancelText: '취소' }
    );
    if (!confirmed) return;
  }
  await navigateTo('blog', 'quick');
  if (!document.getElementById('blog-tab-quick')?.classList.contains('active')) return;
  applyQuickInputMode('ai');
  const keyword = String(item.keyword || '').trim();
  document.getElementById('quick-subject').value = keyword;
  document.getElementById('quick-keywords').value = keyword;
  document.getElementById('quick-instruction').value = '';
  document.getElementById('quick-reference-url').value = '';
  quickTrendTopicContext = {
    id: String(item.id || ''),
    subject: keyword,
    keyword,
    source: 'naver_trend',
    trendDate: String(item.latestTrendDate || '')
  };
  syncQuickTopicOrigin();
  document.getElementById('quick-subject')?.focus();
}

async function saveTrendPostingTopic(item, button) {
  if (!item || !button || button.disabled) return;
  const row = button.closest('tr');
  const feedbackEl = row?.querySelector('[data-trend-topic-save-feedback]');
  row?.classList.remove('trend-topic-save-success', 'trend-topic-save-error');
  button.disabled = true;
  button.textContent = '저장 중...';
  if (feedbackEl) {
    feedbackEl.className = 'trend-topic-save-feedback is-pending';
    feedbackEl.textContent = 'Google Spreadsheet에 저장하는 중...';
  }
  try {
    await postJson('/api/v1/trend-posting/topics', {
      keyword: item.keyword,
      trendDate: item.latestTrendDate
    });
    trendPostingState.savedIds.add(`${String(item.id)}:${String(item.latestTrendDate || '')}`);
    const savedKey = String(item.keyword || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ko-KR');
    if (savedKey) trendPostingState.recentTopicKeys.add(savedKey);
    button.textContent = '저장됨';
    row?.classList.add('trend-topic-save-success');
    if (feedbackEl) {
      feedbackEl.className = 'trend-topic-save-feedback is-success';
      feedbackEl.textContent = 'topics에 대기 상태로 저장됨';
    }
    const statusEl = document.getElementById('trend-posting-status');
    if (statusEl) statusEl.textContent = `“${item.keyword}” 글감을 대기 상태로 저장했습니다.`;
    if (document.getElementById('trend-posting-filter-exclude-recent')?.checked) {
      renderTrendPostingResults();
    }
  } catch (error) {
    button.disabled = false;
    button.textContent = '다시 시도';
    row?.classList.add('trend-topic-save-error');
    if (feedbackEl) {
      feedbackEl.className = 'trend-topic-save-feedback is-error';
      feedbackEl.textContent = `저장 실패: ${error.message}`;
    }
    const statusEl = document.getElementById('trend-posting-status');
    if (statusEl) statusEl.textContent = `글감 저장에 실패했습니다: ${error.message}`;
  }
}

function setNaverCommentDraftResultText(message) {
  naverCommentDraftStatusText = String(message || '');
  const resultEl = document.getElementById('naver-comment-draft-result');
  if (resultEl) resultEl.textContent = naverCommentDraftStatusText;
}

function getNaverCommentDraftSettingsFromUi() {
  return {
    aiMode: (document.getElementById('naver-comment-draft-ai-mode')?.value || 'default').trim(),
    fetchLimit: parseInt(document.getElementById('naver-comment-draft-fetch-limit')?.value || '10', 10) || 10,
    tone: (document.getElementById('naver-comment-draft-tone')?.value || 'empathetic').trim(),
    maxChars: parseInt(document.getElementById('naver-comment-draft-max-chars')?.value || '60', 10) || 60,
    headless: Boolean(document.getElementById('naver-comment-draft-headless')?.checked)
  };
}

function renderNaverCommentDraftItems(items = []) {
  const listEl = document.getElementById('naver-comment-draft-list');
  if (!listEl) return;

  const safeItems = Array.isArray(items) ? items : [];
  naverCommentDraftItems = safeItems.map(item => ({ ...(item || {}) }));
  if (safeItems.length === 0) {
    listEl.innerHTML = '<p class="dash-feed-empty">조건에 맞는 후보 글이 없습니다.</p>';
    return;
  }

  listEl.innerHTML = safeItems.map((item, index) => {
    const drafts = Array.isArray(item?.drafts) ? item.drafts : [];
    const draftHtml = drafts.length > 0
      ? drafts.map((draft, draftIndex) => `
        <div class="comment-draft-item">
          <button class="secondary compact" type="button" data-comment-draft-copy="${index}:${draftIndex}">복사</button>
          <div class="comment-draft-item-text">${escapeHtml(draft)}</div>
        </div>
      `).join('')
      : `<div class="comment-draft-item"><div class="comment-draft-item-text">${escapeHtml(item?.error || '초안을 생성하지 못했습니다.')}</div></div>`;

    const chips = [
      item?.likedStateKnown ? (item?.liked ? '이미 공감한 글' : '공감 안 한 글') : '공감 여부 확인 불가',
      item?.postUrl ? '글 링크 확인됨' : '글 링크 없음'
    ];

    return `
      <article class="comment-draft-card" data-comment-draft-card="${index}">
        <div class="comment-draft-card-head">
          ${item?.thumbnailUrl ? `<div class="comment-draft-thumb"><img src="${escapeHtml(item.thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('is-hidden'); this.remove();"></div>` : ''}
          <div>
            <div class="comment-draft-card-author">${escapeHtml(item?.authorName || '작성자 미상')}</div>
            <div class="comment-draft-card-title">${escapeHtml(item?.title || '제목 없음')}</div>
          </div>
        </div>
        <div class="comment-draft-chip-row">
          ${chips.map((chip) => `<span class="comment-draft-chip">${escapeHtml(chip)}</span>`).join('')}
        </div>
        <div class="comment-draft-card-excerpt">${escapeHtml(item?.excerpt || '본문 요약을 불러오지 못했습니다.')}</div>
        <div class="comment-draft-drafts">${draftHtml}</div>
        <div class="comment-draft-actions">
          <button class="secondary" type="button" data-comment-draft-redraft="${index}">다시 생성</button>
          ${(item?.commentUrl || item?.postUrl) ? `<a class="secondary" href="${escapeHtml(item.commentUrl || item.postUrl)}" target="_blank" rel="noopener noreferrer">글로 이동</a>` : ''}
        </div>
      </article>
    `;
  }).join('');
}

async function loadNaverCommentDraftSettings() {
  const hadItems = Array.isArray(naverCommentDraftItems) && naverCommentDraftItems.length > 0;
  setNaverCommentDraftResultText(hadItems ? naverCommentDraftStatusText : '불러오는 중...');
  try {
    const data = await fetchJson('/api/v1/blog/naver-comment-draft/settings');
    const settings = data?.settings || {};
    const aiModeEl = document.getElementById('naver-comment-draft-ai-mode');
    const fetchLimitEl = document.getElementById('naver-comment-draft-fetch-limit');
    const toneEl = document.getElementById('naver-comment-draft-tone');
    const maxCharsEl = document.getElementById('naver-comment-draft-max-chars');
    const headlessEl = document.getElementById('naver-comment-draft-headless');
    if (aiModeEl) aiModeEl.value = String(settings.aiMode || 'default');
    if (fetchLimitEl) fetchLimitEl.value = String(settings.fetchLimit || 10);
    if (toneEl) toneEl.value = String(settings.tone || 'empathetic');
    if (maxCharsEl) maxCharsEl.value = String(settings.maxChars || 60);
    if (headlessEl) headlessEl.checked = Boolean(settings.headless ?? true);
    if (hadItems) {
      renderNaverCommentDraftItems(naverCommentDraftItems);
      setNaverCommentDraftResultText(naverCommentDraftStatusText);
    } else {
      setNaverCommentDraftResultText('불러오기 완료');
    }
  } catch (e) {
    setNaverCommentDraftResultText(`오류: ${e.message}`);
  }
}

async function saveNaverCommentDraftSettings() {
  setNaverCommentDraftResultText('저장 중...');
  try {
    const payload = getNaverCommentDraftSettingsFromUi();
    await postJson('/api/v1/blog/naver-comment-draft/settings', payload);
    setNaverCommentDraftResultText('저장 완료');
  } catch (e) {
    setNaverCommentDraftResultText(`오류: ${e.message}`);
  }
}

async function runNaverCommentDraft() {
  const runBtn = document.getElementById('naver-comment-draft-run-btn');
  const saveBtn = document.getElementById('naver-comment-draft-save-btn');
  if (runBtn?.disabled) return;
  if (runBtn) runBtn.disabled = true;
  if (saveBtn) saveBtn.disabled = true;
  setNaverCommentDraftResultText('후보 글을 수집하고 댓글 초안을 생성 중...');
  const listEl = document.getElementById('naver-comment-draft-list');
  if (listEl) listEl.innerHTML = '<p class="dash-feed-empty">실행 중...</p>';
  let progressPolling = true;
  let progressTimer = null;
  const pollProgress = async () => {
    if (!progressPolling) return;
    try {
      const data = await fetchJson('/api/v1/blog/naver-comment-draft/progress');
      if (progressPolling && data?.progress?.message) {
        setNaverCommentDraftResultText(data.progress.message);
      }
    } catch (_e) {
      // 실행 성공/실패는 본 요청으로 판정하며, 진행 상태 조회 실패는 현재 표시를 유지한다.
    }
    if (progressPolling) progressTimer = window.setTimeout(pollProgress, 1000);
  };
  progressTimer = window.setTimeout(pollProgress, 250);
  try {
    const payload = getNaverCommentDraftSettingsFromUi();
    const data = await postJson('/api/v1/blog/naver-comment-draft/run', payload);
    renderNaverCommentDraftItems(data?.items || []);
    const summary = data?.summary || {};
    if (summary.status === 'no_candidates') {
      setNaverCommentDraftResultText('조건에 맞는 이웃새글 후보가 없습니다.');
    } else if (summary.status === 'rate_limited') {
      setNaverCommentDraftResultText(`AI 요청 한도로 실행을 중단했습니다. ${summary.successCount || 0}/${summary.candidateCount || 0}건 생성`);
    } else if (summary.status === 'draft_generation_failed') {
      setNaverCommentDraftResultText(`후보 ${summary.candidateCount || 0}건을 찾았지만 댓글 초안을 생성하지 못했습니다.`);
    } else if (summary.status === 'partial_success') {
      setNaverCommentDraftResultText(`일부 완료: ${summary.successCount || 0}건 생성, ${summary.failureCount || 0}건 실패`);
    } else {
      setNaverCommentDraftResultText(`완료: ${summary.successCount ?? (Array.isArray(data?.items) ? data.items.length : 0)}건의 댓글 초안을 생성했습니다.`);
    }
  } catch (e) {
    if (listEl) listEl.innerHTML = '<p class="dash-feed-empty">실행 결과가 없습니다.</p>';
    setNaverCommentDraftResultText(`오류: ${e.message}`);
  } finally {
    progressPolling = false;
    if (progressTimer) window.clearTimeout(progressTimer);
    if (runBtn) runBtn.disabled = false;
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function redraftNaverCommentDraft(itemIndex) {
  const item = naverCommentDraftItems[itemIndex];
  if (!item) return;
  const redraftBtn = document.querySelector(`[data-comment-draft-redraft="${itemIndex}"]`);
  if (redraftBtn?.disabled) return;
  if (redraftBtn) redraftBtn.disabled = true;
  const payload = {
    ...getNaverCommentDraftSettingsFromUi(),
    title: item.title || '',
    authorName: item.authorName || '',
    excerpt: item.excerpt || '',
    postUrl: item.postUrl || ''
  };

  setNaverCommentDraftResultText('초안을 다시 생성 중...');
  try {
    const data = await postJson('/api/v1/blog/naver-comment-draft/redraft', payload);
    const currentItems = naverCommentDraftItems.map((entry, index) => ({
      ...entry,
      drafts: index === itemIndex ? (Array.isArray(data?.drafts) ? data.drafts : []) : (Array.isArray(entry?.drafts) ? entry.drafts : [])
    }));
    renderNaverCommentDraftItems(currentItems);
    setNaverCommentDraftResultText('초안을 다시 생성했습니다.');
  } catch (e) {
    setNaverCommentDraftResultText(`오류: ${e.message}`);
  } finally {
    const currentRedraftBtn = document.querySelector(`[data-comment-draft-redraft="${itemIndex}"]`);
    if (currentRedraftBtn) currentRedraftBtn.disabled = false;
  }
}

function activateShoppingTab(tabName, options = {}) {
  const allowed = ['quick', 'batch', 'auto'];
  const target = allowed.includes(String(tabName)) ? String(tabName) : 'quick';
  shoppingActiveTab = target;

  const tabButtons = Array.from(document.querySelectorAll('.shopping-tab-btn'));
  const tabPanels = Array.from(document.querySelectorAll('.shopping-tab-panel'));
  tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.shoppingTab === target));
  tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === `shopping-tab-${target}`));
  syncScopedMajorSaveActions();

  const forceReload = options.forceReload !== false;
  if (!forceReload) return;

  if (target === 'batch') {
    loadBlogShopping();
    return;
  }
  if (target === 'auto') {
    loadShoppingAutoSettings();
  }
}

function activateSettingsTab(tabName, options = {}) {
  const allowed = ['general', 'mcp', 'naver-blog', 'shopping-connect', 'sns', 'notification', 'ai'];
  const requested = allowed.includes(String(tabName)) ? String(tabName) : 'general';
  const target = requested === 'mcp' ? 'ai' : requested;
  settingsActiveTab = target;

  const tabButtons = Array.from(document.querySelectorAll('.settings-tab-btn[data-settings-tab]'));
  const tabPanels = Array.from(document.querySelectorAll('.settings-tab-panel'));
  tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.settingsTab === target));
  tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === `settings-tab-${target}`));
  if (target === 'naver-blog' && options.forceReload !== false) {
    void loadNaverSessionStatus();
  }
}

function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafePreviewHref(href) {
  const normalized = String(href || '').trim();
  return /^https?:\/\//i.test(normalized);
}

function renderInlinePreviewLinksHtml(input) {
  const source = String(input ?? '');
  if (!source) return '';

  const parts = [];
  const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\b(https?:\/\/[^\s<]+)/gi;
  let lastIndex = 0;
  let match;

  while ((match = markdownLinkPattern.exec(source)) !== null) {
    const [fullMatch, markdownLabel = '', markdownHref = '', bareHref = ''] = match;
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      parts.push(escapeHtml(source.slice(lastIndex, matchIndex)));
    }

    const href = markdownHref || bareHref;
    if (isSafePreviewHref(href)) {
      const label = markdownLabel || bareHref;
      parts.push(
        `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
      );
    } else {
      parts.push(escapeHtml(fullMatch));
    }
    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < source.length) {
    parts.push(escapeHtml(source.slice(lastIndex)));
  }

  return parts.join('');
}

function renderInlinePreviewHtml(input, boldRanges = []) {
  const source = String(input ?? '');
  const ranges = Array.isArray(boldRanges)
    ? boldRanges
      .map((range) => ({
        start: Math.max(0, Number(range?.start) || 0),
        end: Math.min(source.length, Number(range?.end) || 0)
      }))
      .filter((range) => range.end > range.start)
      .sort((a, b) => a.start - b.start)
    : [];

  if (ranges.length === 0) return renderInlinePreviewLinksHtml(source);

  const parts = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    parts.push(renderInlinePreviewLinksHtml(source.slice(cursor, range.start)));
    parts.push(`<strong>${renderInlinePreviewLinksHtml(source.slice(range.start, range.end))}</strong>`);
    cursor = range.end;
  }
  parts.push(renderInlinePreviewLinksHtml(source.slice(cursor)));
  return parts.join('');
}

function normalizeCommaListText(input) {
  return String(input || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .join(', ');
}

function setLocalMarkdownPreviewDensity(panelEl, bodyEl, imageListEl, stats = {}) {
  if (!panelEl || !bodyEl) return;
  const contentCount = Number(stats?.contentCount || 0);
  const imageBlockCount = Number(stats?.imageBlockCount || 0);
  const imageResolvedCount = Number(stats?.imageResolvedCount || 0);
  const bodyHasRenderableContent = contentCount > 0 && !bodyEl.querySelector('.local-markdown-empty');
  const hasImages = imageBlockCount > 0 || imageResolvedCount > 0;

  panelEl.classList.toggle('is-expanded', bodyHasRenderableContent);
  panelEl.classList.toggle('is-compact', !bodyHasRenderableContent);

  const imageSection = imageListEl?.closest('.local-markdown-preview-section');
  if (imageSection) {
    imageSection.classList.toggle('is-hidden', !hasImages);
  }
}

function renderDashboardAutoSchedule() {
  const blog = dashboardAutoScheduleState.blog;
  const shopping = dashboardAutoScheduleState.shopping;

  const setAutoScheduleUI = (prefix, data) => {
    const dateEl = document.getElementById(`dash-auto-${prefix}-next-date`);
    const relEl = document.getElementById(`dash-auto-${prefix}-next-relative`);

    const isWithinTimeRange = (timeStr, start, end) => {
      if (!start || !end) return true;
      if (!timeStr || timeStr === '-') return true;
      const date = new Date(timeStr);
      if (isNaN(date.getTime())) return true;
      const mins = date.getHours() * 60 + date.getMinutes();
      const [sH, sM] = start.split(':').map(Number);
      const [eH, eM] = end.split(':').map(Number);
      const sMin = sH * 60 + sM;
      const eMin = eH * 60 + eM;
      if (sMin <= eMin) return mins >= sMin && mins <= eMin;
      return mins >= sMin || mins <= eMin;
    };

    if (!data.enabled || !data.nextRunAt || data.nextRunAt === '-') {
      if (dateEl) dateEl.textContent = '-';
      if (relEl) relEl.textContent = '';
    } else {
      const isAllowed = isWithinTimeRange(data.nextRunAt, data.startTime, data.endTime);
      if (data.status === 'waiting_time_window' || !isAllowed) {
        if (dateEl) dateEl.textContent = `허용 대기중 (${data.startTime || '00:00'}~${data.endTime || '23:59'})`;
        if (relEl) relEl.textContent = '';
      } else {
        if (dateEl) dateEl.textContent = formatDateTimeAbsolute(data.nextRunAt);
        if (relEl) relEl.textContent = formatNextRunText(data.nextRunAt);
      }
    }
  };

  setAutoScheduleUI('blog', blog);
  setAutoScheduleUI('shopping', shopping);
}

function formatDashboardFeedDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function truncateText(value, maxLen = 120) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(1, maxLen - 1))}…`;
}

function renderDashboardFeedList(containerId, source) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const items = (Array.isArray(source?.items) ? source.items : []).slice(0, 3);
  if (!items.length) {
    const message = source?.error ? `불러오기 실패: ${escapeHtml(source.error)}` : '콘텐츠가 없습니다.';
    container.innerHTML = `<p class="dash-feed-empty">${message}</p>`;
    return;
  }

  container.innerHTML = items.map((item) => {
    const link = String(item?.link || source?.homeUrl || '').trim();
    const title = escapeHtml(item?.title || '(제목 없음)');
    const summary = escapeHtml(truncateText(item?.summary || '', 140));
    const published = escapeHtml(formatDashboardFeedDate(item?.publishedAt || ''));
    const thumbnail = String(item?.thumbnail || '').trim();
    const thumbHtml = thumbnail
      ? `<div class="dash-feed-thumb"><img src="${escapeHtml(thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
      : '';
    const metaHtml = published ? `<div class="dash-feed-meta">${published}</div>` : '';
    const summaryHtml = summary ? `<div class="dash-feed-summary">${summary}</div>` : '';
    return `
      <a class="dash-feed-item" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">
        ${thumbHtml}
        <div class="dash-feed-body">
          <div class="dash-feed-title">${title}</div>
          ${metaHtml}
          ${summaryHtml}
        </div>
      </a>
    `;
  }).join('');
}

function renderDashboardShortsList(containerId, source) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const items = (Array.isArray(source?.items) ? source.items : []).slice(0, 3);
  if (!items.length) {
    const message = source?.error ? `불러오기 실패: ${escapeHtml(source.error)}` : '콘텐츠가 없습니다.';
    container.innerHTML = `<p class="dash-feed-empty">${message}</p>`;
    syncDashboardBottomColumnHeights();
    return;
  }

  container.innerHTML = items.map((item) => {
    const link = String(item?.link || source?.homeUrl || '').trim();
    const title = escapeHtml(item?.title || '(제목 없음)');
    const summary = escapeHtml(truncateText(item?.summary || '', 96));
    const published = escapeHtml(formatDashboardFeedDate(item?.publishedAt || ''));
    const thumbnail = String(item?.thumbnail || '').trim();
    const thumbHtml = thumbnail
      ? `<div class="dash-shorts-thumb"><img src="${escapeHtml(thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
      : '<div class="dash-shorts-thumb dash-shorts-thumb-empty">▶</div>';
    const publishedHtml = published ? `<div class="dash-shorts-meta">${published}</div>` : '';
    const summaryHtml = summary ? `<div class="dash-shorts-summary">${summary}</div>` : '';
    return `
      <a class="dash-shorts-item" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">
        ${thumbHtml}
        <div class="dash-shorts-body">
          <div class="dash-shorts-title">${title}</div>
          ${publishedHtml}
          ${summaryHtml}
        </div>
      </a>
    `;
  }).join('');
  syncDashboardBottomColumnHeights();
}

function syncDashboardBottomColumnHeights() {
  const timeline = document.getElementById('activity-timeline');
  const shorts = document.getElementById('dash-smart-feed-youtube');
  if (!timeline || !shorts) return;

  if (window.innerWidth <= 1100) {
    timeline.style.maxHeight = '';
    shorts.style.maxHeight = '';
    return;
  }

  window.requestAnimationFrame(() => {
    const shortsItems = shorts.querySelectorAll('.dash-shorts-item');
    if (!shortsItems.length) {
      timeline.style.maxHeight = '';
      shorts.style.maxHeight = '';
      return;
    }

    const nextHeight = `${Math.max(320, Math.min(560, shorts.scrollHeight))}px`;
    timeline.style.maxHeight = nextHeight;
    shorts.style.maxHeight = nextHeight;
  });
}

window.addEventListener('resize', syncDashboardBottomColumnHeights);

async function loadDashboardExternalContent(options = {}) {
  const force = options?.force === true;
  const silent = options?.silent === true;
  const now = Date.now();
  if (!force && dashboardExternalContentLastLoadedAt > 0) {
    const elapsed = now - dashboardExternalContentLastLoadedAt;
    if (elapsed < DASHBOARD_EXTERNAL_CONTENT_REFRESH_MS) return;
  }

  try {
    const data = await fetchJson('/api/v1/dashboard/external-content?limit=6');
    const sourceMap = {};
    for (const source of (data?.sources || [])) {
      sourceMap[String(source?.key || '').trim()] = source;
    }
    renderDashboardFeedList('dash-feed-list-naver', sourceMap.naver || {});
    renderDashboardFeedList('dash-feed-list-wordpress', sourceMap.wordpress || {});
    renderDashboardFeedList('dash-feed-list-itmania', sourceMap.itmania || {});

    // Smart Feed (YouTube RSS -> Instagram Widget Fallback)
    const smart = sourceMap.smart || {};
    const smartTitle = document.getElementById('dash-smart-feed-title');
    const smartLink = document.getElementById('dash-smart-feed-link');
    const smartStatus = document.getElementById('dash-smart-feed-status');
    const smartYoutube = document.getElementById('dash-smart-feed-youtube');
    const smartInstagram = document.getElementById('dash-smart-feed-instagram');

    if (smartStatus) smartStatus.style.display = 'none';

    if (smart && Array.isArray(smart.items) && smart.items.length > 0) {
      // YouTube Win
      if (smartTitle) smartTitle.textContent = '유튜브 최신 영상';
      if (smartLink) smartLink.href = String(smart.homeUrl || 'https://www.youtube.com/channel/UC4Sl4m-ZV65knmWTl0UFYkw');
      if (smartLink) smartLink.textContent = '채널 이동';

      if (smartYoutube) {
        smartYoutube.style.display = 'flex';
        renderDashboardShortsList('dash-smart-feed-youtube', smart);
      }
      if (smartInstagram) smartInstagram.style.display = 'none';
    } else {
      // Instagram Fallback
      if (smartTitle) smartTitle.textContent = '인스타그램 릴스';
      if (smartLink) smartLink.href = 'https://www.instagram.com/amadejjs/reels/';
      if (smartLink) smartLink.textContent = '프로필 이동';

      if (smartYoutube) smartYoutube.style.display = 'none';
      if (smartInstagram) smartInstagram.style.display = 'block';
    }

    const setHomeLink = (id, source) => {
      const el = document.getElementById(id);
      if (!el) return;
      const next = String(source?.homeUrl || '').trim();
      if (next) el.href = next;
    };
    setHomeLink('dash-feed-home-naver', sourceMap.naver || {});
    setHomeLink('dash-feed-home-wordpress', sourceMap.wordpress || {});
    setHomeLink('dash-feed-home-itmania', sourceMap.itmania || {});
    // setHomeLink('dash-feed-home-instagram-reels', sourceMap.instagramReels || {});

    dashboardExternalContentLastLoadedAt = Date.now();
    syncDashboardBottomColumnHeights();
  } catch (e) {
    const errMsg = String(e?.message || '콘텐츠를 불러오지 못했습니다.');
    if (!silent) {
      console.warn('[Dashboard External Content]', errMsg);
    }
    const fallback = { error: errMsg };
    renderDashboardFeedList('dash-feed-list-naver', fallback);
    renderDashboardFeedList('dash-feed-list-wordpress', fallback);
    renderDashboardFeedList('dash-feed-list-noworry', fallback);
    // renderDashboardShortsList('dash-feed-list-instagram-reels', fallback);
  }
}

let isDashboardLoading = false;
let lastDashboardLoadTime = 0;

let isAccountOverviewLoading = false;
let lastAccountOverview = null;

function formatAccountDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function setAccountMetaItem(elementId, label, value) {
  const element = document.getElementById(elementId);
  if (!element) return;
  const formatted = formatAccountDate(value);
  element.textContent = `${label} ${formatted}`;
  element.classList.toggle('hidden', formatted === '-');
}

function setAccountMetaText(elementId, text, visible = true) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = String(text || '').trim();
  element.classList.toggle('hidden', !visible || !element.textContent);
}

function getAccountAction(overview, actionId) {
  const actions = Array.isArray(overview?.actions) ? overview.actions : [];
  return actions.find((item) => String(item?.id || '') === actionId) || null;
}

function renderAccountConnection(elementId, connection) {
  const element = document.getElementById(elementId);
  if (!element) return;
  const status = String(connection?.status || 'unknown');
  const connected = status === 'connected' || status === 'configured';
  element.textContent = connected ? '연결됨' : (status === 'not_configured' ? '미설정' : '로그인 필요');
  element.className = connected ? 'state-ok' : (status === 'not_configured' ? 'state-muted' : 'state-warning');
}

function renderAccountOverview(overview) {
  lastAccountOverview = overview;
  const subscription = overview?.subscription || {};
  const usage = overview?.usage || {};
  const device = overview?.device || {};
  const identity = overview?.identity || {};
  const smartUsageItems = Array.isArray(overview?.smart_usage?.items) ? overview.smart_usage.items : [];

  const planName = String(subscription.plan_name || subscription.plan_code || '-').trim() || '-';
  const normalizedPlanCode = String(subscription.plan_code || '').trim().toLowerCase();
  const status = String(subscription.status || 'unavailable').trim();
  const statusLabels = {
    active: '활성',
    quota_exhausted: '사용량 소진',
    unavailable: '확인 필요'
  };
  const statusClass = status === 'active' ? 'active' : (status === 'quota_exhausted' ? 'warning' : 'error');

  setText('account-plan-name', planName);
  const statusEl = document.getElementById('account-plan-status');
  if (statusEl) {
    statusEl.textContent = statusLabels[status] || status;
    statusEl.className = `account-status-badge ${statusClass}`;
  }

  const unlimited = usage.mode === 'unlimited' || Number(usage.limit) < 0 || Number(usage.remaining) < 0;
  const used = Number.isFinite(Number(usage.used)) ? Number(usage.used) : null;
  const limit = Number.isFinite(Number(usage.limit)) ? Number(usage.limit) : null;
  const remaining = Number.isFinite(Number(usage.remaining)) ? Number(usage.remaining) : null;
  const quotaCycle = String(usage.cycle || '').trim().toLowerCase();
  const usageLabel = quotaCycle === 'monthly'
    ? '이번 달 사용량'
    : (quotaCycle === 'none' && normalizedPlanCode === 'test' ? '체험 사용량' : '사용량');
  const planCycleHelpEl = document.getElementById('account-plan-cycle-help');
  if (planCycleHelpEl) {
    const showCycleHelp = quotaCycle === 'monthly';
    planCycleHelpEl.classList.toggle('hidden', !showCycleHelp);
    const cycleHelpText = normalizedPlanCode === 'free'
      ? 'Free Plan은 매월 1일 갱신됩니다.'
      : '월 기본 제공량은 매월 1일 갱신됩니다.';
    planCycleHelpEl.dataset.tooltip = cycleHelpText;
    planCycleHelpEl.setAttribute('aria-label', cycleHelpText);
  }
  setText('account-usage-used-label', usageLabel);
  setText('account-usage-used', unlimited ? '제한 없음' : (used == null || limit == null ? '-' : `${used} / ${limit}회`));
  setText('account-usage-remaining', unlimited ? '무제한' : (remaining == null ? '-' : `${remaining}회`));

  const creditBalance = Number.isFinite(Number(usage.credit_balance)) ? Math.max(0, Number(usage.credit_balance)) : 0;
  const totalAvailable = Number.isFinite(Number(usage.total_available)) ? Number(usage.total_available) : null;
  setText('account-credit-balance', `${creditBalance}회`);
  setText('account-total-available', unlimited ? '무제한' : (totalAvailable == null ? '-' : `${Math.max(0, totalAvailable)}회`));
  const basicAvailableLabel = unlimited ? '무제한' : (remaining == null ? '-' : `${Math.max(0, remaining)}회`);
  const creditAvailableLabel = `${creditBalance}회`;
  setText('account-total-breakdown', unlimited
    ? '현재 플랜에서 발행 횟수 제한 없이 사용할 수 있습니다.'
    : `기본 제공량 ${basicAvailableLabel} + 크레딧 ${creditAvailableLabel}`);
  const creditHelpEl = document.getElementById('account-credit-help');
  if (creditHelpEl) {
    const creditHelpText = quotaCycle === 'monthly'
      ? '기본 제공량 소진 후 충전 크레딧이 사용됩니다.'
      : '충전 크레딧은 현재 플랜 권한 안에서 사용할 수 있는 추가 발행 횟수입니다.';
    creditHelpEl.dataset.tooltip = creditHelpText;
    creditHelpEl.setAttribute('aria-label', creditHelpText);
  }

  setText('account-license-created', `라이선스 생성일: ${formatAccountDate(subscription.created_at)}`);
  if (quotaCycle === 'monthly') {
    setAccountMetaText('account-period-start', '', false);
    setAccountMetaText('account-next-reset', '', false);
  } else {
    setAccountMetaItem('account-period-start', '사용 시작일', usage.current_period_start_at);
    setAccountMetaItem('account-next-reset', '다음 갱신일', usage.resets_at);
  }

  const upgradeFreeAction = getAccountAction(overview, 'upgrade_free');
  const guidanceEl = document.getElementById('account-plan-guidance');
  const guidanceTitleEl = document.getElementById('account-plan-guidance-title');
  const guidanceMessageEl = document.getElementById('account-plan-guidance-message');
  const upgradeFreeBtn = document.getElementById('account-upgrade-free-btn');
  const shouldShowFreeUpgrade = normalizedPlanCode === 'test'
    && status === 'quota_exhausted'
    && upgradeFreeAction?.enabled === true;
  if (guidanceEl) {
    guidanceEl.classList.toggle('hidden', !shouldShowFreeUpgrade);
  }
  if (guidanceTitleEl) {
    guidanceTitleEl.textContent = shouldShowFreeUpgrade ? 'Tester Plan 사용량을 모두 사용했습니다' : '';
  }
  if (guidanceMessageEl) {
    guidanceMessageEl.textContent = shouldShowFreeUpgrade
      ? 'Free Plan은 자동으로 전환되지 않습니다. 이메일 인증 후 월간 무료 발행 횟수로 계속 사용할 수 있습니다.'
      : '';
  }
  if (upgradeFreeBtn) {
    upgradeFreeBtn.textContent = shouldShowFreeUpgrade ? (upgradeFreeAction?.label || 'Free Plan으로 전환') : '';
    upgradeFreeBtn.disabled = !shouldShowFreeUpgrade;
    upgradeFreeBtn.title = upgradeFreeAction?.reason || '';
  }

  const changePlanAction = getAccountAction(overview, 'change_plan') || getAccountAction(overview, 'upgrade');
  const changePlanButton = document.getElementById('account-change-plan-btn');
  if (changePlanButton) {
    changePlanButton.textContent = changePlanAction?.label || '구독 / 플랜 변경';
    changePlanButton.disabled = changePlanAction?.enabled !== true;
    changePlanButton.title = changePlanAction?.reason || '';
  }
  const purchaseCreditsAction = getAccountAction(overview, 'purchase_credits');
  const purchaseCreditsButton = document.getElementById('account-purchase-credits-btn');
  if (purchaseCreditsButton) {
    purchaseCreditsButton.textContent = purchaseCreditsAction?.label || '크레딧 충전';
    purchaseCreditsButton.disabled = purchaseCreditsAction?.enabled !== true || unlimited;
    purchaseCreditsButton.title = unlimited
      ? '무제한 플랜에서는 크레딧 충전이 필요하지 않습니다.'
      : (purchaseCreditsAction?.reason || '');
  }

  setText('account-identity-label', identity.label || '기기 라이선스로 사용 중');
  setText('account-identity-detail', identity.email_verified && (identity.email_masked || identity.email)
    ? `${identity.email_masked || identity.email}\n${identity.purpose || '라이선스 복구와 플랜 관리에 사용됩니다.'}`
    : '로그인 없이 현재 기기에 연결된 라이선스를 사용합니다.');
  const registerAction = getAccountAction(overview, 'register_email');
  const registerButton = document.getElementById('account-register-email-btn');
  if (registerButton) {
    registerButton.textContent = registerAction?.label || '계정 연결 준비 중';
    registerButton.disabled = registerAction?.enabled !== true;
    registerButton.title = registerAction?.reason || '';
  }

  const platformLabels = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };
  setText('account-device-platform', `${platformLabels[device.platform] || device.platform || '-'}${device.os_release ? ` ${device.os_release}` : ''}`);
  setText('account-device-arch', device.arch || '-');
  setText('account-device-hw-id', device.hw_id || '-');
  setText('account-device-app-version', device.app_version ? `v${device.app_version}` : '-');

  const featureList = document.getElementById('account-feature-list');
  if (featureList) {
    featureList.innerHTML = '';
    const items = Array.isArray(overview?.capabilities?.items) ? overview.capabilities.items : [];
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = '플랜 기능 정보가 없습니다.';
      featureList.appendChild(empty);
    } else {
      items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'account-state-row';
        const label = document.createElement('span');
        label.textContent = item.label || item.id;
        const value = document.createElement('strong');
        value.textContent = item.enabled ? '사용 가능' : '제한됨';
        value.className = item.enabled ? 'state-ok' : 'state-muted';
        row.append(label, value);
        featureList.appendChild(row);
      });
    }
  }

  const smartUsageList = document.getElementById('account-smart-usage-list');
  if (smartUsageList) {
    smartUsageList.innerHTML = '';
    smartUsageItems.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'account-smart-usage-item';
      const label = document.createElement('span');
      label.textContent = item.label || item.capability || '스마트 기능';
      const value = document.createElement('strong');
      value.textContent = `${Math.max(0, Number(item.remaining) || 0)} / ${Math.max(0, Number(item.limit) || 0)}회 남음`;
      row.append(label, value);
      smartUsageList.append(row);
    });
    if (smartUsageItems.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'muted';
      empty.textContent = '사용량 정보를 불러오는 중입니다.';
      smartUsageList.append(empty);
    }
  }
  refreshSmartUsageHints();

  renderAccountConnection('account-connection-naver', overview?.connections?.naver);
  renderAccountConnection('account-connection-google', overview?.connections?.google_sheets);
  renderAccountConnection('account-connection-wordpress', overview?.connections?.wordpress);
}

function isValidAccountEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value || '').trim());
}

async function runLicenseEmailVerification({ email, title = '이메일 인증', button = null } = {}) {
  const normalizedEmail = String(email || '').trim();
  if (!isValidAccountEmail(normalizedEmail)) {
    await showUiPopup('유효한 이메일 주소를 입력해 주세요.');
    return null;
  }

  if (button) {
    button.disabled = true;
    button.textContent = '인증 요청 중...';
  }

  const requestResult = await postJson('/api/v1/license/registration/request', {
    email: normalizedEmail
  });
  const code = await showUiPrompt(`${requestResult?.message || '인증 코드가 발송되었습니다.'}\n메일로 받은 6자리 인증 코드를 입력해 주세요.`, {
    title,
    type: 'text',
    placeholder: '123456',
    confirmText: '인증',
    cancelText: '취소'
  });
  if (code == null) {
    await loadAccountOverview({ force: true }).catch(() => {});
    return null;
  }

  const normalizedCode = String(code || '').trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    await showUiPopup('6자리 인증 코드를 입력해 주세요.');
    await loadAccountOverview({ force: true }).catch(() => {});
    return null;
  }

  if (button) {
    button.disabled = true;
    button.textContent = '인증 확인 중...';
  }

  await postJson('/api/v1/license/registration/verify', {
    email: normalizedEmail,
    code: normalizedCode
  });

  return normalizedEmail;
}

async function loadAccountOverview({ force = false } = {}) {
  const loadingEl = document.getElementById('account-overview-loading');
  const errorEl = document.getElementById('account-overview-error');
  const contentEl = document.getElementById('account-overview-content');

  if (isAccountOverviewLoading) return lastAccountOverview;
  if (!force && lastAccountOverview) {
    renderAccountOverview(lastAccountOverview);
    loadingEl?.classList.add('hidden');
    errorEl?.classList.add('hidden');
    contentEl?.classList.remove('hidden');
    return lastAccountOverview;
  }

  isAccountOverviewLoading = true;
  loadingEl?.classList.remove('hidden');
  errorEl?.classList.add('hidden');
  contentEl?.classList.add('hidden');

  try {
    const overview = await fetchJson(`/api/v1/account/overview?quiet=1${force ? '&force=1' : ''}`);
    renderAccountOverview(overview);
    loadingEl?.classList.add('hidden');
    contentEl?.classList.remove('hidden');
    return overview;
  } catch (error) {
    loadingEl?.classList.add('hidden');
    errorEl?.classList.remove('hidden');
    setText('account-overview-error-message', error.message || '잠시 후 다시 시도해 주세요.');
    throw error;
  } finally {
    isAccountOverviewLoading = false;
  }
}

async function upgradeAccountToFreePlan() {
  const action = getAccountAction(lastAccountOverview, 'upgrade_free');
  if (action?.enabled !== true) {
    await showUiPopup(action?.reason || '현재 Free Plan으로 전환할 수 없습니다.');
    return;
  }

  const email = await showUiPrompt('Free Plan 전환에 사용할 이메일을 입력해 주세요.\n인증 코드를 보내고, 확인 후 Free Plan으로 전환합니다.', {
    title: 'Free Plan 전환',
    type: 'email',
    placeholder: 'you@example.com',
    confirmText: '인증 코드 받기',
    cancelText: '취소'
  });
  if (email == null) return;
  const normalizedEmail = String(email || '').trim();
  if (!isValidAccountEmail(normalizedEmail)) {
    await showUiPopup('유효한 이메일 주소를 입력해 주세요.');
    return;
  }

  const button = document.getElementById('account-upgrade-free-btn');
  try {
    const verifiedEmail = await runLicenseEmailVerification({
      email: normalizedEmail,
      title: '이메일 인증',
      button
    });
    if (!verifiedEmail) return;

    if (button) {
      button.disabled = true;
      button.textContent = '전환 중...';
    }
    const result = await postJson('/api/v1/license/upgrade', {
      targetPlan: 'free',
      email: verifiedEmail
    });
    await showUiPopup(result?.message || 'Free Plan으로 전환되었습니다.');
    lastAccountOverview = null;
    await loadAccountOverview({ force: true });
    await loadDashboard();
  } catch (error) {
    await showUiPopup(`전환 실패: ${error.message || '잠시 후 다시 시도해 주세요.'}`);
    await loadAccountOverview({ force: true }).catch(() => {});
  }
}

async function registerOrChangeAccountEmail() {
  const action = getAccountAction(lastAccountOverview, 'register_email');
  if (action?.enabled !== true) {
    await showUiPopup(action?.reason || '현재 이메일을 등록할 수 없습니다.');
    return;
  }

  const isChange = action.mode === 'change' || Boolean(lastAccountOverview?.identity?.email_verified);
  const currentEmail = String(lastAccountOverview?.identity?.email_masked || '').trim();
  const email = await showUiPrompt(
    isChange
      ? `새 이메일을 입력해 주세요.\n현재 연결: ${currentEmail || '-'}\n새 이메일 인증 후 라이선스 복구 이메일이 변경됩니다.`
      : '라이선스 복구와 플랜 관리에 사용할 이메일을 입력해 주세요.\n인증 코드를 보내고, 확인 후 현재 라이선스에 연결합니다.',
    {
      title: isChange ? '이메일 변경' : '이메일 등록',
      type: 'email',
      placeholder: 'you@example.com',
      confirmText: '인증 코드 받기',
      cancelText: '취소'
    }
  );
  if (email == null) return;

  const button = document.getElementById('account-register-email-btn');
  try {
    const verifiedEmail = await runLicenseEmailVerification({
      email,
      title: isChange ? '이메일 변경 인증' : '이메일 등록 인증',
      button
    });
    if (!verifiedEmail) return;

    await showUiPopup(isChange ? '이메일이 변경되었습니다.' : '이메일이 등록되었습니다.');
    lastAccountOverview = null;
    await loadAccountOverview({ force: true });
    await loadDashboard();
  } catch (error) {
    await showUiPopup(`이메일 처리 실패: ${error.message || '잠시 후 다시 시도해 주세요.'}`);
    await loadAccountOverview({ force: true }).catch(() => {});
  }
}

function showAccountPlanInfo() {
  return showUiDialog({
    title: '플랜 안내',
    message: [
      '스마트 기능 (매월 1일 갱신)',
      '- 글감 추천 / 키워드 탐색 / AI 제목 추천은 각각 별도 횟수로 관리됩니다.',
      '- 한 번 시작한 추천 안에서는 정해진 재시도를 사용할 수 있습니다.',
      '',
      'Tester',
      '- 스마트 기능 40 / 40 / 40회',
      'Free',
      '- 스마트 기능 20 / 20 / 20회',
      '- 기본 블로그 발행',
      '',
      'Pro',
      '- 스마트 기능 80 / 80 / 80회',
      '- 트렌드, 쇼핑, 연관글 등 고급 기능',
      '',
      'Ultra',
      '- 스마트 기능 200 / 200 / 200회',
      '- 상위 기능',
      '',
      '크레딧',
      '- 현재 플랜 권한 안에서 사용하는 추가 발행 횟수',
      '- 만료 없음',
      '- 환불 불가',
      '',
      '구독은 기능과 월 기본 횟수를 바꾸고, 크레딧은 현재 플랜 안에서 발행 횟수만 늘립니다.'
    ].join('\n'),
    showCancel: false,
    confirmText: '확인'
  });
}

let accountUpgradeFreeClickBound = false;
