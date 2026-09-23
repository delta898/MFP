const settingsNextAiState = {
  bound: false,
  fields: {},
  presets: { text: [], image: [], providers: {} },
  profiles: { text: {}, image: {}, chat: {} },
  drafts: { text: {}, image: {}, chat: {} },
  verification: { text: null, image: null, chat: null },
  verifiedSnapshot: {},
  busy: new Set()
};

function settingsNextAiPrefix(role) {
  return role === 'text' ? 'TEXT' : (role === 'image' ? 'IMAGE' : 'CHAT');
}

function settingsNextAiValue(role, name) {
  const prefix = settingsNextAiPrefix(role);
  return String(settingsNextAiState.fields[`${prefix}_MODEL_${name}`] || '');
}

function settingsNextAiSetText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value || '');
}

function settingsNextAiSetStatus(role, label, tone) {
  const el = document.getElementById(`settings-next-ai-${role}-status`);
  if (!el) return;
  el.textContent = label;
  el.dataset.state = tone;
}

function settingsNextAiSetFeedback(role, message = '', tone = 'neutral') {
  setUiSettingsCardFeedback(`settings-next-ai-${role}-feedback`, message, tone);
}

function settingsNextAiInvalidateVerification(role) {
  const stillVerified = settingsNextAiVerifiedSnapshotMatches(role);
  settingsNextAiState.verification[role] = stillVerified ? true : null;
  settingsNextAiSetFeedback(role);
  if (role === 'text' && (document.querySelector('input[name="settings-next-ai-chat-source"]:checked')?.value || 'writing') === 'writing') {
    settingsNextAiState.verification.chat = stillVerified ? true : null;
    settingsNextAiSetFeedback('chat');
  }
}

// Last verified connection values per `${role}:${provider}`. Provider switches
// (and reloads via server trust) keep 연결됨 when the form shows values
// identical to a verified set — no re-test needed.
function settingsNextAiSnapshotKey(role, provider) {
  return `${role}:${String(provider || '').trim()}`;
}

function settingsNextAiCaptureVerifiedSnapshot(role, values = {}) {
  const provider = String(values.provider || '').trim();
  if (!provider) return;
  settingsNextAiState.verifiedSnapshot[settingsNextAiSnapshotKey(role, provider)] = {
    presetCode: String(values.presetCode || ''),
    name: String(values.name || ''),
    baseUrl: String(values.baseUrl || ''),
    apiKey: String(values.apiKey || '')
  };
}

function settingsNextAiVerifiedSnapshotMatches(role) {
  const current = settingsNextAiReadRole(role);
  const snapshot = settingsNextAiState.verifiedSnapshot[settingsNextAiSnapshotKey(role, current.provider)];
  if (!snapshot) return false;
  // KIE validates the account, not a specific model: provider + key is enough.
  if (String(current.provider || '') === 'kie') {
    if (String(current.apiKey || '') === snapshot.apiKey) return true;
    return String(current.apiKey || '') === ''
      && snapshot.apiKey === ''
      && settingsNextAiHasConfiguredKey(role, current.provider);
  }
  const direct = String(current.provider || '') === 'direct';
  if (!direct && String(current.presetCode || '') !== snapshot.presetCode) return false;
  if (direct && String(current.name || '') !== snapshot.name) return false;
  if (String(current.baseUrl || '') !== snapshot.baseUrl) return false;
  if (String(current.apiKey || '') === snapshot.apiKey) return true;
  // Empty key input means "keep the saved key": matches only when the snapshot
  // was also taken with an untouched key and one is configured.
  return String(current.apiKey || '') === ''
    && snapshot.apiKey === ''
    && settingsNextAiHasConfiguredKey(role, current.provider);
}

function settingsNextAiDerivedBaseUrl(role, provider, code) {
  if (String(provider || '') === 'google') return 'https://generativelanguage.googleapis.com/v1beta';
  const model = settingsNextAiCatalog(role).find((item) => String(item?.code || '') === String(code || '')
    && String(item?.provider || '') === String(provider || ''));
  return String(model?.base_url || '');
}

// Snapshots for every trusted provider of this role (not just the saved one),
// so switching providers after a restart also keeps 연결됨 without re-testing.
function settingsNextAiCaptureHistorySnapshots(role, history = []) {
  (Array.isArray(history) ? history : []).forEach((entry) => {
    const provider = String(entry?.provider || '').trim();
    const code = String(entry?.code || '').trim();
    if (!provider || entry?.trusted !== true) return;
    const direct = provider === 'direct';
    if (!direct && !code) return;
    settingsNextAiState.verifiedSnapshot[settingsNextAiSnapshotKey(role, provider)] = {
      presetCode: direct ? '' : code,
      name: direct ? code : '',
      baseUrl: String(entry?.base_url || '') || settingsNextAiDerivedBaseUrl(role, provider, code),
      apiKey: ''
    };
  });
}

