function getUiToastContainer() {
  return document.getElementById('ui-toast-container');
}

function clearUiToastTimer(toastId) {
  const timer = uiToastTimers.get(toastId);
  if (timer) {
    clearTimeout(timer);
    uiToastTimers.delete(toastId);
  }
}

function pulseUiToast(toastEl) {
  if (!toastEl) return;
  toastEl.classList.remove('ui-toast-attention');
  void toastEl.offsetWidth;
  toastEl.classList.add('ui-toast-attention');
}

function dismissUiToast(toastId) {
  const toastEl = document.getElementById(`ui-toast-${toastId}`);
  clearUiToastTimer(toastId);
  if (!toastEl) return;

  const dedupeKey = String(toastEl.dataset.dedupeKey || '').trim();
  if (dedupeKey) {
    uiToastActiveByDedupeKey.delete(dedupeKey);
  }

  toastEl.classList.add('is-leaving');
  setTimeout(() => {
    if (toastEl.parentNode) {
      toastEl.parentNode.removeChild(toastEl);
    }
  }, 180);
}

function showUiToast(options = {}) {
  const container = getUiToastContainer();
  if (!container) return null;

  const message = String(options?.message || '').trim();
  if (!message) return null;

  const dedupeKey = String(options?.dedupeKey || '').trim();
  const now = Date.now();
  if (dedupeKey) {
    const activeToastId = uiToastActiveByDedupeKey.get(dedupeKey);
    if (activeToastId) {
      const activeToastEl = document.getElementById(`ui-toast-${activeToastId}`);
      if (activeToastEl) {
        pulseUiToast(activeToastEl);
        clearUiToastTimer(activeToastId);
        const timeoutMs = Math.max(1200, Number(options?.timeoutMs) || UI_TOAST_DEFAULT_TIMEOUT_MS);
        uiToastTimers.set(activeToastId, setTimeout(() => dismissUiToast(activeToastId), timeoutMs));
        return activeToastId;
      }
      uiToastActiveByDedupeKey.delete(dedupeKey);
    }

    const lastShownAt = uiToastRecentShownAt.get(dedupeKey) || 0;
    if ((now - lastShownAt) < UI_TOAST_DEDUPE_WINDOW_MS) {
      return null;
    }
    uiToastRecentShownAt.set(dedupeKey, now);
  }

  const toastId = ++uiToastSeq;
  const level = String(options?.level || 'info').trim() || 'info';
  const timeoutMs = Math.max(1200, Number(options?.timeoutMs) || UI_TOAST_DEFAULT_TIMEOUT_MS);
  const title = String(options?.title || '알림').trim() || '알림';
  const actionLabel = String(options?.actionLabel || '').trim();
  const onAction = typeof options?.onAction === 'function' ? options.onAction : null;

  const toastEl = document.createElement('section');
  toastEl.id = `ui-toast-${toastId}`;
  toastEl.className = `ui-toast ui-toast-${level}`;
  toastEl.dataset.dedupeKey = dedupeKey;
  toastEl.setAttribute('role', 'status');

  const headerEl = document.createElement('div');
  headerEl.className = 'ui-toast-header';

  const titleEl = document.createElement('strong');
  titleEl.className = 'ui-toast-title';
  titleEl.textContent = title;
  headerEl.appendChild(titleEl);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'ui-toast-close';
  closeBtn.setAttribute('aria-label', '알림 닫기');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => dismissUiToast(toastId));
  headerEl.appendChild(closeBtn);

  const messageEl = document.createElement('p');
  messageEl.className = 'ui-toast-message';
  messageEl.textContent = message;

  toastEl.appendChild(headerEl);
  toastEl.appendChild(messageEl);

  if (actionLabel && onAction) {
    const actionsEl = document.createElement('div');
    actionsEl.className = 'ui-toast-actions';

    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'ui-toast-action';
    actionBtn.textContent = actionLabel;
    actionBtn.addEventListener('click', async () => {
      try {
        await onAction();
      } catch (e) {
        console.warn('Toast action failed:', e.message);
      } finally {
        dismissUiToast(toastId);
      }
    });

    actionsEl.appendChild(actionBtn);
    toastEl.appendChild(actionsEl);
  }

  container.appendChild(toastEl);

  if (dedupeKey) {
    uiToastActiveByDedupeKey.set(dedupeKey, toastId);
  }
  uiToastTimers.set(toastId, setTimeout(() => dismissUiToast(toastId), timeoutMs));
  return toastId;
}

function navigateToNaverLoginSettings() {
  if (typeof navigateTo === 'function') {
    return navigateTo('settings-next', 'core');
  }
  goToSettings();
  return Promise.resolve();
}

function getUiIssueRule(code, error, context = {}) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  if (normalizedCode === 'NAVER_SESSION_INVALID') {
    const reason = String(context?.reason || error?.reason || '').trim().toLowerCase();
    let message = '네이버 로그인 세션이 만료되었거나 유효하지 않습니다.\n설정 화면에서 다시 로그인해 주세요.';
    if (reason === 'expired') {
      message = '네이버 로그인 세션이 만료되었습니다.\n설정 화면에서 다시 로그인해 주세요.';
    } else if (reason === 'missing_auth') {
      message = '네이버 로그인이 필요합니다.\n설정 화면에서 로그인을 진행해 주세요.';
    }
    return {
      dedupeKey: 'NAVER_SESSION_INVALID',
      level: 'warn',
      title: '네이버 로그인 필요',
      message,
      actionLabel: '설정으로 이동',
      onAction: () => navigateToNaverLoginSettings(),
      timeoutMs: 9000
    };
  }
  return null;
}

function getUiIssueRuleFromMessage(message) {
  const normalizedMessage = String(message || '').trim().toLowerCase();
  if (!normalizedMessage) return null;

  const looksLikeNaverSessionIssue =
    normalizedMessage.includes('네이버 로그인 세션이 유효하지 않습니다')
    || normalizedMessage.includes('로그인 세션이 만료')
    || normalizedMessage.includes('login session expired');

  if (looksLikeNaverSessionIssue) {
    return getUiIssueRule('NAVER_SESSION_INVALID');
  }
  return null;
}

function notifyUiIssueFromError(error, context = {}) {
  const rule = getUiIssueRule(error?.code, error, context);
  if (!rule) return false;
  error.uiIssueNotified = true;
  showUiToast(rule);
  return true;
}

function notifyUiIssueFromMessage(message) {
  const rule = getUiIssueRuleFromMessage(message);
  if (!rule) return false;
  showUiToast(rule);
  return true;
}

function notifyUiIssueFromStateTransition(issueKey, stateKey, code, payload, context = {}) {
  const normalizedIssueKey = String(issueKey || '').trim();
  if (!normalizedIssueKey) return false;

  const normalizedStateKey = String(stateKey || '').trim() || 'unknown';
  const previousStateKey = uiIssueStateByKey.get(normalizedIssueKey) || '';
  if (previousStateKey === normalizedStateKey) return false;
  uiIssueStateByKey.set(normalizedIssueKey, normalizedStateKey);

  if (normalizedStateKey === 'valid' || normalizedStateKey === 'ok' || normalizedStateKey === 'healthy') {
    return false;
  }

  const issuePayload = payload && typeof payload === 'object' ? { ...payload } : {};
  if (!issuePayload.code) issuePayload.code = code;
  return notifyUiIssueFromError(issuePayload, context);
}

