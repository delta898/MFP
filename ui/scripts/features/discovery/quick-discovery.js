const QUICK_DISCOVERY_INPUT_TARGETS = Object.freeze({
  quick: Object.freeze({
    subject: 'quick-subject', keywords: 'quick-keywords', title: 'quick-title',
    instruction: 'quick-instruction', referenceUrl: 'quick-reference-url', label: '빠른 포스팅'
  }),
  blogNext: Object.freeze({
    subject: 'blog-next-subject', keywords: 'blog-next-keywords', title: 'blog-next-title',
    instruction: 'blog-next-instruction', referenceUrl: 'blog-next-reference-url', label: '블로그'
  })
});

function setQuickDiscoveryInputTarget(target) {
  quickDiscoveryInputTarget = Object.hasOwn(QUICK_DISCOVERY_INPUT_TARGETS, target) ? target : 'quick';
}

function getQuickDiscoveryInputTarget() {
  return QUICK_DISCOVERY_INPUT_TARGETS[quickDiscoveryInputTarget] || QUICK_DISCOVERY_INPUT_TARGETS.quick;
}

function getQuickDiscoveryInputElement(field) {
  const id = getQuickDiscoveryInputTarget()[field];
  return id ? document.getElementById(id) : null;
}

function readQuickDiscoveryInput(field) {
  return String(getQuickDiscoveryInputElement(field)?.value || '').trim();
}

function writeQuickDiscoveryInput(field, value) {
  const element = getQuickDiscoveryInputElement(field);
  if (element) element.value = String(value || '');
}

function getQuickDiscoveryInputValues() {
  return ['subject', 'keywords', 'title', 'instruction', 'referenceUrl'].map(readQuickDiscoveryInput);
}

function activateQuickDiscoveryInputMode() {
  if (quickDiscoveryInputTarget === 'blogNext') {
    if (typeof activateBlogNextInputMode === 'function') activateBlogNextInputMode('ai');
    return;
  }
  applyQuickInputMode('ai');
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
  if (quickTrendTopicContext.inputTarget && quickTrendTopicContext.inputTarget !== quickDiscoveryInputTarget) return null;
  const subject = readQuickDiscoveryInput('subject');
  const keywords = readQuickDiscoveryInput('keywords');
  if (subject !== quickTrendTopicContext.subject || keywords !== quickTrendTopicContext.keyword) return null;
  return quickTrendTopicContext;
}

function getActiveQuickRecommendationContext() {
  if (!quickRecommendationTopicContext) return null;
  if (quickRecommendationTopicContext.inputTarget !== quickDiscoveryInputTarget) return null;
  const subject = readQuickDiscoveryInput('subject');
  const keywords = readQuickDiscoveryInput('keywords');
  if (subject !== quickRecommendationTopicContext.subject || keywords !== quickRecommendationTopicContext.keywordsText) return null;
  return quickRecommendationTopicContext;
}

function syncQuickTopicOrigin() {
  const originEl = document.getElementById('quick-topic-origin');
  if (!originEl) return;
  if (quickDiscoveryInputTarget !== 'quick') {
    originEl.hidden = true;
    return;
  }
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
  const basis = String(item?.recommendation?.basis || '').trim().toLowerCase();
  const activityRef = refs.find((ref) => String(ref?.kind || '').toLowerCase() === 'activity');
  const activityStage = String(activityRef?.stage || '').trim().toLowerCase();
  if (basis === 'request' || refs.some((ref) => String(ref?.kind || '').toLowerCase() === 'request')) return '입력 힌트 기반';
  if (basis === 'trend' || refs.some((ref) => ['trends', 'knowledge'].includes(String(ref?.kind || '').toLowerCase()))) return '최근 트렌드';
  if (basis === 'saved_interest' || refs.some((ref) => ['topic', 'facet', 'topic_facet'].includes(String(ref?.kind || '').toLowerCase()))) return '저장한 관심 주제';
  if (basis === 'writing_activity' || activityRef) {
    if (activityStage === 'published') return '발행 글 기반';
    if (activityStage === 'drafted') return '작성한 초안 기반';
    return '최근 글감 활동';
  }
  return '근거 확인 필요';
}

