const settingsNextExternalState = {
  bound: false,
  loaded: false,
  fields: {},
  busy: new Set()
};

function settingsNextExternalStatus(id, { enabled, configured, running }) {
  if (!configured) return settingsNextSetStatus(id, '미설정', 'neutral');
  if (!enabled) return settingsNextSetStatus(id, '꺼짐', 'neutral');
  return settingsNextSetStatus(id, running ? '실행 중' : '확인 필요', running ? 'success' : 'warning');
}

function settingsNextExternalApply(data = {}) {
  const fields = settingsNextExternalState.fields = { ...(data.fields || {}) };
  const telegramEnabled = document.getElementById('settings-next-telegram-inbound-enabled');
  if (telegramEnabled) {
    telegramEnabled.checked = fields.TELEGRAM_INBOUND_ENABLED === true;
    telegramEnabled.disabled = fields.TELEGRAM_INBOUND_CONFIGURED !== true;
  }
  const mcpEnabled = document.getElementById('settings-next-mcp-remote-enabled');
  if (mcpEnabled) mcpEnabled.checked = fields.MCP_REMOTE_ENABLED === true;
  settingsNextExternalStatus('settings-next-telegram-inbound-status', {
    enabled: fields.TELEGRAM_INBOUND_ENABLED === true,
    configured: fields.TELEGRAM_INBOUND_CONFIGURED === true,
    running: fields.TELEGRAM_INBOUND_RUNNING === true
  });
  settingsNextExternalStatus('settings-next-mcp-remote-status', {
    enabled: fields.MCP_REMOTE_ENABLED === true,
    configured: fields.MCP_REMOTE_AUTH_TOKEN_CONFIGURED === true,
    running: fields.MCP_REMOTE_RUNNING === true
  });
  [['host', 'MCP_REMOTE_HOST'], ['port', 'MCP_REMOTE_PORT'], ['path', 'MCP_REMOTE_PATH']].forEach(([id, field]) => {
    const input = document.getElementById(`settings-next-mcp-remote-${id}`);
    if (input) input.value = fields[field] || '';
  });
  const token = document.getElementById('settings-next-mcp-remote-token');
  if (token) token.value = '';
}

function settingsNextExternalValues(scope) {
  if (scope === 'telegram') {
    return { TELEGRAM_INBOUND_ENABLED: document.getElementById('settings-next-telegram-inbound-enabled')?.checked === true };
  }
  return {
    MCP_REMOTE_ENABLED: document.getElementById('settings-next-mcp-remote-enabled')?.checked === true,
    MCP_REMOTE_HOST: document.getElementById('settings-next-mcp-remote-host')?.value || '',
    MCP_REMOTE_PORT: document.getElementById('settings-next-mcp-remote-port')?.value || '',
    MCP_REMOTE_PATH: document.getElementById('settings-next-mcp-remote-path')?.value || '',
    MCP_REMOTE_AUTH_TOKEN: document.getElementById('settings-next-mcp-remote-token')?.value || ''
  };
}

function settingsNextExternalFeedbackId(scope) {
  return `settings-next-${scope === 'mcp' ? 'mcp-remote' : 'telegram-inbound'}-feedback`;
}

async function settingsNextExternalSave(scope) {
  if (settingsNextExternalState.busy.has(scope)) return;
  const form = document.querySelector(`[data-settings-next-external-scope="${scope}"]`);
  const button = form?.querySelector('button[type="submit"]');
  settingsNextExternalState.busy.add(scope);
  form?.setAttribute('aria-busy', 'true');
  if (button) { button.disabled = true; button.textContent = '적용 중...'; }
  settingsNextSetFeedback(settingsNextExternalFeedbackId(scope), '');
  try {
    const result = await postJson('/api/v1/settings/external-connections', {
      scope,
      values: settingsNextExternalValues(scope)
    });
    settingsNextExternalApply(result);
    settingsNextExternalState.loaded = true;
    if (scope === 'mcp') setUiSettingsCardFooterDetail('settings-next-mcp-remote-footer-detail', '설정을 적용했습니다.');
  } catch (error) {
    settingsNextSetFeedback(settingsNextExternalFeedbackId(scope), error.message || '설정을 적용하지 못했습니다.', 'danger');
  } finally {
    settingsNextExternalState.busy.delete(scope);
    form?.setAttribute('aria-busy', 'false');
    if (button) { button.disabled = false; button.textContent = '적용'; }
  }
}

function initSettingsNextExternalConnections() {
  if (settingsNextExternalState.bound) return;
  document.querySelectorAll('[data-settings-next-external-scope]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void settingsNextExternalSave(form.dataset.settingsNextExternalScope);
    });
  });
  document.getElementById('settings-next-telegram-inbound-enabled')?.addEventListener('change', () => {
    void settingsNextExternalSave('telegram');
  });
  settingsNextExternalState.bound = true;
}

async function loadSettingsNextExternalConnections({ force = false } = {}) {
  if (settingsNextExternalState.loaded && !force) return;
  try {
    settingsNextExternalApply(await fetchJson('/api/v1/settings/external-connections'));
    settingsNextExternalState.loaded = true;
  } catch (error) {
    settingsNextSetFeedback('settings-next-telegram-inbound-feedback', error.message || '외부 연결 설정을 불러오지 못했습니다.', 'danger');
  }
}
