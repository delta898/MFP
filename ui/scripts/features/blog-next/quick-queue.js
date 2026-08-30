let blogNextTopicSubmitting = false;
let blogNextQueueLoading = false;

function readBlogNextTopicPayload(action) {
  const platforms = [];
  if (document.getElementById('blog-next-target-naver')?.checked) platforms.push('naver');
  if (document.getElementById('blog-next-target-wordpress')?.checked) platforms.push('wordpress');

  return {
    action,
    subject: document.getElementById('blog-next-subject')?.value || '',
    keywords: document.getElementById('blog-next-keywords')?.value || '',
    instruction: document.getElementById('blog-next-instruction')?.value || '',
    referenceUrl: document.getElementById('blog-next-reference-url')?.value || '',
    platforms,
    naverCategory: document.getElementById('blog-next-naver-category')?.value || '',
    wordpressCategory: document.getElementById('blog-next-wordpress-category')?.value || '',
    writingStrategy: document.getElementById('blog-next-writing-strategy')?.value || 'search',
    imageMode: document.getElementById('blog-next-image-mode')?.value || 'prompt_only',
    postStatus: document.getElementById('blog-next-post-status')?.value || 'publish',
    scheduleDate: document.getElementById('blog-next-schedule-date')?.value || '',
    externalReference: document.getElementById('blog-next-external-reference')?.checked === true
  };
}

function setBlogNextTopicBusy(busy, action = '') {
  blogNextTopicSubmitting = busy;
  const saveButton = document.getElementById('blog-next-save-topic');
  const enqueueButton = document.getElementById('blog-next-enqueue-topic');
  if (saveButton) {
    saveButton.disabled = busy;
    saveButton.textContent = busy && action === 'save' ? '저장 중...' : '글감 저장';
  }
  if (enqueueButton) {
    enqueueButton.disabled = busy;
    enqueueButton.textContent = busy && action === 'enqueue' ? '추가 중...' : '발행 대기열에 추가';
  }
}

function setBlogNextTopicResult(message, level = '') {
  const result = document.getElementById('blog-next-topic-result');
  if (!result) return;
  result.textContent = String(message || '');
  result.dataset.level = level;
}

function resetBlogNextTopicForm() {
  document.getElementById('blog-next-topic-form')?.reset();
  const naverTarget = document.getElementById('blog-next-target-naver');
  if (naverTarget) naverTarget.checked = true;
  syncBlogNextScheduleField();
}

async function submitBlogNextTopic(action) {
  if (blogNextTopicSubmitting) return;
  setBlogNextTopicBusy(true, action);
  setBlogNextTopicResult('');
  try {
    const data = await postJson('/api/v1/continuous-publishing/topics', readBlogNextTopicPayload(action));
    const queued = data?.status === '발행 준비 완료';
    const message = queued
      ? '발행 계획을 확인해 대기열에 추가했습니다.'
      : '글감을 저장했습니다. 발행 계획은 나중에 완성할 수 있습니다.';
    setBlogNextTopicResult(message, 'success');
    showUiToast({ level: 'success', title: queued ? '대기열 추가 완료' : '글감 저장 완료', message });
    resetBlogNextTopicForm();
    if (queued) await loadBlogNextQueue({ force: true });
  } catch (error) {
    setBlogNextTopicResult(error.message || '글감을 저장하지 못했습니다.', 'error');
  } finally {
    setBlogNextTopicBusy(false);
  }
}

function syncBlogNextScheduleField() {
  const postStatus = document.getElementById('blog-next-post-status')?.value || 'publish';
  const field = document.getElementById('blog-next-schedule-field');
  const input = document.getElementById('blog-next-schedule-date');
  const scheduled = postStatus === 'schedule';
  if (field) field.hidden = !scheduled;
  if (input) input.required = scheduled;
}

function buildBlogNextQueueItem(item = {}, position = 0) {
  const article = document.createElement('article');
  article.className = 'blog-next-queue-item';

  const order = document.createElement('span');
  order.className = 'blog-next-queue-order';
  order.textContent = String(position + 1);

  const copy = document.createElement('div');
  copy.className = 'blog-next-queue-copy';
  const title = document.createElement('strong');
  title.textContent = item.subject || item.keywordsRaw || '제목 없는 글감';
  const meta = document.createElement('span');
  const platforms = Array.isArray(item.options?.platforms) ? item.options.platforms.join(' · ') : '대상 확인 필요';
  const postStatus = item.postStatus === 'draft' ? '임시 저장' : item.postStatus === 'schedule' ? '예약 발행' : '공개 발행';
  meta.textContent = `${platforms} · ${postStatus}`;
  copy.append(title, meta);

  const status = document.createElement('span');
  status.className = 'blog-next-queue-status';
  status.textContent = item.status || '발행 준비 완료';
  article.append(order, copy, status);
  return article;
}

function renderBlogNextQueue(data = {}) {
  const list = document.getElementById('blog-next-queue-list');
  const count = document.getElementById('blog-next-queue-count');
  if (!list || !count) return;
  const items = Array.isArray(data.items) ? data.items : [];
  count.textContent = `${Number(data.total ?? items.length)}건 대기 중`;
  list.replaceChildren();
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'blog-next-empty-state';
    const strong = document.createElement('strong');
    strong.textContent = '아직 준비된 글감이 없습니다.';
    const message = document.createElement('p');
    message.textContent = '빠른 글 작성에서 발행 계획을 완성해 대기열에 추가해 보세요.';
    empty.append(strong, message);
    list.appendChild(empty);
    return;
  }
  items.forEach((item, index) => list.appendChild(buildBlogNextQueueItem(item, index)));
}

async function loadBlogNextQueue(options = {}) {
  if (blogNextQueueLoading && options.force !== true) return;
  blogNextQueueLoading = true;
  const refreshButton = document.getElementById('blog-next-queue-refresh');
  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.textContent = '불러오는 중...';
  }
  try {
    renderBlogNextQueue(await fetchJson('/api/v1/continuous-publishing/queue?limit=50'));
  } catch (error) {
    setBlogNextTopicResult(error.message || '발행 대기열을 불러오지 못했습니다.', 'error');
  } finally {
    blogNextQueueLoading = false;
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.textContent = '새로고침';
    }
  }
}

function initBlogNextQuickQueue() {
  const form = document.getElementById('blog-next-topic-form');
  if (!form || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitBlogNextTopic('enqueue');
  });
  document.getElementById('blog-next-save-topic')?.addEventListener('click', () => submitBlogNextTopic('save'));
  document.getElementById('blog-next-clear-topic')?.addEventListener('click', () => {
    resetBlogNextTopicForm();
    setBlogNextTopicResult('');
  });
  document.getElementById('blog-next-post-status')?.addEventListener('change', syncBlogNextScheduleField);
  document.getElementById('blog-next-queue-refresh')?.addEventListener('click', () => loadBlogNextQueue({ force: true }));
  syncBlogNextScheduleField();
}
