let shoppingManagementActiveTab = 'ready';
let shoppingManagementHasLoaded = false;

function setShoppingManagementStatus(message = '', state = 'idle') {
  const element = document.getElementById('shopping-management-status');
  if (!element) return;
  element.textContent = String(message || '').trim();
  element.dataset.state = state;
  element.hidden = !element.textContent;
}

function activateShoppingManagementTab(tabName) {
  const nextTab = tabName === 'saved' ? 'saved' : 'ready';
  shoppingManagementActiveTab = nextTab;
  document.querySelectorAll('[data-shopping-management-tab]').forEach((button) => {
    const active = button.dataset.shoppingManagementTab === nextTab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('[data-shopping-management-panel]').forEach((panel) => {
    const active = panel.dataset.shoppingManagementPanel === nextTab;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

function renderShoppingManagementEmptyState(list, titleText, descriptionText, state = 'empty') {
  const empty = document.createElement('div');
  empty.className = `blog-next-empty-state${state === 'error' ? ' has-error' : ''}`;
  const title = document.createElement('strong');
  title.textContent = titleText;
  const description = document.createElement('p');
  description.textContent = descriptionText;
  empty.append(title, description);
  list.replaceChildren(empty);
}

function formatShoppingManagementHost(rawUrl) {
  try {
    return new URL(String(rawUrl || '')).hostname.replace(/^www\./, '');
  } catch (_error) {
    return '상품 링크';
  }
}

function getShoppingManagementTargets(item = {}) {
  const candidates = Array.isArray(item.targets)
    ? item.targets
    : (Array.isArray(item.options?.platforms) ? item.options.platforms : []);
  return Array.from(new Set(candidates
    .map((target) => String(target || '').trim().toLowerCase())
    .filter((target) => ['naver', 'wordpress'].includes(target))));
}

function formatShoppingManagementTargets(item = {}) {
  const labels = { naver: '네이버 블로그', wordpress: '워드프레스' };
  const targets = getShoppingManagementTargets(item);
  return targets.length > 0 ? targets.map((target) => labels[target]).join(' · ') : '발행 대상 없음';
}

async function moveShoppingManagementItem(item, status, button) {
  if (!item || !Number.isInteger(Number(item.rowIndex))) return;
  if (status === '발행 준비 완료' && getShoppingManagementTargets(item).length === 0) {
    openShoppingEditor(Number(item.rowIndex));
    showUiToast({ level: 'info', title: '발행 대상 선택', message: '발행 대상을 선택해 저장한 뒤 대기열로 옮겨 주세요.' });
    return;
  }
  const previousStatus = item.status;
  const defaultLabel = button?.textContent || '';
  if (button) {
    button.disabled = true;
    button.textContent = '이동 중...';
  }
  setShoppingManagementStatus('', 'idle');
  try {
    await saveShoppingRowPatch(Number(item.rowIndex), { status }, { silent: true });
    showUiToast(status === '준비'
      ? { level: 'success', title: '보관으로 이동 완료', message: '글감을 보관한 글감으로 옮겼습니다.' }
      : { level: 'success', title: '대기열로 이동 완료', message: '글감을 발행 대기열로 옮겼습니다.' });
  } catch (error) {
    item.status = previousStatus;
    renderBlogShoppingTable(blogShoppingCache);
    showUiToast({ level: 'error', title: '대기열 변경 실패', message: error.message || '잠시 후 다시 시도해 주세요.' });
  } finally {
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = defaultLabel;
    }
  }
}

async function deleteShoppingManagementItem(item, button) {
  if (!item || !Number.isInteger(Number(item.rowIndex))) return;
  const confirmed = await showUiConfirm('보관한 글감을 삭제할까요? 삭제한 글감은 복구할 수 없습니다.', {
    title: '보관한 글감 삭제',
    confirmText: '삭제',
    cancelText: '취소'
  });
  if (!confirmed) return;
  if (button) {
    button.disabled = true;
    button.textContent = '삭제 중...';
  }
  setShoppingManagementStatus('', 'idle');
  try {
    await postJson('/api/v1/shopping/topics/delete', { rowIndices: [Number(item.rowIndex)] });
    await loadBlogShopping({ silent: true });
    showUiToast({ level: 'success', title: '글감 삭제 완료', message: '보관한 글감을 삭제했습니다.' });
  } catch (error) {
    showUiToast({ level: 'error', title: '글감 삭제 실패', message: error.message || '잠시 후 다시 시도해 주세요.' });
  } finally {
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = '삭제';
    }
  }
}

async function runShoppingManagementItem(item, button) {
  if (!item || !Number.isInteger(Number(item.rowIndex))) return;
  const resultBox = document.getElementById('shopping-action-result');
  if (!resultBox) return;
  if (button) button.disabled = true;
  pauseDashboardPolling();
  try {
    const result = await runWithLiveProgress({
      targetEl: resultBox,
      requestLabel: '쇼핑 글 포스팅',
      requestFn: () => postJson('/api/v1/continuous-publishing/shopping/runner/start', {
        rowIndex: Number(item.rowIndex),
        headless: Boolean(document.getElementById('shopping-quick-headless')?.checked)
      }),
      onTick: () => loadBlogShopping({ silent: true })
    });
    showUiToast({
      level: 'success',
      title: '쇼핑 글 포스팅 완료',
      message: result?.postStatus === 'draft'
        ? '쇼핑 글을 임시 저장했습니다.'
        : result?.postStatus === 'schedule'
          ? '쇼핑 글 예약 발행을 등록했습니다.'
          : '쇼핑 글을 발행했습니다.'
    });
    await Promise.all([loadBlogShopping({ silent: true }), loadDashboard()]);
  } catch (_error) {
    // runWithLiveProgress가 상세 오류를 결과 영역에 표시한다.
  } finally {
    resumeDashboardPolling();
    if (button) button.disabled = false;
  }
}

function createShoppingManagementItem(item, position, saved) {
  const runningState = String(item.status || '').trim() === '발행 중' || Boolean(String(item.runtimeLog || '').trim());
  const article = document.createElement('article');
  article.className = `blog-next-queue-item shopping-management-item${saved ? ' blog-next-saved-item' : ''}${runningState ? ' is-running' : ''}`;
  article.dataset.shoppingManagementRowIndex = String(Number(item.rowIndex));

  const order = document.createElement('span');
  order.className = 'blog-next-queue-order';
  order.textContent = String(position + 1);

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'blog-next-queue-copy';
  copy.setAttribute('aria-label', `${item.product || '제목 없는 쇼핑 글감'} 수정`);
  copy.addEventListener('click', () => openShoppingEditor(Number(item.rowIndex)));
  const title = document.createElement('strong');
  title.textContent = item.product || '제목 없는 쇼핑 글감';
  const meta = document.createElement('span');
  meta.className = 'blog-next-queue-meta';
  meta.textContent = [
    formatShoppingManagementHost(item.shortUrl),
    formatShoppingManagementTargets(item),
    getPostStatusLabel(item.postStatus || 'publish'),
    item.scheduleDate || ''
  ].filter(Boolean).join(' · ');
  const running = document.createElement('span');
  running.className = 'blog-next-queue-running';
  running.hidden = !runningState;
  running.textContent = String(item.runtimeLog || '').trim() || '포스팅을 진행하고 있습니다.';
  copy.append(title, meta, running);

  const actions = document.createElement('div');
  actions.className = 'blog-next-queue-actions';
  if (saved) {
    const enqueue = document.createElement('button');
    enqueue.type = 'button';
    enqueue.className = 'primary';
    enqueue.textContent = getShoppingManagementTargets(item).length > 0 ? '대기열로 이동' : '발행 대상 선택';
    enqueue.addEventListener('click', () => moveShoppingManagementItem(item, '발행 준비 완료', enqueue));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ghost';
    remove.textContent = '삭제';
    remove.addEventListener('click', () => deleteShoppingManagementItem(item, remove));
    actions.append(enqueue, remove);
  } else {
    const archive = document.createElement('button');
    archive.type = 'button';
    archive.className = 'ghost';
    archive.textContent = '보관으로 이동';
    archive.disabled = runningState;
    archive.addEventListener('click', () => moveShoppingManagementItem(item, '준비', archive));
    const run = document.createElement('button');
    run.type = 'button';
    run.className = 'primary';
    const hasDeliveryTargets = getShoppingManagementTargets(item).length > 0;
    run.textContent = runningState ? '진행 중' : (hasDeliveryTargets ? '지금 포스팅' : '발행 대상 선택');
    run.disabled = runningState;
    run.addEventListener('click', () => {
      if (!hasDeliveryTargets) {
        openShoppingEditor(Number(item.rowIndex));
        showUiToast({ level: 'info', title: '발행 대상 선택', message: '발행 대상을 선택해 저장한 뒤 포스팅해 주세요.' });
        return;
      }
      void runShoppingManagementItem(item, run);
    });
    actions.append(archive, run);
  }

  article.append(order, copy, actions);
  return article;
}

function renderShoppingManagementList(list, items, saved) {
  if (!list) return;
  const sourceItems = Array.isArray(items) ? items : [];
  list.dataset.state = sourceItems.length > 0 ? 'results' : 'empty';
  list.setAttribute('aria-busy', 'false');
  if (sourceItems.length === 0) {
    renderShoppingManagementEmptyState(
      list,
      saved ? '보관한 글감이 없습니다.' : '아직 준비된 글감이 없습니다.',
      saved ? '빠른 글 작성에서 떠오른 아이디어를 먼저 보관해 보세요.' : '발행 계획을 완성해 대기열에 추가해 보세요.'
    );
    return;
  }
  list.replaceChildren(...sourceItems.map((item, position) => createShoppingManagementItem(item, position, saved)));
}

function renderBlogShoppingTable(items) {
  const sourceItems = Array.isArray(items) ? items : [];
  const readyItems = sourceItems.filter((item) => ['발행 준비 완료', '발행 중'].includes(String(item.status || '').trim()));
  const savedItems = sourceItems.filter((item) => String(item.status || '').trim() === '준비');
  renderShoppingManagementList(
    document.getElementById('shopping-management-ready-list'),
    readyItems,
    false
  );
  renderShoppingManagementList(
    document.getElementById('shopping-management-saved-list'),
    savedItems,
    true
  );
  const readyCount = document.getElementById('shopping-management-ready-count');
  const savedCount = document.getElementById('shopping-management-saved-count');
  if (readyCount) readyCount.textContent = `${readyItems.length}건`;
  if (savedCount) savedCount.textContent = `${savedItems.length}건`;
}

async function fetchShoppingManagementItems() {
  const params = new URLSearchParams({
    limit: '10000',
    offset: '0',
    sortBy: 'rowNumber',
    sortDir: 'desc'
  });
  return fetchJson(`/api/v1/shopping/items?${params.toString()}`);
}

async function loadBlogShopping(options = {}) {
  if (!guardUiConfigReady('쇼핑 글감 조회')) return;
  const silent = Boolean(options.silent);
  const refresh = document.getElementById('shopping-refresh-btn');
  const readyList = document.getElementById('shopping-management-ready-list');
  const savedList = document.getElementById('shopping-management-saved-list');
  if (refresh) {
    refresh.disabled = true;
    refresh.textContent = '불러오는 중...';
    refresh.setAttribute('aria-busy', 'true');
  }
  if (!silent) setShoppingManagementStatus('', 'idle');
  [readyList, savedList].forEach((list) => {
    if (!list) return;
    list.dataset.state = 'loading';
    list.setAttribute('aria-busy', 'true');
  });

  try {
    const data = await fetchShoppingManagementItems();
    const items = Array.isArray(data.items) ? data.items : [];
    const readyItems = items
      .filter((item) => ['발행 준비 완료', '발행 중'].includes(String(item.status || '').trim()))
      .sort((left, right) => Number(left.rowNumber || 0) - Number(right.rowNumber || 0));
    const savedItems = items.filter((item) => String(item.status || '').trim() === '준비');
    blogShoppingCache = [...readyItems, ...savedItems];
    shoppingManagementHasLoaded = true;
    renderBlogShoppingTable(blogShoppingCache);
    if (!silent) setShoppingManagementStatus('', 'idle');
  } catch (error) {
    const message = error.message || '글감 목록을 불러오지 못했습니다.';
    if (shoppingManagementHasLoaded) {
      setShoppingManagementStatus(`${message} 기존 목록은 그대로 유지했습니다.`, 'error');
    } else {
      [readyList, savedList].forEach((list) => {
        if (!list) return;
        list.dataset.state = 'error';
        list.setAttribute('aria-busy', 'false');
        renderShoppingManagementEmptyState(list, '글감 목록을 불러오지 못했습니다.', '새로고침으로 다시 시도해 주세요.', 'error');
      });
      setShoppingManagementStatus('', 'idle');
    }
  } finally {
    if (refresh) {
      refresh.disabled = false;
      refresh.textContent = '새로고침';
      refresh.setAttribute('aria-busy', 'false');
    }
  }
}

async function runShoppingBatchAction() {
  if (!guardUiConfigReady('쇼핑 글 포스팅')) return;
  const resultBox = document.getElementById('shopping-action-result');
  if (!resultBox) return;

  const rowIndices = Array.from(blogShoppingSelectedRowIndices.values()).filter(v => Number.isInteger(v));
  if (rowIndices.length === 0) {
    resultBox.textContent = '포스팅할 글감을 선택해 주세요.';
    return;
  }

  const selectedSnapshot = [...rowIndices];

  const headless = Boolean(document.getElementById('shopping-quick-headless')?.checked);
  const targets = [];
  if (document.getElementById('shopping-quick-target-naver')?.checked) targets.push('naver');
  if (document.getElementById('shopping-quick-target-wordpress')?.checked) targets.push('wordpress');

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
      requestLabel: '쇼핑 글 포스팅',
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

async function saveShoppingRowPatch(rowIndex, patch = {}, options = {}) {
  const silent = Boolean(options.silent);
  const resultBox = document.getElementById('shopping-action-result');
  const item = findShoppingByRowIndex(rowIndex);
  if (!item) throw new Error(`rowIndex(${rowIndex})를 찾지 못했습니다.`);
  const previous = {
    product: item.product,
    shortUrl: item.shortUrl,
    instruction: item.instruction,
    status: item.status,
    category: item.category,
    postStatus: item.postStatus,
    scheduleDate: item.scheduleDate,
    writingStrategy: item.writingStrategy,
    contentFocus: item.contentFocus,
    targets: [...getShoppingManagementTargets(item)],
    options: { ...(item.options || {}) }
  };

  const nextTargets = patch.targets !== undefined
    ? getShoppingManagementTargets({ targets: patch.targets })
    : getShoppingManagementTargets(item);
  if (patch.status === '발행 준비 완료' && nextTargets.length === 0) {
    throw new Error('발행 대기열로 옮기려면 포스팅 대상을 하나 이상 선택해 주세요.');
  }

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
  if (patch.writingStrategy !== undefined) item.writingStrategy = patch.writingStrategy;
  if (patch.contentFocus !== undefined) item.contentFocus = patch.contentFocus;
  if (patch.targets !== undefined) {
    item.targets = [...getShoppingManagementTargets({ targets: patch.targets })];
    item.options = { ...(item.options || {}), platforms: [...item.targets] };
  }

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
    scheduleDate: patch.scheduleDate !== undefined ? String(patch.scheduleDate || '').trim() : item.scheduleDate,
    writingStrategy: patch.writingStrategy !== undefined ? String(patch.writingStrategy || '').trim() : item.writingStrategy,
    contentFocus: patch.contentFocus !== undefined ? String(patch.contentFocus || '').trim() : item.contentFocus,
    targets: nextTargets
  };

  if (!silent && resultBox) resultBox.textContent = `row ${rowIndex + 2} 수정 중...`;
  try {
    const data = await postJson('/api/v1/shopping/row/update', payload);
    if (!silent && resultBox) resultBox.textContent = JSON.stringify(data, null, 2);
    // 서버가 모든 shopping 목록 캐시를 무효화한다. 전파 확인은 조용히 한 번만 한다.
    setTimeout(() => loadBlogShopping({ silent: true }), 750);
    return data;
  } catch (error) {
    Object.assign(item, previous);
    renderBlogShoppingTable(blogShoppingCache);
    throw error;
  }
}
