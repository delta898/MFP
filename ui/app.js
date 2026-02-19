async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(body?.error?.message || `HTTP ${res.status}`);
  }
  return body.data;
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(body?.error?.message || `HTTP ${res.status}`);
  }
  return body.data;
}

function formatRemaining(value) {
  if (typeof value === 'number' && value < 0) return '무제한';
  if (typeof value === 'number') return `${value}회`;
  return '-';
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setPre(id, data) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = JSON.stringify(data, null, 2);
}

let blogTopicsCache = [];
let blogTrendsCache = [];
const blogSelectedRowIndices = new Set();
const blogTrendsSelectedRowIndices = new Set();
let blogLastBatchResult = null;
const blogRecentBatchRows = new Map();
let blogInlineEditState = null;
let blogActiveTab = 'quick';
let blogTrendsCollectInFlight = false;
const blogPageState = {
  trends: { limit: 50, offset: 0, total: 0 },
  topics: { limit: 50, offset: 0, total: 0 }
};
let settingsLoadedOnce = false;
let settingsAdvancedLoadedOnce = false;
let uiConfigReady = true;
let uiConfigPopupShown = false;
let uiConfigStatusMessage = '';
let naverLoginPollTimer = null;

function showUiPopup(message) {
  const text = String(message || '').trim();
  if (!text) return;
  window.alert(text);
}

async function loadConfigStatus() {
  try {
    const status = await fetchJson('/api/v1/config/status');
    uiConfigReady = status?.ready === true;
    uiConfigStatusMessage = String(status?.message || '').trim();
    if (!uiConfigReady && !uiConfigPopupShown) {
      uiConfigPopupShown = true;
      const popupText = [
        '설정 파일이 준비되지 않았습니다.',
        '',
        '설정 메뉴에서 주요 항목을 입력 후 저장하세요.',
        '',
        uiConfigStatusMessage || '- config/config.txt 또는 config/config.txt.sample 확인 필요'
      ].join('\n');
      showUiPopup(popupText);
    }
    return status;
  } catch (e) {
    uiConfigReady = false;
    uiConfigStatusMessage = String(e.message || '');
    if (!uiConfigPopupShown) {
      uiConfigPopupShown = true;
      showUiPopup(`설정 상태 확인 중 오류가 발생했습니다.\n${uiConfigStatusMessage}`);
    }
    return null;
  }
}

function guardUiConfigReady(featureLabel = '이 기능') {
  if (uiConfigReady) return true;
  showUiPopup([
    `${featureLabel}을(를) 실행하려면 설정이 필요합니다.`,
    '상단 메뉴의 [설정]에서 주요 항목 저장 후 다시 시도하세요.',
    '',
    uiConfigStatusMessage || ''
  ].join('\n'));
  return false;
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('ko-KR', { hour12: false });
}

function renderNaverLoginStatus(data) {
  const resultEl = document.getElementById('settings-naver-login-result');
  if (!resultEl) return;
  if (!data) {
    resultEl.textContent = '로그인 상태를 불러오지 못했습니다.';
    return;
  }

  const lines = [
    `상태: ${data.status || '-'}`,
    `메시지: ${data.message || '-'}`,
    `시작: ${formatDateTime(data.startedAt)}`,
    `완료: ${formatDateTime(data.finishedAt)}`,
    `경과: ${typeof data.elapsedSeconds === 'number' ? `${data.elapsedSeconds}초` : '-'}`,
    `감지 방식: ${data.detectedBy || '-'}`,
    `오류: ${data.error || '-'}`
  ];
  resultEl.textContent = lines.join('\n');
}

function stopNaverLoginPolling() {
  if (naverLoginPollTimer) {
    clearInterval(naverLoginPollTimer);
    naverLoginPollTimer = null;
  }
}

function startNaverLoginPolling() {
  stopNaverLoginPolling();
  naverLoginPollTimer = setInterval(async () => {
    const status = await loadNaverLoginStatus({ silent: true });
    if (!status?.isRunning) {
      stopNaverLoginPolling();
      await loadDashboard();
    }
  }, 1000);
}

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

