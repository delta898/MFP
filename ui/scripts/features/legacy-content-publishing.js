
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
  const countText = document.getElementById('blog-selected-count');
  if (countText) countText.textContent = `${count}건 선택`;
}

function getPostStatusLabel(val) {
  const norm = String(val || 'publish').trim().toLowerCase();
  const map = { 'publish': '즉시 발행', 'draft': '임시 저장', 'schedule': '예약 발행' };
  return map[norm] || val || '-';
}

function getExecutionModeLabel(val) {
  const norm = String(val || '').trim().toLowerCase();
  const map = {
    'append_only': '시트 추가만',
    'append_and_generate': '시트 추가 + 생성',
    'append_and_publish': '시트 추가 + 실행',
    'publish': '즉시 실행'
  };
  return map[norm] || val || '-';
}

function renderBlogTable(items) {
  const tbody = document.getElementById('blog-table-body');
  if (!tbody) return;

  const sourceItems = Array.isArray(items) ? items : [];
  if (sourceItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11">조회 결과가 없습니다.</td></tr>';
    updateSortableHeadersUi();
    return;
  }

  tbody.innerHTML = sourceItems.map(item => {
    const subject = escapeHtml(item.subject || '');
    const instruction = escapeHtml(item.content_guide?.additional_instructions || '');
    const referenceUrl = escapeHtml((item.content_guide?.reference_urls || []).join(', '));
    const runtimeLog = escapeHtml(item.runtimeLog || '');
    const keywords = (Array.isArray(item.keywords) ? item.keywords : [])
      .join(', ')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const category = escapeHtml(item.category || '');
    const postStatusRaw = item.postStatus || 'publish';
    const postStatus = escapeHtml(getPostStatusLabel(postStatusRaw));
    const scheduleDate = escapeHtml(item.scheduleDate || '');
    const status = escapeHtml(item.status || '');
    const imageGeneration = Boolean(item.image_gen);
    const externalReference = Boolean(item.external_reference);
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
        <td class="editable-cell" data-field="postStatus">${postStatus}</td>
        <td class="editable-cell" data-field="subject">${subject || '-'}${subjectBadge}</td>
        <td class="editable-cell" data-field="keywords">${keywords || '-'}</td>
        <td class="editable-cell" data-field="instruction">${instruction || '-'}</td>
        <td class="editable-cell" data-field="referenceUrl">${referenceUrl || '-'}</td>
        <td class="toggle-cell"><input type="checkbox" class="inline-toggle" data-field="imageGeneration" data-row-index="${item.rowIndex}" ${imageChecked}></td>
        <td class="toggle-cell"><input type="checkbox" class="inline-toggle" data-field="externalReference" data-row-index="${item.rowIndex}" ${externalChecked}></td>
        <td class="runtime-log-cell">${runtimeLog}</td>
        <td class="editable-cell" data-field="status">${status || '-'}</td>
      </tr>
    `;
  }).join('');
  const blogSelectAll = document.getElementById('blog-table-select-all');
  if (blogSelectAll) blogSelectAll.checked = false;
  updateBlogSelectionUi();
  updateSortableHeadersUi();
}

function getEditableFieldValue(item, field) {
  if (!item) return '';
  if (field === 'category') return String(item.category || '');
  if (field === 'postStatus') return String(item.postStatus || 'publish');
  if (field === 'scheduleDate') return String(item.scheduleDate || '');
  if (field === 'subject') return String(item.subject || '');
  if (field === 'keywords') return Array.isArray(item.keywords) ? item.keywords.join(', ') : '';
  if (field === 'instruction') return String(item.content_guide?.additional_instructions || '');
  if (field === 'referenceUrl') return Array.isArray(item.content_guide?.reference_urls) ? item.content_guide.reference_urls.join(', ') : '';
  if (field === 'status') return String(item.status || '');
  return '';
}

function isRuntimeRunning(item) {
  return Boolean(String(item?.runtimeLog || '').trim());
}

async function cancelBlogInlineEdit() {
  blogInlineEditState = null;
}

// --- Modal Editor Logic ---
let currentEditRowIndex = null;

async function openBlogTopicEditor(rowIndex) {
  const item = findTopicByRowIndex(rowIndex);
  if (!item) return;

  if (isRuntimeRunning(item)) {
    const resultBox = document.getElementById('blog-action-result');
    if (resultBox) resultBox.textContent = `row ${rowIndex + 2}는 진행 중이라 수정할 수 없습니다.`;
    return;
  }

  currentEditRowIndex = rowIndex;
  const modal = document.getElementById('blog-edit-modal-backdrop');

  // Fill fields
  document.getElementById('blog-edit-subject').value = item.subject || '';
  document.getElementById('blog-edit-keywords').value = Array.isArray(item.keywords) ? item.keywords.join(', ') : '';
  document.getElementById('blog-edit-instruction').value = item.content_guide?.additional_instructions || '';
  document.getElementById('blog-edit-reference-url').value = Array.isArray(item.content_guide?.reference_urls) ? item.content_guide.reference_urls.join('\n') : '';
  document.getElementById('blog-edit-writing-strategy').value = item.writing_strategy || item.options?.writing_strategy || 'inherit';
  document.getElementById('blog-edit-schedule-date').value = (item.scheduleDate || '').replace(' ', 'T').substring(0, 16);

  // Category Parsing (N:..., W:...)
  let naverCategory = '';
  let wordpressCategory = '';
  const rawCat = item.category || '';
  if (rawCat.includes('N:') || rawCat.includes('W:')) {
    const nMatch = rawCat.match(/N:([^,]*)/);
    const wMatch = rawCat.match(/W:([^,]*)/);
    naverCategory = nMatch ? nMatch[1].trim() : '';
    wordpressCategory = wMatch ? wMatch[1].trim() : '';
  } else {
    // Legacy support: if no prefix, assume it's for both or just use as is
    naverCategory = rawCat;
    wordpressCategory = rawCat;
  }
  document.getElementById('blog-edit-naver-category').value = naverCategory;
  document.getElementById('blog-edit-wordpress-category').value = wordpressCategory;

  const statusTabText = document.getElementById('modal-blog-status-text');
  statusTabText.textContent = item.status || '대기';
  statusTabText.dataset.value = item.status || '대기';

  const postStatusMap = { 'publish': '즉시 발행', 'draft': '임시 저장', 'schedule': '예약 발행' };
  const postStatusValue = item.postStatus || 'publish';
  const postStatusText = document.getElementById('modal-blog-post-status-text');
  postStatusText.textContent = postStatusMap[postStatusValue] || postStatusValue;
  postStatusText.dataset.value = postStatusValue;

  // Checkboxes
  document.getElementById('blog-edit-image-required').checked = Boolean(item.image_gen);
  document.getElementById('blog-edit-external-ref').checked = Boolean(item.external_reference);

  // document.getElementById('blog-edit-result').textContent = '';
  modal.classList.remove('hidden');
}

function initModalCategorySearch(initialValue) {
  const searchInput = document.getElementById('modal-blog-category-search');
  const optionsContainer = document.getElementById('modal-blog-category-options');
  const triggerText = document.getElementById('modal-blog-category-text');

  searchInput.value = '';

  const renderOptions = (filter = '') => {
    optionsContainer.innerHTML = '';
    const categories = window.categoryCache ? ['', ...window.categoryCache.map(c => c.name)] : [''];

    const filtered = categories.filter(c => c.toLowerCase().includes(filter.toLowerCase()));
    if (filter && !filtered.includes(filter)) {
      filtered.unshift(filter);
    }

    filtered.forEach(cat => {
      const div = document.createElement('div');
      div.className = `custom-select-option ${cat === initialValue ? 'selected' : ''}`;
      div.textContent = cat || '(기본)';
      div.dataset.value = cat;
      div.onclick = () => {
        triggerText.textContent = cat || '(기본)';
        triggerText.dataset.value = cat;
        document.getElementById('modal-blog-category-container').classList.remove('open');
      };
      optionsContainer.appendChild(div);
    });
  };

  renderOptions();
  searchInput.oninput = () => renderOptions(searchInput.value);
}

function closeBlogTopicEditor() {
  document.getElementById('blog-edit-modal-backdrop').classList.add('hidden');
  currentEditRowIndex = null;
}

// ── 쇼핑 팝업 편집 ──────────────────────────────────────────
let currentShoppingEditRowIndex = null;

function openShoppingEditor(rowIndex) {
  const item = findShoppingByRowIndex(rowIndex);
  if (!item) return;

  currentShoppingEditRowIndex = rowIndex;

  document.getElementById('shopping-edit-product').value = item.product || '';
  document.getElementById('shopping-edit-url').value = item.shortUrl || '';
  document.getElementById('shopping-edit-instruction').value = item.instruction || item.options?.instruction || '';
  document.getElementById('shopping-edit-schedule-date').value = (item.scheduleDate || '').replace(' ', 'T').substring(0, 16);

  // 카테고리 파싱 (N:..., W:...)
  let naverCategory = '';
  let wordpressCategory = '';
  const rawCat = item.category || '';
  if (rawCat.includes('N:') || rawCat.includes('W:')) {
    const nMatch = rawCat.match(/N:([^,]*)/);
    const wMatch = rawCat.match(/W:(.*)/);
    naverCategory = nMatch ? nMatch[1].trim() : '';
    wordpressCategory = wMatch ? wMatch[1].trim() : '';
  } else {
    naverCategory = rawCat;
    wordpressCategory = rawCat;
  }
  document.getElementById('shopping-edit-naver-category').value = naverCategory;
  document.getElementById('shopping-edit-wordpress-category').value = wordpressCategory;

  const postStatusMap = { 'publish': '즉시 발행', 'draft': '임시 저장', 'schedule': '예약 발행' };
  const postStatusValue = item.postStatus || 'publish';
  const postStatusText = document.getElementById('modal-shopping-post-status-text');
  postStatusText.textContent = postStatusMap[postStatusValue] || postStatusValue;
  postStatusText.dataset.value = postStatusValue;

  const statusText = document.getElementById('modal-shopping-status-text');
  statusText.textContent = item.status || '준비';
  statusText.dataset.value = item.status || '준비';

  document.getElementById('shopping-edit-result').textContent = '';
  document.getElementById('shopping-edit-modal-backdrop').classList.remove('hidden');
}

function closeShoppingEditor() {
  document.getElementById('shopping-edit-modal-backdrop').classList.add('hidden');
  currentShoppingEditRowIndex = null;
}

async function saveShoppingModifications() {
  if (currentShoppingEditRowIndex === null) return;
  const resultBox = document.getElementById('shopping-edit-result');
  const rowIndex = currentShoppingEditRowIndex;

  const product = document.getElementById('shopping-edit-product').value.trim();
  const shortUrl = document.getElementById('shopping-edit-url').value.trim();
  const instruction = document.getElementById('shopping-edit-instruction').value.trim();
  const naverCategory = document.getElementById('shopping-edit-naver-category').value.trim();
  const wordpressCategory = document.getElementById('shopping-edit-wordpress-category').value.trim();
  const scheduleDate = document.getElementById('shopping-edit-schedule-date').value.replace('T', ' ');
  const postStatus = document.getElementById('modal-shopping-post-status-text').dataset.value || 'publish';
  const status = document.getElementById('modal-shopping-status-text').dataset.value || '준비';

  const category = (naverCategory || wordpressCategory)
    ? `N:${naverCategory}, W:${wordpressCategory}`
    : '';

  const patch = {
    product, shortUrl, instruction, category, postStatus, status,
    scheduleDate: scheduleDate ? (scheduleDate.length === 16 ? scheduleDate + ':00' : scheduleDate) : ''
  };

  try {
    resultBox.textContent = '저장 중...';
    await saveShoppingRowPatch(rowIndex, patch, { silent: true });
    resultBox.textContent = '저장 완료';
    setTimeout(() => {
      closeShoppingEditor();
      loadBlogShopping({ silent: true });
    }, 500);
  } catch (err) {
    resultBox.textContent = `오류: ${err.message}`;
  }
}
// ────────────────────────────────────────────────────────────


async function saveBlogTopicModifications() {
  if (currentEditRowIndex === null) return;

  const resultBox = document.getElementById('blog-edit-result');
  const rowIndex = currentEditRowIndex;

  const subject = document.getElementById('blog-edit-subject').value.trim();
  const keywords = document.getElementById('blog-edit-keywords').value.trim();
  const instruction = document.getElementById('blog-edit-instruction').value.trim();
  const referenceUrl = document.getElementById('blog-edit-reference-url').value.trim();
  const writingStrategy = document.getElementById('blog-edit-writing-strategy').value;
  const scheduleDate = document.getElementById('blog-edit-schedule-date').value.replace('T', ' ');
  const naverCategory = document.getElementById('blog-edit-naver-category').value.trim();
  const wordpressCategory = document.getElementById('blog-edit-wordpress-category').value.trim();

  const status = document.getElementById('modal-blog-status-text').dataset.value || '대기';
  const postStatus = document.getElementById('modal-blog-post-status-text').dataset.value || 'publish';
  const isImageRequired = document.getElementById('blog-edit-image-required').checked;
  const isExternalRef = document.getElementById('blog-edit-external-ref').checked;

  const patch = {
    subject,
    keywords: normalizeCommaListText(keywords),
    instruction,
    referenceUrl: normalizeCommaListText(referenceUrl),
    writingStrategy,
    category: `N:${naverCategory}, W:${wordpressCategory}`,
    naverCategory,
    wordpressCategory,
    status,
    postStatus,
    imageGeneration: isImageRequired,
    externalReference: isExternalRef,
    scheduleDate: scheduleDate ? (scheduleDate.length === 16 ? scheduleDate + ':00' : scheduleDate) : ''
  };

  try {
    resultBox.textContent = '저장 중...';
    await saveBlogRowPatch(rowIndex, patch, { silent: true });
    resultBox.textContent = '저장 완료';
    setTimeout(() => {
      closeBlogTopicEditor();
      loadBlogTopics({ silent: true });
    }, 500);
  } catch (err) {
    resultBox.textContent = `오류: ${err.message}`;
  }
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
  const quotaMessage = String(data?.quotaPreflight?.message || '').trim();
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
    ${quotaMessage ? `<div>${escapeHtml(quotaMessage)}</div>` : ''}
    <div>요청 ${total}건 / 성공 ${success}건 / 실패 ${fail}건</div>
    <ul>${lines || '<li>결과 없음</li>'}</ul>
  `;
  box.classList.remove('hidden');
}

async function getPublishQuotaPreflight(selectedCount) {
  const license = await fetchJson('/api/v1/license/status?quiet=true');
  const selected = Math.max(0, Number(selectedCount || 0));
  const remainingValue = Number(license?.remaining);
  const unlimited = remainingValue === -1;
  const remaining = unlimited ? -1 : Math.max(0, Number.isFinite(remainingValue) ? remainingValue : 0);
  const executable = unlimited ? selected : Math.min(selected, remaining);
  return {
    selected,
    remaining,
    executable,
    unlimited,
    message: `${selected}건 선택 · 잔여 ${unlimited ? '무제한' : `${remaining}회`} · 최대 ${executable}건 실행`
  };
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
    status: String((patch.status !== undefined ? patch.status : safeItem.status) || '').trim(),
    category: String((patch.category !== undefined ? patch.category : safeItem.category) || '').trim(),
    postStatus: String((patch.postStatus !== undefined ? patch.postStatus : safeItem.postStatus) || '').trim(),
    scheduleDate: String((patch.scheduleDate !== undefined ? patch.scheduleDate : safeItem.scheduleDate) || '').trim(),
    imageGeneration: (patch.imageGeneration !== undefined ? patch.imageGeneration : Boolean(safeItem.image_gen)) === true,
    externalReference: (patch.externalReference !== undefined ? patch.externalReference : Boolean(safeItem.external_reference)) === true,
    writingStrategy: String((patch.writingStrategy !== undefined ? patch.writingStrategy : safeItem.writing_strategy) || 'inherit').trim()
  };
}

/**
 * 워드프레스 카테고리 목록을 서버에서 가져옵니다. (캐시 및 중복 요청 방지 포함)
 */
async function fetchWpCategories(options = {}) {
  const force = Boolean(options.force);
  if (!force && categoryCache) return categoryCache;
  if (categoryFetchPromise) return categoryFetchPromise;

  categoryFetchPromise = (async () => {
    try {
      const data = await fetchJson('/api/v1/wordpress/categories');
      if (Array.isArray(data)) {
        categoryCache = data;
        // 카테고리를 사용하는 UI들 갱신 요청 (이벤트 방식 대신 간단히 캐시 채우기)
        return data;
      }
      return null;
    } catch (e) {
      console.warn('WordPress categories fetch failed:', e);
      return null;
    } finally {
      categoryFetchPromise = null;
    }
  })();

  return categoryFetchPromise;
}

/**
 * 워드프레스 카테고리 캐시를 강제로 비웁니다. (설정 변경 시 등)
 */
function invalidateWpCategoryCache() {
  categoryCache = null;
  categoryFetchPromise = null;
}

async function fetchWpCategoriesSilently() {
  await fetchWpCategories();
}

async function saveBlogRowPatch(rowIndex, patch = {}, options = {}) {
  const silent = Boolean(options.silent);
  const resultBox = document.getElementById('blog-action-result');
  const item = findTopicByRowIndex(rowIndex);
  if (!item) throw new Error(`rowIndex(${rowIndex})를 찾지 못했습니다.`);

  // 1. 캐시를 즉시 업데이트 (race condition 방지)
  if (patch.imageGeneration !== undefined) item.image_gen = Boolean(patch.imageGeneration);
  if (patch.externalReference !== undefined) item.external_reference = Boolean(patch.externalReference);
  if (patch.subject !== undefined) item.subject = patch.subject;
  if (patch.keywords !== undefined) item.keywords = typeof patch.keywords === 'string'
    ? patch.keywords.split(',').map(k => k.trim()).filter(Boolean)
    : patch.keywords;
  if (patch.instruction !== undefined) {
    if (!item.content_guide) item.content_guide = {};
    item.content_guide.additional_instructions = patch.instruction;
  }
  if (patch.referenceUrl !== undefined) {
    if (!item.content_guide) item.content_guide = {};
    item.content_guide.reference_urls = typeof patch.referenceUrl === 'string'
      ? patch.referenceUrl.split(',').map(u => u.trim()).filter(Boolean)
      : patch.referenceUrl;
  }
  if (patch.status !== undefined) item.status = patch.status;
  if (patch.postStatus !== undefined) item.postStatus = patch.postStatus;
  if (patch.scheduleDate !== undefined) item.scheduleDate = patch.scheduleDate;
  if (patch.category !== undefined) item.category = patch.category;
  if (patch.writingStrategy !== undefined) {
    const value = ['search', 'discovery'].includes(patch.writingStrategy) ? patch.writingStrategy : '';
    item.writing_strategy = value;
    item.options = { ...(item.options || {}) };
    if (value) item.options.writing_strategy = value;
    else delete item.options.writing_strategy;
  }

  // 2. 즉시 재렌더링 (낙관적 업데이트)
  renderBlogTable(blogTopicsCache);

  const payload = buildBlogUpdatePayload(item, patch);
  if (!payload.subject) throw new Error('Subject는 비워둘 수 없습니다.');
  if (!silent && resultBox) resultBox.textContent = `row ${rowIndex + 2} 수정 중...`;

  const data = await postJson('/api/v1/blog/topic/update', payload);
  if (!silent && resultBox) resultBox.textContent = JSON.stringify(data, null, 2);

  // 3. write-lock: Google Sheets 전파 시간(~5s) 동안 loadBlogTopics가 재렌더링하지 않도록 막음
  blogTopicsWriteLockUntil = Date.now() + 6000;
  setTimeout(() => loadBlogTopics({ silent: true }), 6500);
}


async function loadBlogTopics(options = {}) {
  console.log("=== loadBlogTopics START ===", options);
  try {
    if (!guardUiConfigReady('블로그 목록 조회')) {
      console.log("loadBlogTopics: guardUiConfigReady returned false");
      return;
    }

    const silent = Boolean(options.silent);
    const skipRender = Boolean(options.skipRender);
    const pageInfo = getPageInfo('topics');
    const status = (document.getElementById('blog-status-filter')?.value || '').trim();
    const q = (document.getElementById('blog-q-filter')?.value || '').trim();
    const params = new URLSearchParams();
    const sortState = getSortState('topics');

    if (status) params.set('status', status);
    if (q) params.set('q', q);
    params.set('limit', String(pageInfo.limit));
    params.set('offset', String(pageInfo.offset));
    params.set('sortBy', String(sortState.key || 'rowNumber'));
    params.set('sortDir', String(sortState.direction || 'desc'));

    const resultBox = document.getElementById('blog-action-result');
    if (resultBox && !silent) resultBox.textContent = '블로그 목록 조회 중...';

    const writeLocked = Date.now() < blogTopicsWriteLockUntil;
    console.log("loadBlogTopics: fetching...", `/api/v1/blog/topics?${params.toString()}`);

    const data = await fetchJson(`/api/v1/blog/topics?${params.toString()}`);
    console.log("loadBlogTopics: fetch complete", data);

    const freshItems = Array.isArray(data?.items) ? data.items : [];
    if (!writeLocked && !skipRender) {
      blogTopicsCache = freshItems;
      setPageInfo('topics', {
        total: Number(data.total || 0),
        limit: Number(data.limit || pageInfo.limit || 50),
        offset: Number(data.offset || 0)
      });
      renderBlogTable(blogTopicsCache);
      renderTopicsPagination();
    } else {
      blogTopicsCache = freshItems;
    }
    if (resultBox && !silent) {
      resultBox.textContent = `조회 완료: ${data.total ?? blogTopicsCache.length}건`;
    }
  } catch (e) {
    console.error("=== FATAL ERROR in loadBlogTopics ===", e);
    const writeLocked = Date.now() < blogTopicsWriteLockUntil;
    const skipRender = Boolean(options.skipRender);
    if (!writeLocked && !skipRender) {
      blogTopicsCache = [];
      renderBlogTable([]);
      renderTopicsPagination();
    }
    const silent = Boolean(options.silent);
    const resultBox = document.getElementById('blog-action-result');
    if (resultBox && !silent) resultBox.textContent = `오류: ${e.message}`;
  }
}

function renderBlogShoppingTable(items) {
  const tbody = document.getElementById('shopping-table-body');
  if (!tbody) return;

  const sourceItems = Array.isArray(items) ? items : [];
  if (sourceItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">조회 결과가 없습니다.</td></tr>';
    updateShoppingSelectionUi();
    updateSortableHeadersUi();
    return;
  }

  tbody.innerHTML = sourceItems.map(item => {
    const checked = blogShoppingSelectedRowIndices.has(item.rowIndex) ? 'checked' : '';
    const product = escapeHtml(item.product || '');
    const shortUrl = escapeHtml(item.shortUrl || '');
    const runtimeLog = escapeHtml(item.runtimeLog || '');
    const status = escapeHtml(item.status || '');
    const publishedAt = escapeHtml(item.publishedAt || '');
    const postStatusRaw = item.postStatus || 'publish';
    const postStatus = escapeHtml(getPostStatusLabel(postStatusRaw));
    const runningClass = runtimeLog ? 'running-row' : '';
    return `
      <tr class="${runningClass} clickable-row" data-row-index="${item.rowIndex}" title="더블클릭으로 편집" style="cursor:pointer;">
        <td><input type="checkbox" class="shopping-row-selector" value="${item.rowIndex}" ${checked}></td>
        <td>${item.rowNumber}</td>
        <td>${postStatus || '-'}</td>
        <td>${product || '-'}</td>
        <td>${shortUrl || '-'}</td>
        <td class="runtime-log-cell">${runtimeLog || ''}</td>
        <td>${status || '-'}</td>
        <td>${publishedAt || '-'}</td>
      </tr>
    `;
  }).join('');
  const shoppingSelectAll = document.getElementById('shopping-table-select-all');
  if (shoppingSelectAll) shoppingSelectAll.checked = false;
  updateShoppingSelectionUi();
  updateSortableHeadersUi();
}

async function loadBlogShopping(options = {}) {
  if (!guardUiConfigReady('쇼핑 목록 조회')) return;
  const silent = Boolean(options.silent);
  const pageInfo = getPageInfo('shopping');
  const status = (document.getElementById('shopping-status-filter')?.value || '').trim();
  const q = (document.getElementById('shopping-q-filter')?.value || '').trim();
  const params = new URLSearchParams();
  const sortState = getSortState('shopping');
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  params.set('limit', String(pageInfo.limit));
  params.set('offset', String(pageInfo.offset));
  params.set('sortBy', String(sortState.key || 'rowNumber'));
  params.set('sortDir', String(sortState.direction || 'desc'));

  const resultBox = document.getElementById('shopping-batch-result');
  if (resultBox && !silent) resultBox.textContent = '쇼핑 목록 조회 중...';

  try {
    const data = await fetchJson(`/api/v1/shopping/items?${params.toString()}`);
    blogShoppingCache = Array.isArray(data.items) ? data.items : [];
    setPageInfo('shopping', {
      total: Number(data.total || 0),
      limit: Number(data.limit || pageInfo.limit || 50),
      offset: Number(data.offset || 0)
    });
    renderBlogShoppingTable(blogShoppingCache);
    renderShoppingPagination();
    if (resultBox && !silent) {
      resultBox.textContent = `조회 완료: ${data.total ?? blogShoppingCache.length}건`;
    }
  } catch (e) {
    blogShoppingCache = [];
    renderBlogShoppingTable([]);
    renderShoppingPagination();
    if (resultBox && !silent) resultBox.textContent = `오류: ${e.message}`;
  }
}

async function runShoppingBatchAction() {
  if (!guardUiConfigReady('선택 글감 포스팅')) return;
  const resultBox = document.getElementById('shopping-action-result');
  if (!resultBox) return;

  const rowIndices = Array.from(blogShoppingSelectedRowIndices.values()).filter(v => Number.isInteger(v));
  if (rowIndices.length === 0) {
    resultBox.textContent = '먼저 발행할 행을 1개 이상 선택하세요.';
    return;
  }

  const selectedSnapshot = [...rowIndices];

  const headless = Boolean(document.getElementById('shopping-batch-headless')?.checked);
  const targets = [];
  if (document.getElementById('shopping-batch-target-naver')?.checked) targets.push('naver');
  if (document.getElementById('shopping-batch-target-wordpress')?.checked) targets.push('wordpress');

  const preCheck = checkPublishPrerequisites(targets);
  if (!preCheck.ok) {
    resultBox.textContent = preCheck.message;
    return;
  }

  try {
    const quota = await getPublishQuotaPreflight(selectedSnapshot.length);
    if (quota.executable === 0) {
      resultBox.textContent = quota.message;
      return;
    }
    if (await showUiConfirm(quota.message, { title: '발행 사용량 확인', confirmText: '실행', cancelText: '취소' }) === false) {
      resultBox.textContent = '발행이 취소되었습니다.';
      return;
    }
  } catch (error) {
    resultBox.textContent = `사용량 확인 실패: ${error.message}`;
    return;
  }

  clearShoppingSelections();
  pauseDashboardPolling();

  try {
    await runWithLiveProgress({
      targetEl: resultBox,
      requestLabel: `쇼핑 일괄 발행 (${selectedSnapshot.length}건)`,
      requestFn: async () => {
        await loadBlogShopping({ silent: true });
        const data = await postJson('/api/v1/shopping/action', { action: 'batch', rowIndices: selectedSnapshot, headless, targets });
        return data;
      },
      onTick: () => loadBlogShopping({ silent: true })
    });
    await Promise.all([loadDashboard(), loadBlogShopping()]);
  } catch (e) {
    // runWithLiveProgress 이미 노출
  } finally {
    resumeDashboardPolling();
  }
}

function getShoppingEditableFieldValue(item, field) {
  if (!item) return '';
  if (field === 'product') return String(item.product || '');
  if (field === 'shortUrl') return String(item.shortUrl || '');
  if (field === 'status') return String(item.status || '');
  if (field === 'category') return String(item.category || '');
  if (field === 'postStatus') return String(item.postStatus || 'publish');
  if (field === 'scheduleDate') return String(item.scheduleDate || '');
  return '';
}

function isShoppingRuntimeRunning(item) {
  return Boolean(String(item?.runtimeLog || '').trim());
}

async function cancelShoppingInlineEdit() {
  if (!shoppingInlineEditState) return;
  const { cell, originalHtml } = shoppingInlineEditState;
  if (cell) cell.innerHTML = originalHtml;
  shoppingInlineEditState = null;
}

async function saveShoppingRowPatch(rowIndex, patch = {}, options = {}) {
  const silent = Boolean(options.silent);
  const resultBox = document.getElementById('shopping-batch-result');
  const item = findShoppingByRowIndex(rowIndex);
  if (!item) throw new Error(`rowIndex(${rowIndex})를 찾지 못했습니다.`);

  // 1. 캐시를 즉시 업데이트 (race condition 방지)
  if (patch.product !== undefined) item.product = patch.product;
  if (patch.shortUrl !== undefined) item.shortUrl = patch.shortUrl;
  if (patch.instruction !== undefined) {
    item.instruction = patch.instruction;
    item.options = { ...(item.options || {}) };
    if (patch.instruction) item.options.instruction = patch.instruction;
    else delete item.options.instruction;
  }
  if (patch.status !== undefined) item.status = patch.status;
  if (patch.category !== undefined) item.category = patch.category;
  if (patch.postStatus !== undefined) item.postStatus = patch.postStatus;
  if (patch.scheduleDate !== undefined) item.scheduleDate = patch.scheduleDate;

  // 2. 즉시 재렌더링 (낙관적 업데이트)
  renderBlogShoppingTable(blogShoppingCache);

  const payload = {
    rowIndex,
    product: patch.product !== undefined ? String(patch.product || '').trim() : item.product,
    shortUrl: patch.shortUrl !== undefined ? String(patch.shortUrl || '').trim() : item.shortUrl,
    instruction: patch.instruction !== undefined ? String(patch.instruction || '').trim() : String(item.instruction || ''),
    status: patch.status !== undefined ? String(patch.status || '').trim() : item.status,
    category: patch.category !== undefined ? String(patch.category || '').trim() : item.category,
    postStatus: patch.postStatus !== undefined ? String(patch.postStatus || '').trim() : item.postStatus,
    scheduleDate: patch.scheduleDate !== undefined ? String(patch.scheduleDate || '').trim() : item.scheduleDate
  };

  if (!silent && resultBox) resultBox.textContent = `row ${rowIndex + 2} 수정 중...`;
  const data = await postJson('/api/v1/shopping/row/update', payload);
  if (!silent && resultBox) resultBox.textContent = JSON.stringify(data, null, 2);

  // 3. write-lock: Google Sheets 전파 시간(~5s) 동안 loadBlogShopping가 재렌더링하지 않도록 막음
  if (typeof blogShoppingWriteLockUntil !== 'undefined') {
    blogShoppingWriteLockUntil = Date.now() + 6000;
  }
  setTimeout(() => loadBlogShopping({ silent: true }), 6500);
}

async function commitShoppingInlineEdit() {
  if (!shoppingInlineEditState) return;

  const resultBox = document.getElementById('shopping-batch-result');
  const {
    rowIndex,
    field,
    editorEl,
    cell,
    originalHtml
  } = shoppingInlineEditState;

  let normalizedValue = String(editorEl?.value ?? '').trim();
  if (field === 'scheduleDate' && normalizedValue) {
    normalizedValue = normalizedValue.replace('T', ' ');
    if (normalizedValue.length === 16) normalizedValue += ':00';
  }
  const item = findShoppingByRowIndex(rowIndex);
  if (!item) {
    shoppingInlineEditState = null;
    await loadBlogShopping({ silent: true });
    return;
  }

  const beforeValue = getShoppingEditableFieldValue(item, field);
  if (normalizedValue === beforeValue) {
    cell.innerHTML = originalHtml;
    shoppingInlineEditState = null;
    return;
  }

  const patch = {};
  patch[field] = normalizedValue;

  try {
    if (resultBox) resultBox.textContent = `row ${rowIndex + 2} inline 수정 중...`;
    await saveShoppingRowPatch(rowIndex, patch, { silent: true });
    shoppingInlineEditState = null;
    if (resultBox) resultBox.textContent = `row ${rowIndex + 2} inline 수정 완료`;
  } catch (e) {
    cell.innerHTML = originalHtml;
    shoppingInlineEditState = null;
    if (resultBox) resultBox.textContent = `오류: ${e.message}`;
  }
}

async function startShoppingInlineEdit(cell) {
  if (!cell) return;
  const row = cell.closest('tr[data-row-index]');
  if (!row) return;
  const rowIndex = Number(row.dataset.rowIndex);
  const field = String(cell.dataset.field || '');
  if (!Number.isInteger(rowIndex)) return;
  if (!['product', 'shortUrl', 'status', 'category', 'postStatus', 'scheduleDate'].includes(field)) return;

  const item = findShoppingByRowIndex(rowIndex);
  if (!item) return;
  if (isShoppingRuntimeRunning(item)) {
    const resultBox = document.getElementById('shopping-batch-result');
    if (resultBox) resultBox.textContent = `row ${rowIndex + 2}는 진행 중이라 수정할 수 없습니다.`;
    return;
  }

  if (shoppingInlineEditState) {
    if (shoppingInlineEditState.cell === cell) return;
    await cancelShoppingInlineEdit();
  }

  const originalHtml = cell.innerHTML;
  const initialValue = getShoppingEditableFieldValue(item, field);
  const multiline = false; // 쇼핑 테이블은 아직 멀티라인 필드 없음
  const useSelect = ['status', 'postStatus', 'category'].includes(field);
  const isDateTime = field === 'scheduleDate';
  let editorEl;

  if (useSelect) {
    editorEl = document.createElement('select');
    editorEl.className = 'inline-editor';
    let options = [];
    if (field === 'status') {
      options = ['', '준비', '발행 준비 완료', '발행 중', '발행 완료', '임시 저장 완료', '예약 포스팅 등록 완료', '실패'];
    } else if (field === 'postStatus') {
      options = ['publish', 'draft', 'schedule'];
    } else if (field === 'category') {
      options = [''];
      if (categoryCache) {
        options = ['', ...categoryCache.map(c => c.name)];
      } else {
        fetchWpCategories().then(() => {
          if (shoppingInlineEditState && shoppingInlineEditState.cell === cell && shoppingInlineEditState.field === 'category') {
            const currentVal = editorEl.value;
            editorEl.innerHTML = '';
            const newOpts = ['', ...categoryCache.map(c => c.name)];
            if (currentVal && !newOpts.includes(currentVal)) newOpts.push(currentVal);
            newOpts.forEach(optVal => {
              const opt = document.createElement('option');
              opt.value = optVal;
              opt.textContent = optVal || '(기본)';
              if (optVal === currentVal) opt.selected = true;
              editorEl.appendChild(opt);
            });
          }
        });
      }
      if (initialValue && !options.includes(initialValue)) {
        options.push(initialValue);
      }
    }

    for (const optionValue of options) {
      const opt = document.createElement('option');
      opt.value = optionValue;
      opt.textContent = optionValue || (field === 'category' ? '(기본)' : '(비움)');
      if (optionValue === initialValue) opt.selected = true;
      editorEl.appendChild(opt);
    }
  } else {
    editorEl = document.createElement('input');
    if (isDateTime) {
      editorEl.type = 'datetime-local';
    } else {
      editorEl.type = 'text';
    }
    editorEl.className = `inline-editor ${isDateTime ? 'datetime' : ''}`.trim();

    // scheduleDate 포맷 변환 (YYYY-MM-DD HH:mm:ss -> YYYY-MM-DDTHH:mm)
    let val = initialValue;
    if (isDateTime && val) {
      val = val.replace(' ', 'T').substring(0, 16);
    }
    editorEl.value = val;
  }

  cell.innerHTML = '';
  cell.appendChild(editorEl);
  editorEl.focus();
  if (!useSelect) editorEl.select?.();

  shoppingInlineEditState = {
    rowIndex,
    field,
    cell,
    editorEl,
    originalHtml,
    committing: false
  };

  editorEl.addEventListener('keydown', async (e) => {
    if (!shoppingInlineEditState) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      await cancelShoppingInlineEdit();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      shoppingInlineEditState.committing = true;
      await commitShoppingInlineEdit();
    }
  });

  editorEl.addEventListener('blur', async () => {
    if (!shoppingInlineEditState) return;
    if (shoppingInlineEditState.committing) return;
    shoppingInlineEditState.committing = true;
    await commitShoppingInlineEdit();
  });
}