function setQuickDiscoveryModalOpen(open) {
  const modal = document.getElementById('quick-discovery-modal');
  if (!modal) return;
  if (open) {
    // Closing and reopening the dialog must not silently begin another charged use.
    // Keep an in-progress recommendation flow until the user explicitly continues.
    if (!quickKeywordDiscoveryState.smartUsageSessionId) {
      quickKeywordDiscoveryState.smartUsageSessionId = createSmartUsageSessionId();
    }
    refreshSmartUsageHints();
    void loadAccountOverview({ force: true })
      .then(() => refreshSmartUsageHints())
      .catch(() => {});
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

function readSmartUsageNumber(usage, camelKey, snakeKey) {
  const value = usage?.[camelKey] ?? usage?.[snakeKey];
  if (value === null || value === undefined || value === '') return null;
  return Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : null;
}

function getQuickTopicRequestsRemaining() {
  return readSmartUsageNumber(quickTopicRecommendationState.smartUsage, 'requestsRemaining', 'requests_remaining');
}

function quickTopicNeedsAnotherUse() {
  if (!quickTopicRecommendationState.smartUsageSessionId) return false;
  if (getQuickTopicRequestsRemaining() === 0) return true;
  const startedAt = Number(quickTopicRecommendationState.smartUsageStartedAt) || 0;
  return startedAt > 0 && (Date.now() - startedAt) >= (15 * 60 * 1000);
}

function formatQuickTopicUsageHint() {
  const localUsage = quickTopicRecommendationState.smartUsage;
  const localRemaining = readSmartUsageNumber(localUsage, 'remaining', 'remaining');
  const localLimit = readSmartUsageNumber(localUsage, 'limit', 'limit');
  const monthlyHint = localRemaining !== null && localLimit !== null
    ? `${localRemaining} / ${localLimit}회 남음`
    : formatSmartUsageHint('content_idea');
  const requestsRemaining = getQuickTopicRequestsRemaining();
  if (quickTopicRecommendationState.loading && localRemaining !== null) {
    return `${monthlyHint} · 새 추천을 준비하고 있어요`;
  }
  if (requestsRemaining === null) return monthlyHint || '이용 가능 횟수 확인 중';
  const guidance = requestsRemaining > 0
    ? '한 번 더 새로운 글감을 받아볼 수 있어요'
    : '계속 추천받으면 이용 가능 횟수 1회가 사용됩니다';
  return [monthlyHint, guidance].filter(Boolean).join(' · ');
}

function getQuickTopicRefreshLabel() {
  if (!quickTopicRecommendationState.loaded) return '글감 추천';
  return quickTopicNeedsAnotherUse() ? '계속 추천받기' : '다른 글감 추천';
}

async function beginAnotherQuickTopicUse() {
  const item = getSmartUsageItem('content_idea');
  const remaining = readSmartUsageNumber(item, 'remaining', 'remaining');
  if (remaining === 0) {
    await showUiPopup('이번 달 글감 추천 이용 가능 횟수를 모두 사용했습니다.');
    return false;
  }
  const usageChange = remaining === null ? '' : `\n${remaining}회 → ${Math.max(0, remaining - 1)}회`;
  const confirmed = await showUiConfirm(
    `새로운 글감을 더 추천받으면 이용 가능 횟수 1회가 사용됩니다.${usageChange}\n\n추천을 만들지 못하면 횟수는 사용되지 않습니다.`,
    {
      title: '계속 추천받을까요?',
      confirmText: '계속 추천받기',
      cancelText: '취소'
    }
  );
  if (!confirmed) return false;
  quickTopicRecommendationState.smartUsageSessionId = createSmartUsageSessionId();
  quickTopicRecommendationState.smartUsage = quickTopicRecommendationState.smartUsage
    ? {
        ...quickTopicRecommendationState.smartUsage,
        requestsRemaining: null,
        requests_remaining: null
      }
    : null;
  quickTopicRecommendationState.smartUsageStartedAt = 0;
  return true;
}

function refreshSmartUsageHints() {
  setText('quick-topic-smart-usage', formatQuickTopicUsageHint());
  setText('quick-keyword-smart-usage', formatSmartUsageHint('keyword_discovery'));
  setText('quick-title-smart-usage', formatSmartUsageHint('title_recommendation'));
}

function applySmartUsageUpdate(usage) {
  if (!usage?.capability) return;
  const capability = String(usage.capability);
  if (String(usage.capability) === 'content_idea') {
    quickTopicRecommendationState.smartUsage = { ...usage };
  }
  const currentAccountItem = getSmartUsageItem(capability) || latestSmartUsageByCapability.get(capability) || {};
  const latestUsage = { ...currentAccountItem, ...usage };
  latestSmartUsageByCapability.set(capability, latestUsage);
  smartUsageRevision += 1;
  if (!lastAccountOverview?.smart_usage) {
    refreshSmartUsageHints();
    return;
  }
  const items = Array.isArray(lastAccountOverview.smart_usage.items)
    ? lastAccountOverview.smart_usage.items
    : [];
  const index = items.findIndex((item) => String(item?.capability || '') === capability);
  const next = latestUsage;
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
  const sourceOrder = ['입력 힌트 기반', '최근 트렌드', '저장한 관심 주제', '발행 글 기반', '작성한 초안 기반', '최근 글감 활동'];
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
  setText('quick-topic-smart-usage', formatQuickTopicUsageHint());
  if (refreshBtn) {
    refreshBtn.disabled = quickTopicRecommendationState.loading;
    refreshBtn.setAttribute('aria-busy', String(quickTopicRecommendationState.loading));
    refreshBtn.textContent = getQuickTopicRefreshLabel();
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
    statusEl.textContent = quickTopicRecommendationState.error
      ? `추천을 불러오지 못했습니다: ${quickTopicRecommendationState.error}`
      : (quickTopicRecommendationState.loaded
      ? '지금 바로 드릴 추천이 없습니다. 다른 추천을 눌러 다시 살펴보세요.'
      : '버튼을 누르면 최근 글쓰기와 관심 주제를 바탕으로 글감을 찾아드립니다.');
    listEl.innerHTML = '';
    return;
  }
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
  if (refresh && quickTopicNeedsAnotherUse() && !await beginAnotherQuickTopicUse()) return;
  quickTopicRecommendationState.loading = true;
  document.getElementById('quick-topic-recommendations-refresh')?.setAttribute('disabled', '');
  quickTopicRecommendationState.error = '';
  renderQuickTopicRecommendations();
  try {
    const params = new URLSearchParams({ limit: '3' });
    if (refresh) params.set('refresh', '1');
    if (topicQuery) params.set('query', topicQuery);
    if (!quickTopicRecommendationState.smartUsageSessionId) {
      quickTopicRecommendationState.smartUsageSessionId = createSmartUsageSessionId();
    }
    params.set('session_id', quickTopicRecommendationState.smartUsageSessionId);
    params.set('operation_id', createSmartUsageSessionId());
    const result = await fetchJson(`/api/v1/blog/topic-recommendations?${params.toString()}`);
    quickTopicRecommendationState.items = Array.isArray(result?.ideas) ? result.ideas.slice(0, 3) : [];
    quickTopicRecommendationState.loaded = true;
    quickTopicRecommendationState.query = topicQuery;
    quickTopicRecommendationState.smartUsageSessionId = result?.smart_usage_session_id
      || quickTopicRecommendationState.smartUsageSessionId;
    if (result?.smart_usage && !quickTopicRecommendationState.smartUsageStartedAt) {
      quickTopicRecommendationState.smartUsageStartedAt = Date.now();
    }
    applySmartUsageUpdate(result?.smart_usage);
  } catch (error) {
    quickTopicRecommendationState.loaded = true;
    quickTopicRecommendationState.query = topicQuery;
    if (error.code === 'SMART_SESSION_REQUEST_LIMIT') {
      quickTopicRecommendationState.smartUsage = {
        ...(quickTopicRecommendationState.smartUsage || {}),
        capability: 'content_idea',
        requestsRemaining: 0
      };
      quickTopicRecommendationState.error = '이번 추천에서 받을 수 있는 글감을 모두 확인했습니다.';
    } else {
      quickTopicRecommendationState.items = [];
      quickTopicRecommendationState.error = error.message;
    }
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
  const values = getQuickDiscoveryInputValues();
  const activeContext = getActiveQuickRecommendationContext();
  const same = activeContext?.id === String(item.id || '');
  if (!same && values.some(Boolean)) {
    const confirmed = await showUiConfirm(
      `${getQuickDiscoveryInputTarget().label}에 작성 중인 내용이 있습니다. 선택한 추천 글감으로 교체할까요?`,
      { title: '추천 글감으로 교체', confirmText: '교체', cancelText: '취소' }
    );
    if (!confirmed) return false;
  }
  activateQuickDiscoveryInputMode();
  const keywordsText = Array.isArray(item.keywords) ? item.keywords.join(', ') : '';
  // A newly selected topic starts a new draft; do not keep a title from the previous one.
  writeQuickDiscoveryInput('title', '');
  writeQuickDiscoveryInput('subject', String(item.title || '').trim());
  writeQuickDiscoveryInput('keywords', keywordsText);
  writeQuickDiscoveryInput('instruction', String(item.summary || '').trim());
  writeQuickDiscoveryInput('referenceUrl', '');
  quickTrendTopicContext = null;
  quickRecommendationTopicContext = {
    inputTarget: quickDiscoveryInputTarget,
    id: String(item.id || ''),
    subject: String(item.title || '').trim(),
    keywordsText,
    topicSeed: String(item?.recommendation?.topic_seed || '').trim(),
    recommendation: item.recommendation
  };
  syncQuickTopicOrigin();
  await recordQuickTopicRecommendationOutcome(item, 'selected');
  getQuickDiscoveryInputElement('subject')?.focus();
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
  const values = getQuickDiscoveryInputValues();
  if (values.some(Boolean)) {
    const confirmed = await showUiConfirm(
      `${getQuickDiscoveryInputTarget().label}에 작성 중인 내용이 있습니다. 선택한 키워드로 새 글을 시작할까요?`,
      { title: '선택 키워드로 교체', confirmText: '교체', cancelText: '취소' }
    );
    if (!confirmed) return false;
  }
  activateQuickDiscoveryInputMode();
  writeQuickDiscoveryInput('title', '');
  const subjectInput = getQuickDiscoveryInputElement('subject');
  if (subjectInput && !String(subjectInput.value || '').trim()) {
    subjectInput.value = keywords[0];
  }
  writeQuickDiscoveryInput('keywords', keywords.join(', '));
  writeQuickDiscoveryInput('instruction', '');
  writeQuickDiscoveryInput('referenceUrl', '');
  quickTrendTopicContext = null;
  quickRecommendationTopicContext = null;
  syncQuickTopicOrigin();
  getQuickDiscoveryInputElement('subject')?.focus();
  return true;
}
