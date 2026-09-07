let blogNextAutomationSaving = false;
let blogNextAutomationLoading = false;
let blogNextAutomationPollingTimer = null;
let blogNextAutomationSavedSettings = null;
let blogNextAutomationDirty = false;

function normalizeBlogNextAutomationSettings(settings = {}) {
  return {
    enabled: settings.enabled === true,
    allowed_start_time: String(settings.allowed_start_time || '00:00'),
    allowed_end_time: String(settings.allowed_end_time || '23:59'),
    interval_minutes: Number.parseInt(String(settings.interval_minutes ?? '60'), 10),
    notification_enabled: settings.notification_enabled === true
  };
}

function serializeBlogNextAutomationSettings(settings = {}) {
  return JSON.stringify(normalizeBlogNextAutomationSettings(settings));
}

function readBlogNextAutomationForm() {
  const startTime = document.getElementById('blog-next-automation-start-time');
  const endTime = document.getElementById('blog-next-automation-end-time');
  const interval = document.getElementById('blog-next-automation-interval');
  return {
    enabled: document.getElementById('blog-next-automation-enabled')?.checked === true,
    allowed_start_time: startTime ? startTime.value : '00:00',
    allowed_end_time: endTime ? endTime.value : '23:59',
    interval_minutes: Number.parseInt(interval ? interval.value : '60', 10),
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
  syncBlogNextAutomationDependentFields();
}

function setBlogNextAutomationFeedback(state, message = '') {
  const feedback = document.getElementById('blog-next-automation-feedback');
  if (!feedback) return;
  feedback.dataset.state = state;
  feedback.textContent = message;
  feedback.hidden = !message;
}

function syncBlogNextAutomationDependentFields() {
  const enabledControl = document.getElementById('blog-next-automation-enabled');
  const fields = document.querySelector('.blog-next-automation-fields');
  const active = enabledControl?.checked === true;
  const locked = blogNextAutomationLoading || blogNextAutomationSaving;
  if (enabledControl) enabledControl.disabled = locked;
  if (fields) {
    fields.dataset.dependencyActive = String(active);
    fields.querySelectorAll('input, select, textarea').forEach((control) => {
      control.disabled = locked || !active;
    });
  }
}

function syncBlogNextAutomationSaveState() {
  const button = document.getElementById('blog-next-automation-save');
  const form = document.getElementById('blog-next-automation-form');
  if (form) form.dataset.dirty = blogNextAutomationDirty ? 'true' : 'false';
  if (!button) return;
  button.disabled = blogNextAutomationLoading || blogNextAutomationSaving || !blogNextAutomationDirty;
  button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
  button.textContent = blogNextAutomationSaving ? '저장 중...' : '설정 저장';
  syncBlogNextAutomationDependentFields();
}

function updateBlogNextAutomationDirtyState() {
  blogNextAutomationDirty = Boolean(blogNextAutomationSavedSettings)
    && serializeBlogNextAutomationSettings(readBlogNextAutomationForm())
      !== serializeBlogNextAutomationSettings(blogNextAutomationSavedSettings);
  syncBlogNextAutomationSaveState();
  return blogNextAutomationDirty;
}

function setBlogNextAutomationSavedSettings(settings = {}) {
  blogNextAutomationSavedSettings = normalizeBlogNextAutomationSettings(settings);
  blogNextAutomationDirty = false;
  syncBlogNextAutomationSaveState();
}

function discardBlogNextAutomationChanges() {
  if (blogNextAutomationSavedSettings) fillBlogNextAutomationForm(blogNextAutomationSavedSettings);
  blogNextAutomationDirty = false;
  syncBlogNextAutomationSaveState();
}

async function confirmDiscardUnsavedBlogNextAutomationSettings() {
  if (!blogNextAutomationDirty) return true;
  const shouldDiscard = await showUiConfirm(
    '저장되지 않은 연속 발행 설정이 있습니다.\n저장하지 않고 이동하면 변경사항이 사라집니다.',
    {
      title: '연속 발행 설정 변경사항',
      confirmText: '저장 안 하고 이동',
      cancelText: '계속 편집'
    }
  );
  if (!shouldDiscard) return false;
  discardBlogNextAutomationChanges();
  return true;
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
  setBlogNextAutomationSavedSettings(settings);
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
    testButton.dataset.testScheduled = runtime.scheduler?.test_scheduled === true ? 'true' : 'false';
    testButton.disabled = runtime.scheduler?.test_scheduled === true
      || (typeof blogNextRunnerActive !== 'undefined' && blogNextRunnerActive);
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
  if (typeof scheduleGlobalPublishingStatusRefresh === 'function') scheduleGlobalPublishingStatusRefresh(50);
}

async function scheduleBlogNextAutomationTest() {
  const button = document.getElementById('blog-next-automation-test');
  if (button?.disabled || (typeof blogNextRunnerActive !== 'undefined' && blogNextRunnerActive)) return;
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
  syncBlogNextAutomationSaveState();
}

async function loadBlogNextAutomationSettings(options = {}) {
  if (blogNextAutomationDirty && options.force !== true) return null;
  blogNextAutomationLoading = true;
  syncBlogNextAutomationSaveState();
  setBlogNextAutomationFeedback('loading', '연속 발행 설정을 불러오는 중입니다.');
  try {
    const data = await fetchJson('/api/v1/continuous-publishing/automation/settings');
    renderBlogNextAutomationSettings(data);
    setBlogNextAutomationFeedback('ready');
    return data;
  } catch (error) {
    setBlogNextAutomationFeedback('error', error.message || '연속 발행 설정을 불러오지 못했습니다.');
    return null;
  } finally {
    blogNextAutomationLoading = false;
    syncBlogNextAutomationSaveState();
  }
}

async function saveBlogNextAutomationSettings(event) {
  event?.preventDefault();
  if (blogNextAutomationSaving) return;
  setBlogNextAutomationSaving(true);
  setBlogNextAutomationFeedback('loading', '연속 발행 설정을 저장하는 중입니다.');
  try {
    const data = await postJson('/api/v1/continuous-publishing/automation/settings', readBlogNextAutomationForm());
    renderBlogNextAutomationSettings(data);
    setBlogNextAutomationFeedback('success', '설정을 저장했습니다.');
    showUiToast({ level: 'success', title: '연속 발행 설정 저장', message: '설정을 저장했습니다.' });
  } catch (error) {
    setBlogNextAutomationFeedback('error', error.message || '설정을 저장하지 못했습니다. 입력값을 확인해 주세요.');
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
  form.addEventListener('input', updateBlogNextAutomationDirtyState);
  form.addEventListener('change', () => {
    syncBlogNextAutomationDependentFields();
    updateBlogNextAutomationDirtyState();
  });
  document.getElementById('blog-next-automation-test')?.addEventListener('click', scheduleBlogNextAutomationTest);
  syncBlogNextAutomationSaveState();
  loadBlogNextAutomationSettings();
}