function renderBlogTrendsTable(items) {
  const tbody = document.getElementById('blog-trends-table-body');
  if (!tbody) return;

  if (!Array.isArray(items) || items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">조회 결과가 없습니다.</td></tr>';
    updateTrendsSelectionUi();
    return;
  }

  tbody.innerHTML = items.map(item => {
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
  updateTrendsSelectionUi();
}

async function loadBlogTrends(options = {}) {
  if (!guardUiConfigReady('Trends 조회')) return;
  const silent = Boolean(options.silent);
  const resultBox = document.getElementById('blog-trends-result');
  const pageInfo = getPageInfo('trends');
  const q = (document.getElementById('blog-trends-q-filter')?.value || '').trim();
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('limit', String(pageInfo.limit));
  params.set('offset', String(pageInfo.offset));
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

  const shouldProceed = window.confirm(confirmMessage);
  if (shouldProceed !== true) {
    return;
  }

  blogTrendsCollectInFlight = true;
  if (resultBox) resultBox.textContent = `트렌드 수집 중... (기준일: ${targetDateYmd})`;
  try {
    const payload = { date: targetDateYmd };
    const data = await postJson('/api/v1/trends/collect', payload);
    if (resultBox) resultBox.textContent = JSON.stringify(data, null, 2);
    clearTrendsSelections();
    setPageInfo('trends', { offset: 0 });
    await Promise.all([loadDashboard(), loadBlogTrends({ silent: true })]);
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
  const allowed = ['quick', 'trends', 'topics', 'shopping'];
  const target = allowed.includes(String(tabName)) ? String(tabName) : 'quick';
  blogActiveTab = target;

  const tabButtons = Array.from(document.querySelectorAll('.blog-tab-btn'));
  const tabPanels = Array.from(document.querySelectorAll('.blog-tab-panel'));
  tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.blogTab === target));
  tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === `blog-tab-${target}`));

  const forceReload = options.forceReload !== false;
  if (!forceReload) return;

  if (target === 'trends') {
    loadBlogTrends();
    return;
  }
  if (target === 'topics') {
    loadBlogTopics();
    return;
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

function normalizeCommaListText(input) {
  return String(input || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .join(', ');
}

async function loadDashboard() {
  try {
    const [health, license, session, capabilities] = await Promise.all([
      fetchJson('/api/v1/health'),
      fetchJson('/api/v1/license/status?quiet=1'),
      fetchJson('/api/v1/session/naver'),
      fetchJson('/api/v1/capabilities?quiet=1')
    ]);

    setText('health-text', `상태: ${health.status} / 버전: ${health.version}`);
    setText(
      'license-text',
      `${license.planName || license.planCode || '-'} | 사용 ${license.usageCount ?? '-'} / 총 ${license.usageLimit ?? '-'} | 잔여 ${formatRemaining(license.remaining)}`
    );
    setText('session-text', session.valid ? '유효' : `만료/오류 (${session.reason || 'unknown'})`);
    setPre('cap-text', capabilities);

    setText('top-plan', `플랜: ${license.planName || license.planCode || '-'}`);
    setText('top-remaining', `잔여: ${formatRemaining(license.remaining)}`);
    setText('top-session', `세션: ${session.valid ? '유효' : '만료'}`);
  } catch (e) {
    setText('health-text', `오류: ${e.message}`);
    setText('license-text', `오류: ${e.message}`);
    setText('session-text', `오류: ${e.message}`);
    setPre('cap-text', { error: e.message });
  }
}

function bindNavigation() {
  const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
  const views = Array.from(document.querySelectorAll('.view'));

  const activate = (viewName) => {
    navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewName));
    views.forEach(view => view.classList.toggle('active', view.id === `view-${viewName}`));
    if (viewName === 'blog') {
      activateBlogTab(blogActiveTab, { forceReload: true });
      return;
    }
    if (viewName === 'settings') {
      if (!settingsLoadedOnce) {
        loadSettingsMajor();
        loadNaverLoginStatus();
        settingsLoadedOnce = true;
      } else {
        loadNaverLoginStatus({ silent: true });
      }
    }
  };

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => activate(btn.dataset.view));
  });
}

function getSelectedBlogRowIndices() {
  return Array.from(blogSelectedRowIndices.values()).filter(v => Number.isInteger(v));
}

function getRecentBatchMeta(rowIndex) {
  return blogRecentBatchRows.get(rowIndex) || null;
}

function markRecentBatchRows(results) {
  for (const rowResult of (Array.isArray(results) ? results : [])) {
    const rowIndex = Number(rowResult?.rowIndex);
    if (!Number.isInteger(rowIndex)) continue;
    blogRecentBatchRows.set(rowIndex, {
      success: rowResult?.success === true
    });
  }
}

function clearPreviousBatchVisualState() {
  blogRecentBatchRows.clear();
  blogLastBatchResult = null;
  renderBlogLastBatchResult(null);
}

function clearBlogSelections() {
  blogSelectedRowIndices.clear();
  const selectors = Array.from(document.querySelectorAll('input.row-selector'));
  selectors.forEach(el => {
    el.checked = false;
  });
  updateBlogSelectionUi();
}

function updateBlogSelectionUi() {
  const count = blogSelectedRowIndices.size;
  const sticky = document.getElementById('blog-sticky-actions');
  const countText = document.getElementById('blog-selected-count');
  if (countText) countText.textContent = `${count}건 선택`;
  if (sticky) sticky.classList.toggle('hidden', count <= 0);
}

