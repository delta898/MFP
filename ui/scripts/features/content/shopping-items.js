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