function settingsNextAiCatalog(role) {
  return Array.isArray(settingsNextAiState.presets?.[role === 'chat' ? 'text' : role])
    ? settingsNextAiState.presets[role === 'chat' ? 'text' : role]
    : [];
}

function settingsNextAiProviders(role) {
  const type = role === 'chat' ? 'text' : role;
  const configured = Array.isArray(settingsNextAiState.presets?.providers?.[type])
    ? settingsNextAiState.presets.providers[type] : [];
  return [...new Set([...configured.map((item) => String(item?.id || item || '').trim()), ...settingsNextAiCatalog(role).map((item) => String(item?.provider || '').trim()), 'direct'])].filter(Boolean);
}

function settingsNextAiProviderLabel(role, provider) {
  const type = role === 'chat' ? 'text' : role;
  const configured = Array.isArray(settingsNextAiState.presets?.providers?.[type]) ? settingsNextAiState.presets.providers[type] : [];
  const item = configured.find((candidate) => String(candidate?.id || candidate || '') === provider);
  return String(item?.name || item?.display_name || ({ google: 'Google', openai: 'OpenAI', anthropic: 'Anthropic', kie: 'KIE.ai', direct: '직접 입력' }[provider]) || provider);
}

function settingsNextAiModelLabel(role, provider, code, directName = '') {
  if (String(provider || '') === 'direct') return String(directName || code || '선택 필요');
  const model = settingsNextAiCatalog(role).find((item) => String(item?.provider || '') === String(provider || '')
    && String(item?.code || '') === String(code || ''));
  return String(model?.name || model?.display_name || code || '선택 필요');
}

function settingsNextAiProfile(role, provider) {
  return settingsNextAiState.profiles?.[role]?.[provider] || null;
}

function settingsNextAiDraft(role, provider) {
  return settingsNextAiState.drafts?.[role]?.[provider] || null;
}

function settingsNextAiHasConfiguredKey(role, provider) {
  const entered = settingsNextAiGetField(role, 'apiKey')?.value.trim();
  const activeProvider = settingsNextAiValue(role, 'PROVIDER');
  return Boolean(
    entered
    || settingsNextAiDraft(role, provider)?.apiKey
    || settingsNextAiProfile(role, provider)?.api_key_configured
    || (provider === activeProvider && settingsNextAiState.fields[`${settingsNextAiPrefix(role)}_MODEL_API_KEY_CONFIGURED`])
  );
}

function settingsNextAiCaptureDraft(role, provider) {
  if (!provider) return;
  if (!settingsNextAiState.drafts[role]) settingsNextAiState.drafts[role] = {};
  settingsNextAiState.drafts[role][provider] = settingsNextAiReadRole(role);
}

function settingsNextAiSetApiKeyPresentation(role, provider) {
  const apiKey = settingsNextAiGetField(role, 'apiKey');
  const hint = document.querySelector(`[data-settings-next-ai-fields="${role}"] [data-ai-key-hint]`);
  if (!apiKey || !hint) return;
  const label = settingsNextAiProviderLabel(role, provider);
  const configured = settingsNextAiHasConfiguredKey(role, provider);
  syncSettingsNextSecretRegistration({
    input: apiKey,
    hint,
    configured,
    label: `${label} API Key`,
    emptyPlaceholder: `${label} API Key 입력`,
    emptyHint: `${label} API Key를 입력한 뒤 연결을 확인하세요.`,
    configuredHint: `${label} API Key가 등록되어 있습니다. 변경할 때만 새 값을 입력하세요.`
  });
}

function settingsNextAiFieldMarkup(role) {
  return `<label class="ui-settings-field">공급자<span class="ui-select-shell"><select data-ai-field="provider"></select></span><small aria-hidden="true">&nbsp;</small></label>
    <label class="ui-settings-field" data-ai-preset-wrap>모델<span class="ui-select-shell"><select data-ai-field="presetCode"></select></span><small aria-hidden="true">&nbsp;</small></label>
    <label class="ui-settings-field" data-ai-name-wrap hidden>모델 이름<input data-ai-field="name" type="text" placeholder="예: gpt-4.1-mini"><small>직접 입력 모델의 이름 또는 코드를 입력하세요.</small></label>
    <label class="ui-settings-field" data-ai-base-wrap>Base URL<input data-ai-field="baseUrl" type="url" placeholder="https://api.example.com/v1"><small data-ai-summary></small></label>
    <label class="ui-settings-field">API Key<span class="settings-next-secret-input"><input id="settings-next-ai-${role}-api-key" data-ai-field="apiKey" type="password" autocomplete="new-password" placeholder="선택한 AI 모델의 API Key"><button class="settings-next-icon-button" type="button" data-settings-next-secret-toggle="settings-next-ai-${role}-api-key" aria-label="새 API Key 표시" aria-pressed="false" title="API Key 표시"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg></button></span><small data-ai-key-hint></small></label>`;
}