function renderBlogTable(items) {
  const tbody = document.getElementById('blog-table-body');
  if (!tbody) return;

  if (!items || items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10">조회 결과가 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = items.map(item => {
    const subject = escapeHtml(item.subject || '');
    const instruction = escapeHtml(item.content_guide?.additional_instructions || '');
    const referenceUrl = escapeHtml((item.content_guide?.reference_urls || []).join(', '));
    const runtimeLog = escapeHtml(item.runtimeLog || '');
    const keywords = (Array.isArray(item.keywords) ? item.keywords : [])
      .join(', ')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const status = escapeHtml(item.status || '');
    const imageGeneration = Boolean(item.image_options?.generate);
    const externalReference = Boolean(item.use_external_ref);
    const recentMeta = getRecentBatchMeta(item.rowIndex);
    const runningClass = runtimeLog ? 'running-row' : '';
    const recentClass = recentMeta ? (recentMeta.success ? 'recent-batch-success' : 'recent-batch-fail') : '';
    const subjectBadge = recentMeta
      ? `<span class="recent-badge ${recentMeta.success ? 'success' : 'fail'}">${recentMeta.success ? '방금 성공' : '방금 실패'}</span>`
      : '';
    const checked = blogSelectedRowIndices.has(item.rowIndex) ? 'checked' : '';
    const imageChecked = imageGeneration ? 'checked' : '';
    const externalChecked = externalReference ? 'checked' : '';
    return `
      <tr class="${[runningClass, recentClass].filter(Boolean).join(' ')}" data-row-index="${item.rowIndex}">
        <td><input type="checkbox" class="row-selector" name="blog-row" value="${item.rowIndex}" ${checked}></td>
        <td>${item.rowNumber}</td>
        <td class="editable-cell" data-field="subject">${subject || '-'}${subjectBadge}</td>
        <td class="editable-cell" data-field="keywords">${keywords || '-'}</td>
        <td class="editable-cell" data-field="instruction">${instruction || '-'}</td>
        <td class="editable-cell" data-field="referenceUrl">${referenceUrl || '-'}</td>
        <td class="toggle-cell"><input type="checkbox" class="inline-toggle" data-field="imageGeneration" data-row-index="${item.rowIndex}" ${imageChecked}></td>
        <td class="toggle-cell"><input type="checkbox" class="inline-toggle" data-field="externalReference" data-row-index="${item.rowIndex}" ${externalChecked}></td>
        <td class="runtime-log-cell">${runtimeLog}</td>
        <td>${status || '-'}</td>
      </tr>
    `;
  }).join('');
  updateBlogSelectionUi();
}

function getEditableFieldValue(item, field) {
  if (!item) return '';
  if (field === 'subject') return String(item.subject || '');
  if (field === 'keywords') return Array.isArray(item.keywords) ? item.keywords.join(', ') : '';
  if (field === 'instruction') return String(item.content_guide?.additional_instructions || '');
  if (field === 'referenceUrl') return Array.isArray(item.content_guide?.reference_urls) ? item.content_guide.reference_urls.join(', ') : '';
  return '';
}

function isRuntimeRunning(item) {
  return Boolean(String(item?.runtimeLog || '').trim());
}

async function cancelBlogInlineEdit() {
  if (!blogInlineEditState) return;
  const { cell, originalHtml } = blogInlineEditState;
  if (cell) {
    cell.innerHTML = originalHtml;
  }
  blogInlineEditState = null;
}

async function commitBlogInlineEdit() {
  if (!blogInlineEditState) return;

  const resultBox = document.getElementById('blog-action-result');
  const {
    rowIndex,
    field,
    editorEl,
    cell,
    originalHtml
  } = blogInlineEditState;

  const rawValue = String(editorEl?.value ?? '');
  let normalizedValue = rawValue;
  if (field === 'keywords' || field === 'referenceUrl') {
    normalizedValue = normalizeCommaListText(rawValue);
  } else {
    normalizedValue = rawValue.trim();
  }

  const item = findTopicByRowIndex(rowIndex);
  if (!item) {
    blogInlineEditState = null;
    await loadBlogTopics({ silent: true });
    return;
  }
  const beforeValue = getEditableFieldValue(item, field);
  if (normalizedValue === beforeValue) {
    cell.innerHTML = originalHtml;
    blogInlineEditState = null;
    return;
  }

  const patch = {};
  patch[field] = normalizedValue;

  try {
    if (resultBox) resultBox.textContent = `row ${rowIndex + 2} inline 수정 중...`;
    await saveBlogRowPatch(rowIndex, patch, { silent: true });
    blogInlineEditState = null;
    if (resultBox) resultBox.textContent = `row ${rowIndex + 2} inline 수정 완료`;
  } catch (e) {
    cell.innerHTML = originalHtml;
    blogInlineEditState = null;
    if (resultBox) resultBox.textContent = `오류: ${e.message}`;
  }
}

