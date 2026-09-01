const GLOBAL_PUBLISHING_STATUS_POLL_MS = Object.freeze({
  running: 1500,
  attention: 15000,
  scheduled: 30000,
  idle: 60000
});

let globalPublishingStatusTimer = null;
let globalPublishingStatusRequest = null;
let globalPublishingStatusSnapshot = { state: 'idle' };
let globalPublishingStatusBound = false;

function globalPublishingSeoulDateParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric'
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = Number(part.value);
    return result;
  }, {});
  return { date, year: parts.year, month: parts.month, day: parts.day };
}

function globalPublishingDaySerial(parts) {
  return parts ? Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000) : null;
}

function formatGlobalPublishingSchedule(value, nowValue = new Date()) {
  const target = globalPublishingSeoulDateParts(value);
  const today = globalPublishingSeoulDateParts(nowValue);
  if (!target || !today) return '';
  const dayDifference = globalPublishingDaySerial(target) - globalPublishingDaySerial(today);
  const dayLabel = dayDifference === 0
    ? '오늘'
    : dayDifference === 1 ? '내일' : `${target.month}월 ${target.day}일`;
  const timeLabel = target.date.toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit'
  });
  return `${dayLabel} ${timeLabel}`;
}

function truncateGlobalPublishingSubject(value, limit = 18) {
  const characters = Array.from(String(value || '').trim());
  return characters.length > limit ? `${characters.slice(0, limit).join('')}…` : characters.join('');
}

function presentGlobalPublishingStatus(summary = {}) {
  const state = ['attention', 'running', 'scheduled'].includes(summary.state) ? summary.state : 'idle';
  if (state === 'attention') return { state, label: '발행 확인 필요', detail: summary.message || '' };
  if (state === 'running') {
    const subject = truncateGlobalPublishingSubject(summary.subject);
    return { state, label: subject ? `발행 중 · ${subject}` : '발행 중', detail: summary.subject || summary.message || '' };
  }
  if (state === 'scheduled') {
    const schedule = formatGlobalPublishingSchedule(summary.next_processing_at);
    return schedule
      ? { state, label: `다음 처리 ${schedule}`, detail: `연속 발행 다음 처리: ${schedule}` }
      : { state: 'idle', label: '', detail: '' };
  }
  return { state: 'idle', label: '', detail: '' };
}

function renderGlobalPublishingStatus(summary = {}) {
  globalPublishingStatusSnapshot = { ...summary };
  const presentation = presentGlobalPublishingStatus(summary);
  document.querySelectorAll('[data-global-publishing-status]').forEach((button) => {
    const label = button.querySelector('[data-global-publishing-status-label]');
    button.hidden = presentation.state === 'idle';
    button.dataset.state = presentation.state;
    button.title = presentation.detail || presentation.label;
    button.setAttribute('aria-label', `${presentation.label}. 글감 관리로 이동`);
    if (label) label.textContent = presentation.label;
  });

  const sidebarSignal = document.getElementById('blog-next-global-nav-status');
  if (sidebarSignal) {
    const signalVisible = ['running', 'attention'].includes(presentation.state);
    sidebarSignal.hidden = !signalVisible;
    sidebarSignal.dataset.state = presentation.state;
    sidebarSignal.title = presentation.label;
    sidebarSignal.setAttribute('aria-hidden', 'true');
    const navButton = sidebarSignal.closest('.nav-btn');
    if (navButton) navButton.title = signalVisible ? `블로그 Beta · ${presentation.label}` : '';
  }
  return presentation;
}

function getGlobalPublishingPollDelay(state) {
  return GLOBAL_PUBLISHING_STATUS_POLL_MS[state] || GLOBAL_PUBLISHING_STATUS_POLL_MS.idle;
}

function scheduleGlobalPublishingStatusRefresh(delay = null) {
  clearTimeout(globalPublishingStatusTimer);
  const wait = delay !== null && Number.isFinite(Number(delay))
    ? Math.max(0, Number(delay))
    : getGlobalPublishingPollDelay(globalPublishingStatusSnapshot.state);
  globalPublishingStatusTimer = setTimeout(loadGlobalPublishingStatus, wait);
}

async function loadGlobalPublishingStatus() {
  if (document.visibilityState === 'hidden') return;
  if (globalPublishingStatusRequest) return globalPublishingStatusRequest;
  globalPublishingStatusRequest = fetchJson('/api/v1/continuous-publishing/status-summary')
    .then((summary) => {
      renderGlobalPublishingStatus(summary);
      return summary;
    })
    .catch(() => globalPublishingStatusSnapshot)
    .finally(() => {
      globalPublishingStatusRequest = null;
      scheduleGlobalPublishingStatusRefresh();
    });
  return globalPublishingStatusRequest;
}

async function openGlobalPublishingStatus() {
  const blogNextActive = document.getElementById('view-blog-next')?.classList.contains('active') === true;
  if (blogNextActive && typeof requestActivateBlogNextTab === 'function') {
    await requestActivateBlogNextTab('queue');
    return;
  }
  if (typeof navigateTo === 'function') await navigateTo('blog-next', 'queue');
}

function initGlobalPublishingStatus() {
  if (!globalPublishingStatusBound) {
    globalPublishingStatusBound = true;
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-global-publishing-status]')) void openGlobalPublishingStatus();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') scheduleGlobalPublishingStatusRefresh(0);
      else clearTimeout(globalPublishingStatusTimer);
    });
  }
  renderGlobalPublishingStatus(globalPublishingStatusSnapshot);
  scheduleGlobalPublishingStatusRefresh(0);
}
