function closeUiDialog(result = false) {
  const backdrop = document.getElementById('ui-dialog-backdrop');
  const confirmBtn = document.getElementById('ui-dialog-confirm');
  const cancelBtn = document.getElementById('ui-dialog-cancel');
  const tertiaryBtn = document.getElementById('ui-dialog-tertiary');
  const inputEl = document.getElementById('ui-dialog-input');
  const resolvedValue = result === 'tertiary'
    ? 'tertiary'
    : (uiDialogMode === 'prompt'
      ? (result ? String(inputEl?.value || '') : null)
      : Boolean(result));
  if (backdrop) {
    backdrop.classList.add('hidden');
    backdrop.setAttribute('aria-hidden', 'true');
  }
  if (inputEl) {
    inputEl.value = '';
    inputEl.placeholder = '';
    inputEl.classList.add('hidden');
  }
  if (confirmBtn) confirmBtn.textContent = '확인';
  if (cancelBtn) {
    cancelBtn.textContent = '취소';
    cancelBtn.classList.add('hidden');
  }
  if (tertiaryBtn) {
    tertiaryBtn.textContent = '';
    tertiaryBtn.classList.add('hidden');
  }
  uiDialogMode = 'default';
  if (uiDialogResolver) {
    const resolver = uiDialogResolver;
    uiDialogResolver = null;
    resolver(resolvedValue);
  }
}

function showUiDialog(options = {}) {
  const title = String(options?.title || '알림').trim() || '알림';
  const message = String(options?.message || '').trim();
  const showCancel = options?.showCancel === true;
  const confirmText = String(options?.confirmText || '확인').trim() || '확인';
  const cancelText = String(options?.cancelText || '취소').trim() || '취소';
  const tertiaryText = String(options?.tertiaryText || '').trim();

  const backdrop = document.getElementById('ui-dialog-backdrop');
  const titleEl = document.getElementById('ui-dialog-title');
  const messageEl = document.getElementById('ui-dialog-message');
  const inputEl = document.getElementById('ui-dialog-input');
  const confirmBtn = document.getElementById('ui-dialog-confirm');
  const cancelBtn = document.getElementById('ui-dialog-cancel');
  const tertiaryBtn = document.getElementById('ui-dialog-tertiary');
  if (!backdrop || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
    if (showCancel) {
      return Promise.resolve(window.confirm(message));
    }
    window.alert(message);
    return Promise.resolve(true);
  }

  if (uiDialogResolver) {
    closeUiDialog(false);
  }

  titleEl.textContent = title;
  messageEl.textContent = message;
  if (inputEl) {
    inputEl.value = '';
    inputEl.placeholder = '';
    inputEl.classList.add('hidden');
  }
  uiDialogMode = 'default';
  confirmBtn.textContent = confirmText;
  cancelBtn.textContent = cancelText;
  cancelBtn.classList.toggle('hidden', !showCancel);
  if (tertiaryBtn) {
    tertiaryBtn.textContent = tertiaryText;
    tertiaryBtn.classList.toggle('hidden', !tertiaryText);
  }

  backdrop.classList.remove('hidden');
  backdrop.setAttribute('aria-hidden', 'false');

  return new Promise((resolve) => {
    uiDialogResolver = resolve;
  });
}

function showUiPrompt(message, options = {}) {
  const backdrop = document.getElementById('ui-dialog-backdrop');
  const titleEl = document.getElementById('ui-dialog-title');
  const messageEl = document.getElementById('ui-dialog-message');
  const inputEl = document.getElementById('ui-dialog-input');
  const confirmBtn = document.getElementById('ui-dialog-confirm');
  const cancelBtn = document.getElementById('ui-dialog-cancel');
  if (!backdrop || !titleEl || !messageEl || !inputEl || !confirmBtn || !cancelBtn) {
    return Promise.resolve(window.prompt(String(message || ''), String(options?.defaultValue || '')));
  }

  if (uiDialogResolver) {
    closeUiDialog(false);
  }

  uiDialogMode = 'prompt';
  titleEl.textContent = String(options?.title || '입력').trim() || '입력';
  messageEl.textContent = String(message || '');
  inputEl.type = String(options?.type || 'text').trim() || 'text';
  inputEl.value = String(options?.defaultValue || '');
  inputEl.placeholder = String(options?.placeholder || '');
  inputEl.classList.remove('hidden');
  confirmBtn.textContent = String(options?.confirmText || '확인').trim() || '확인';
  cancelBtn.textContent = String(options?.cancelText || '취소').trim() || '취소';
  cancelBtn.classList.remove('hidden');

  backdrop.classList.remove('hidden');
  backdrop.setAttribute('aria-hidden', 'false');
  setTimeout(() => inputEl.focus(), 0);

  return new Promise((resolve) => {
    uiDialogResolver = resolve;
  });
}

function showUiPopup(message) {
  const text = String(message || '').trim();
  if (!text) return Promise.resolve(true);
  if (notifyUiIssueFromMessage(text)) return Promise.resolve(true);
  return showUiDialog({
    title: '알림',
    message: text,
    showCancel: false
  });
}

function showUiConfirm(message, options = {}) {
  return showUiDialog({
    title: String(options?.title || '확인'),
    message: String(message || ''),
    showCancel: true,
    confirmText: String(options?.confirmText || '확인'),
    cancelText: String(options?.cancelText || '취소')
  });
}

// Three-way choice: 'save' | 'discard' | 'stay'.
// confirm = save (primary), tertiary = discard, cancel/backdrop = stay.
function showUiThreeWayChoice(message, options = {}) {
  return showUiDialog({
    title: String(options?.title || '확인'),
    message: String(message || ''),
    showCancel: true,
    confirmText: String(options?.saveText || '저장'),
    cancelText: String(options?.stayText || '계속 편집'),
    tertiaryText: String(options?.discardText || '버리기')
  }).then((result) => (result === 'tertiary' ? 'discard' : (result === true ? 'save' : 'stay')));
}