async function startBlogInlineEdit(cell) {
  if (!cell) return;
  const row = cell.closest('tr[data-row-index]');
  if (!row) return;
  const rowIndex = Number(row.dataset.rowIndex);
  const field = String(cell.dataset.field || '');
  if (!Number.isInteger(rowIndex)) return;
  if (!['subject', 'keywords', 'instruction', 'referenceUrl'].includes(field)) return;

  const item = findTopicByRowIndex(rowIndex);
  if (!item) return;
  if (isRuntimeRunning(item)) {
    const resultBox = document.getElementById('blog-action-result');
    if (resultBox) resultBox.textContent = `row ${rowIndex + 2}는 진행 중이라 수정할 수 없습니다.`;
    return;
  }

  if (blogInlineEditState) {
    await cancelBlogInlineEdit();
  }

  const originalHtml = cell.innerHTML;
  const initialValue = getEditableFieldValue(item, field);
  const multiline = field === 'instruction' || field === 'referenceUrl';
  const editorEl = document.createElement(multiline ? 'textarea' : 'input');
  if (!multiline) editorEl.type = 'text';
  editorEl.className = `inline-editor ${multiline ? 'multiline' : ''}`.trim();
  editorEl.value = initialValue;

  cell.innerHTML = '';
  cell.appendChild(editorEl);
  editorEl.focus();
  editorEl.select?.();

  blogInlineEditState = {
    rowIndex,
    field,
    cell,
    editorEl,
    originalHtml,
    committing: false
  };

  editorEl.addEventListener('keydown', async (e) => {
    if (!blogInlineEditState) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      await cancelBlogInlineEdit();
      return;
    }
    if (e.key === 'Enter') {
      if (multiline && !(e.ctrlKey || e.metaKey)) {
        return;
      }
      e.preventDefault();
      blogInlineEditState.committing = true;
      await commitBlogInlineEdit();
    }
  });

  editorEl.addEventListener('blur', async () => {
    if (!blogInlineEditState) return;
    if (blogInlineEditState.committing) return;
    blogInlineEditState.committing = true;
    await commitBlogInlineEdit();
  });
}

function renderBlogLastBatchResult(data) {
  const box = document.getElementById('blog-last-batch');
  if (!box) return;

  if (!data || !Array.isArray(data.results)) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }

  const total = Number(data.requestedCount || data.results.length || 0);
  const success = Number(data.successCount || 0);
  const fail = Number(data.failCount || 0);
  const lines = data.results.slice(0, 12).map((rowResult) => {
    const rowNo = Number.isInteger(Number(rowResult.rowIndex)) ? Number(rowResult.rowIndex) + 2 : '-';
    const label = rowResult.success ? '성공' : '실패';
    const message = rowResult.success
      ? (rowResult?.data?.status || '완료')
      : (rowResult?.message || rowResult?.code || '실패');
    return `<li>Row ${rowNo}: ${label} - ${escapeHtml(message)}</li>`;
  }).join('');
  const nowText = new Date().toLocaleString();

  box.innerHTML = `
    <div class="title">이번 실행 결과 (${nowText})</div>
    <div>요청 ${total}건 / 성공 ${success}건 / 실패 ${fail}건</div>
    <ul>${lines || '<li>결과 없음</li>'}</ul>
  `;
  box.classList.remove('hidden');
}

function findTopicByRowIndex(rowIndex) {
  return (blogTopicsCache || []).find(item => item.rowIndex === rowIndex) || null;
}

function buildBlogUpdatePayload(baseItem, patch = {}) {
  const safeItem = baseItem || {};
  return {
    rowIndex: safeItem.rowIndex,
    subject: String((patch.subject !== undefined ? patch.subject : safeItem.subject) || '').trim(),
    keywords: (patch.keywords !== undefined ? patch.keywords : (Array.isArray(safeItem.keywords) ? safeItem.keywords.join(', ') : '')).toString().trim(),
    instruction: String((patch.instruction !== undefined ? patch.instruction : safeItem.content_guide?.additional_instructions) || '').trim(),
    referenceUrl: (patch.referenceUrl !== undefined ? patch.referenceUrl : (Array.isArray(safeItem.content_guide?.reference_urls) ? safeItem.content_guide.reference_urls.join(', ') : '')).toString().trim(),
    imageGeneration: (patch.imageGeneration !== undefined ? patch.imageGeneration : Boolean(safeItem.image_options?.generate)) === true,
    externalReference: (patch.externalReference !== undefined ? patch.externalReference : Boolean(safeItem.use_external_ref)) === true
  };
}