function settingsNextAiGetField(role, name) {
  return document.querySelector(`[data-settings-next-ai-fields="${role}"] [data-ai-field="${name}"]`);
}

function settingsNextAiRenderRoleFields(role, options = {}) {
  const root = document.querySelector(`[data-settings-next-ai-fields="${role}"]`);
  if (!root) return;
  if (!root.innerHTML) root.innerHTML = settingsNextAiFieldMarkup(role);
  initOpaqueSettingsSecretToggles(root);
  const provider = settingsNextAiGetField(role, 'provider');
  const preset = settingsNextAiGetField(role, 'presetCode');
  const providerValue = options.provider || provider?.value || settingsNextAiValue(role, 'PROVIDER') || 'google';
  const providers = settingsNextAiProviders(role);
  provider.innerHTML = providers.map((id) => `<option value="${id}">${settingsNextAiProviderLabel(role, id)}</option>`).join('');
  provider.value = providers.includes(providerValue) ? providerValue : providers[0];
  provider.dataset.activeProvider = provider.value;
  const direct = provider.value === 'direct';
  const profile = settingsNextAiProfile(role, provider.value);
  const draft = options.restore ? settingsNextAiDraft(role, provider.value) : null;
  const selection = draft || profile || null;
  const models = settingsNextAiCatalog(role).filter((item) => String(item?.provider || '') === provider.value);
  const selected = selection?.code || settingsNextAiValue(role, 'PRESET_CODE');
  preset.innerHTML = models.map((item) => `<option value="${item.code}">${item.name || item.code}</option>`).join('');
  if (models.some((item) => item.code === selected)) preset.value = selected;
  const name = settingsNextAiGetField(role, 'name');
  const baseUrl = settingsNextAiGetField(role, 'baseUrl');
  const apiKey = settingsNextAiGetField(role, 'apiKey');
  apiKey.value = selection?.apiKey || '';
  name.value = selection?.name || settingsNextAiValue(role, 'NAME');
  baseUrl.value = selection?.base_url || settingsNextAiValue(role, 'BASE_URL');
  root.querySelector('[data-ai-preset-wrap]').hidden = direct;
  root.querySelector('[data-ai-name-wrap]').hidden = !direct;
  preset.disabled = direct;
  name.disabled = !direct;
  if (!direct) {
    const model = models.find((item) => item.code === preset.value) || models[0];
    baseUrl.value = provider.value === 'google'
      ? 'https://generativelanguage.googleapis.com/v1beta'
      : String(model?.base_url || '');
    baseUrl.readOnly = true;
    root.querySelector('[data-ai-summary]').textContent = '';
  } else {
    if (baseUrl.value === 'https://generativelanguage.googleapis.com/v1beta') baseUrl.value = '';
    baseUrl.readOnly = false;
    root.querySelector('[data-ai-summary]').textContent = 'OpenAI-compatible Base URL을 입력하세요.';
  }
  settingsNextAiSetApiKeyPresentation(role, provider.value);
}

function settingsNextAiReadRole(role) {
  const provider = settingsNextAiGetField(role, 'provider')?.value || '';
  return {
    provider,
    presetCode: settingsNextAiGetField(role, 'presetCode')?.value || '',
    name: settingsNextAiGetField(role, 'name')?.value || '',
    baseUrl: settingsNextAiGetField(role, 'baseUrl')?.value || '',
    apiKey: settingsNextAiGetField(role, 'apiKey')?.value || ''
  };
}

