const blogNextTrendState = {
  meta: null,
  items: [],
  itemsById: new Map(),
  queryRange: null,
  savedIds: new Set(),
  loading: false,
  bound: false
};

let blogNextTrendContext = null;

function formatBlogNextTrendDate(value) {
  const parts = String(value || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isInteger(part))) return String(value || '');
  return `${parts[1]}월 ${parts[2]}일`;
}

function subtractBlogNextTrendDays(ymd, days) {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function getSelectedBlogNextTrendCategories() {
  return Array.from(document.querySelectorAll('[data-blog-next-trend-category].active'))
    .map(button => String(button.dataset.category || '').trim())
    .filter(Boolean);
}

function syncBlogNextTrendCategoryLimit() {
  const selected = getSelectedBlogNextTrendCategories();
  const atLimit = selected.length >= 5;
  document.querySelectorAll('[data-blog-next-trend-category]').forEach((button) => {
    button.disabled = atLimit && !button.classList.contains('active');
  });
  const count = document.getElementById('blog-next-trend-category-count');
  const hint = document.getElementById('blog-next-trend-category-hint');
  if (count) count.textContent = `${selected.length}/5`;
  if (hint) hint.textContent = atLimit
    ? '최대 5개를 선택했습니다. 다른 카테고리를 선택하려면 하나를 해제하세요.'
    : '최대 5개까지 선택할 수 있습니다.';
}

function syncBlogNextTrendPeriod() {
  const custom = document.getElementById('blog-next-trend-period')?.value === 'custom';
  const fields = document.getElementById('blog-next-trend-custom-dates');
  if (fields) fields.hidden = !custom;
}

function resolveBlogNextTrendDateRange() {
  const latest = String(blogNextTrendState.meta?.dateRange?.max || '').trim();
  const period = document.getElementById('blog-next-trend-period')?.value || 'latest';
  if (period === 'custom') {
    return {
      dateFrom: String(document.getElementById('blog-next-trend-date-from')?.value || '').trim(),
      dateTo: String(document.getElementById('blog-next-trend-date-to')?.value || '').trim()
    };
  }
  return { dateFrom: period === '7days' ? subtractBlogNextTrendDays(latest, 6) : latest, dateTo: latest };
}

function renderBlogNextTrendCategories(categories, selectedCategories = null) {
  const container = document.getElementById('blog-next-trend-categories');
  if (!container) return;
  const hasSelectionSnapshot = Array.isArray(selectedCategories);
  const selected = new Set(hasSelectionSnapshot ? selectedCategories : []);
  container.innerHTML = (Array.isArray(categories) ? categories : []).map((category, index) => `
    <button type="button" class="category-option-btn${hasSelectionSnapshot ? (selected.has(category) ? ' active' : '') : (index === 0 ? ' active' : '')}"
      data-blog-next-trend-category data-category="${escapeHtml(category)}"
      aria-pressed="${hasSelectionSnapshot ? String(selected.has(category)) : (index === 0 ? 'true' : 'false')}">${escapeHtml(category)}</button>
  `).join('') || '<span class="category-hint">선택할 수 있는 카테고리가 없습니다.</span>';
  syncBlogNextTrendCategoryLimit();
}

function renderBlogNextTrendChange(change = {}) {
  const type = ['up', 'down', 'new', 'steady'].includes(change.type) ? change.type : 'steady';
  const fallback = { up: '상승', down: '하락', new: '신규', steady: '유지' }[type];
  return `<span class="trend-change trend-change-${type}">${escapeHtml(change.raw || fallback)}</span>`;
}

function getBlogNextTrendChangeValue(change = {}) {
  const type = String(change?.type || 'steady');
  const amount = Number(change?.amount);
  if (type === 'new') return Number.POSITIVE_INFINITY;
  if (type === 'up') return Number.isFinite(amount) ? Math.abs(amount) : 0;
  if (type === 'down') return Number.isFinite(amount) ? -Math.abs(amount) : 0;
  return 0;
}

function getFilteredBlogNextTrends() {
  const keyword = String(document.getElementById('blog-next-trend-filter-keyword')?.value || '')
    .replace(/\s+/g, ' ').trim().toLocaleLowerCase('ko-KR');
  const view = String(document.getElementById('blog-next-trend-filter-view')?.value || 'all');
  let filtered = blogNextTrendState.items.filter((item) => {
    const changeType = String(item?.change?.type || 'steady');
    if (keyword && !String(item?.keyword || '').toLocaleLowerCase('ko-KR').includes(keyword)) return false;
    if (view === 'all' || view === 'top10') return true;
    return changeType === view;
  });
  if (view === 'top10') {
    filtered = filtered
      .map((item, index) => ({ item, index }))
      .sort((left, right) => getBlogNextTrendChangeValue(right.item?.change) - getBlogNextTrendChangeValue(left.item?.change) || left.index - right.index)
      .slice(0, 10)
      .map(({ item }) => item);
  }
  return filtered;
}

function renderBlogNextTrendResults(items) {
  const body = document.getElementById('blog-next-trend-results');
  if (!body) return;
  if (Array.isArray(items)) {
    blogNextTrendState.items = items.slice();
    blogNextTrendState.itemsById = new Map(items.map(item => [String(item.id || ''), item]));
  }
  const visible = getFilteredBlogNextTrends();
  const count = document.getElementById('blog-next-trend-filter-count');
  if (count) count.textContent = blogNextTrendState.items.length > 0
    ? `${blogNextTrendState.items.length}개 중 ${visible.length}개 표시`
    : (blogNextTrendState.queryRange ? '0개 중 0개 표시' : '조회 후 사용할 수 있습니다.');
  if (blogNextTrendState.items.length === 0) {
    body.innerHTML = blogNextTrendState.queryRange
      ? '<tr><td colspan="5">조건에 맞는 트렌드 키워드가 없습니다.</td></tr>'
      : '<tr><td colspan="5">아직 조회하지 않았습니다.</td></tr>';
    return;
  }
  if (visible.length === 0) {
    body.innerHTML = '<tr><td colspan="5">현재 결과 필터에 맞는 키워드가 없습니다.</td></tr>';
    return;
  }
  body.innerHTML = visible.map((item) => {
    const id = String(item.id || '');
    const saved = blogNextTrendState.savedIds.has(`${id}:${String(item.latestTrendDate || '')}`);
    const categories = (Array.isArray(item.categories) ? item.categories : [])
      .map(category => `<span class="trend-category-tag">${escapeHtml(category)}</span>`).join('');
    return `<tr data-blog-next-trend-id="${escapeHtml(id)}">
      <td><div class="trend-category-tags">${categories}</div></td>
      <td>${escapeHtml(item.latestTrendDate)}</td>
      <td class="trend-keyword-cell">${escapeHtml(item.keyword)}</td>
      <td>${renderBlogNextTrendChange(item.change)}</td>
      <td><div class="trend-posting-row-actions">
        <button type="button" class="primary" data-blog-next-trend-select data-item-id="${escapeHtml(id)}">빠른 글 작성</button>
        <button type="button" class="secondary" data-blog-next-trend-save data-item-id="${escapeHtml(id)}"${saved ? ' disabled' : ''}>${saved ? '보관 완료' : '글감 보관'}</button>
      </div></td>
    </tr>`;
  }).join('');
}

async function loadBlogNextTrendMeta(options = {}) {
  if (blogNextTrendState.loading) return;
  if (blogNextTrendState.meta && options.force !== true) return;
  const status = document.getElementById('blog-next-trend-status');
  const queryButton = document.getElementById('blog-next-trend-query');
  const refreshButton = document.getElementById('blog-next-trend-refresh');
  const previousLatest = String(blogNextTrendState.meta?.dateRange?.max || '');
  const selectedCategories = options.force === true ? getSelectedBlogNextTrendCategories() : null;
  const preservedDates = options.force === true
    ? Object.fromEntries(['from', 'to'].map((side) => [side, document.getElementById(`blog-next-trend-date-${side}`)?.value || '']))
    : {};
  blogNextTrendState.loading = true;
  if (queryButton) queryButton.disabled = true;
  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.classList.add('is-loading');
    refreshButton.setAttribute('aria-busy', 'true');
  }
  if (status) status.textContent = options.force === true
    ? '최신 데이터 날짜를 확인하는 중...'
    : '트렌드 조회 정보를 불러오는 중...';
  try {
    const meta = await fetchJson('/api/v1/trend-posting/meta');
    blogNextTrendState.meta = meta;
    const latest = String(meta?.dateRange?.max || '');
    const label = formatBlogNextTrendDate(latest);
    const badge = document.getElementById('blog-next-trend-latest-badge');
    const period = document.getElementById('blog-next-trend-period');
    if (badge) badge.textContent = label ? `최신 데이터 ${label}` : '최신 날짜 없음';
    const latestOption = period?.querySelector('option[value="latest"]');
    if (latestOption) latestOption.textContent = label ? `최신 데이터 (${label})` : '최신 데이터';
    ['from', 'to'].forEach((side) => {
      const input = document.getElementById(`blog-next-trend-date-${side}`);
      if (!input) return;
      const minimum = String(meta?.dateRange?.min || '');
      const preserved = String(preservedDates[side] || '');
      input.min = minimum;
      input.max = latest;
      input.value = preserved
        ? (minimum && preserved < minimum ? minimum : (latest && preserved > latest ? latest : preserved))
        : latest;
    });
    renderBlogNextTrendCategories(meta?.categories || [], selectedCategories);
    if (status) {
      status.textContent = options.force === true
        ? (previousLatest === latest
          ? '이미 최신 데이터입니다.'
          : (label ? `최신 데이터가 ${label}로 갱신되었습니다.` : '최신 날짜를 확인하지 못했습니다.'))
        : '기간과 트렌드 카테고리를 선택한 뒤 조회하세요.';
    }
  } catch (error) {
    if (status) status.textContent = options.force === true
      ? `최신 데이터 날짜를 확인하지 못했습니다: ${error.message}`
      : `조회 정보를 불러오지 못했습니다: ${error.message}`;
  } finally {
    blogNextTrendState.loading = false;
    const currentMeta = blogNextTrendState.meta;
    if (queryButton) queryButton.disabled = !String(currentMeta?.dateRange?.max || '')
      || !Array.isArray(currentMeta?.categories) || currentMeta.categories.length === 0;
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.classList.remove('is-loading');
      refreshButton.setAttribute('aria-busy', 'false');
    }
  }
}

