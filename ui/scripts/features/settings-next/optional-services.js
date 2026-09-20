const SETTINGS_NEXT_EXTRAS_TABS = Object.freeze(['social', 'messaging', 'links']);
const settingsNextOptionalState = {
  bound: false,
  fields: {},
  verified: { buffer: null, 'sns-distribution': null, telegram: null, slack: null, bitly: null },
  bufferConnection: { organizations: [], organizationId: '', channels: [], workspacesLoaded: false },
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
  if (scope === 'buffer') return {
    BUFFER_API_KEY: String(document.getElementById('settings-next-buffer-api-key')?.value || '').trim(),
    BUFFER_ORGANIZATION_ID: String(document.getElementById('settings-next-buffer-organization')?.value || '').trim()
  };
  if (scope === 'sns-distribution') return {
    SNS_PUBLISH_ENABLED: document.getElementById('settings-next-sns-distribution-enabled')?.checked === true,
    SNS_SOURCE_BLOGS: ['naver', 'wordpress'].filter((source) => document.getElementById(`settings-next-sns-source-${source}`)?.checked),
    BUFFER_ORGANIZATION_ID: String(document.getElementById('settings-next-buffer-organization')?.value || '').trim(),
    BUFFER_CHANNELS: settingsNextSelectedBufferChannels()
  };
  if (scope === 'telegram') return {
    NOTIFY_TELEGRAM_BOT_TOKEN: String(document.getElementById('settings-next-telegram-token')?.value || '').trim(),
    NOTIFY_TELEGRAM_CHAT_ID: String(document.getElementById('settings-next-telegram-chat-id')?.value || '').trim(),
    NOTIFY_TELEGRAM_DELIVERY_ENABLED: document.getElementById('settings-next-telegram-delivery-enabled')?.checked === true
  };
  if (scope === 'slack') return {
    NOTIFY_SLACK_WEBHOOK_URL: String(document.getElementById('settings-next-slack-webhook')?.value || '').trim(),
    NOTIFY_SLACK_DELIVERY_ENABLED: document.getElementById('settings-next-slack-delivery-enabled')?.checked === true
  };
  return { NOTIFY_BITLY_TOKEN: String(document.getElementById('settings-next-bitly-token')?.value || '').trim() };
}

function settingsNextBufferChannel(channel = {}) {
  return {
    id: String(channel.id || channel.channelId || '').trim(),
    name: String(channel.name || channel.displayName || channel.display_name || '').trim(),
    displayName: String(channel.displayName || channel.display_name || channel.name || '').trim(),
    service: String(channel.service || '').trim().toLowerCase()
  };
}

function settingsNextSelectedBufferChannels() {
  const candidates = Array.isArray(settingsNextOptionalState.bufferConnection.channels) && settingsNextOptionalState.bufferConnection.channels.length
    ? settingsNextOptionalState.bufferConnection.channels
    : (Array.isArray(settingsNextOptionalState.fields.BUFFER_CHANNELS) ? settingsNextOptionalState.fields.BUFFER_CHANNELS : []);
  const selectedIds = new Set(Array.from(
    document.querySelectorAll('#settings-next-buffer-channel-list input[type="checkbox"]:checked'),
    (input) => String(input.dataset.channelId || '').trim()
  ));
  return candidates
    .filter((channel) => selectedIds.has(String(channel.id || channel.channelId || '').trim()))
    .map(settingsNextBufferChannel)
    .filter((channel) => channel.id);
}

