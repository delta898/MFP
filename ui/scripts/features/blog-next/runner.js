const BLOG_NEXT_RUNNER_ACTIVE_STATES = new Set(['selecting', 'running']);

let blogNextRunnerPollingTimer = null;
let blogNextRunnerRequesting = false;

function describeBlogNextRunner(status = {}) {
  const subject = String(status.subject || '').trim();
  const rowNumber = Number(status.rowNumber);
  const resultStatus = String(status.resultStatus || '').trim();
  const parts = [];
  if (subject) parts.push(subject);
  if (Number.isInteger(rowNumber) && rowNumber > 0) parts.push(`Topics ${rowNumber}행`);
  if (resultStatus) parts.push(resultStatus);
  return parts.join(' · ') || '발행 준비된 가장 오래된 글감 한 건을 처리합니다.';
}

function renderBlogNextRunnerStatus(status = {}) {
  const message = document.getElementById('blog-next-runner-message');
  const detail = document.getElementById('blog-next-runner-detail');
  const startButton = document.getElementById('blog-next-runner-start');
  const headless = document.getElementById('blog-next-runner-headless');
  const active = status.busy === true || BLOG_NEXT_RUNNER_ACTIVE_STATES.has(status.state);

  if (message) message.textContent = String(status.message || '실행 대기 중');
  if (detail) detail.textContent = describeBlogNextRunner(status);
  if (startButton) {
    startButton.disabled = active || blogNextRunnerRequesting;
    startButton.textContent = active ? '실행 중...' : '다음 1건 실행';
  }
  if (headless) headless.disabled = active || blogNextRunnerRequesting;
  return active;
}

function scheduleBlogNextRunnerPoll() {
  clearTimeout(blogNextRunnerPollingTimer);
  blogNextRunnerPollingTimer = setTimeout(() => loadBlogNextRunnerStatus({ poll: true }), 1000);
}

async function loadBlogNextRunnerStatus(options = {}) {
  try {
    const status = await fetchJson('/api/v1/continuous-publishing/runner/status');
    const active = renderBlogNextRunnerStatus(status);
    if (active) scheduleBlogNextRunnerPoll();
    else if (options.poll === true && typeof loadBlogNextQueue === 'function') loadBlogNextQueue({ force: true });
    return status;
  } catch (error) {
    renderBlogNextRunnerStatus({ state: 'failed', message: error.message || '실행 상태를 불러오지 못했습니다.' });
    return null;
  }
}

async function startBlogNextRunner() {
  if (blogNextRunnerRequesting) return;
  blogNextRunnerRequesting = true;
  const headless = document.getElementById('blog-next-runner-headless')?.checked !== false;
  renderBlogNextRunnerStatus({ state: 'selecting', busy: true, message: '다음 글감을 확인하고 있습니다.' });
  try {
    const status = await postJson('/api/v1/continuous-publishing/runner/start', { headless });
    renderBlogNextRunnerStatus(status);
    scheduleBlogNextRunnerPoll();
  } catch (error) {
    renderBlogNextRunnerStatus({ state: 'failed', message: error.message || '다음 글감 실행을 시작하지 못했습니다.' });
    showUiToast({ level: 'error', title: '실행 시작 실패', message: error.message || '잠시 후 다시 시도해 주세요.' });
  } finally {
    blogNextRunnerRequesting = false;
  }
}

function initBlogNextRunner() {
  const startButton = document.getElementById('blog-next-runner-start');
  if (!startButton || startButton.dataset.bound === 'true') return;
  startButton.dataset.bound = 'true';
  startButton.addEventListener('click', startBlogNextRunner);
}