async function queryBlogNextTrends() {
  if (blogNextTrendState.loading) return;
  const categories = getSelectedBlogNextTrendCategories();
  if (categories.length === 0) {
    await showUiPopup('트렌드 카테고리를 하나 이상 선택해 주세요.');
    return;
  }
  const { dateFrom, dateTo } = resolveBlogNextTrendDateRange();
  const fromTime = Date.parse(`${dateFrom}T00:00:00.000Z`);
  const toTime = Date.parse(`${dateTo}T00:00:00.000Z`);
  const inclusiveDays = Math.floor((toTime - fromTime) / 86400000) + 1;
  if (!dateFrom || !dateTo || !Number.isFinite(inclusiveDays) || inclusiveDays < 1) {
    await showUiPopup('조회 기간을 확인해 주세요.');
    return;
  }
  if (inclusiveDays > 31) {
    await showUiPopup('직접 지정 기간은 최대 31일까지 조회할 수 있습니다.');
    return;
  }
  const status = document.getElementById('blog-next-trend-status');
  const queryButton = document.getElementById('blog-next-trend-query');
  const refreshButton = document.getElementById('blog-next-trend-refresh');
  blogNextTrendState.loading = true;
  if (queryButton) queryButton.disabled = true;
  if (refreshButton) refreshButton.disabled = true;
  if (status) status.textContent = '트렌드 키워드를 조회하는 중...';
  try {
    const params = new URLSearchParams({ dateFrom, dateTo });
    categories.forEach(category => params.append('categories[]', category));
    const result = await fetchJson(`/api/v1/trend-posting/keywords?${params.toString()}`);
    blogNextTrendState.queryRange = { dateFrom, dateTo };
    blogNextTrendState.savedIds.clear();
    renderBlogNextTrendResults(result?.items || []);
    if (status) status.textContent = `${Number(result?.count || 0)}개의 키워드를 찾았습니다.`;
  } catch (error) {
    if (status) status.textContent = `트렌드 조회에 실패했습니다: ${error.message}`;
  } finally {
    blogNextTrendState.loading = false;
    if (queryButton) queryButton.disabled = false;
    if (refreshButton) refreshButton.disabled = false;
  }
}

