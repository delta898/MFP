let clockInterval = null;
const CLOCK_STYLE_STORAGE_KEY = 'blog_genius_clock_style_v1';
const CLOCK_MODE_STORAGE_KEY = 'blog_genius_clock_mode_v1';
const POMODORO_STYLE_STORAGE_KEY = 'blog_genius_pomodoro_style_v1';
const POMODORO_STATE_STORAGE_KEY = 'blog_genius_pomodoro_state_v1';
const POMODORO_SOUND_STORAGE_KEY = 'blog_genius_pomodoro_sound_v1';
const POMODORO_DURATIONS = Object.freeze({ focus: 25 * 60 * 1000, break: 5 * 60 * 1000 });
const QUICK_POSTING_CELEBRATION_MAX_WAIT_MS = 10 * 60 * 1000;
let celebrationCleanupTimer = null;
let pendingQuickPostingCelebrationAt = 0;
let pendingQuickPostingCelebrationPostStatus = '';

function reportPostingCompletionEffect(stage, postStatus = '') {
  if (typeof postJson !== 'function') return;
  void postJson('/api/v1/system/ui-event', {
    event: 'posting_completion_effect',
    stage: String(stage || '').trim(),
    postStatus: String(postStatus || '').trim()
  }).catch((error) => console.warn('[CompletionEffect] 로그 기록 실패:', error));
}

function showAppCelebration({ title, message } = {}) {
  document.querySelectorAll('.app-celebration').forEach((item) => item.remove());
  if (celebrationCleanupTimer) clearTimeout(celebrationCleanupTimer);
  const celebration = document.createElement('div');
  celebration.className = 'app-celebration';
  celebration.setAttribute('aria-hidden', 'true');
  const colors = ['#38bdf8', '#6366f1', '#f43f5e', '#f59e0b', '#10b981', '#a855f7'];
  const particleCount = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 64;
  for (let index = 0; index < particleCount; index += 1) {
    const particle = document.createElement('i');
    particle.style.setProperty('--confetti-x', `${Math.round(Math.random() * 100)}vw`);
    particle.style.setProperty('--confetti-drift', `${Math.round((Math.random() - 0.5) * 34)}vw`);
    particle.style.setProperty('--confetti-delay', `${(Math.random() * 0.7).toFixed(2)}s`);
    particle.style.setProperty('--confetti-duration', `${(2.1 + Math.random() * 1.2).toFixed(2)}s`);
    particle.style.setProperty('--confetti-rotation', `${Math.round(Math.random() * 720 - 360)}deg`);
    particle.style.setProperty('--confetti-color', colors[index % colors.length]);
    celebration.appendChild(particle);
  }
  const messageBox = document.createElement('div');
  messageBox.className = 'app-celebration-message';
  const titleEl = document.createElement('strong');
  titleEl.textContent = String(title || '완료! 🎉');
  const messageEl = document.createElement('span');
  messageEl.textContent = String(message || '잘 해냈어요.');
  messageBox.append(titleEl, messageEl);
  celebration.appendChild(messageBox);
  document.body.appendChild(celebration);
  celebrationCleanupTimer = setTimeout(() => celebration.remove(), 3600);
}

async function showPendingUpdateCelebration() {
  try {
    const completion = await fetchJson('/api/v1/system/update/completion');
    if (!completion?.pending || !completion.operationId || !completion.targetVersion) return false;
    showAppCelebration({
      title: '업데이트 완료! 🎉',
      message: `BlogGenius v${completion.targetVersion} 업데이트가 적용되었습니다.`
    });
    await postJson('/api/v1/system/update/completion/ack', {
      operationId: completion.operationId
    });
    return true;
  } catch (error) {
    console.warn('[UpdateCompletion] 완료 안내 확인 실패:', error);
    return false;
  }
}

function showQuickPostingCelebration() {
  showAppCelebration({
    title: '글쓰기 완료! 🎉',
    message: '새 글을 안전하게 저장했어요.'
  });
}

function isQuickPostingCelebrationStatus(postStatus) {
  return postStatus === 'publish' || postStatus === 'draft';
}

function showPostingCompletionCelebration(postStatus) {
  if (!isQuickPostingCelebrationStatus(postStatus)) return false;
  reportPostingCompletionEffect('requested', postStatus);
  showOrQueueQuickPostingCelebration(postStatus);
  return true;
}

function showOrQueueQuickPostingCelebration(postStatus = '') {
  if (document.visibilityState === 'visible' && document.hasFocus()) {
    pendingQuickPostingCelebrationAt = 0;
    pendingQuickPostingCelebrationPostStatus = '';
    showQuickPostingCelebration();
    reportPostingCompletionEffect('displayed', postStatus);
    return;
  }
  pendingQuickPostingCelebrationAt = Date.now();
  pendingQuickPostingCelebrationPostStatus = String(postStatus || '').trim();
  reportPostingCompletionEffect('queued', postStatus);
}

function flushPendingQuickPostingCelebration(options = {}) {
  if (!pendingQuickPostingCelebrationAt) return;
  const windowFocused = options.windowFocused === true;
  if (document.visibilityState !== 'visible' || (!windowFocused && !document.hasFocus())) return;
  const waitedMs = Date.now() - pendingQuickPostingCelebrationAt;
  const postStatus = pendingQuickPostingCelebrationPostStatus;
  pendingQuickPostingCelebrationAt = 0;
  pendingQuickPostingCelebrationPostStatus = '';
  if (waitedMs <= QUICK_POSTING_CELEBRATION_MAX_WAIT_MS) {
    showQuickPostingCelebration();
    reportPostingCompletionEffect('displayed_after_focus', postStatus);
  }
}