async function saveBlogRowPatch(rowIndex, patch = {}, options = {}) {
  const silent = Boolean(options.silent);
  const resultBox = document.getElementById('blog-action-result');
  const item = findTopicByRowIndex(rowIndex);
  if (!item) throw new Error(`rowIndex(${rowIndex})를 찾지 못했습니다.`);

  const payload = buildBlogUpdatePayload(item, patch);
  if (!payload.subject) throw new Error('Subject는 비워둘 수 없습니다.');
  if (!silent && resultBox) resultBox.textContent = `row ${rowIndex + 2} 수정 중...`;
  const data = await postJson('/api/v1/blog/topic/update', payload);
  if (!silent && resultBox) resultBox.textContent = JSON.stringify(data, null, 2);
  await loadBlogTopics({ silent: true });
}

async function loadBlogTopics(options = {}) {
  if (!guardUiConfigReady('블로그 목록 조회')) return;
  const silent = Boolean(options.silent);
  const pageInfo = getPageInfo('topics');
  const status = (document.getElementById('blog-status-filter')?.value || '').trim();
  const q = (document.getElementById('blog-q-filter')?.value || '').trim();
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  params.set('limit', String(pageInfo.limit));
  params.set('offset', String(pageInfo.offset));

  const resultBox = document.getElementById('blog-action-result');
  if (resultBox && !silent) resultBox.textContent = '블로그 목록 조회 중...';

  try {
    const data = await fetchJson(`/api/v1/blog/topics?${params.toString()}`);
    blogTopicsCache = Array.isArray(data.items) ? data.items : [];
    setPageInfo('topics', {
      total: Number(data.total || 0),
      limit: Number(data.limit || pageInfo.limit || 50),
      offset: Number(data.offset || 0)
    });
    renderBlogTable(blogTopicsCache);
    renderTopicsPagination();
    if (resultBox && !silent) {
      resultBox.textContent = `조회 완료: ${data.total ?? blogTopicsCache.length}건`;
    }
  } catch (e) {
    blogTopicsCache = [];
    renderBlogTable([]);
    renderTopicsPagination();
    if (resultBox && !silent) resultBox.textContent = `오류: ${e.message}`;
  }
}

async function runBlogBatchAction() {
  if (!guardUiConfigReady('선택 행 발행(batch)')) return;
  const resultBox = document.getElementById('blog-action-result');
  if (!resultBox) return;

  const rowIndices = getSelectedBlogRowIndices();
  if (rowIndices.length === 0) {
    resultBox.textContent = '먼저 발행할 행을 1개 이상 선택하세요.';
    return;
  }

  const selectedSnapshot = [...rowIndices];
  clearBlogSelections();
  clearPreviousBatchVisualState();

  const startedAt = Date.now();
  const progressTimer = setInterval(async () => {
    const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
    if (resultBox) {
      resultBox.textContent = `batch 실행 중... (선택 ${rowIndices.length}건, ${elapsedSec}초 경과)\n진행 상태를 표의 로그/상태 컬럼에서 확인하세요.`;
    }
    try {
      await loadBlogTopics({ silent: true });
    } catch (e) {
      // 진행 중 폴링 오류는 무시하고 본 요청 완료를 기다린다.
    }
  }, 1000);

  resultBox.textContent = `batch 실행 중... (선택 ${rowIndices.length}건)\n진행 상태를 표의 로그/상태 컬럼에서 확인하세요.`;
  try {
    await loadBlogTopics({ silent: true });
    const data = await postJson('/api/v1/blog/action', { action: 'batch', rowIndices: selectedSnapshot });
    blogLastBatchResult = data;
    markRecentBatchRows(data.results || []);
    renderBlogLastBatchResult(blogLastBatchResult);
    resultBox.textContent = JSON.stringify(data, null, 2);
    await Promise.all([loadDashboard(), loadBlogTopics()]);
  } catch (e) {
    resultBox.textContent = `오류: ${e.message}`;
  } finally {
    clearInterval(progressTimer);
  }
}

function applySettingsMajorToForm(data) {
  const fields = data?.fields || {};
  const naverIdEl = document.getElementById('settings-naver-id');
  const geminiKeyEl = document.getElementById('settings-gemini-api-key');
  const sheetIdEl = document.getElementById('settings-google-sheet-id');
  const headlessEl = document.getElementById('settings-headless');
  const typingEl = document.getElementById('settings-typing-speed');

  if (naverIdEl) naverIdEl.value = String(fields.NAVER_ID || '');
  if (geminiKeyEl) geminiKeyEl.value = String(fields.GEMINI_API_KEY || '');
  if (sheetIdEl) sheetIdEl.value = String(fields.GOOGLE_SHEET_ID || '');
  if (headlessEl) headlessEl.value = fields.HEADLESS ? 'true' : 'false';
  if (typingEl) typingEl.value = String(fields.TYPING_SPEED || 'NORMAL');
}