async function runBlogBatchAction() {
  if (!guardUiConfigReady('선택 글감 포스팅')) return;
  const resultBox = document.getElementById('blog-action-result');
  if (!resultBox) return;

  const rowIndices = getSelectedBlogRowIndices();
  if (rowIndices.length === 0) {
    resultBox.textContent = '먼저 발행할 행을 1개 이상 선택하세요.';
    return;
  }

  const selectedSnapshot = [...rowIndices];

  const headless = Boolean(document.getElementById('blog-batch-headless')?.checked);
  const targets = [];
  if (document.getElementById('blog-batch-target-naver')?.checked) targets.push('naver');
  if (document.getElementById('blog-batch-target-wordpress')?.checked) targets.push('wordpress');

  const preCheck = checkPublishPrerequisites(targets);
  if (!preCheck.ok) {
    resultBox.textContent = preCheck.message;
    return;
  }

  try {
    const quota = await getPublishQuotaPreflight(selectedSnapshot.length);
    if (quota.executable === 0) {
      resultBox.textContent = quota.message;
      return;
    }
    if (await showUiConfirm(quota.message, { title: '발행 사용량 확인', confirmText: '실행', cancelText: '취소' }) === false) {
      resultBox.textContent = '발행이 취소되었습니다.';
      return;
    }
  } catch (error) {
    resultBox.textContent = `사용량 확인 실패: ${error.message}`;
    return;
  }

  clearBlogSelections();
  clearPreviousBatchVisualState();
  pauseDashboardPolling();

  try {
    const data = await runWithLiveProgress({
      targetEl: resultBox,
      requestLabel: `블로그 일괄 발행 (${selectedSnapshot.length}건)`,
      requestFn: async () => {
        await loadBlogTopics({ silent: true });
        const res = await postJson('/api/v1/blog/action', { action: 'batch', rowIndices: selectedSnapshot, headless, targets });
        return res;
      },
      onTick: () => loadBlogTopics({ silent: true })
    });
    blogLastBatchResult = data;
    markRecentBatchRows(data?.results || []);
    renderBlogLastBatchResult(blogLastBatchResult);
    await Promise.all([loadDashboard(), loadBlogTopics()]);
  } catch (e) {
    // runWithLiveProgress 이미 노출
  } finally {
    resumeDashboardPolling();
  }
}

