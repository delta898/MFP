const BLOG_NEXT_RUNNER_ACTIVE_STATES = new Set(['selecting', 'running']);
const BLOG_NEXT_RUNNER_TERMINAL_STATES = new Set(['completed', 'simulated', 'failed', 'needs_attention', 'blocked', 'empty']);

let blogNextRunnerPollingTimer = null;
let blogNextRunnerRequesting = false;
let blogNextRunnerActive = false;
let blogNextRunnerDismissedKey = '';
let blogNextRunnerLastStatus = { state: 'idle' };
let blogNextRunnerObservedFinishedAt = '';
let blogNextRunnerStatusInitialized = false;

function getBlogNextRunnerStatusKey(status = {}) {
  return [status.state, status.rowIndex, status.finishedAt, status.resultStatus, status.message]
    .map(value => String(value ?? ''))
    .join(':');
}

function presentBlogNextRunnerStatus(status = {}) {
  const state = String(status.state || 'idle');
  const resultStatus = String(status.resultStatus || '').trim();
  if (state === 'selecting' || state === 'running') return { title: '발행 중', tone: 'progress' };
  if (state === 'completed') {
    const safeResult = ['발행 완료', '임시 저장 완료', '예약 발행 완료'].includes(resultStatus)
      ? resultStatus
      : '발행 완료';
    return { title: safeResult, tone: 'success' };
  }
  if (state === 'simulated') return { title: '시뮬레이션 완료', tone: 'success' };
  if (state === 'needs_attention') return { title: '확인 필요', tone: 'warning', manage: true };
  if (state === 'blocked') return { title: '실행할 수 없음', tone: 'warning', manage: true };
  if (state === 'failed') return { title: '발행 실패', tone: 'error', manage: true };
  if (state === 'empty') return { title: '실행할 글감 없음', tone: 'warning', manage: true };
  return { title: '', tone: '' };
}

function syncBlogNextRunnerTriggerState() {
  const active = blogNextRunnerActive || blogNextRunnerRequesting;
  const startButton = document.getElementById('blog-next-runner-start');
  const headless = document.getElementById('blog-next-runner-headless');
  if (startButton) {
    startButton.disabled = active;
    startButton.textContent = active ? '실행 중...' : '다음 1건 실행';
  }
  if (headless) headless.disabled = active;
  document.querySelectorAll('[data-blog-next-run-now]').forEach((button) => {
    button.disabled = active;
  });
  const automationTestButton = document.getElementById('blog-next-automation-test');
  if (automationTestButton) {
    const testScheduled = automationTestButton.dataset.testScheduled === 'true';
    automationTestButton.disabled = active || testScheduled;
    automationTestButton.setAttribute('aria-disabled', automationTestButton.disabled ? 'true' : 'false');
    automationTestButton.title = active ? '현재 실행이 끝난 뒤 시험 실행할 수 있습니다.' : '';
    automationTestButton.textContent = active ? '실행 중...' : testScheduled ? '테스트 대기 중...' : '30초 테스트';
  }
  if (typeof setBlogNextTopicBusy === 'function') setBlogNextTopicBusy(blogNextTopicSubmitting);
  if (typeof syncBlogNextDraftExecutionState === 'function') syncBlogNextDraftExecutionState(active);
  if (typeof syncBlogNextQueueRunnerState === 'function') syncBlogNextQueueRunnerState(blogNextRunnerLastStatus);
}

function renderBlogNextRunnerStatus(status = {}) {
  const panel = document.getElementById('blog-next-publish-status');
  const title = document.getElementById('blog-next-publish-status-title');
  const subject = document.getElementById('blog-next-publish-status-subject');
  const message = document.getElementById('blog-next-publish-status-message');
  const manage = document.getElementById('blog-next-publish-status-manage');
  const dismiss = document.getElementById('blog-next-publish-status-dismiss');
  const state = String(status.state || 'idle');
  const active = status.busy === true || BLOG_NEXT_RUNNER_ACTIVE_STATES.has(state);
  const terminal = BLOG_NEXT_RUNNER_TERMINAL_STATES.has(state);
  const presentation = presentBlogNextRunnerStatus(status);
  const statusKey = getBlogNextRunnerStatusKey(status);
  const dismissed = terminal && statusKey === blogNextRunnerDismissedKey;
  const panelVisible = state !== 'idle' && !dismissed;

  blogNextRunnerLastStatus = { ...status };
  blogNextRunnerActive = active;
  if (typeof settleBlogNextImmediateSubmission === 'function') {
    settleBlogNextImmediateSubmission(status);
  }
  if (panel) {
    panel.hidden = !panelVisible;
    panel.dataset.state = state;
    panel.dataset.tone = presentation.tone;
  }
  if (title) title.textContent = presentation.title;
  if (subject) {
    subject.textContent = String(status.subject || '').trim();
    subject.hidden = !subject.textContent;
  }
  if (message) {
    const rawMessage = String(status.message || '').trim();
    message.textContent = state === 'completed' && rawMessage === '다음 글감 한 건을 처리했습니다.'
      ? '글감 처리 완료'
      : rawMessage;
  }
  if (manage) manage.hidden = presentation.manage !== true;
  if (dismiss) dismiss.hidden = !terminal;
  document.querySelectorAll('[data-blog-next-runner-status-jump]').forEach((button) => {
    button.hidden = !panelVisible || !active;
  });
  syncBlogNextRunnerTriggerState();
  if (typeof scheduleGlobalPublishingStatusRefresh === 'function') scheduleGlobalPublishingStatusRefresh(50);
  return active;
}

