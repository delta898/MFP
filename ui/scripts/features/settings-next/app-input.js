const settingsNextAppInputState = { bound: false, loaded: false, busy: false, testTimer: null, savedSpeed: 'NORMAL' };

const SETTINGS_NEXT_TYPING_SPEED_LABELS = Object.freeze({
  QUICK: '빠르게',
  FAST: '빠른 편',
  NORMAL: '보통',
  HUMAN: '천천히'
});

function settingsNextAppInputApply(data = {}) {
  const speed = String(data.fields?.TYPING_SPEED || 'NORMAL').toUpperCase();
  const input = document.getElementById('settings-next-typing-speed');
  if (input) input.value = SETTINGS_NEXT_TYPING_SPEED_LABELS[speed] ? speed : 'NORMAL';
  settingsNextAppInputState.savedSpeed = input?.value || 'NORMAL';
  settingsNextClearScopeDirty('app-input');
  settingsNextSetStatus('settings-next-app-input-status', '적용됨', 'success');
}

function settingsNextSyncAppInputDirty() {
  const speed = String(document.getElementById('settings-next-typing-speed')?.value || 'NORMAL').toUpperCase();
  const dirty = speed !== settingsNextAppInputState.savedSpeed;
  if (dirty) {
    settingsNextMarkScopeDirty('app-input');
    settingsNextSetStatus('settings-next-app-input-status', '변경됨', 'warning');
    setUiSettingsCardFooterDetail('settings-next-app-input-footer-detail', '');
  } else {
    settingsNextClearScopeDirty('app-input');
    settingsNextSetStatus('settings-next-app-input-status', '적용됨', 'success');
  }
}

async function loadSettingsNextAppInput({ force = false } = {}) {
  if (settingsNextAppInputState.loaded && !force) return;
  try {
    settingsNextAppInputApply(await fetchJson('/api/v1/settings/app-input'));
    settingsNextAppInputState.loaded = true;
  } catch (error) {
    settingsNextSetStatus('settings-next-app-input-status', '확인 필요', 'warning');
    settingsNextSetFeedback('settings-next-app-input-feedback', error.message || '입력 환경을 불러오지 못했습니다.', 'danger');
  }
}

// Save-only path (no typing sample): used by "save and proceed" flows.
async function settingsNextPersistAppInput() {
  if (settingsNextAppInputState.busy) return false;
  settingsNextAppInputState.busy = true;
  try {
    const result = await postJson('/api/v1/settings/app-input', { values: {
      TYPING_SPEED: document.getElementById('settings-next-typing-speed')?.value || 'NORMAL'
    } });
    settingsNextAppInputApply(result);
    settingsNextAppInputState.loaded = true;
    setUiSettingsCardFooterDetail('settings-next-app-input-footer-detail', result.message || '네이버 입력 속도를 적용했습니다.');
    return true;
  } catch (error) {
    settingsNextSetFeedback('settings-next-app-input-feedback', error.message || '입력 환경을 적용하지 못했습니다.', 'danger');
    return false;
  } finally {
    settingsNextAppInputState.busy = false;
  }
}

async function settingsNextSubmitAppInput(event) {
  event.preventDefault();
  if (settingsNextAppInputState.busy) return;
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  settingsNextAppInputState.busy = true;
  form.setAttribute('aria-busy', 'true');
  if (button) { button.disabled = true; button.textContent = '적용 중...'; }
  settingsNextSetFeedback('settings-next-app-input-feedback', '');
  setUiSettingsCardFooterDetail('settings-next-app-input-footer-detail', '');
  try {
    const result = await postJson('/api/v1/settings/app-input', { values: {
      TYPING_SPEED: document.getElementById('settings-next-typing-speed')?.value || 'NORMAL'
    } });
    settingsNextAppInputApply(result);
    settingsNextAppInputState.loaded = true;
    setUiSettingsCardFooterDetail('settings-next-app-input-footer-detail', result.message || '네이버 입력 속도를 적용했습니다.');
  } catch (error) {
    settingsNextSetFeedback('settings-next-app-input-feedback', error.message || '입력 환경을 적용하지 못했습니다.', 'danger');
  } finally {
    settingsNextAppInputState.busy = false;
    form.setAttribute('aria-busy', 'false');
    if (button) { button.disabled = false; button.textContent = '적용'; }
  }
}

function settingsNextRunTypingSample() {
  const output = document.getElementById('settings-next-typing-sample-output');
  const speed = String(document.getElementById('settings-next-typing-speed')?.value || 'NORMAL').toUpperCase();
  const sample = 'BlogGenius가 네이버 에디터에 본문을 입력하는 모습을 확인합니다. 문단의 흐름과 속도를 천천히 살펴보세요.';
  const interval = { QUICK: 8, FAST: 18, NORMAL: 38, HUMAN: 65 }[speed] || 38;
  if (!output) return;
  if (settingsNextAppInputState.testTimer) window.clearTimeout(settingsNextAppInputState.testTimer);
  output.textContent = '';
  let index = 0;
  let repeat = 0;
  const typeNext = () => {
    if (index < sample.length) {
      output.textContent += sample[index];
      index += 1;
      settingsNextAppInputState.testTimer = window.setTimeout(typeNext, interval);
      return;
    }
    repeat += 1;
    if (repeat >= 3) {
      settingsNextAppInputState.testTimer = null;
      return;
    }
    output.textContent += '\n\n';
    index = 0;
    settingsNextAppInputState.testTimer = window.setTimeout(typeNext, interval * 2);
  };
  typeNext();
}

function initSettingsNextAppInput() {
  if (settingsNextAppInputState.bound) return;
  document.getElementById('settings-next-app-input-form')?.addEventListener('submit', settingsNextSubmitAppInput);
  document.getElementById('settings-next-typing-speed')?.addEventListener('change', () => {
    settingsNextSyncAppInputDirty();
    settingsNextRunTypingSample();
  });
  settingsNextAppInputState.bound = true;
}

function initSettingsNextAppEnvironment() {
  initSettingsNextAppInput();
  initSettingsNextAppGeneral();
}

function loadSettingsNextAppEnvironment() {
  void loadSettingsNextAppInput();
  void loadSettingsNextAppGeneral();
}