function settingsNextRenderSnsDistribution() {
  const fields = settingsNextOptionalState.fields;
  const connected = settingsNextOptionalSecretConfigured('buffer');
  const form = document.getElementById('settings-next-sns-distribution-form');
  const enabledInput = document.getElementById('settings-next-sns-distribution-enabled');
  const fieldsRoot = document.getElementById('settings-next-sns-distribution-fields');
  const organization = document.getElementById('settings-next-buffer-organization');
  const workspaceLoad = document.getElementById('settings-next-buffer-workspaces-load');
  const channelsRoot = document.getElementById('settings-next-buffer-channel-list');
  if (!form || !enabledInput || !fieldsRoot || !organization || !workspaceLoad || !channelsRoot) return;

  const organizations = Array.isArray(settingsNextOptionalState.bufferConnection.organizations)
    ? settingsNextOptionalState.bufferConnection.organizations
    : [];
  const selectedOrganizationId = String(fields.BUFFER_ORGANIZATION_ID || settingsNextOptionalState.bufferConnection.organizationId || '').trim();
  organization.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = connected ? '작업 공간을 선택해 주세요.' : 'Buffer 연결 후 선택할 수 있습니다.';
  organization.append(placeholder);
  const organizationOptions = settingsNextOptionalState.bufferConnection.workspacesLoaded && organizations.length
    ? organizations
    : [];
  organizationOptions.forEach((item) => {
    const option = document.createElement('option');
    option.value = String(item.id || '');
    option.textContent = String(item.name || item.id || 'Buffer 작업 공간');
    option.selected = option.value === selectedOrganizationId;
    organization.append(option);
  });

  const availableChannels = settingsNextOptionalState.bufferConnection.workspacesLoaded
    ? (Array.isArray(settingsNextOptionalState.bufferConnection.channels) ? settingsNextOptionalState.bufferConnection.channels : [])
    : [];
  workspaceLoad.disabled = !connected;
  workspaceLoad.textContent = settingsNextOptionalState.bufferConnection.workspacesLoaded ? '다시 불러오기' : '작업 공간 불러오기';
  const selectedIds = new Set((Array.isArray(fields.BUFFER_CHANNELS) ? fields.BUFFER_CHANNELS : []).map((channel) => String(channel?.id || channel?.channelId || '').trim()));
  channelsRoot.replaceChildren();
  if (!availableChannels.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = !connected
      ? 'Buffer 연결 후 채널을 불러와 선택할 수 있습니다.'
      : (!settingsNextOptionalState.bufferConnection.workspacesLoaded
        ? '작업 공간 불러오기를 눌러 SNS 채널을 확인해 주세요.'
        : (organizations.length > 1 && !selectedOrganizationId ? '작업 공간을 선택하면 SNS 채널이 표시됩니다.' : '선택한 작업 공간에 사용할 수 있는 SNS 채널이 없습니다.'));
    channelsRoot.append(empty);
  } else {
    availableChannels.map(settingsNextBufferChannel).filter((channel) => channel.id).forEach((channel) => {
      const label = document.createElement('label');
      label.className = 'ui-selectable-card settings-next-sns-channel-option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = `settings-next-buffer-channel-${channel.id}`;
      input.dataset.channelId = channel.id;
      input.checked = selectedIds.has(channel.id);
      input.disabled = !connected;
      const copy = document.createElement('span');
      copy.className = 'ui-selectable-card-copy';
      const title = document.createElement('strong');
      title.textContent = channel.displayName || channel.name || channel.id;
      const detail = document.createElement('small');
      detail.textContent = channel.service || 'SNS 채널';
      copy.append(title, detail);
      label.append(input, copy);
      channelsRoot.append(label);
    });
  }

  enabledInput.checked = fields.SNS_PUBLISH_ENABLED === true;
  enabledInput.disabled = !connected;
  organization.disabled = !connected || !settingsNextOptionalState.bufferConnection.workspacesLoaded;
  document.querySelectorAll('#settings-next-sns-distribution-fields input').forEach((input) => { input.disabled = !connected; });
  fieldsRoot.setAttribute('aria-disabled', connected ? 'false' : 'true');
  const save = document.getElementById('settings-next-sns-distribution-save');
  if (save) {
    save.disabled = !connected;
    save.textContent = '저장';
  }
  if (!connected) settingsNextOptionalSetStatus('sns-distribution', 'Buffer 연결 필요', 'neutral');
  else if (fields.SNS_PUBLISH_ENABLED === true) settingsNextOptionalSetStatus('sns-distribution', '사용 중', 'success');
  else settingsNextOptionalSetStatus('sns-distribution', '사용 안 함', 'neutral');
}