function scheduleBlogNextRunnerPoll(delay = 1000) {
  clearTimeout(blogNextRunnerPollingTimer);
  blogNextRunnerPollingTimer = setTimeout(() => loadBlogNextRunnerStatus({ poll: true }), delay);
}

function syncBlogNextRunnerWatchForTab() {
  clearTimeout(blogNextRunnerPollingTimer);
  if (blogNextRunnerActive) scheduleBlogNextRunnerPoll(1000);
  else if (typeof blogNextActiveTab !== 'undefined' && blogNextActiveTab === 'queue') scheduleBlogNextRunnerPoll(5000);
}

async function loadBlogNextRunnerStatus(options = {}) {
  try {
    const status = await fetchJson('/api/v1/continuous-publishing/runner/status');
    const previousFinishedAt = blogNextRunnerObservedFinishedAt;
    const finishedAt = String(status.finishedAt || '');
    const finishedChanged = blogNextRunnerStatusInitialized
      && Boolean(finishedAt)
      && finishedAt !== previousFinishedAt;
    blogNextRunnerObservedFinishedAt = finishedAt || previousFinishedAt;
    blogNextRunnerStatusInitialized = true;
    const active = renderBlogNextRunnerStatus(status);
    if (finishedChanged
      && typeof blogNextActiveTab !== 'undefined'
      && blogNextActiveTab === 'queue'
      && typeof loadBlogNextQueue === 'function') {
      loadBlogNextQueue({ force: true });
    }
    syncBlogNextRunnerWatchForTab();
    return status;
  } catch (error) {
    renderBlogNextRunnerStatus({ state: 'failed', message: error.message || '실행 상태를 불러오지 못했습니다.' });
    syncBlogNextRunnerWatchForTab();
    return null;
  }
}

async function startBlogNextRunner(options = {}) {
  if (blogNextRunnerRequesting || blogNextRunnerActive) return;
  blogNextRunnerRequesting = true;
  blogNextRunnerDismissedKey = '';
  const headless = document.getElementById('blog-next-runner-headless')?.checked !== false;
  const rowIndex = Number(options.rowIndex);
  const selected = Number.isInteger(rowIndex);
  renderBlogNextRunnerStatus({ state: 'selecting', busy: true, message: selected ? '선택한 글감을 확인하고 있습니다.' : '다음 글감을 확인하고 있습니다.' });
  try {
    const status = await postJson('/api/v1/continuous-publishing/runner/start', selected ? { headless, rowIndex } : { headless });
    renderBlogNextRunnerStatus(status);
    scheduleBlogNextRunnerPoll(1000);
    return status;
  } catch (error) {
    renderBlogNextRunnerStatus({ state: 'failed', message: error.message || '다음 글감 실행을 시작하지 못했습니다.' });
    throw error;
  } finally {
    blogNextRunnerRequesting = false;
    syncBlogNextRunnerTriggerState();
  }
}

function initBlogNextRunner() {
  const panel = document.getElementById('blog-next-publish-status');
  if (!panel) return;
  if (panel.dataset.bound !== 'true') {
    panel.dataset.bound = 'true';
    document.getElementById('blog-next-publish-status-manage')?.addEventListener('click', () => {
      activateBlogNextTab('queue');
    });
    document.getElementById('blog-next-publish-status-dismiss')?.addEventListener('click', () => {
      blogNextRunnerDismissedKey = getBlogNextRunnerStatusKey(blogNextRunnerLastStatus);
      panel.hidden = true;
      document.querySelectorAll('[data-blog-next-runner-status-jump]').forEach((button) => {
        button.hidden = true;
      });
    });
    document.querySelectorAll('[data-blog-next-runner-status-jump]').forEach((button) => {
      button.addEventListener('click', () => {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    document.getElementById('blog-next-runner-start')?.addEventListener('click', () => startBlogNextRunner());
  }
  loadBlogNextRunnerStatus();
}