async function loadSettingsMajor() {
  const resultEl = document.getElementById('settings-major-result');
  if (resultEl) resultEl.textContent = '주요 설정 불러오는 중...';
  try {
    const data = await fetchJson('/api/v1/settings/major');
    applySettingsMajorToForm(data);
    if (resultEl) {
      resultEl.textContent = `불러오기 완료: ${data.configPath || '-'}`;
    }
  } catch (e) {
    if (resultEl) resultEl.textContent = `오류: ${e.message}`;
  }
}

function buildSettingsMajorPayload() {
  return {
    NAVER_ID: (document.getElementById('settings-naver-id')?.value || '').trim(),
    GEMINI_API_KEY: (document.getElementById('settings-gemini-api-key')?.value || '').trim(),
    GOOGLE_SHEET_ID: (document.getElementById('settings-google-sheet-id')?.value || '').trim(),
    HEADLESS: (document.getElementById('settings-headless')?.value || 'false') === 'true',
    TYPING_SPEED: (document.getElementById('settings-typing-speed')?.value || 'NORMAL').trim().toUpperCase()
  };
}

async function saveSettingsMajor() {
  const resultEl = document.getElementById('settings-major-result');
  if (resultEl) resultEl.textContent = '주요 설정 저장 중...';
  try {
    const payload = buildSettingsMajorPayload();
    const data = await postJson('/api/v1/settings/major', payload);
    applySettingsMajorToForm(data);
    if (resultEl) {
      resultEl.textContent = `${data.message || '주요 설정 저장 완료'}\n${data.configPath || '-'}`;
    }
    await Promise.all([loadConfigStatus(), loadDashboard()]);
  } catch (e) {
    if (resultEl) resultEl.textContent = `오류: ${e.message}`;
  }
}

async function loadSettingsAdvanced() {
  const resultEl = document.getElementById('settings-advanced-result');
  const editorEl = document.getElementById('settings-advanced-content');
  if (resultEl) resultEl.textContent = '고급 설정 불러오는 중...';
  try {
    const data = await fetchJson('/api/v1/settings/advanced');
    if (editorEl) editorEl.value = String(data.content || '');
    if (resultEl) {
      resultEl.textContent = `불러오기 완료: ${data.configPath || '-'}`;
    }
  } catch (e) {
    if (resultEl) resultEl.textContent = `오류: ${e.message}`;
  }
}

async function saveSettingsAdvanced() {
  const resultEl = document.getElementById('settings-advanced-result');
  const editorEl = document.getElementById('settings-advanced-content');
  const content = String(editorEl?.value || '');
  if (resultEl) resultEl.textContent = '고급 설정 저장 중...';
  try {
    const data = await postJson('/api/v1/settings/advanced', { content });
    if (resultEl) {
      const restartText = data.requiresRestart ? '\n변경 적용을 위해 재시작을 권장합니다.' : '';
      resultEl.textContent = `${data.message || '고급 설정 저장 완료'}\n${data.configPath || '-'}${restartText}`;
    }
    await Promise.all([loadSettingsMajor(), loadConfigStatus(), loadDashboard()]);
  } catch (e) {
    if (resultEl) resultEl.textContent = `오류: ${e.message}`;
  }
}

async function loadNaverLoginStatus(options = {}) {
  const silent = Boolean(options.silent);
  const resultEl = document.getElementById('settings-naver-login-result');
  if (!silent && resultEl) resultEl.textContent = '네이버 로그인 상태 조회 중...';
  try {
    const data = await fetchJson('/api/v1/session/naver-login');
    renderNaverLoginStatus(data);
    if (data?.isRunning) {
      startNaverLoginPolling();
    } else {
      stopNaverLoginPolling();
    }
    return data;
  } catch (e) {
    stopNaverLoginPolling();
    if (resultEl) resultEl.textContent = `오류: ${e.message}`;
    return null;
  }
}

async function startNaverLoginFromUi() {
  const resultEl = document.getElementById('settings-naver-login-result');
  if (resultEl) {
    resultEl.textContent = '로그인 시작 요청 중...';
  }
  try {
    const data = await postJson('/api/v1/session/naver-login/start', {});
    renderNaverLoginStatus(data);
    startNaverLoginPolling();
    showUiPopup('네이버 로그인 시작 요청이 접수되었습니다.\n브라우저가 뜨는지 확인하고, 로그인 완료 후 상태를 확인하세요.');
  } catch (e) {
    if (resultEl) resultEl.textContent = `오류: ${e.message}`;
    showUiPopup(`네이버 로그인 시작 실패\n${e.message}`);
  }
}

