let blogNextAutomationSaving = false;

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
  if (!value) return '설정이 꺼져 있습니다.';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
}

function describeBlogNextAutomationRuntime(runtime = {}, settings = {}) {
  if (settings.enabled !== true) {
    return { state: 'disabled', title: '이 기기의 연속 발행이 꺼져 있습니다.', detail: '설정을 켜더라도 저장만 되며 아직 자동 실행은 시작되지 않습니다.' };
  }
  if (runtime.environment_allows_automation !== true) {
    return { state: 'blocked', title: '설정은 저장됐지만 현재 환경에서는 자동 실행하지 않습니다.', detail: 'Local과 Development는 자동 발행을 차단합니다. 수동으로 다음 1건을 실행해 검증할 수 있습니다.' };
  }
  return { state: 'waiting', title: '자동 실행 정책이 저장되었습니다.', detail: '여러 기기의 중복 실행을 막는 안전장치가 연결되기 전까지 실제 timer는 시작하지 않습니다.' };
}

function renderBlogNextAutomationSettings(data = {}) {
  const settings = data.settings || {};
  const runtime = data.runtime || {};
  const status = document.getElementById('blog-next-automation-status');
  const title = document.getElementById('blog-next-automation-status-title');
  const detail = document.getElementById('blog-next-automation-status-detail');
  const environment = document.getElementById('blog-next-automation-environment');
  const nextRun = document.getElementById('blog-next-automation-next-run');
  const description = describeBlogNextAutomationRuntime(runtime, settings);
  fillBlogNextAutomationForm(settings);
  if (status) status.dataset.state = description.state;
  if (title) title.textContent = description.title;
  if (detail) detail.textContent = description.detail;
  if (environment) environment.textContent = runtime.environment || '확인 불가';
  if (nextRun) nextRun.textContent = formatBlogNextAutomationTime(runtime.next_run_at_preview);
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
    const title = document.getElementById('blog-next-automation-status-title');
    const detail = document.getElementById('blog-next-automation-status-detail');
    if (title) title.textContent = '연속 발행 설정을 불러오지 못했습니다.';
    if (detail) detail.textContent = error.message || '잠시 후 다시 시도해 주세요.';
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
    showUiToast({ level: 'success', title: '연속 발행 설정 저장', message: '이 기기의 실행 정책을 저장했습니다.' });
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
  loadBlogNextAutomationSettings();
}
