const SETTINGS_SECRET_FIELD_IDS = [
  'settings-wordpress-app-password',
  'settings-notify-telegram-bot-token',
  'settings-notify-bitly-token',
  'settings-text-model-api-key',
  'settings-image-model-api-key',
  'settings-chat-model-api-key',
  'settings-notify-slack-webhook-url',
  'settings-buffer-api-key'
];

function maskPartialSecret(value) {
  const raw = String(value || '');
  if (!raw) return '';
  if (raw.length <= 8) return '•'.repeat(raw.length);

  const headCount = Math.min(5, Math.max(3, Math.floor(raw.length * 0.12)));
  const tailCount = Math.min(4, Math.max(2, Math.floor(raw.length * 0.08)));
  const maskCount = Math.max(4, raw.length - headCount - tailCount);

  return `${raw.slice(0, headCount)}${'•'.repeat(maskCount)}${raw.slice(raw.length - tailCount)}`;
}

function isManagedSettingsSecretField(el) {
  return Boolean(el?.dataset?.secretManaged === 'true');
}

function getManagedSettingsSecretValue(el) {
  if (!el) return '';
  return String(el.dataset.secretRaw ?? el.value ?? '');
}

function syncManagedSettingsSecretDisplay(el) {
  if (!el) return;
  const raw = getManagedSettingsSecretValue(el);
  const isFocused = el.dataset.secretFocused === 'true';
  el.type = 'text';
  el.autocomplete = 'off';
  el.spellcheck = false;
  el.value = isFocused ? raw : maskPartialSecret(raw);
}

function setManagedSettingsSecretValue(el, value = '') {
  if (!el) return;
  el.dataset.secretRaw = String(value ?? '');
  syncManagedSettingsSecretDisplay(el);
}

function bindManagedSettingsSecretField(el) {
  if (!el || isManagedSettingsSecretField(el)) return;

  el.dataset.secretManaged = 'true';
  el.dataset.secretFocused = 'false';
  el.dataset.secretRaw = String(el.value || '');
  syncManagedSettingsSecretDisplay(el);

  el.addEventListener('focus', () => {
    el.dataset.secretFocused = 'true';
    syncManagedSettingsSecretDisplay(el);
    requestAnimationFrame(() => {
      try { el.select(); } catch (_) {}
    });
  });

  el.addEventListener('input', () => {
    el.dataset.secretRaw = String(el.value || '');
  });

  el.addEventListener('blur', () => {
    el.dataset.secretFocused = 'false';
    el.dataset.secretRaw = String(el.value || '');
    syncManagedSettingsSecretDisplay(el);
  });
}

function initManagedSettingsSecretFields() {
  [...SETTINGS_SECRET_FIELD_IDS.map((id) => document.getElementById(id)), ...document.querySelectorAll('[data-managed-settings-secret]')]
    .filter(Boolean)
    .forEach(bindManagedSettingsSecretField);
}

function getSettingsInputValue(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  return isManagedSettingsSecretField(el)
    ? getManagedSettingsSecretValue(el)
    : String(el.value || '');
}

function initOpaqueSettingsSecretToggles(root = document) {
  if (!root) return;
  root.querySelectorAll('[data-settings-next-secret-toggle]').forEach((button) => {
    if (button.dataset.secretToggleBound === 'true') return;
    button.dataset.secretLabel = String(button.getAttribute('aria-label') || button.title || '비밀정보')
      .replace(/^새\s*/, '')
      .replace(/\s+(표시|숨기기)$/, '');
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.settingsNextSecretToggle);
      if (!input) return;
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      button.setAttribute('aria-pressed', visible ? 'true' : 'false');
      const subject = button.dataset.secretLabel || '비밀정보';
      button.title = `${subject} ${visible ? '숨기기' : '표시'}`;
      button.setAttribute('aria-label', `새 ${subject} ${visible ? '숨기기' : '표시'}`);
    });
    button.dataset.secretToggleBound = 'true';
  });
}

function syncSettingsNextSecretRegistration({ input, hint, configured, label, emptyPlaceholder, emptyHint, configuredHint, suffix = '' } = {}) {
  if (!input) return;
  const subject = String(label || '비밀정보').trim();
  const configuredState = configured === true;
  input.placeholder = configuredState ? `${subject} 등록됨` : String(emptyPlaceholder || `${subject} 입력`);
  if (!hint) return;
  hint.textContent = configuredState
    ? `${String(configuredHint || `${subject}이 등록되어 있습니다. 변경할 때만 새 값을 입력하세요.`)}${suffix}`
    : `${String(emptyHint || `${subject}을 입력한 뒤 연결을 확인하세요.`)}${suffix}`;
}

function parsePositiveInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function formatNextRunText(nextRunAt) {
  const raw = String(nextRunAt || '').trim();
  if (!raw) return '-';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '-';
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 0) return '곧 실행';
  const totalMin = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}시간 ${m}분 후`;
}

function formatDateTimeAbsolute(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}시 ${pad(d.getMinutes())}분`;
}

function formatDashboardActivityTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseBoolLike(value) {
  if (typeof value === 'boolean') return value;
  const raw = String(value ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'y' || raw === 'on';
}
