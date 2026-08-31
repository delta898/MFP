let blogNextAutomationSaving = false;
let blogNextAutomationPollingTimer = null;

function readBlogNextAutomationForm() {
  return {
    enabled: document.getElementById('blog-next-automation-enabled')?.checked === true,
    allowed_start_time: document.getElementById('blog-next-automation-start-time')?.value || '00:00',
    allowed_end_time: document.getElementById('blog-next-automation-end-time')?.value || '23:59',
    interval_minutes: Number.parseInt(document.getElementById('blog-next-automation-interval')?.value || '60', 10),
    notification_enabled: document.getElementById('blog-next-automation-notify')?.checked === true
  };
}

function fillBlogNextAutomationForm(settings = {}) {
  const enabled = document.getElementById('blog-next-automation-enabled');
  const startTime = document.getElementById('blog-next-automation-start-time');
  const endTime = document.getElementById('blog-next-automation-end-time');
  const interval = document.getElementById('blog-next-automation-interval');
  const notify = document.getElementById('blog-next-automation-notify');
  if (enabled) enabled.checked = settings.enabled === true;
  if (startTime) startTime.value = settings.allowed_start_time || '00:00';
  if (endTime) endTime.value = settings.allowed_end_time || '23:59';
  if (interval) interval.value = String(settings.interval_minutes || 60);
  if (notify) notify.checked = settings.notification_enabled === true;
}

function formatBlogNextAutomationTime(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
}

function renderBlogNextAutomationSettings(data = {}) {
  const settings = data.settings || {};
  const runtime = data.runtime || {};
  const status = document.getElementById('blog-next-automation-status');
  const form = document.getElementById('blog-next-automation-form');
  const testButton = document.getElementById('blog-next-automation-test');
  fillBlogNextAutomationForm(settings);
  if (form) form.dataset.loaded = 'true';
  if (status) {
    const nextRun = formatBlogNextAutomationTime(runtime.scheduler?.test_run_at || runtime.next_run_at_preview);
    const lastRun = formatBlogNextAutomationTime(runtime.scheduler?.last_finished_at);
    const summary = [];
    if (nextRun) summary.push(`다음 실행 ${nextRun}`);
    if (lastRun) summary.push(`최근 완료 ${lastRun}`);
    status.textContent = summary.join(' · ');
    status.hidden = summary.length === 0;
    status.dataset.state = settings.enabled === true ? 'waiting' : 'disabled';
  }
  if (testButton) {
    const development = runtime.environment === 'development';
    testButton.hidden = !development;
    testButton.disabled = runtime.scheduler?.test_scheduled === true;
    testButton.textContent = runtime.scheduler?.test_scheduled === true
      ? '테스트 대기 중...'
      : '30초 테스트';
  }
  clearTimeout(blogNextAutomationPollingTimer);
  if (runtime.scheduler?.test_scheduled === true) {
    blogNextAutomationPollingTimer = setTimeout(loadBlogNextAutomationSettings, 1000);
  } else if (runtime.scheduler?.last_finished_at && typeof loadBlogNextRunnerStatus === 'function') {
    loadBlogNextRunnerStatus({ poll: true });
  }
}

async function scheduleBlogNextAutomationTest() {
  const button = document.getElementById('blog-next-automation-test');
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try {
    await postJson('/api/v1/continuous-publishing/automation/test', {});
    showUiToast({ level: 'success', title: '시험 실행 예약', message: '30초 후 가장 오래된 임시 저장 글감 한 건을 확인합니다.' });
    await loadBlogNextAutomationSettings();
  } catch (error) {
    showUiToast({ level: 'error', title: '시험 실행 예약 실패', message: error.message || '잠시 후 다시 시도해 주세요.' });
    if (button) button.disabled = false;
  }
}

function setBlogNextAutomationSaving(saving) {
  blogNextAutomationSaving = saving;
  const button = document.getElementById('blog-next-automation-save');
  if (button) {
    button.disabled = saving;
    button.textContent = saving ? '저장 중...' : '설정 저장';
  }
}

async function loadBlogNextAutomationSettings() {
  try {
    const data = await fetchJson('/api/v1/continuous-publishing/automation/settings');
    renderBlogNextAutomationSettings(data);
    return data;
  } catch (error) {
    const status = document.getElementById('blog-next-automation-status');
    if (status) {
      status.hidden = false;
      status.dataset.state = 'error';
      status.textContent = error.message || '연속 발행 설정을 불러오지 못했습니다.';
    }
    return null;
  }
}

async function saveBlogNextAutomationSettings(event) {
  event?.preventDefault();
  if (blogNextAutomationSaving) return;
  setBlogNextAutomationSaving(true);
  try {
    const data = await postJson('/api/v1/continuous-publishing/automation/settings', readBlogNextAutomationForm());
    renderBlogNextAutomationSettings(data);
    showUiToast({ level: 'success', title: '연속 발행 설정 저장', message: '설정을 저장했습니다.' });
  } catch (error) {
    showUiToast({ level: 'error', title: '설정 저장 실패', message: error.message || '입력값을 확인해 주세요.' });
  } finally {
    setBlogNextAutomationSaving(false);
  }
}

function initBlogNextAutomationSettings() {
  const form = document.getElementById('blog-next-automation-form');
  if (!form || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';
  form.addEventListener('submit', saveBlogNextAutomationSettings);
  document.getElementById('blog-next-automation-test')?.addEventListener('click', scheduleBlogNextAutomationTest);
  loadBlogNextAutomationSettings();
}