function clearBlogNextTrendContext() {
  blogNextTrendContext = null;
}

async function selectBlogNextTrend(item) {
  if (!item) return;
  const keyword = String(item.keyword || '').trim();
  if (!keyword) return;
  const currentValues = ['blog-next-subject', 'blog-next-title', 'blog-next-keywords', 'blog-next-instruction', 'blog-next-reference-url']
    .map(id => String(document.getElementById(id)?.value || '').trim());
  const sameTrend = blogNextTrendContext?.id === String(item.id || '')
    && blogNextTrendContext?.trendDate === String(item.latestTrendDate || '');
  if (!sameTrend && currentValues.some(Boolean)) {
    const confirmed = await showUiConfirm('작성 중인 글감을 선택한 트렌드 키워드로 바꿀까요?', {
      title: '글감 교체', confirmText: '교체', cancelText: '취소'
    });
    if (!confirmed) return;
  }
  activateBlogNextTab('quick');
  activateBlogNextInputMode('ai');
  document.getElementById('blog-next-subject').value = keyword;
  document.getElementById('blog-next-title').value = '';
  document.getElementById('blog-next-keywords').value = keyword;
  document.getElementById('blog-next-instruction').value = '';
  document.getElementById('blog-next-reference-url').value = '';
  blogNextTrendContext = {
    id: String(item.id || ''),
    keyword,
    trendDate: String(item.latestTrendDate || ''),
    source: 'naver_trend'
  };
  setBlogNextTopicResult('');
  document.getElementById('blog-next-subject')?.focus();
}

