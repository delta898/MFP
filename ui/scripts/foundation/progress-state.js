let uiDialogResolver = null;
let uiDialogMode = 'default';

// ─── Logging & Progress Utilities ──────────────────────────────────
const QUICK_PROGRESS_POLL_MS = 1500;
const QUICK_PROGRESS_MAX_LINES = 300;
const QUICK_PROGRESS_FETCH_LIMIT = 600;

const buildDashboardLogKey = (log) => `${String(log?.timestamp || '').trim()}__${String(log?.level || '').trim()}__${String(log?.message || '').trim()}`;

const fetchDashboardLogsSafe = async (limit = 160) => {
  try {
    const safeLimit = Math.max(50, Math.min(1000, Number(limit) || QUICK_PROGRESS_FETCH_LIMIT));
    const res = await fetchJson(`/api/v1/dashboard/logs?limit=${safeLimit}`);
    return Array.isArray(res?.logs) ? res.logs : [];
  } catch (_e) {
    return [];
  }
};

const formatDashboardProgressLine = (log) => {
  const ts = String(log?.timestamp || '').trim();
  const level = String(log?.level || 'info').trim().toUpperCase();
  const message = String(log?.message || '').trim();
  if (!message) return '';
  if (ts) return `[${ts}] [${level}] ${message}`;
  return `[${level}] ${message}`;
};

const appendProgressLine = (targetEl, lines, line) => {
  if (!targetEl) return;
  const text = String(line || '').trim();
  if (!text) return;
  const distanceFromBottom = targetEl.scrollHeight - targetEl.clientHeight - targetEl.scrollTop;
  const shouldStickToBottom = distanceFromBottom <= 24;
  lines.push(text);
  if (lines.length > QUICK_PROGRESS_MAX_LINES) {
    lines.splice(0, lines.length - QUICK_PROGRESS_MAX_LINES);
  }
  targetEl.textContent = lines.join('\n');
  if (shouldStickToBottom) {
    targetEl.scrollTop = targetEl.scrollHeight;
  }
};

const runWithLiveProgress = async ({ targetEl, requestLabel, requestFn, onTick }) => {
  if (!targetEl || typeof requestFn !== 'function') return null;

  const progressLines = [];
  const seenLogKeys = new Set();
  const push = (line) => appendProgressLine(targetEl, progressLines, line);

  const seedLogs = await fetchDashboardLogsSafe(QUICK_PROGRESS_FETCH_LIMIT);
  seedLogs.forEach((log) => {
    seenLogKeys.add(buildDashboardLogKey(log));
  });

  const flushNewLogs = async () => {
    const currentLogs = await fetchDashboardLogsSafe(QUICK_PROGRESS_FETCH_LIMIT);
    if (typeof onTick === 'function') {
      try { await onTick(); } catch (e) { }
    }
    if (!Array.isArray(currentLogs) || currentLogs.length === 0) return;
    const ordered = currentLogs.slice().reverse();
    for (const log of ordered) {
      const key = buildDashboardLogKey(log);
      if (seenLogKeys.has(key)) continue;
      seenLogKeys.add(key);
      push(formatDashboardProgressLine(log));
    }
  };

  push(`[요청] ${requestLabel}`);
  push('[진행] 서버 처리 시작...');

  let timer = null;
  try {
    // 🚀 시작하자마자 첫 번째 폴링 즉시 실행
    flushNewLogs().catch(e => console.warn('Initial flush failed:', e));

    timer = setInterval(async () => {
      void flushNewLogs();
    }, QUICK_PROGRESS_POLL_MS);

    const data = await requestFn();
    await flushNewLogs();
    push('[완료] 요청 처리 완료');
    if (data && typeof data === 'object') {
      const statusText = String(data.status || '').trim();
      const postStatusText = String(data.postStatus || '').trim();
      const executionModeText = String(data.executionMode || data.mode || '').trim();
      const rowNumber = Number(data.rowNumber);
      if (statusText) push(`[상태] ${statusText}`);
      if (postStatusText) push(`[포스팅 옵션] ${getPostStatusLabel(postStatusText)}`);
      if (executionModeText) push(`[실행 모드] ${getExecutionModeLabel(executionModeText)}`);
      if (Number.isFinite(rowNumber) && rowNumber > 0) push(`[Row] ${rowNumber}`);
    }
    return data;
  } catch (e) {
    await flushNewLogs();
    push(`[오류] ${String(e?.message || '요청 처리 중 오류')}`);
    throw e;
  } finally {
    if (timer) clearInterval(timer);
  }
};
// ─────────────────────────────────────────────────────────────────


function pauseDashboardPolling() {
  dashboardPollingPauseCount += 1;
}

function resumeDashboardPolling() {
  dashboardPollingPauseCount = Math.max(0, dashboardPollingPauseCount - 1);
}

function isDashboardPollingPaused() {
  return dashboardPollingPauseCount > 0;
}