function bindActions() {
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadConfigStatus().finally(() => loadDashboard());
    });
  }

  const saveBtn = document.getElementById('quick-save-btn');
  const publishBtn = document.getElementById('quick-publish-btn');
  const resultEl = document.getElementById('quick-result');

  const buildQuickPayload = (mode) => ({
    subject: (document.getElementById('quick-subject')?.value || '').trim(),
    keywords: (document.getElementById('quick-keywords')?.value || '').trim(),
    instruction: (document.getElementById('quick-instruction')?.value || '').trim(),
    referenceUrl: (document.getElementById('quick-reference-url')?.value || '').trim(),
    imageGeneration: Boolean(document.getElementById('quick-image-generation')?.checked),
    externalReference: Boolean(document.getElementById('quick-external-reference')?.checked),
    publishMode: mode
  });

  const runQuickPublish = async (mode) => {
    if (!resultEl) return;
    if (!guardUiConfigReady('빠른발행')) return;
    resultEl.textContent = '요청 전송 중...';
    try {
      const data = await postJson('/api/v1/blog/quick-publish', buildQuickPayload(mode));
      resultEl.textContent = JSON.stringify(data, null, 2);
      await loadDashboard();
    } catch (e) {
      resultEl.textContent = `오류: ${e.message}`;
    }
  };

  if (saveBtn) {
    saveBtn.addEventListener('click', () => runQuickPublish('append_only'));
  }
  if (publishBtn) {
    publishBtn.addEventListener('click', () => runQuickPublish('append_and_publish'));
  }

  const blogTabButtons = Array.from(document.querySelectorAll('.blog-tab-btn'));
  const blogTrendsDateInput = document.getElementById('blog-trends-date');
  const blogTrendsQFilter = document.getElementById('blog-trends-q-filter');
  const blogTrendsCollectBtn = document.getElementById('blog-trends-collect-btn');
  const blogTrendsRefreshBtn = document.getElementById('blog-trends-refresh-btn');
  const blogTrendsToTopicsBtn = document.getElementById('blog-trends-to-topics-btn');
  const blogTrendsPrevBtn = document.getElementById('blog-trends-page-prev');
  const blogTrendsNextBtn = document.getElementById('blog-trends-page-next');
  const blogRefreshBtn = document.getElementById('blog-refresh-btn');
  const blogBatchBtn = document.getElementById('blog-batch-btn');
  const blogBatchBtnBottom = document.getElementById('blog-batch-btn-bottom');
  const blogTopicsPrevBtn = document.getElementById('blog-topics-page-prev');
  const blogTopicsNextBtn = document.getElementById('blog-topics-page-next');
  const blogStatusFilter = document.getElementById('blog-status-filter');
  const blogQFilter = document.getElementById('blog-q-filter');
  const blogTrendsTableBody = document.getElementById('blog-trends-table-body');
  const blogTopicsTableBody = document.getElementById('blog-table-body');

  blogTabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = String(btn.dataset.blogTab || '');
      activateBlogTab(tabName, { forceReload: true });
    });
  });

  if (blogTrendsCollectBtn) {
    blogTrendsCollectBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      runBlogTrendsCollect();
    });
  }
  if (blogTrendsRefreshBtn) blogTrendsRefreshBtn.addEventListener('click', () => loadBlogTrends());
  if (blogTrendsToTopicsBtn) blogTrendsToTopicsBtn.addEventListener('click', runTrendsToTopics);
  if (blogTrendsQFilter) {
    blogTrendsQFilter.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        setPageInfo('trends', { offset: 0 });
        loadBlogTrends();
      }
    });
  }
  // 날짜 입력창 Enter로 수집을 바로 실행하지 않는다.
  // (중복 호출/오동작 방지)
  if (blogTrendsPrevBtn) {
    blogTrendsPrevBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('trends');
      setPageInfo('trends', { offset: Math.max(0, pageInfo.offset - pageInfo.limit) });
      loadBlogTrends();
    });
  }
  if (blogTrendsNextBtn) {
    blogTrendsNextBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('trends');
      setPageInfo('trends', { offset: Math.max(0, pageInfo.offset + pageInfo.limit) });
      loadBlogTrends();
    });
  }

  if (blogRefreshBtn) blogRefreshBtn.addEventListener('click', loadBlogTopics);
  if (blogBatchBtn) blogBatchBtn.addEventListener('click', runBlogBatchAction);
  if (blogBatchBtnBottom) blogBatchBtnBottom.addEventListener('click', runBlogBatchAction);
  if (blogStatusFilter) {
    blogStatusFilter.addEventListener('change', () => {
      setPageInfo('topics', { offset: 0 });
      loadBlogTopics();
    });
  }
  if (blogQFilter) {
    blogQFilter.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        setPageInfo('topics', { offset: 0 });
        loadBlogTopics();
      }
    });
  }
  if (blogTopicsPrevBtn) {
    blogTopicsPrevBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('topics');
      setPageInfo('topics', { offset: Math.max(0, pageInfo.offset - pageInfo.limit) });
      loadBlogTopics();
    });
  }
  if (blogTopicsNextBtn) {
    blogTopicsNextBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('topics');
      setPageInfo('topics', { offset: Math.max(0, pageInfo.offset + pageInfo.limit) });
      loadBlogTopics();
    });
  }

  if (blogTrendsTableBody) {
    blogTrendsTableBody.addEventListener('change', (e) => {
      const selector = e.target?.closest('input.trend-row-selector');
      if (!selector) return;
      const rowIndex = Number(selector.value);
      if (!Number.isInteger(rowIndex) || !findTrendByRowIndex(rowIndex)) return;
      if (selector.checked) {
        blogTrendsSelectedRowIndices.add(rowIndex);
      } else {
        blogTrendsSelectedRowIndices.delete(rowIndex);
      }
      updateTrendsSelectionUi();
    });
  }

  if (blogTopicsTableBody) {
    blogTopicsTableBody.addEventListener('change', async (e) => {
      const selector = e.target?.closest('input.row-selector');
      if (selector) {
        const rowIndex = Number(selector.value);
        if (!Number.isInteger(rowIndex)) return;
        if (selector.checked) {
          blogSelectedRowIndices.add(rowIndex);
        } else {
          blogSelectedRowIndices.delete(rowIndex);
        }
        updateBlogSelectionUi();
        return;
      }

      const toggle = e.target?.closest('input.inline-toggle');
      if (toggle) {
        const rowIndex = Number(toggle.dataset.rowIndex);
        const field = String(toggle.dataset.field || '');
        if (!Number.isInteger(rowIndex) || !['imageGeneration', 'externalReference'].includes(field)) return;
        const patch = {};
        patch[field] = Boolean(toggle.checked);
        try {
          await saveBlogRowPatch(rowIndex, patch, { silent: true });
        } catch (err) {
          toggle.checked = !toggle.checked;
          const resultBox = document.getElementById('blog-action-result');
          if (resultBox) resultBox.textContent = `오류: ${err.message}`;
        }
      }
    });

    blogTopicsTableBody.addEventListener('dblclick', (e) => {
      const cell = e.target?.closest('td.editable-cell');
      if (!cell) return;
      startBlogInlineEdit(cell);
    });
  }

  const settingsMajorRefreshBtn = document.getElementById('settings-major-refresh-btn');
  const settingsMajorSaveBtn = document.getElementById('settings-major-save-btn');
  const settingsAdvancedRefreshBtn = document.getElementById('settings-advanced-refresh-btn');
  const settingsAdvancedSaveBtn = document.getElementById('settings-advanced-save-btn');
  const settingsAdvancedFold = document.getElementById('settings-advanced-fold');
  const settingsNaverLoginStartBtn = document.getElementById('settings-naver-login-start-btn');
  const settingsNaverLoginRefreshBtn = document.getElementById('settings-naver-login-refresh-btn');

  if (settingsMajorRefreshBtn) settingsMajorRefreshBtn.addEventListener('click', loadSettingsMajor);
  if (settingsMajorSaveBtn) settingsMajorSaveBtn.addEventListener('click', saveSettingsMajor);
  if (settingsAdvancedRefreshBtn) settingsAdvancedRefreshBtn.addEventListener('click', loadSettingsAdvanced);
  if (settingsAdvancedSaveBtn) settingsAdvancedSaveBtn.addEventListener('click', saveSettingsAdvanced);
  if (settingsNaverLoginStartBtn) settingsNaverLoginStartBtn.addEventListener('click', startNaverLoginFromUi);
  if (settingsNaverLoginRefreshBtn) settingsNaverLoginRefreshBtn.addEventListener('click', () => loadNaverLoginStatus());
  if (settingsAdvancedFold) {
    settingsAdvancedFold.addEventListener('toggle', () => {
      if (settingsAdvancedFold.open && !settingsAdvancedLoadedOnce) {
        loadSettingsAdvanced();
        settingsAdvancedLoadedOnce = true;
      }
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  bindNavigation();
  bindActions();
  loadConfigStatus().finally(() => {
    loadDashboard();
  });
  renderBlogLastBatchResult(blogLastBatchResult);
  updateBlogSelectionUi();
  updateTrendsSelectionUi();
  renderTrendsPagination();
  renderTopicsPagination();
  setInterval(loadDashboard, 15000);
});
