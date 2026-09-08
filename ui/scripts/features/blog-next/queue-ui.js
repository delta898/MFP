let blogNextQueueHasLoaded = false;

function formatBlogNextPostStatus(item = {}) {
  const postStatus = item.postStatus || item.options?.post_status;
  return postStatus === 'draft' ? '임시 저장' : postStatus === 'schedule' ? '예약 발행' : '즉시 발행';
}

const BLOG_NEXT_MANAGEMENT_TABS = Object.freeze(['ready', 'saved', 'automation']);

function activateBlogNextManagementTab(tabName) {
  const target = BLOG_NEXT_MANAGEMENT_TABS.includes(String(tabName || '').trim())
    ? String(tabName).trim()
    : 'ready';
  blogNextActiveManagementTab = target;
  document.querySelectorAll('[data-blog-next-management-tab]').forEach((button) => {
    const active = button.dataset.blogNextManagementTab === target;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('[data-blog-next-management-panel]').forEach((panel) => {
    const active = panel.dataset.blogNextManagementPanel === target;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
  const actions = document.querySelector('.blog-next-management-actions');
  if (actions) actions.hidden = target === 'automation';
  const status = document.getElementById('blog-next-management-status');
  if (status) status.hidden = target === 'automation' || !status.textContent;
  if (target === 'automation' && typeof loadBlogNextAutomationSettings === 'function') {
    loadBlogNextAutomationSettings();
  }
  if (target !== 'automation'
    && typeof blogNextActiveTab !== 'undefined'
    && blogNextActiveTab === 'queue'
    && typeof loadBlogNextQueue === 'function') {
    loadBlogNextQueue();
  }
}

async function requestActivateBlogNextManagementTab(tabName) {
  const target = BLOG_NEXT_MANAGEMENT_TABS.includes(String(tabName || '').trim())
    ? String(tabName).trim()
    : 'ready';
  if (blogNextActiveManagementTab === 'automation'
    && target !== 'automation'
    && typeof confirmDiscardUnsavedBlogNextAutomationSettings === 'function') {
    const canLeave = await confirmDiscardUnsavedBlogNextAutomationSettings();
    if (!canLeave) return false;
  }
  activateBlogNextManagementTab(target);
  return true;
}

function renderBlogNextEmptyState(list, title, message, state = 'empty') {
  const empty = document.createElement('div');
  empty.className = `blog-next-empty-state${state === 'error' ? ' has-error' : ''}`;
  const strong = document.createElement('strong');
  strong.textContent = title;
  empty.appendChild(strong);
  if (message) {
    const copy = document.createElement('p');
    copy.textContent = message;
    empty.appendChild(copy);
  }
  list.appendChild(empty);
}

function setBlogNextManagementStatus(state, message = '') {
  const status = document.getElementById('blog-next-management-status');
  if (!status) return;
  status.dataset.state = state;
  status.textContent = message;
  status.hidden = blogNextActiveManagementTab === 'automation' || !message;
}

function setBlogNextQueueListsBusy(busy) {
  ['blog-next-queue-list', 'blog-next-saved-list'].forEach((id) => {
    document.getElementById(id)?.setAttribute('aria-busy', busy ? 'true' : 'false');
  });
}

function renderBlogNextQueueInitialError(message) {
  if (blogNextQueueHasLoaded) return;
  ['blog-next-queue-list', 'blog-next-saved-list'].forEach((id) => {
    const list = document.getElementById(id);
    if (!list) return;
    list.dataset.state = 'error';
    list.replaceChildren();
    renderBlogNextEmptyState(list, '글감 목록을 불러오지 못했습니다.', message || '새로고침으로 다시 시도해 주세요.', 'error');
  });
}

function createBlogNextListItem(item, position, saved) {
  const article = document.createElement('article');
  article.className = `blog-next-queue-item${saved ? ' blog-next-saved-item' : ''}`;
  if (Number.isInteger(Number(item.rowIndex))) article.dataset.blogNextQueueRowIndex = String(Number(item.rowIndex));
  if (item.queue_runtime_state === 'running') article.dataset.blogNextQueueServerRunning = 'true';
  const order = document.createElement('span');
  order.className = 'blog-next-queue-order';
  order.textContent = String(position + 1);
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'blog-next-queue-copy';
  copy.dataset.blogNextEdit = saved ? 'saved' : 'ready';
  copy.setAttribute('aria-label', `${item.subject || item.keywordsRaw || '제목 없는 글감'} 수정`);
  copy.addEventListener('click', () => populateBlogNextTopicForm(item, saved ? '대기' : '발행 준비 완료'));
  const title = document.createElement('strong');
  title.textContent = item.subject || item.keywordsRaw || '제목 없는 글감';
  const meta = document.createElement('span');
  meta.className = 'blog-next-queue-meta';
  const platforms = formatBlogPlatformList(item.options?.platforms) || '발행 대상 미정';
  const postStatus = formatBlogNextPostStatus(item);
  if (saved) meta.textContent = `${platforms} · ${postStatus}`;
  else {
    const estimate = formatBlogNextQueueEstimate(item.processing_estimate_at);
    const schedule = estimate
      ? `${position === 0 ? '다음 처리' : '처리 예상'} ${estimate}${position === 0 ? '' : ' 이후'}`
      : '';
    meta.textContent = [platforms, postStatus, schedule].filter(Boolean).join(' · ');
  }
  meta.dataset.planText = meta.textContent;
  const running = document.createElement('span');
  running.className = 'blog-next-queue-running';
  running.hidden = true;
  const runningIndicator = document.createElement('i');
  runningIndicator.className = 'blog-next-queue-running-indicator';
  runningIndicator.setAttribute('aria-hidden', 'true');
  const runningText = document.createElement('span');
  runningText.dataset.blogNextQueueRunningText = 'true';
  running.append(runningIndicator, runningText);
  copy.append(title, meta, running);
  const actions = document.createElement('div');
  actions.className = 'blog-next-queue-actions';
  if (!saved) {
    const readyCount = Number(item.queueSize || 0);
    [
      { direction: 'up', label: '위로 이동', symbol: '↑', disabled: position === 0 },
      { direction: 'down', label: '아래로 이동', symbol: '↓', disabled: position === readyCount - 1 }
    ].forEach((control) => {
      const moveButton = document.createElement('button');
      moveButton.type = 'button';
      moveButton.className = 'ghost blog-next-queue-move';
      moveButton.dataset.blogNextQueueMove = control.direction;
      moveButton.textContent = control.symbol;
      moveButton.title = control.label;
      moveButton.setAttribute('aria-label', control.label);
      moveButton.disabled = control.disabled;
      moveButton.dataset.blogNextQueueDefaultDisabled = control.disabled ? 'true' : 'false';
      moveButton.addEventListener('click', () => reorderBlogNextQueueItem(item, control.direction));
      actions.append(moveButton);
    });
  }
  if (saved) {
    const enqueueButton = document.createElement('button');
    enqueueButton.type = 'button';
    enqueueButton.className = 'primary';
    enqueueButton.dataset.blogNextQueueDefaultDisabled = 'false';
    enqueueButton.textContent = '대기열로 이동';
    enqueueButton.addEventListener('click', () => addBlogNextSavedItemToQueue(item, enqueueButton));
    actions.append(enqueueButton);
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'ghost';
    deleteButton.dataset.blogNextQueueDefaultDisabled = 'false';
    deleteButton.textContent = '삭제';
    deleteButton.addEventListener('click', () => deleteBlogNextSavedItem(item, deleteButton));
    actions.append(deleteButton);
  } else {
    const archiveButton = document.createElement('button');
    archiveButton.type = 'button';
    archiveButton.className = 'ghost';
    archiveButton.dataset.blogNextQueueDefaultDisabled = 'false';
    archiveButton.textContent = '보관으로 이동';
    archiveButton.addEventListener('click', () => removeBlogNextQueueItem(item, archiveButton));
    actions.append(archiveButton);
    const runButton = document.createElement('button');
    runButton.type = 'button';
    runButton.className = 'primary';
    runButton.dataset.blogNextRunNow = 'true';
    runButton.dataset.blogNextQueueDefaultDisabled = 'false';
    runButton.disabled = typeof blogNextRunnerActive !== 'undefined' && blogNextRunnerActive;
    runButton.textContent = getBlogNextQueueRunActionCopy(item).label;
    runButton.addEventListener('click', () => runBlogNextQueueItemNow(item, runButton));
    actions.append(runButton);
  }
  article.append(order, copy, actions);
  return article;
}
