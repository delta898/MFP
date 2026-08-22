function markSettingsMajorPendingChanges(pending = true) {
  settingsMajorHasPendingBasicChanges = Boolean(pending);
  updateSettingsMajorSaveUi();
}

function updateSettingsMajorSaveUi() {
  const saveBtns = document.querySelectorAll('#settings-major-save-btn, .settings-major-save-btn');
  const statusEls = Array.from(document.querySelectorAll('.settings-major-save-status'));
  const isDirty = settingsMajorHasPendingBasicChanges === true;

  saveBtns.forEach((btn) => {
    btn.disabled = !isDirty || settingsMajorSaveInFlight;
  });

  if (statusEls.length === 0) return;
  if (settingsMajorSaveInFlight) {
    statusEls.forEach((statusEl) => {
      statusEl.textContent = '저장 중...';
      statusEl.style.color = 'var(--text-muted)';
    });
    return;
  }
  if (isDirty) {
    statusEls.forEach((statusEl) => {
      statusEl.textContent = '저장되지 않은 변경사항';
      statusEl.style.color = 'var(--warning, #d97706)';
    });
    return;
  }
  statusEls.forEach((statusEl) => {
    statusEl.textContent = '저장됨';
    statusEl.style.color = 'var(--success, #16a34a)';
  });
}

function syncScopedMajorSaveActions() {
  const blogSaveActionsEl = document.getElementById('blog-major-save-actions');
  if (blogSaveActionsEl) {
    const shouldShow = ['collect', 'auto'].includes(String(blogActiveTab || ''));
    blogSaveActionsEl.hidden = !shouldShow;
    blogSaveActionsEl.style.display = shouldShow ? 'inline-flex' : 'none';
  }

  const shoppingSaveActionsEl = document.getElementById('shopping-major-save-actions');
  if (shoppingSaveActionsEl) {
    const shouldShow = String(shoppingActiveTab || '') === 'auto';
    shoppingSaveActionsEl.hidden = !shouldShow;
    shoppingSaveActionsEl.style.display = shouldShow ? 'inline-flex' : 'none';
  }
}

function setSettingsMajorResultText(message) {
  const resultEls = document.querySelectorAll('.settings-major-result');
  resultEls.forEach(el => el.textContent = String(message || ''));
}

function stopSettingsTypingPreview() {
  if (settingsTypingPreviewTimer) {
    clearTimeout(settingsTypingPreviewTimer);
    settingsTypingPreviewTimer = null;
  }
}

function setSettingsTypingPreviewMeta(message) {
  const metaEl = document.getElementById('settings-typing-preview-meta');
  if (!metaEl) return;
  metaEl.textContent = String(message || '');
}

function getSettingsTypingPreviewDelay(speedKey) {
  const key = String(speedKey || '').trim().toUpperCase();
  const base = SETTINGS_TYPING_PREVIEW_DELAY[key] || SETTINGS_TYPING_PREVIEW_DELAY.NORMAL;
  const jitter = Math.floor(base * 0.35);
  const offset = Math.floor(Math.random() * (jitter * 2 + 1)) - jitter;
  return Math.max(1, base + offset);
}

function getSettingsTypingPreviewSourceText() {
  const inputEl = document.getElementById('settings-typing-preview-input');
  const raw = String(inputEl?.value || '').trim();
  if (raw) return raw;
  const placeholder = String(inputEl?.placeholder || '').trim();
  if (placeholder) return placeholder;
  return SETTINGS_TYPING_PREVIEW_DEFAULT_TEXT;
}