async function saveBlogNextTrend(item, button) {
  if (!item || !button || button.disabled) return;
  button.disabled = true;
  button.textContent = '보관 중...';
  try {
    await postJson('/api/v1/trend-posting/topics', {
      keyword: item.keyword,
      trendDate: item.latestTrendDate
    });
    blogNextTrendState.savedIds.add(`${String(item.id || '')}:${String(item.latestTrendDate || '')}`);
    button.textContent = '보관 완료';
    if (typeof loadBlogNextQueue === 'function') await loadBlogNextQueue({ force: true });
  } catch (error) {
    button.disabled = false;
    button.textContent = '다시 시도';
    const status = document.getElementById('blog-next-trend-status');
    if (status) status.textContent = `글감을 보관하지 못했습니다: ${error.message}`;
  }
}

function initBlogNextTrendPosting() {
  if (blogNextTrendState.bound) return;
  document.getElementById('blog-next-trend-period')?.addEventListener('change', syncBlogNextTrendPeriod);
  document.getElementById('blog-next-trend-refresh')?.addEventListener('click', () => {
    void loadBlogNextTrendMeta({ force: true });
  });
  document.getElementById('blog-next-trend-categories')?.addEventListener('click', (event) => {
    const button = event.target?.closest('[data-blog-next-trend-category]');
    if (!button || button.disabled) return;
    const active = !button.classList.contains('active');
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    syncBlogNextTrendCategoryLimit();
  });
  document.getElementById('blog-next-trend-query')?.addEventListener('click', queryBlogNextTrends);
  document.getElementById('blog-next-trend-filters')?.addEventListener('input', renderBlogNextTrendResults);
  document.getElementById('blog-next-trend-filter-reset')?.addEventListener('click', () => {
    const keyword = document.getElementById('blog-next-trend-filter-keyword');
    const view = document.getElementById('blog-next-trend-filter-view');
    if (keyword) keyword.value = '';
    if (view) view.value = 'all';
    renderBlogNextTrendResults();
  });
  document.getElementById('blog-next-trend-results')?.addEventListener('click', (event) => {
    const button = event.target?.closest('[data-blog-next-trend-select], [data-blog-next-trend-save]');
    if (!button) return;
    const item = blogNextTrendState.itemsById.get(String(button.dataset.itemId || ''));
    if (!item) return;
    if (button.matches('[data-blog-next-trend-save]')) void saveBlogNextTrend(item, button);
    else void selectBlogNextTrend(item);
  });
  blogNextTrendState.bound = true;
}