const BLOG_WRITING_STYLE_PREVIEWS = {
  'conversational:polite': {
    description: '친근하고 자연스러운 후기형 문체',
    example: '직접 써보니 생각보다 편했고, 처음 쓰는 분도 금방 익힐 수 있어요.'
  },
  'conversational:plain': {
    description: '편안하고 자유로운 일기·SNS형 문체',
    example: '직접 써보니 생각보다 편했고, 처음 써도 금방 익힐 수 있어.'
  },
  'written:polite': {
    description: '정돈되고 신뢰감 있는 정보·전문형 문체',
    example: '직접 사용해 본 결과 편의성이 높았으며, 처음 사용하는 경우에도 쉽게 익힐 수 있습니다.'
  },
  'written:plain': {
    description: '간결하고 객관적인 설명문·칼럼형 문체',
    example: '직접 사용해 본 결과 편의성이 높았고, 처음 사용하는 경우에도 쉽게 익힐 수 있다.'
  }
};
let currentBlogWritingStrategy = 'search';

function getSelectedSettingsRadioValue(name, fallback) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
}

function setSelectedSettingsRadioValue(name, value, fallback) {
  const targetValue = String(value || fallback);
  const target = document.querySelector(`input[name="${name}"][value="${targetValue}"]`)
    || document.querySelector(`input[name="${name}"][value="${fallback}"]`);
  if (target) target.checked = true;
}

