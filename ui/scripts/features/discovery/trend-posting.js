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