async function settingsNextLoadBufferWorkspaces() {
  const organization = document.getElementById('settings-next-buffer-organization');
  const organizationId = String(organization?.value || settingsNextOptionalState.fields.BUFFER_ORGANIZATION_ID || '').trim();
  if (settingsNextOptionalState.busy.has('buffer-workspaces')) return;
  settingsNextOptionalState.busy.add('buffer-workspaces');
  if (organization) organization.disabled = true;
  const button = document.getElementById('settings-next-buffer-workspaces-load');
  if (button) { button.disabled = true; button.textContent = '불러오는 중...'; }
  settingsNextSetFeedback('settings-next-sns-distribution-feedback', 'Buffer 작업 공간을 불러오는 중...');
  try {
    const result = await postJson('/api/v1/settings/optional-services/test', {
      scope: 'buffer', values: { BUFFER_API_KEY: '', BUFFER_ORGANIZATION_ID: organizationId }
    });
    const resolvedOrganizationId = String(result.organization_id || organizationId).trim();
    if (resolvedOrganizationId) {
      settingsNextOptionalState.fields = {
        ...settingsNextOptionalState.fields,
        BUFFER_ORGANIZATION_ID: resolvedOrganizationId,
        BUFFER_CHANNELS: []
      };
    }
    settingsNextOptionalState.bufferConnection = {
      organizations: Array.isArray(result.organizations) ? result.organizations : [],
      organizationId: resolvedOrganizationId,
      channels: Array.isArray(result.channels) ? result.channels : [],
      workspacesLoaded: true
    };
    if (typeof persistManualSnsWorkspaceCache === 'function') {
      persistManualSnsWorkspaceCache(settingsNextOptionalState.bufferConnection);
    }
    if (typeof invalidateManualSnsWorkspaceState === 'function') {
      invalidateManualSnsWorkspaceState({ preserveCache: true });
    }
    settingsNextSetFeedback('settings-next-sns-distribution-feedback', '');
    settingsNextRenderSnsDistribution();
  } catch (error) {
    settingsNextSetFeedback('settings-next-sns-distribution-feedback', error.message || 'SNS 채널을 불러오지 못했습니다.', 'danger');
  } finally {
    settingsNextOptionalState.busy.delete('buffer-workspaces');
    settingsNextRenderSnsDistribution();
  }
}

function settingsNextLimitBufferChannelSelection(input) {
  if (!input.checked) return;
  const checked = document.querySelectorAll('#settings-next-buffer-channel-list input:checked').length;
  if (checked <= 3) return;
  input.checked = false;
  settingsNextSetFeedback('settings-next-sns-distribution-feedback', 'SNS 채널은 최대 3개까지 선택할 수 있습니다.', 'danger');
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
  settingsNextRenderSnsDistribution();
}

function settingsNextOptionalApply(data = {}) {
  settingsNextOptionalState.fields = { ...(data.fields || {}) };
  const fields = settingsNextOptionalState.fields;
  setUiSettingsCardFooterDetail('settings-next-buffer-footer-detail', '');
  setUiSettingsCardFooterDetail('settings-next-sns-distribution-footer-detail', '');
  setUiSettingsCardFooterDetail('settings-next-telegram-footer-detail', '');
  setUiSettingsCardFooterDetail('settings-next-slack-footer-detail', '');
  setUiSettingsCardFooterDetail('settings-next-bitly-footer-detail', '');
  document.getElementById('settings-next-telegram-chat-id').value = fields.NOTIFY_TELEGRAM_CHAT_ID || '';
  [
    ['telegram', 'NOTIFY_TELEGRAM_DELIVERY_ENABLED'],
    ['slack', 'NOTIFY_SLACK_DELIVERY_ENABLED']
  ].forEach(([scope, field]) => {
    const input = document.getElementById(`settings-next-${scope}-delivery-enabled`);
    if (!input) return;
    const configured = scope === 'telegram'
      ? settingsNextOptionalSecretConfigured(scope) && Boolean(String(fields.NOTIFY_TELEGRAM_CHAT_ID || '').trim())
      : settingsNextOptionalSecretConfigured(scope);
    input.checked = fields[field] === true;
    input.disabled = !configured;
  });
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
  ['buffer', 'sns-distribution', 'telegram', 'slack', 'bitly'].forEach((scope) => settingsNextClearScopeDirty(`optional-${scope}`));
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
  if (scope === 'sns-distribution' && values.SNS_PUBLISH_ENABLED) {
    if (!settingsNextOptionalSecretConfigured('buffer')) return 'Buffer 연결을 먼저 완료해 주세요.';
    if (!values.BUFFER_ORGANIZATION_ID) return 'Buffer 작업 공간을 선택해 주세요.';
    if (!values.BUFFER_CHANNELS.length) return '공유할 SNS 채널을 1개 이상 선택해 주세요.';
    if (!values.SNS_SOURCE_BLOGS.length) return '공유할 블로그를 1개 이상 선택해 주세요.';
  }
  if (scope === 'telegram' && ((!values.NOTIFY_TELEGRAM_BOT_TOKEN && !settingsNextOptionalSecretConfigured(scope)) || !values.NOTIFY_TELEGRAM_CHAT_ID)) return 'Bot Token과 Chat ID를 모두 입력해 주세요.';
  if (scope === 'slack' && !values.NOTIFY_SLACK_WEBHOOK_URL && !settingsNextOptionalSecretConfigured(scope)) return 'Webhook URL을 입력해 주세요.';
  if (scope === 'bitly' && !values.NOTIFY_BITLY_TOKEN && !settingsNextOptionalSecretConfigured(scope)) return 'Access Token을 입력해 주세요.';
  return '';
}