function syncSettingsBlogWritingStyleDescription() {
  const writingMode = getSelectedSettingsRadioValue('settings-blog-writing-mode', 'conversational');
  const speechLevel = getSelectedSettingsRadioValue('settings-blog-speech-level', 'polite');
  const preview = BLOG_WRITING_STYLE_PREVIEWS[`${writingMode}:${speechLevel}`]
    || BLOG_WRITING_STYLE_PREVIEWS['conversational:polite'];
  const descriptionTarget = document.querySelector('#settings-blog-writing-style-description strong');
  const exampleTarget = document.getElementById('settings-blog-writing-style-example');
  if (descriptionTarget) descriptionTarget.textContent = preview.description;
  if (exampleTarget) exampleTarget.textContent = `(예시: ${preview.example})`;
}

function getWritingStrategyLabel(value) {
  return value === 'discovery' ? '발견 중심 (피드)' : '검색 중심';
}

function syncWritingStrategyInheritanceLabels() {
  const label = `기본 설정 사용 (현재: ${getWritingStrategyLabel(currentBlogWritingStrategy)})`;
  const inheritOption = document.querySelector('#blog-edit-writing-strategy option[value="inherit"]');
  if (inheritOption) inheritOption.textContent = label;
  setSelectedSettingsRadioValue('quick-writing-strategy', currentBlogWritingStrategy, 'search');
}

