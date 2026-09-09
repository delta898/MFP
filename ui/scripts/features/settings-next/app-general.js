const settingsNextAppGeneralState = { bound: false, loaded: false, busy: false };

function settingsNextAppGeneralApply(data = {}) {
  const fields = data.fields || {};
  const host = document.getElementById('settings-next-listen-host');
  const port = document.getElementById('settings-next-listen-port');
  if (host) host.value = fields.LISTEN_HOST || '127.0.0.1';
  if (port) port.value = fields.LISTEN_PORT || 4577;
  settingsNextSetStatus('settings-next-app-general-status', '적용됨', 'success');
}

async function loadSettingsNextAppGeneral({ force = false } = {}) {
  if (settingsNextAppGeneralState.loaded && !force) return;
  try {
    settingsNextAppGeneralApply(await fetchJson('/api/v1/settings/app-general'));
    settingsNextAppGeneralState.loaded = true;
  } catch (error) {
    settingsNextSetStatus('settings-next-app-general-status', '확인 필요', 'warning');
    settingsNextSetFeedback('settings-next-app-general-feedback', error.message || '앱 일반 설정을 불러오지 못했습니다.', 'danger');
  }
}

async function settingsNextSubmitAppGeneral(event) {
  event.preventDefault();
  if (settingsNextAppGeneralState.busy) return;
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  settingsNextAppGeneralState.busy = true;
  form.setAttribute('aria-busy', 'true');
  if (button) { button.disabled = true; button.textContent = '적용 중...'; }
  settingsNextSetFeedback('settings-next-app-general-feedback', '');
  setUiSettingsCardFooterDetail('settings-next-app-general-footer-detail', '');
  try {
    const result = await postJson('/api/v1/settings/app-general', { values: {
      LISTEN_HOST: document.getElementById('settings-next-listen-host')?.value || '',
      LISTEN_PORT: document.getElementById('settings-next-listen-port')?.value || ''
    } });
    settingsNextAppGeneralApply(result);
    settingsNextAppGeneralState.loaded = true;
    setUiSettingsCardFooterDetail('settings-next-app-general-footer-detail', result.message || '접속 설정을 적용했습니다.');
  } catch (error) {
    settingsNextSetFeedback('settings-next-app-general-feedback', error.message || '접속 설정을 적용하지 못했습니다.', 'danger');
  } finally {
    settingsNextAppGeneralState.busy = false;
    form.setAttribute('aria-busy', 'false');
    if (button) { button.disabled = false; button.textContent = '적용'; }
  }
}

function initSettingsNextAppGeneral() {
  if (settingsNextAppGeneralState.bound) return;
  document.getElementById('settings-next-app-general-form')?.addEventListener('submit', settingsNextSubmitAppGeneral);
  document.querySelectorAll('[data-settings-next-update-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const force = button.dataset.settingsNextUpdateAction === 'force';
      void checkUpdate(true, force);
    });
  });
  settingsNextAppGeneralState.bound = true;
}