function settingsNextAiRenderStatuses() {
  ['text', 'image'].forEach((role) => {
    const value = settingsNextAiReadRole(role);
    const configured = Boolean((value.provider === 'direct' ? value.name && value.baseUrl : value.presetCode) && (value.provider === 'direct' || settingsNextAiHasConfiguredKey(role, value.provider)));
    const verified = settingsNextAiState.verification[role] === true;
    settingsNextAiSetText(`settings-next-ai-${role}-readiness`, verified ? '연결됨' : (configured ? '연결 확인 필요' : '설정 필요'));
    const dot = document.getElementById(`settings-next-ai-${role}-readiness-dot`);
    if (dot) dot.dataset.tone = verified ? 'success' : (configured ? 'warning' : 'danger');
    settingsNextAiSetStatus(role, verified ? '연결됨' : (configured ? '확인 필요' : '미설정'), verified ? 'success' : (configured ? 'warning' : 'neutral'));
  });
  const source = document.querySelector('input[name="settings-next-ai-chat-source"]:checked')?.value || 'writing';
  const chat = settingsNextAiReadRole('chat');
  const configured = source === 'writing' || Boolean((chat.provider === 'direct' ? chat.name && chat.baseUrl : chat.presetCode) && (chat.provider === 'direct' || settingsNextAiHasConfiguredKey('chat', chat.provider)));
  const verified = source === 'writing' ? settingsNextAiState.verification.text === true : settingsNextAiState.verification.chat === true;
  settingsNextAiSetText('settings-next-ai-chat-readiness', source === 'writing' ? '글쓰기 모델 사용' : (verified ? '연결됨' : (configured ? '연결 확인 필요' : '설정 필요')));
  const dot = document.getElementById('settings-next-ai-chat-readiness-dot');
  if (dot) dot.dataset.tone = verified ? 'success' : (configured ? 'warning' : 'neutral');
  settingsNextAiSetStatus('chat', source === 'writing' ? '글쓰기 모델 사용' : (verified ? '연결됨' : (configured ? '확인 필요' : '미설정')), verified ? 'success' : (configured ? 'warning' : 'neutral'));
}

function settingsNextAiSyncChatSource() {
  const source = document.querySelector('input[name="settings-next-ai-chat-source"]:checked')?.value || 'writing';
  const fields = document.querySelector('[data-settings-next-ai-fields="chat"]');
  if (fields) fields.hidden = source !== 'dedicated';
  const writing = settingsNextAiReadRole('text');
  const writingLabel = settingsNextAiModelLabel('text', writing.provider, writing.presetCode, writing.name);
  settingsNextAiSetText('settings-next-ai-chat-inherited', source === 'writing'
    ? `현재 글쓰기 모델 · ${writingLabel}`
    : '글쓰기 모델과 별도로 설정합니다.');
  settingsNextAiRenderStatuses();
}

function settingsNextAiValidateValues(role, selected, selectedRole) {
  if (!(selected.provider === 'direct' ? selected.name && selected.baseUrl : selected.presetCode)
    || (selected.provider !== 'direct' && !settingsNextAiHasConfiguredKey(selectedRole, selected.provider))) {
    settingsNextAiSetFeedback(role, '모델과 필요한 API Key를 입력해 주세요.', 'danger');
    return false;
  }
  return true;
}

// Save-only path (no connection test): used by "save and proceed" flows so a
// quit/navigation save never triggers paid model checks.
async function settingsNextPersistAiRoleValues(role, values) {
  const saved = await postJson('/api/v1/settings/ai-roles', { scope: role, values });
  settingsNextAiState.fields = { ...(saved?.fields || settingsNextAiState.fields) };
  settingsNextAiState.profiles = saved?.aiProviderProfiles || settingsNextAiState.profiles;
  delete settingsNextAiState.drafts?.[role]?.[values.provider];
  settingsNextAiRenderRoleFields(role, { provider: values.provider, restore: true });
  settingsNextClearScopeDirty(`ai-${role}`);
  return true;
}

async function settingsNextPersistAiRole(role, values) {
  const source = role === 'chat'
    ? (String(values.CHAT_MODEL_SOURCE || '') || document.querySelector('input[name="settings-next-ai-chat-source"]:checked')?.value || 'writing')
    : '';
  const selected = role === 'chat' && source === 'writing' ? settingsNextAiReadRole('text') : values;
  const selectedRole = role === 'chat' && source === 'writing' ? 'text' : role;
  if (!settingsNextAiValidateValues(role, selected, selectedRole)) return false;
  if (settingsNextAiState.busy.has(role)) return false;
  await settingsNextPersistAiRoleValues(role, values);
  return true;
}