function syncSettingsBlogWritingStrategyDescription() {
  currentBlogWritingStrategy = getSelectedSettingsRadioValue('settings-blog-writing-strategy', 'search') === 'discovery'
    ? 'discovery'
    : 'search';
  const target = document.querySelector('#settings-blog-writing-strategy-description strong');
  if (target) {
    target.textContent = currentBlogWritingStrategy === 'discovery'
      ? '피드에서 발견한 독자의 관심과 읽기 흐름을 고려합니다.'
      : '검색 의도와 핵심 정보를 명확하게 전달합니다.';
  }
  syncWritingStrategyInheritanceLabels();
}

function normalizeSettingsBufferChannels(value) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  return source
    .map((item) => ({
      id: String(item?.id || '').trim(),
      name: String(item?.display_name || item?.name || item?.descriptor || '').trim(),
      display_name: String(item?.display_name || item?.name || item?.descriptor || '').trim(),
      service: String(item?.service || '').trim().toLowerCase(),
      avatar: String(item?.avatar || '').trim(),
      is_disconnected: item?.is_disconnected === true,
      is_locked: item?.is_locked === true
    }))
    .filter((item) => {
      if (!item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}

function isSettingsBufferChannelUnsupported(channel) {
  const service = String(channel?.service || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['tiktok', 'youtube', 'youtubeshorts'].includes(service);
}

function getSelectedSettingsBufferChannels() {
  return settingsBufferChannels
    .filter((channel) => (
      settingsBufferSelectedChannelIds.has(channel.id)
      && !isSettingsBufferChannelUnsupported(channel)
    ))
    .slice(0, 3)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      display_name: channel.display_name,
      service: channel.service,
      avatar: channel.avatar
    }));
}

