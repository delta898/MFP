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
const blogSelectedRowIndices = new Set();
let blogLastBatchResult = null;
const blogRecentBatchRows = new Map();
let blogInlineEditState = null;
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
      loadBlogTopics();
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
  const status = (document.getElementById('blog-status-filter')?.value || '').trim();
  const q = (document.getElementById('blog-q-filter')?.value || '').trim();
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  params.set('limit', '100');
  params.set('offset', '0');

  const resultBox = document.getElementById('blog-action-result');
  if (resultBox && !silent) resultBox.textContent = '블로그 목록 조회 중...';

  try {
    const data = await fetchJson(`/api/v1/blog/topics?${params.toString()}`);
    blogTopicsCache = Array.isArray(data.items) ? data.items : [];
    renderBlogTable(blogTopicsCache);
    if (resultBox && !silent) {
      resultBox.textContent = `조회 완료: ${data.total ?? blogTopicsCache.length}건`;
    }
  } catch (e) {
    blogTopicsCache = [];
    renderBlogTable([]);
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

  const blogRefreshBtn = document.getElementById('blog-refresh-btn');
  const blogBatchBtn = document.getElementById('blog-batch-btn');
  const blogBatchBtnBottom = document.getElementById('blog-batch-btn-bottom');
  const blogStatusFilter = document.getElementById('blog-status-filter');
  const blogQFilter = document.getElementById('blog-q-filter');
  const blogTableBody = document.getElementById('blog-table-body');

  if (blogRefreshBtn) blogRefreshBtn.addEventListener('click', loadBlogTopics);
  if (blogBatchBtn) blogBatchBtn.addEventListener('click', runBlogBatchAction);
  if (blogBatchBtnBottom) blogBatchBtnBottom.addEventListener('click', runBlogBatchAction);
  if (blogStatusFilter) blogStatusFilter.addEventListener('change', loadBlogTopics);
  if (blogQFilter) {
    blogQFilter.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loadBlogTopics();
      }
    });
  }

  if (blogTableBody) {
    blogTableBody.addEventListener('change', async (e) => {
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

    blogTableBody.addEventListener('dblclick', (e) => {
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
  setInterval(loadDashboard, 15000);
});
