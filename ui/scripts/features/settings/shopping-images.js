function revokeSettingsShoppingObjectUrl(slot) {
  const current = settingsShoppingImageObjectUrls[slot];
  if (current) {
    URL.revokeObjectURL(current);
    delete settingsShoppingImageObjectUrls[slot];
  }
}

function buildSettingsShoppingPreviewUrl(slot, source) {
  const value = String(source || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const query = new URLSearchParams({
    slot,
    source: value,
    _t: String(Date.now())
  });
  return `/api/v1/settings/shopping-image/preview?${query.toString()}`;
}

function clearStagedSettingsShoppingImage(slot) {
  delete settingsShoppingImageFileState[slot];
  revokeSettingsShoppingObjectUrl(slot);
  const fileInput = document.getElementById(`settings-image-file-${slot}`);
  if (fileInput) fileInput.value = '';
}

function renderSettingsShoppingImageSlot(slot) {
  const slotData = settingsShoppingImageSlots[slot] || {};
  const sourceInput = document.getElementById(`settings-image-source-${slot}`);
  const previewWrap = document.getElementById(`settings-image-preview-wrap-${slot}`);
  const previewImg = document.getElementById(`settings-image-preview-${slot}`);
  const metaEl = document.getElementById(`settings-image-meta-${slot}`);
  if (!sourceInput || !previewWrap || !previewImg || !metaEl) return;

  let source = String(sourceInput.value || '').trim();
  if (!source) source = String(slotData.source || '').trim();
  sourceInput.value = source;

  const stagedFile = settingsShoppingImageFileState[slot];
  if (stagedFile) {
    revokeSettingsShoppingObjectUrl(slot);
    const objectUrl = URL.createObjectURL(stagedFile);
    settingsShoppingImageObjectUrls[slot] = objectUrl;
    previewImg.src = objectUrl;
    previewWrap.classList.add('has-image');
    metaEl.textContent = `선택됨(저장 시 반영): ${stagedFile.name}`;
    return;
  }

  revokeSettingsShoppingObjectUrl(slot);
  const previewUrl = buildSettingsShoppingPreviewUrl(slot, source);
  if (previewUrl) {
    const modeText = /^https?:\/\//i.test(source) ? '원격 URL' : '로컬 파일';
    metaEl.textContent = `현재 이미지: ${modeText}`;
    previewImg.onload = () => {
      previewWrap.classList.add('has-image');
    };
    previewImg.onerror = () => {
      previewWrap.classList.remove('has-image');
      metaEl.textContent = '현재 이미지: 미리보기를 불러오지 못했습니다.';
    };
    previewWrap.classList.remove('has-image');
    previewImg.src = previewUrl;
  } else {
    previewImg.onload = null;
    previewImg.onerror = null;
    previewImg.removeAttribute('src');
    previewWrap.classList.remove('has-image');
    metaEl.textContent = '현재 이미지: 설정 없음';
  }
}

function renderSettingsShoppingImageSlots() {
  SETTINGS_SHOPPING_SLOT_ORDER.forEach((slot) => {
    const sourceInput = document.getElementById(`settings-image-source-${slot}`);
    const source = String(settingsShoppingImageSlots?.[slot]?.source || '').trim();
    if (sourceInput) sourceInput.value = source;
    renderSettingsShoppingImageSlot(slot);
  });
}

function restoreSettingsShoppingDefault(slot) {
  const meta = SETTINGS_SHOPPING_SLOT_META[slot];
  if (!meta) return;
  clearStagedSettingsShoppingImage(slot);
  const source = String(settingsShoppingImageDefaults?.[meta.key] || '').trim();
  const sourceInput = document.getElementById(`settings-image-source-${slot}`);
  if (sourceInput) sourceInput.value = source;
  if (!settingsShoppingImageSlots[slot]) settingsShoppingImageSlots[slot] = {};
  settingsShoppingImageSlots[slot].source = source;
  renderSettingsShoppingImageSlot(slot);
}

function clearSettingsShoppingOptional(slot) {
  clearStagedSettingsShoppingImage(slot);
  const sourceInput = document.getElementById(`settings-image-source-${slot}`);
  if (sourceInput) sourceInput.value = '';
  if (!settingsShoppingImageSlots[slot]) settingsShoppingImageSlots[slot] = {};
  settingsShoppingImageSlots[slot].source = '';
  renderSettingsShoppingImageSlot(slot);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('파일이 선택되지 않았습니다.'));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

async function uploadShoppingImageFromSettings(slot, file) {
  if (!file) throw new Error('업로드할 이미지 파일을 먼저 선택해 주세요.');
  const dataUrl = await readFileAsDataUrl(file);
  return postJson('/api/v1/settings/shopping-image', {
    slot,
    fileName: file.name,
    mimeType: file.type || '',
    base64Data: dataUrl
  });
}

async function uploadPendingSettingsShoppingImages(resultEls) {
  for (const slot of SETTINGS_SHOPPING_SLOT_ORDER) {
    const file = settingsShoppingImageFileState[slot];
    if (!file) continue;
    const label = SETTINGS_SHOPPING_SLOT_META[slot]?.label || slot;
    if (resultEls) resultEls.forEach(el => el.textContent = `이미지 업로드 중... (${label}: ${file.name})`);
    const data = await uploadShoppingImageFromSettings(slot, file);
    const sourceValue = String(data?.value || '').trim();
    const sourceInput = document.getElementById(`settings-image-source-${slot}`);
    if (sourceInput) sourceInput.value = sourceValue;
    if (!settingsShoppingImageSlots[slot]) settingsShoppingImageSlots[slot] = {};
    settingsShoppingImageSlots[slot].source = sourceValue;
    clearStagedSettingsShoppingImage(slot);
  }
}

function ensureRequiredSettingsShoppingImages() {
  // 슬롯 데이터가 아직 로드되지 않은 경우 검증을 건너뜁니다
  if (!settingsShoppingImageSlots || Object.keys(settingsShoppingImageSlots).length === 0) return;
  for (const slot of SETTINGS_SHOPPING_SLOT_ORDER) {
    const meta = SETTINGS_SHOPPING_SLOT_META[slot];
    if (!meta?.required) continue;
    // DOM input 대신 메모리 상태로 검사 (렌더링 여부와 무관하게 항상 정확함)
    const slotSource = String(settingsShoppingImageSlots?.[slot]?.source || '').trim();
    const hasStagedFile = !!settingsShoppingImageFileState?.[slot];
    if (!slotSource && !hasStagedFile) {
      throw new Error(`${meta.label}는 필수입니다. 이미지를 선택하거나 기본 이미지로 복원해 주세요.`);
    }
  }
}

async function saveSettingsMajor({ mode = 'manual' } = {}) {
  const saveBtns = document.querySelectorAll('#settings-major-save-btn, .settings-major-save-btn');
  const resultEls = document.querySelectorAll('.settings-major-result');
  let savedResponse = null;

  if (settingsMajorSaveInFlight) {
    return;
  }

  settingsMajorSaveInFlight = true;
  updateSettingsMajorSaveUi();
  console.log(`[Settings] Save starting (mode: ${mode})`);

  try {
    updateSettingsStatus('.settings-major-result', '주요 설정 저장 중...', 'info');

    await uploadPendingSettingsShoppingImages(resultEls);
    ensureRequiredSettingsShoppingImages();

    const payload = buildSettingsMajorPayload();
    const data = await postJson('/api/v1/settings/major', payload);
    savedResponse = data;
    const warningMessages = Array.isArray(data?.warnings)
      ? data.warnings.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const warningSuffix = warningMessages.length > 0
      ? `\n확인 필요: ${warningMessages.join(' / ')}`
      : '';

    console.log('[Settings] Save successful');
    applySettingsMajorToForm(data);
    commitSettingsMajorSavedState();
    uiSheetsReady = false;
    invalidateWpCategoryCache();

    if (data.restarting) {
      updateSettingsStatus(
        '.settings-major-result',
        `${data.message || '주요 설정 저장 완료'}\n주소/포트 변경으로 인해 서버를 재시작 중입니다... 새 주소로 이동합니다.${warningSuffix}`,
        'success'
      );
      if (warningMessages.length > 0) {
        showUiToast({
          level: 'warn',
          title: '설정 저장 후 확인 필요',
          message: warningMessages.join(' / '),
          dedupeKey: 'settings-major-save-warnings',
          timeoutMs: 10000
        });
      }
      setTimeout(() => {
        window.location.href = `http://${data.newHost === '0.0.0.0' ? '127.0.0.1' : data.newHost}:${data.newPort}`;
      }, 1500);
      return;
    }

    const mcpStatusLine = data?.remoteMcpStatus?.running
      ? `\nMCP: ${data.remoteMcpStatus.endpoint || '-'}`
      : (data?.remoteMcpStatus?.enabled === false ? '\nMCP: 비활성화' : '');
    updateSettingsStatus(
      '.settings-major-result',
      `${data.message || '주요 설정 저장 완료'}\n${data.configPath || '-'}${mcpStatusLine}${warningSuffix}`,
      'success'
    );
    if (warningMessages.length > 0) {
      showUiToast({
        level: 'warn',
        title: '설정 저장 후 확인 필요',
        message: warningMessages.join(' / '),
        dedupeKey: 'settings-major-save-warnings',
        timeoutMs: 10000
      });
    }
    try {
      await Promise.all([loadConfigStatus(), loadDashboard()]);
      await loadSettingsSnsRuntimeStatus();
      if (uiConfigReady) {
        await ensureSheetsPreflightUi({ force: true, silent: true });
      }
      commitSettingsMajorSavedState();
    } catch (refreshError) {
      console.warn('[Settings] Post-save refresh failed:', refreshError);
      updateSettingsStatus(
        '.settings-major-result',
        `${data.message || '주요 설정 저장 완료'}\n일부 화면 갱신에 실패했습니다. 새로고침 후 다시 확인해 주세요.${warningSuffix}`,
        'success'
      );
      showUiToast({
        level: 'warn',
        title: '설정 저장 후 확인 필요',
        message: '설정은 저장됐지만 일부 화면 갱신에 실패했습니다. 새로고침 후 다시 확인해 주세요.',
        dedupeKey: 'settings-major-refresh-failed',
        timeoutMs: 9000
      });
    }
  } catch (e) {
    console.error('[Settings] Save failed:', e);
    if (savedResponse) {
      commitSettingsMajorSavedState();
      updateSettingsStatus(
        '.settings-major-result',
        `${savedResponse.message || '주요 설정 저장 완료'}\n일부 후속 작업에 실패했습니다: ${e.message}`,
        'success'
      );
      showUiToast({
        level: 'warn',
        title: '설정 저장 후 확인 필요',
        message: `설정은 저장됐지만 후속 작업 중 오류가 있었습니다: ${e.message}`,
        dedupeKey: 'settings-major-post-save-failed',
        timeoutMs: 9000
      });
    } else {
      updateSettingsStatus('.settings-major-result', `오류: ${e.message}`, 'error');
      showUiToast({
        level: 'error',
        title: '설정 저장 실패',
        message: `설정을 저장하지 못했습니다: ${e.message}`,
        dedupeKey: 'settings-major-save-failed',
        timeoutMs: 10000
      });
    }
  } finally {
    settingsMajorSaveInFlight = false;
    updateSettingsMajorSaveUi();
  }
}