function renderSettingsBufferOrganizations(selectedId = '') {
  const selectEl = document.getElementById('settings-buffer-organization');
  if (!selectEl) return;
  const targetId = String(selectedId || '').trim();
  selectEl.innerHTML = '';

  if (settingsBufferOrganizations.length === 0) {
    const option = document.createElement('option');
    option.value = targetId;
    option.textContent = targetId ? `저장된 Organization (${targetId})` : 'API Key 연결 확인이 필요합니다';
    selectEl.appendChild(option);
    return;
  }

  if (settingsBufferOrganizations.length > 1) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Organization을 선택하세요';
    selectEl.appendChild(placeholder);
  }
  settingsBufferOrganizations.forEach((organization) => {
    const option = document.createElement('option');
    option.value = organization.id;
    option.textContent = organization.name || organization.id;
    selectEl.appendChild(option);
  });
  selectEl.value = settingsBufferOrganizations.some((item) => item.id === targetId) ? targetId : '';
}

function renderSettingsBufferChannels() {
  const containerEl = document.getElementById('settings-buffer-channel-list');
  if (!containerEl) return;
  containerEl.innerHTML = '';

  if (settingsBufferChannels.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'sns-empty-message';
    emptyEl.textContent = 'Organization을 선택하고 연결 확인을 완료하면 채널이 표시됩니다.';
    containerEl.appendChild(emptyEl);
    return;
  }

  settingsBufferChannels.forEach((channel) => {
    const unsupported = isSettingsBufferChannelUnsupported(channel);
    if (unsupported) settingsBufferSelectedChannelIds.delete(channel.id);
    const labelEl = document.createElement('label');
    labelEl.className = 'settings-checkbox-label';
    const checkEl = document.createElement('input');
    checkEl.type = 'checkbox';
    checkEl.checked = settingsBufferSelectedChannelIds.has(channel.id);
    checkEl.disabled = channel.is_disconnected || channel.is_locked || unsupported;
    checkEl.addEventListener('change', () => {
      if (checkEl.checked && settingsBufferSelectedChannelIds.size >= 3) {
        checkEl.checked = false;
        showUiToast({
          level: 'warning',
          title: '채널 선택 제한',
          message: 'SNS 발행 채널은 최대 3개까지 선택할 수 있습니다.',
          dedupeKey: 'buffer-channel-limit'
        });
        return;
      }
      if (checkEl.checked) settingsBufferSelectedChannelIds.add(channel.id);
      else settingsBufferSelectedChannelIds.delete(channel.id);
      scheduleSettingsMajorAutoSave({ immediate: true });
    });

    const textEl = document.createElement('span');
    const stateLabel = channel.is_disconnected
      ? ' · 연결 끊김'
      : (channel.is_locked ? ' · 잠김' : (unsupported ? ' · 지원 제외' : ''));
    textEl.textContent = `${channel.display_name || channel.name || channel.id} · ${channel.service || 'unknown'}${stateLabel}`;
    labelEl.append(checkEl, textEl);
    containerEl.appendChild(labelEl);
  });
}