async function settingsNextAiSubmit(role, event) {
  event.preventDefault();
  if (settingsNextAiState.busy.has(role)) return;
  const source = role === 'chat' ? (document.querySelector('input[name="settings-next-ai-chat-source"]:checked')?.value || 'writing') : '';
  const values = settingsNextAiReadRole(role);
  if (role === 'chat') values.CHAT_MODEL_SOURCE = source;
  const selected = role === 'chat' && source === 'writing' ? settingsNextAiReadRole('text') : values;
  const selectedRole = role === 'chat' && source === 'writing' ? 'text' : role;
  if (!settingsNextAiValidateValues(role, selected, selectedRole)) return;
  settingsNextAiState.busy.add(role);
  document.getElementById(`settings-next-ai-${role}-form`)?.setAttribute('aria-busy', 'true');
  const button = document.querySelector(`[data-settings-next-ai-action="${role}"]`);
  if (button) { button.disabled = true; button.textContent = '연결 확인 중...'; }
  settingsNextAiSetFeedback(role, '');
  try {
    await settingsNextPersistAiRoleValues(role, values);
    const result = await postJson('/api/v1/settings/ai-roles/test', { scope: role });
    settingsNextAiState.verification[role] = Boolean(result);
    if (result) settingsNextAiCaptureVerifiedSnapshot(selectedRole, selected);
    settingsNextAiSetFeedback(role, '');
    settingsNextClearScopeDirty(`ai-${role}`);
  } catch (error) {
    settingsNextAiState.verification[role] = false;
    settingsNextAiSetFeedback(role, error.message || '연결을 확인하지 못했습니다.', 'danger');
  } finally {
    settingsNextAiState.busy.delete(role);
    document.getElementById(`settings-next-ai-${role}-form`)?.setAttribute('aria-busy', 'false');
    if (button) { button.disabled = false; button.textContent = '연결 확인'; }
    settingsNextAiRenderStatuses();
  }
}

function loadSettingsNextAi(data = {}) {
  settingsNextAiState.fields = { ...(data?.fields || {}) };
  settingsNextAiState.presets = data?.aiPresets || settingsNextAiState.presets;
  settingsNextAiState.profiles = data?.aiProviderProfiles || settingsNextAiState.profiles;
  const serverVerification = data?.verification || {};
  ['text', 'image', 'chat'].forEach((role) => {
    if (serverVerification[role]?.trusted === true) settingsNextAiState.verification[role] = true;
  });
  ['text', 'image', 'chat'].forEach((role) => settingsNextClearScopeDirty(`ai-${role}`));
  ['text', 'image', 'chat'].forEach(settingsNextAiRenderRoleFields);
  // Snapshot after render: derived values (e.g. preset base URLs) must match
  // what the compare reads from the DOM later. apiKey stays '' (untouched).
  ['text', 'image', 'chat'].forEach((role) => {
    settingsNextAiCaptureHistorySnapshots(role, serverVerification[role]?.history);
    if (settingsNextAiState.verification[role] === true && serverVerification[role]?.trusted === true) {
      settingsNextAiCaptureVerifiedSnapshot(role, { ...settingsNextAiReadRole(role), apiKey: '' });
    }
  });
  const source = String(settingsNextAiState.fields.CHAT_MODEL_SOURCE || 'writing');
  const radio = document.querySelector(`input[name="settings-next-ai-chat-source"][value="${source}"]`);
  if (radio) radio.checked = true;
  settingsNextAiSyncChatSource();
}

function initSettingsNextAi() {
  if (settingsNextAiState.bound) return;
  document.querySelectorAll('[data-settings-next-ai-role]').forEach((form) => form.addEventListener('submit', (event) => void settingsNextAiSubmit(form.dataset.settingsNextAiRole, event)));
  document.querySelectorAll('[data-settings-next-ai-fields]').forEach((root) => {
    const invalidate = (event) => {
      if (!event.target.matches('[data-ai-field]')) return;
      const role = root.dataset.settingsNextAiFields;
      settingsNextMarkScopeDirty(`ai-${role}`);
      if (event.type === 'change' && event.target.matches('[data-ai-field="provider"]')) {
        settingsNextAiCaptureDraft(role, event.target.dataset.activeProvider);
        settingsNextAiRenderRoleFields(role, { provider: event.target.value, restore: true });
      }
      if (event.target.matches('[data-ai-field="apiKey"]')) settingsNextAiSetApiKeyPresentation(role, settingsNextAiGetField(role, 'provider')?.value || '');
      settingsNextAiInvalidateVerification(role);
      if (role === 'text' && (document.querySelector('input[name="settings-next-ai-chat-source"]:checked')?.value || 'writing') === 'writing') {
        settingsNextAiSyncChatSource();
      } else {
        settingsNextAiRenderStatuses();
      }
    };
    root.addEventListener('input', invalidate);
    root.addEventListener('change', invalidate);
  });
  document.querySelectorAll('input[name="settings-next-ai-chat-source"]').forEach((input) => input.addEventListener('change', () => {
    settingsNextMarkScopeDirty('ai-chat');
    settingsNextAiInvalidateVerification('chat');
    settingsNextAiSyncChatSource();
  }));
  settingsNextAiState.bound = true;
}