// Save-only path (no connection test): used by "save and proceed" flows.
async function settingsNextPersistOptionalScope(scope) {
  if (settingsNextOptionalState.busy.has(scope)) return false;
  const payload = settingsNextOptionalPayload(scope);
  const errorMessage = settingsNextOptionalValidate(scope, payload.values);
  if (errorMessage) {
    settingsNextSetFeedback(`settings-next-${scope}-feedback`, errorMessage, 'danger');
    return false;
  }
  settingsNextOptionalState.busy.add(scope);
  try {
    const saved = await postJson('/api/v1/settings/optional-services', payload);
    settingsNextOptionalApply(saved);
    if (scope === 'buffer') {
      if (typeof clearManualSnsWorkspaceCache === 'function') clearManualSnsWorkspaceCache();
      if (typeof invalidateManualSnsWorkspaceState === 'function') invalidateManualSnsWorkspaceState();
    }
    settingsNextClearScopeDirty(`optional-${scope}`);
    settingsNextOptionalRenderStatuses();
    return true;
  } catch (error) {
    settingsNextSetFeedback(`settings-next-${scope}-feedback`, error.message || '저장하지 못했습니다.', 'danger');
    return false;
  } finally {
    settingsNextOptionalState.busy.delete(scope);
  }
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
  const actionLabel = scope === 'sns-distribution' ? '저장' : '연결 확인';
  const busyLabel = scope === 'sns-distribution'
    ? '저장 중...'
    : scope === 'telegram'
      ? 'Bot·채팅·메시지 확인 중...'
      : '연결 확인 중...';
  if (button) { button.disabled = true; button.textContent = busyLabel; }
  settingsNextSetFeedback(`settings-next-${scope}-feedback`, '');
    if (['buffer', 'sns-distribution', 'telegram', 'slack', 'bitly'].includes(scope)) setUiSettingsCardFooterDetail(`settings-next-${scope}-footer-detail`, '');
  let persisted = false;
  try {
    const saved = await postJson('/api/v1/settings/optional-services', payload);
    persisted = true;
    settingsNextOptionalApply(saved);
    if (scope === 'buffer') {
      if (typeof clearManualSnsWorkspaceCache === 'function') clearManualSnsWorkspaceCache();
      if (typeof invalidateManualSnsWorkspaceState === 'function') invalidateManualSnsWorkspaceState();
    }
    const tested = scope === 'sns-distribution'
      ? null
      : await postJson('/api/v1/settings/optional-services/test', settingsNextOptionalPayload(scope));
    if (scope === 'buffer') {
      settingsNextOptionalState.bufferConnection = {
        organizations: Array.isArray(tested.organizations) ? tested.organizations : [],
        organizationId: String(tested.organization_id || '').trim(),
        channels: Array.isArray(tested.channels) ? tested.channels : [],
        workspacesLoaded: true
      };
      if (typeof persistManualSnsWorkspaceCache === 'function') {
        persistManualSnsWorkspaceCache(settingsNextOptionalState.bufferConnection);
      }
      if (typeof invalidateManualSnsWorkspaceState === 'function') {
        invalidateManualSnsWorkspaceState({ preserveCache: true });
      }
      const organizations = Array.isArray(tested.organizations) ? tested.organizations.length : 0;
      const channels = Array.isArray(tested.channels) ? tested.channels.length : 0;
      setUiSettingsCardFooterDetail(
        'settings-next-buffer-footer-detail',
        `연결된 조직 ${organizations}개${channels ? ` · 사용 가능한 발행 채널 ${channels}개` : ''}`
      );
    }
    if (scope === 'sns-distribution') setUiSettingsCardFooterDetail('settings-next-sns-distribution-footer-detail', '저장했습니다.');
    if (scope === 'telegram') setUiSettingsCardFooterDetail('settings-next-telegram-footer-detail', tested?.message || '연결됨 · 테스트 메시지를 전송했습니다.');
    if (scope === 'slack') setUiSettingsCardFooterDetail('settings-next-slack-footer-detail', '테스트 메시지를 전송했습니다.');
    if (scope === 'bitly') setUiSettingsCardFooterDetail('settings-next-bitly-footer-detail', 'Bitly 연결을 확인했습니다.');
    settingsNextOptionalState.verified[scope] = true;
  } catch (error) {
    settingsNextOptionalState.verified[scope] = false;
    const message = error.message || '연결을 확인하지 못했습니다.';
    const resultMessage = persisted ? `입력값은 반영됨 · ${message}` : message;
    if (['buffer', 'sns-distribution', 'telegram', 'slack', 'bitly'].includes(scope)) {
      setUiSettingsCardFooterDetail(`settings-next-${scope}-footer-detail`, resultMessage, 'danger');
    } else {
      settingsNextSetFeedback(`settings-next-${scope}-feedback`, resultMessage, 'danger');
    }
  } finally {
    settingsNextOptionalState.busy.delete(scope);
    form.setAttribute('aria-busy', 'false');
    if (button) { button.disabled = false; button.textContent = actionLabel; }
    settingsNextOptionalRenderStatuses();
  }
}

