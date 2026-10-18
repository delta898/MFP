
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

function normalizeBlogTopicImageMode(item) {
  const mode = String(item?.image_mode || item?.image_options?.mode || '').trim();
  if (['generate', 'prompt_only', 'none'].includes(mode)) return mode;
  return item?.image_gen === true ? 'generate' : 'prompt_only';
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
    const imageMode = normalizeBlogTopicImageMode(item);
    const externalReference = Boolean(item.external_reference);
    const recentMeta = getRecentBatchMeta(item.rowIndex);
    const runningClass = runtimeLog ? 'running-row' : '';
    const recentClass = recentMeta ? (recentMeta.success ? 'recent-batch-success' : 'recent-batch-fail') : '';
    const subjectBadge = recentMeta
      ? `<span class="recent-badge ${recentMeta.success ? 'success' : 'fail'}">${recentMeta.success ? '방금 성공' : '방금 실패'}</span>`
      : '';
    const checked = blogSelectedRowIndices.has(item.rowIndex) ? 'checked' : '';
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
        <td class="toggle-cell">
          <select class="inline-image-mode" data-field="imageMode" data-row-index="${item.rowIndex}">
            <option value="generate" ${imageMode === 'generate' ? 'selected' : ''}>이미지 생성</option>
            <option value="prompt_only" ${imageMode === 'prompt_only' ? 'selected' : ''}>프롬프트 포함</option>
            <option value="none" ${imageMode === 'none' ? 'selected' : ''}>미포함</option>
          </select>
        </td>
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

  document.getElementById('blog-edit-image-mode').value = normalizeBlogTopicImageMode(item);
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
    const categories = categoryCache ? ['', ...categoryCache.map(c => c.name)] : [''];

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

function updateShoppingEditorSettings() {
  const focusLabels = { auto: '자동 구성', product_intro: '상품 소개', comparison: '비교·선택 가이드', usage: '사용 상황 제안' };
  const writingSummary = document.getElementById('shopping-edit-writing-summary');
  const strategy = document.getElementById('shopping-edit-writing-strategy')?.value || 'search';
  const focus = document.getElementById('shopping-edit-content-focus')?.value || 'auto';
  if (writingSummary) writingSummary.textContent = `${strategy === 'discovery' ? '발견 중심' : '검색 중심'} · ${focusLabels[focus] || focusLabels.auto}`;

  const postStatus = document.getElementById('shopping-edit-post-status')?.value || 'publish';
  const scheduleDate = document.getElementById('shopping-edit-schedule-date');
  const scheduleRequired = document.getElementById('shopping-edit-schedule-required');
  if (scheduleDate) {
    scheduleDate.disabled = postStatus !== 'schedule';
    scheduleDate.required = postStatus === 'schedule';
  }
  if (scheduleRequired) scheduleRequired.hidden = postStatus !== 'schedule';

  const targets = [
    document.getElementById('shopping-edit-target-naver')?.checked ? '네이버' : '',
    document.getElementById('shopping-edit-target-wordpress')?.checked ? '워드프레스' : ''
  ].filter(Boolean);
  const statusLabels = { publish: '즉시 발행', draft: '임시 저장', schedule: '예약 발행' };
  const publishSummary = document.getElementById('shopping-edit-publish-summary');
  if (publishSummary) publishSummary.textContent = `${targets.length ? targets.join('·') : '발행 대상 선택'} · ${statusLabels[postStatus] || '즉시 발행'}`;
}

function openShoppingEditor(rowIndex) {
  const item = findShoppingByRowIndex(rowIndex);
  if (!item) return;

  currentShoppingEditRowIndex = rowIndex;

  document.getElementById('shopping-edit-product').value = item.product || '';
  document.getElementById('shopping-edit-url').value = item.shortUrl || '';
  document.getElementById('shopping-edit-instruction').value = item.instruction || item.options?.instruction || '';
  document.getElementById('shopping-edit-schedule-date').value = (item.scheduleDate || '').replace(' ', 'T').substring(0, 16);
  document.getElementById('shopping-edit-writing-strategy').value = item.writingStrategy || item.options?.writing_strategy || 'search';
  document.getElementById('shopping-edit-content-focus').value = item.contentFocus || item.options?.content_focus || 'auto';
  const targets = Array.isArray(item.targets)
    ? item.targets
    : (Array.isArray(item.options?.platforms) ? item.options.platforms : []);
  const singleTarget = targets.length === 1 ? targets[0] : '';
  document.getElementById('shopping-edit-target-naver').checked = singleTarget === 'naver';
  document.getElementById('shopping-edit-target-wordpress').checked = singleTarget === 'wordpress';

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

  document.getElementById('shopping-edit-post-status').value = item.postStatus || item.options?.post_status || 'publish';
  document.getElementById('shopping-edit-status').value = item.status || '준비';
  updateShoppingEditorSettings();

  document.getElementById('shopping-edit-result').textContent = targets.length > 1
    ? '기존 글감에 발행 대상이 여러 개 저장되어 있습니다. 하나를 선택한 뒤 저장해 주세요.'
    : '';
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
  const postStatus = document.getElementById('shopping-edit-post-status').value || 'publish';
  const status = document.getElementById('shopping-edit-status').value || '준비';
  const writingStrategy = document.getElementById('shopping-edit-writing-strategy').value || 'search';
  const contentFocus = document.getElementById('shopping-edit-content-focus').value || 'auto';
  const targets = [
    document.getElementById('shopping-edit-target-naver').checked ? 'naver' : '',
    document.getElementById('shopping-edit-target-wordpress').checked ? 'wordpress' : ''
  ].filter(Boolean);

  if (status === '발행 준비 완료' && targets.length !== 1) {
    resultBox.textContent = '발행 대기열로 옮기려면 포스팅 대상을 하나 선택해 주세요.';
    return;
  }
  if (postStatus === 'schedule' && !scheduleDate) {
    resultBox.textContent = '예약 발행을 선택했다면 예약 일시를 입력해 주세요.';
    return;
  }

  const category = (naverCategory || wordpressCategory)
    ? `N:${naverCategory}, W:${wordpressCategory}`
    : '';

  const patch = {
    product, shortUrl, instruction, category, postStatus, status, targets, writingStrategy, contentFocus,
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
  const imageMode = document.getElementById('blog-edit-image-mode').value || 'prompt_only';
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
    imageMode,
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
    imageMode: String((patch.imageMode !== undefined ? patch.imageMode : normalizeBlogTopicImageMode(safeItem)) || 'prompt_only'),
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
  if (patch.imageMode !== undefined) {
    item.image_mode = patch.imageMode;
    item.image_gen = patch.imageMode === 'generate';
    item.image_options = { ...(item.image_options || {}), mode: patch.imageMode, generate: patch.imageMode === 'generate' };
    item.options = { ...(item.options || {}), image_mode: patch.imageMode, image_gen: patch.imageMode === 'generate' };
  }
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