function playSettingsTypingPreview() {
  const targetEl = document.getElementById('settings-typing-preview-text');
  const speedEl = document.getElementById('settings-typing-speed');
  const sampleText = getSettingsTypingPreviewSourceText();
  if (!targetEl || !speedEl) return;
  if (!sampleText) {
    targetEl.textContent = '미리보기 문구를 입력해 주세요.';
    setSettingsTypingPreviewMeta('자동 재생: 대기');
    stopSettingsTypingPreview();
    return;
  }

  stopSettingsTypingPreview();
  const runId = ++settingsTypingPreviewRunId;
  const speedKey = String(speedEl.value || 'NORMAL').trim().toUpperCase();
  let cursor = 0;
  let repeatIndex = 1;
  targetEl.textContent = '';
  setSettingsTypingPreviewMeta(`자동 재생: ${repeatIndex}/${SETTINGS_TYPING_PREVIEW_REPEAT_COUNT}`);

  const tick = () => {
    if (runId !== settingsTypingPreviewRunId) return;
    if (cursor >= sampleText.length) {
      targetEl.textContent = sampleText;
      if (repeatIndex >= SETTINGS_TYPING_PREVIEW_REPEAT_COUNT) {
        setSettingsTypingPreviewMeta(`자동 재생 완료: ${SETTINGS_TYPING_PREVIEW_REPEAT_COUNT}회`);
        stopSettingsTypingPreview();
        return;
      }
      repeatIndex += 1;
      cursor = 0;
      setSettingsTypingPreviewMeta(`자동 재생: ${repeatIndex}/${SETTINGS_TYPING_PREVIEW_REPEAT_COUNT}`);
      settingsTypingPreviewTimer = setTimeout(tick, 420);
      return;
    }
    cursor += 1;
    targetEl.textContent = `${sampleText.slice(0, cursor)}▌`;
    settingsTypingPreviewTimer = setTimeout(tick, getSettingsTypingPreviewDelay(speedKey));
  };

  settingsTypingPreviewTimer = setTimeout(tick, 120);
}

function scheduleSettingsMajorAutoSave({ immediate = false } = {}) {
  if (settingsMajorApplyingForm || !settingsMajorLoadedOnce) return;
  const currentSignature = buildSettingsMajorBasicSignature();
  const isDirty = currentSignature !== settingsMajorLastSavedSignature;
  markSettingsMajorPendingChanges(isDirty);
  if (!isDirty) return;
  setSettingsMajorResultText('저장되지 않은 변경사항이 있습니다.');
}

async function loadSettingsMajor({ force = false, skipPendingConfirm = false } = {}) {
  const canReload = await shouldProceedWithMajorSettingsReload({
    force,
    skipPendingConfirm,
    contextLabel: '설정 화면'
  });
  if (!canReload) return false;

  const refreshBtns = document.querySelectorAll('.settings-major-refresh-btn');
  const resultEls = document.querySelectorAll('.settings-major-result');

  refreshBtns.forEach(btn => btn.disabled = true);
  updateSettingsStatus('.settings-major-result', '불러오는 중...', 'info');
  try {
    const data = await fetchJson('/api/v1/settings/major');
    applySettingsMajorToForm(data);
    await loadSettingsSnsRuntimeStatus();
    updateSettingsStatus('.settings-major-result', `불러오기 완료: ${data.configPath || '-'}`, 'success');
    return true;
  } catch (e) {
    updateSettingsStatus('.settings-major-result', `오류: ${e.message}`, 'error');
    return false;
  } finally {
    refreshBtns.forEach(btn => btn.disabled = false);
  }
}

function buildSettingsMajorPayload() {
  const imageSources = {};
  SETTINGS_SHOPPING_SLOT_ORDER.forEach((slot) => {
    const meta = SETTINGS_SHOPPING_SLOT_META[slot];
    const domValue = (document.getElementById(`settings-image-source-${slot}`)?.value || '').trim();
    // DOM input이 비어있을 수 있음 (쇼핑 설정 탭이 활성화되지 않으면 renderSettingsShoppingImageSlot이 값을 채우지 않음)
    // 그 경우 메모리에 있는 슬롯 데이터를 사용하여 기존 값이 유실되지 않도록 함
    const memoryValue = String(settingsShoppingImageSlots?.[slot]?.source || '').trim();
    imageSources[meta.key] = domValue || memoryValue;
  });

  const basic = getSettingsMajorBasicValuesFromDom();

  return {
    ...basic,
    ...imageSources
  };
}