async function settingsNextOptionalToggleDelivery(scope, input) {
  if (settingsNextOptionalState.busy.has(scope)) return;
  const field = scope === 'telegram' ? 'NOTIFY_TELEGRAM_DELIVERY_ENABLED' : 'NOTIFY_SLACK_DELIVERY_ENABLED';
  const previous = settingsNextOptionalState.fields[field] === true;
  settingsNextOptionalState.busy.add(scope);
  input.disabled = true;
  settingsNextSetFeedback(`settings-next-${scope}-feedback`, '');
  try {
    const saved = await postJson('/api/v1/settings/optional-services', settingsNextOptionalPayload(scope));
    settingsNextOptionalState.fields = { ...(saved.fields || {}) };
    settingsNextClearScopeDirty(`optional-${scope}`);
    settingsNextOptionalRenderStatuses();
  } catch (error) {
    input.checked = previous;
    settingsNextSetFeedback(`settings-next-${scope}-feedback`, error.message || '알림 사용 여부를 반영하지 못했습니다.', 'danger');
  } finally {
    settingsNextOptionalState.busy.delete(scope);
    input.disabled = false;
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
    form.addEventListener('input', (event) => {
      if (event.target.matches('[data-settings-next-delivery-toggle]')) return;
      settingsNextMarkScopeDirty(`optional-${scope}`);
      settingsNextOptionalState.verified[scope] = null;
      if (['buffer', 'sns-distribution', 'telegram', 'slack', 'bitly'].includes(scope)) setUiSettingsCardFooterDetail(`settings-next-${scope}-footer-detail`, '');
      settingsNextSetFeedback(`settings-next-${scope}-feedback`, '');
      if (scope === 'sns-distribution') return;
      settingsNextOptionalRenderStatuses();
    });
    form.addEventListener('change', (event) => {
      if (event.target.matches('[data-settings-next-delivery-toggle]')) return;
      settingsNextMarkScopeDirty(`optional-${scope}`);
      settingsNextOptionalState.verified[scope] = null;
      if (['buffer', 'sns-distribution', 'telegram', 'slack', 'bitly'].includes(scope)) setUiSettingsCardFooterDetail(`settings-next-${scope}-footer-detail`, '');
      if (scope === 'sns-distribution') return;
      settingsNextOptionalRenderStatuses();
    });
  });
  document.querySelectorAll('[data-settings-next-delivery-toggle]').forEach((input) => {
    input.addEventListener('change', () => void settingsNextOptionalToggleDelivery(input.dataset.settingsNextDeliveryToggle, input));
  });
  document.getElementById('settings-next-buffer-workspaces-load')?.addEventListener('click', () => void settingsNextLoadBufferWorkspaces());
  document.getElementById('settings-next-buffer-organization')?.addEventListener('change', () => void settingsNextLoadBufferWorkspaces());
  document.getElementById('settings-next-buffer-channel-list')?.addEventListener('change', (event) => {
    if (event.target.matches('input[type="checkbox"]')) settingsNextLimitBufferChannelSelection(event.target);
  });
  initOpaqueSettingsSecretToggles(document.getElementById('settings-next-panel-extras'));
  settingsNextActivateExtrasTab('social');
  settingsNextOptionalState.bound = true;
}
