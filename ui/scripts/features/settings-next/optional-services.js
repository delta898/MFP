const SETTINGS_NEXT_EXTRAS_TABS = Object.freeze(['social', 'messaging', 'links']);
const settingsNextOptionalState = {
  bound: false,
  fields: {},
  verified: { buffer: null, telegram: null, slack: null, bitly: null },
  busy: new Set()
};

function settingsNextActivateExtrasTab(tabName) {
  const target = SETTINGS_NEXT_EXTRAS_TABS.includes(tabName) ? tabName : 'social';
  document.querySelectorAll('[data-settings-next-extras-tab]').forEach((button) => {
    const active = button.dataset.settingsNextExtrasTab === target;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('.settings-next-extras-panel').forEach((panel) => {
    const active = panel.id === `settings-next-extras-panel-${target}`;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

function settingsNextOptionalSecretConfigured(scope) {
  return {
    buffer: settingsNextOptionalState.fields.BUFFER_API_KEY_CONFIGURED,
    telegram: settingsNextOptionalState.fields.NOTIFY_TELEGRAM_BOT_TOKEN_CONFIGURED,
    slack: settingsNextOptionalState.fields.NOTIFY_SLACK_WEBHOOK_URL_CONFIGURED,
    bitly: settingsNextOptionalState.fields.NOTIFY_BITLY_TOKEN_CONFIGURED
  }[scope] === true;
}

function settingsNextOptionalValues(scope) {
  if (scope === 'buffer') return { BUFFER_API_KEY: String(document.getElementById('settings-next-buffer-api-key')?.value || '').trim() };
  if (scope === 'telegram') return {
    NOTIFY_TELEGRAM_BOT_TOKEN: String(document.getElementById('settings-next-telegram-token')?.value || '').trim(),
    NOTIFY_TELEGRAM_CHAT_ID: String(document.getElementById('settings-next-telegram-chat-id')?.value || '').trim()
  };
  if (scope === 'slack') return {
    NOTIFY_SLACK_WEBHOOK_URL: String(document.getElementById('settings-next-slack-webhook')?.value || '').trim()
  };
  return { NOTIFY_BITLY_TOKEN: String(document.getElementById('settings-next-bitly-token')?.value || '').trim() };
}

function settingsNextOptionalPayload(scope) {
  return { scope, values: settingsNextOptionalValues(scope) };
}

function settingsNextOptionalSetStatus(scope, label, tone) {
  settingsNextSetStatus(`settings-next-${scope}-status`, label, tone);
  if (!['telegram', 'slack'].includes(scope)) return;
  settingsNextSetText(`settings-next-${scope}-readiness`, label);
  settingsNextSetDot(document.getElementById(`settings-next-${scope}-readiness-dot`), tone);
}

function settingsNextOptionalRenderStatuses() {
  ['buffer', 'telegram', 'slack', 'bitly'].forEach((scope) => {
    const enteredSecret = {
      buffer: document.getElementById('settings-next-buffer-api-key')?.value,
      telegram: document.getElementById('settings-next-telegram-token')?.value,
      slack: document.getElementById('settings-next-slack-webhook')?.value,
      bitly: document.getElementById('settings-next-bitly-token')?.value
    }[scope];
    const hasSecret = settingsNextOptionalSecretConfigured(scope) || Boolean(String(enteredSecret || '').trim());
    const configured = hasSecret
      && (scope !== 'telegram' || Boolean(String(document.getElementById('settings-next-telegram-chat-id')?.value || '').trim()));
    const verified = settingsNextOptionalState.verified[scope];
    if (!hasSecret) settingsNextOptionalSetStatus(scope, '미설정', 'neutral');
    else if (!configured) settingsNextOptionalSetStatus(scope, '확인 필요', 'warning');
    else if (verified === false) settingsNextOptionalSetStatus(scope, '확인 실패', 'danger');
    else if (verified === true) settingsNextOptionalSetStatus(scope, '연결됨', 'success');
    else settingsNextOptionalSetStatus(scope, '확인 필요', 'warning');
  });
}

function settingsNextOptionalApply(data = {}) {
  settingsNextOptionalState.fields = { ...(data.fields || {}) };
  const fields = settingsNextOptionalState.fields;
  setUiSettingsCardFooterDetail('settings-next-buffer-footer-detail', '');
  setUiSettingsCardFooterDetail('settings-next-telegram-footer-detail', '');
  setUiSettingsCardFooterDetail('settings-next-slack-footer-detail', '');
  setUiSettingsCardFooterDetail('settings-next-bitly-footer-detail', '');
  document.getElementById('settings-next-telegram-chat-id').value = fields.NOTIFY_TELEGRAM_CHAT_ID || '';
  ['buffer-api-key', 'telegram-token', 'slack-webhook', 'bitly-token'].forEach((suffix) => {
    const input = document.getElementById(`settings-next-${suffix}`);
    if (input) { input.value = ''; input.type = 'password'; }
  });
  [
    ['buffer', 'Buffer API Key', '새 API Key 입력'],
    ['telegram', 'Telegram Bot Token', '새 Bot Token 입력'],
    ['slack', 'Slack Webhook URL', '새 Webhook URL 입력'],
    ['bitly', 'Bitly Access Token', '새 Access Token 입력']
  ].forEach(([scope, label, emptyPlaceholder]) => {
    const hint = document.getElementById(`settings-next-${scope}-secret-help`);
    const input = document.getElementById({
      buffer: 'settings-next-buffer-api-key',
      telegram: 'settings-next-telegram-token',
      slack: 'settings-next-slack-webhook',
      bitly: 'settings-next-bitly-token'
    }[scope]);
    const fallback = scope === 'bitly' ? ' 연결되지 않으면 원본 URL을 사용합니다.' : '';
    syncSettingsNextSecretRegistration({
      input,
      hint,
      configured: settingsNextOptionalSecretConfigured(scope),
      label,
      emptyPlaceholder,
      emptyHint: `${label}은 등록 후 표시하지 않습니다.`,
      configuredHint: `${label}${scope === 'buffer' ? '가' : '이'} 등록되어 있습니다. 변경할 때만 새 값을 입력하세요.`,
      suffix: fallback
    });
  });
  ['buffer', 'telegram', 'slack', 'bitly'].forEach((scope) => settingsNextClearScopeDirty(`optional-${scope}`));
  settingsNextOptionalRenderStatuses();
}

async function loadSettingsNextOptionalServices() {
  try {
    settingsNextOptionalApply(await fetchJson('/api/v1/settings/optional-services'));
    settingsNextSetFeedback('settings-next-extras-load-feedback', '');
  } catch (error) {
    settingsNextSetFeedback('settings-next-extras-load-feedback', error.message || '부가 서비스 설정을 불러오지 못했습니다.', 'danger');
    throw error;
  }
}

function settingsNextOptionalValidate(scope, values) {
  if (scope === 'buffer' && !values.BUFFER_API_KEY && !settingsNextOptionalSecretConfigured(scope)) return 'API Key를 입력해 주세요.';
  if (scope === 'telegram' && ((!values.NOTIFY_TELEGRAM_BOT_TOKEN && !settingsNextOptionalSecretConfigured(scope)) || !values.NOTIFY_TELEGRAM_CHAT_ID)) return 'Bot Token과 Chat ID를 모두 입력해 주세요.';
  if (scope === 'slack' && !values.NOTIFY_SLACK_WEBHOOK_URL && !settingsNextOptionalSecretConfigured(scope)) return 'Webhook URL을 입력해 주세요.';
  if (scope === 'bitly' && !values.NOTIFY_BITLY_TOKEN && !settingsNextOptionalSecretConfigured(scope)) return 'Access Token을 입력해 주세요.';
  return '';
}

async function settingsNextOptionalSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const scope = form.dataset.settingsNextOptionalScope;
  if (settingsNextOptionalState.busy.has(scope)) return;
  const payload = settingsNextOptionalPayload(scope);
  const errorMessage = settingsNextOptionalValidate(scope, payload.values);
  if (errorMessage) { settingsNextSetFeedback(`settings-next-${scope}-feedback`, errorMessage, 'danger'); return; }
  const button = form.querySelector('button[type="submit"]');
  settingsNextOptionalState.busy.add(scope);
  form.setAttribute('aria-busy', 'true');
  if (button) { button.disabled = true; button.textContent = '연결 확인 중...'; }
  settingsNextSetFeedback(`settings-next-${scope}-feedback`, '');
    if (['buffer', 'telegram', 'slack', 'bitly'].includes(scope)) setUiSettingsCardFooterDetail(`settings-next-${scope}-footer-detail`, '');
  let persisted = false;
  try {
    const saved = await postJson('/api/v1/settings/optional-services', payload);
    persisted = true;
    settingsNextOptionalApply(saved);
    const tested = await postJson('/api/v1/settings/optional-services/test', settingsNextOptionalPayload(scope));
    if (scope === 'buffer') {
      const organizations = Array.isArray(tested.organizations) ? tested.organizations.length : 0;
      const channels = Array.isArray(tested.channels) ? tested.channels.length : 0;
      setUiSettingsCardFooterDetail(
        'settings-next-buffer-footer-detail',
        `연결된 조직 ${organizations}개${channels ? ` · 사용 가능한 발행 채널 ${channels}개` : ''}`
      );
    }
    if (scope === 'telegram') setUiSettingsCardFooterDetail('settings-next-telegram-footer-detail', '테스트 메시지를 전송했습니다.');
    if (scope === 'slack') setUiSettingsCardFooterDetail('settings-next-slack-footer-detail', '테스트 메시지를 전송했습니다.');
    if (scope === 'bitly') setUiSettingsCardFooterDetail('settings-next-bitly-footer-detail', 'Bitly 연결을 확인했습니다.');
    settingsNextOptionalState.verified[scope] = true;
  } catch (error) {
    settingsNextOptionalState.verified[scope] = false;
    const message = error.message || '연결을 확인하지 못했습니다.';
    const resultMessage = persisted ? `입력값은 반영됨 · ${message}` : message;
    if (['buffer', 'telegram', 'slack', 'bitly'].includes(scope)) {
      setUiSettingsCardFooterDetail(`settings-next-${scope}-footer-detail`, resultMessage, 'danger');
    } else {
      settingsNextSetFeedback(`settings-next-${scope}-feedback`, resultMessage, 'danger');
    }
  } finally {
    settingsNextOptionalState.busy.delete(scope);
    form.setAttribute('aria-busy', 'false');
    if (button) { button.disabled = false; button.textContent = '연결 확인'; }
    settingsNextOptionalRenderStatuses();
  }
}

function initSettingsNextOptionalServices() {
  if (settingsNextOptionalState.bound) return;
  document.querySelectorAll('[data-settings-next-extras-tab]').forEach((button) => {
    button.addEventListener('click', () => settingsNextActivateExtrasTab(button.dataset.settingsNextExtrasTab));
    button.addEventListener('keydown', (event) => void handleUiTabNavigationKeydown(event, { selector: '[data-settings-next-extras-tab]', dataKey: 'settingsNextExtrasTab', activate: settingsNextActivateExtrasTab }));
  });
  document.querySelectorAll('[data-settings-next-optional-scope]').forEach((form) => {
    const scope = form.dataset.settingsNextOptionalScope;
    form.addEventListener('submit', settingsNextOptionalSubmit);
    form.addEventListener('input', () => {
      settingsNextMarkScopeDirty(`optional-${scope}`);
      settingsNextOptionalState.verified[scope] = null;
      if (['buffer', 'telegram', 'slack', 'bitly'].includes(scope)) setUiSettingsCardFooterDetail(`settings-next-${scope}-footer-detail`, '');
      settingsNextSetFeedback(`settings-next-${scope}-feedback`, '');
      settingsNextOptionalRenderStatuses();
    });
    form.addEventListener('change', () => {
      settingsNextMarkScopeDirty(`optional-${scope}`);
      settingsNextOptionalState.verified[scope] = null;
      if (['buffer', 'telegram', 'slack', 'bitly'].includes(scope)) setUiSettingsCardFooterDetail(`settings-next-${scope}-footer-detail`, '');
      settingsNextOptionalRenderStatuses();
    });
  });
  initOpaqueSettingsSecretToggles(document.getElementById('settings-next-panel-extras'));
  settingsNextActivateExtrasTab('social');
  settingsNextOptionalState.bound = true;
}