function syncSettingsBufferHelpLink(url = '') {
  const wrapEl = document.getElementById('settings-buffer-help-wrap');
  const linkEl = document.getElementById('settings-buffer-help-link');
  const normalizedUrl = String(url || '').trim() || DEFAULT_BUFFER_HELP_URL;
  if (linkEl) linkEl.href = normalizedUrl;
  if (wrapEl) wrapEl.style.display = '';
}

function syncSettingsSnsAiHint() {
  const modeEl = document.getElementById('settings-sns-ai-mode');
  const hintEl = document.getElementById('settings-sns-ai-hint');
  if (!modeEl || !hintEl) return;

  if (modeEl.value === 'blog_text') {
    const modelName = (
      document.getElementById('settings-text-model-name')?.value
      || document.getElementById('settings-text-model-preset-code')?.value
      || ''
    ).trim();
    const hasApiKey = Boolean(getSettingsInputValue('settings-text-model-api-key').trim());
    hintEl.textContent = hasApiKey
      ? `설정된 Text Model${modelName ? ` (${modelName})` : ''}을 SNS 콘텐츠 처리에 사용합니다. 현재는 글당 해시태그 생성에 사용합니다.`
      : 'Text Model API Key가 없어 현재 SNS AI 작업을 실행하지 않습니다. AI 설정에서 확인해 주세요.';
    return;
  }

  if (modeEl.value === 'chat') {
    const source = getSelectedSettingsRadioValue('settings-chat-model-source', 'writing');
    const prefix = source === 'writing' ? 'text' : 'chat';
    const modelName = (
      document.getElementById(`settings-${prefix}-model-name`)?.value
      || document.getElementById(`settings-${prefix}-model-preset-code`)?.value
      || ''
    ).trim();
    hintEl.textContent = `Chat Model${modelName ? ` (${modelName})` : ''}을 SNS 콘텐츠 처리에 사용합니다. 현재는 글당 해시태그 생성에 사용합니다.`;
    return;
  }

  hintEl.textContent = 'SNS 콘텐츠 처리에 AI를 사용하지 않습니다.';
}

function formatSettingsSnsRuntimeStatus(sns = {}) {
  const lines = [];
  if (sns.running) {
    lines.push('현재 RSS 확인 또는 SNS 발행을 처리하고 있습니다.');
  } else if (sns.enabled) {
    lines.push('자동 처리 대기 중');
  } else {
    lines.push('SNS 자동 발행이 비활성화되어 있습니다.');
  }

  if (sns.nextRunAt) {
    lines.push(`다음 자동 처리: ${formatDateTimeAbsolute(sns.nextRunAt)} (${formatNextRunText(sns.nextRunAt)})`);
  } else if (sns.enabled && !sns.running) {
    lines.push('다음 자동 처리 시각이 아직 예약되지 않았습니다.');
  }

  if (sns.lastRunAt) {
    lines.push(`마지막 실행: ${formatDateTimeAbsolute(sns.lastRunAt)}`);
  } else {
    lines.push('마지막 실행: 아직 실행되지 않음');
  }

  const lastResult = sns.lastResult;
  const automationData = lastResult?.data?.discovery || lastResult?.data?.distribution
    ? lastResult.data
    : null;
  const discoveryResult = automationData?.discovery || (
    String(lastResult?.code || '').startsWith('SNS_DISCOVERY_') ? lastResult : null
  );
  const distributionResult = automationData?.distribution || (
    String(lastResult?.code || '').startsWith('SNS_DISTRIBUTION_') ? lastResult : null
  );

  if (discoveryResult?.success) {
    const data = discoveryResult.data || {};
    lines.push(
      `RSS 결과: 발견 ${Number(data.discoveredCount || 0)}건 · 신규 원문 ${Number(data.newEntryCount || 0)}건 · SNS 행 ${Number(data.addedDeliveryCount || 0)}건 · 중복 ${Number(data.duplicateCount || 0)}건`
    );
    const unavailableSources = Array.isArray(data.unavailableSourceBlogs)
      ? data.unavailableSourceBlogs
      : [];
    if (unavailableSources.length > 0) {
      const labels = unavailableSources.map((source) => source === 'naver' ? '네이버 블로그' : 'WordPress');
      lines.push(`미설정으로 제외: ${labels.join(', ')}`);
    }
  }
  if (distributionResult) {
    const data = distributionResult.data || {};
    if (distributionResult.code === 'SNS_DISTRIBUTION_EMPTY') {
      lines.push('발행 결과: 대기 중인 원문 글 없음');
    } else {
      lines.push(
        `발행 결과: 성공 ${Number(data.completedCount || 0)}건 · 실패 ${Number(data.failedCount || 0)}건 · 건너뜀 ${Number(data.skippedCount || 0)}건`
      );
    }
  }
  if (!discoveryResult && !distributionResult && lastResult?.message) {
    lines.push(`마지막 결과: ${lastResult.message}`);
  }
  return lines.join('\n');
}

