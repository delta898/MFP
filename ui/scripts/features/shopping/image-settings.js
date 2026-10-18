const SHOPPING_IMAGE_SETTINGS_SLOTS = [
  { slot: 'ftc', key: 'FTC_DISCLOSURE_IMAGE_URL', label: '공정위 이미지', required: true },
  { slot: 'cta1', key: 'SHOPPING_CTA_IMAGE_URL1', label: '구매 독려 이미지 1', required: true },
  { slot: 'cta2', key: 'SHOPPING_CTA_IMAGE_URL2', label: '구매 독려 이미지 2', required: false },
  { slot: 'cta3', key: 'SHOPPING_CTA_IMAGE_URL3', label: '구매 독려 이미지 3', required: false }
];

const shoppingImageSettingsState = {
  initialized: false,
  loaded: false,
  loading: false,
  saving: false,
  sources: {},
  stagedFiles: {},
  objectUrls: {},
  defaults: {}
};

function shoppingImageSettingsMeta(slot) {
  return SHOPPING_IMAGE_SETTINGS_SLOTS.find((item) => item.slot === slot) || null;
}

function shoppingImageSettingsRoot(slot) {
  return document.querySelector(`[data-shopping-image-slot="${slot}"]`);
}

function shoppingImageSettingsPreviewUrl(slot, source) {
  const value = String(source || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const query = new URLSearchParams({ slot, source: value, _t: String(Date.now()) });
  return `/api/v1/settings/shopping-image/preview?${query.toString()}`;
}

function shoppingImageSettingsSourceLabel(slot, source) {
  const value = String(source || '').trim();
  if (!value) return '설정 없음';
  const fallback = String(shoppingImageSettingsState.defaults[slot] || '').trim();
  if (fallback && value === fallback) return '기본값 사용 중';
  if (/^https?:\/\//i.test(value)) return value;
  return value.split('/').pop() || value;
}

function setShoppingImageSettingsFeedback(message) {
  const feedback = document.getElementById('shopping-image-feedback');
  if (feedback) feedback.textContent = String(message || '');
}

function updateShoppingImageSettingsSummary() {
  const summary = document.getElementById('shopping-quick-image-summary');
  if (!summary) return;
  const configured = SHOPPING_IMAGE_SETTINGS_SLOTS.filter((item) => {
    if (shoppingImageSettingsState.stagedFiles[item.slot]) return true;
    return Boolean(String(shoppingImageSettingsState.sources[item.slot] || '').trim());
  }).length;
  summary.textContent = `이미지 4종 중 ${configured}종 설정`;
}

function renderShoppingImageSettingsSlot(slot) {
  const root = shoppingImageSettingsRoot(slot);
  if (!root) return;
  const meta = shoppingImageSettingsMeta(slot);
  const previewWrap = root.querySelector('[data-shopping-image-preview-wrap]');
  const previewImg = root.querySelector('[data-shopping-image-preview]');
  const metaEl = root.querySelector('[data-shopping-image-meta]');
  if (!previewWrap || !previewImg || !metaEl) return;

  const stagedFile = shoppingImageSettingsState.stagedFiles[slot];
  if (stagedFile) {
    const previous = shoppingImageSettingsState.objectUrls[slot];
    if (previous) URL.revokeObjectURL(previous);
    const objectUrl = URL.createObjectURL(stagedFile);
    shoppingImageSettingsState.objectUrls[slot] = objectUrl;
    previewImg.onload = () => previewWrap.classList.add('has-image');
    previewImg.onerror = null;
    previewImg.src = objectUrl;
    previewWrap.classList.add('has-image');
    metaEl.textContent = `선택됨(저장 시 반영): ${stagedFile.name}`;
    updateShoppingImageSettingsSummary();
    return;
  }

  const previous = shoppingImageSettingsState.objectUrls[slot];
  if (previous) {
    URL.revokeObjectURL(previous);
    delete shoppingImageSettingsState.objectUrls[slot];
  }
  const source = String(shoppingImageSettingsState.sources[slot] || '').trim();
  const previewUrl = shoppingImageSettingsPreviewUrl(slot, source);
  if (previewUrl) {
    metaEl.textContent = shoppingImageSettingsSourceLabel(slot, source);
    previewImg.onload = () => previewWrap.classList.add('has-image');
    previewImg.onerror = () => {
      previewWrap.classList.remove('has-image');
      metaEl.textContent = '미리보기를 불러오지 못했습니다.';
    };
    previewWrap.classList.remove('has-image');
    previewImg.src = previewUrl;
  } else {
    previewImg.onload = null;
    previewImg.onerror = null;
    previewImg.removeAttribute('src');
    previewWrap.classList.remove('has-image');
    metaEl.textContent = '설정 없음';
  }
  updateShoppingImageSettingsSummary();
}

function renderShoppingImageSettingsSlots() {
  SHOPPING_IMAGE_SETTINGS_SLOTS.forEach((item) => renderShoppingImageSettingsSlot(item.slot));
}

function clearStagedShoppingImageSettingsFile(slot) {
  delete shoppingImageSettingsState.stagedFiles[slot];
  const previous = shoppingImageSettingsState.objectUrls[slot];
  if (previous) {
    URL.revokeObjectURL(previous);
    delete shoppingImageSettingsState.objectUrls[slot];
  }
  const root = shoppingImageSettingsRoot(slot);
  const fileInput = root?.querySelector('[data-shopping-image-file]');
  if (fileInput) fileInput.value = '';
}

function readShoppingImageSettingsFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('업로드할 이미지 파일을 먼저 선택해 주세요.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

async function loadShoppingImageSettings({ force = false } = {}) {
  if (shoppingImageSettingsState.loading) return;
  if (shoppingImageSettingsState.loaded && !force) return;
  shoppingImageSettingsState.loading = true;
  setShoppingImageSettingsFeedback('이미지 설정을 불러오는 중입니다.');
  try {
    const data = await fetchJson('/api/v1/settings/major');
    const slots = data?.shoppingImageSlots && typeof data.shoppingImageSlots === 'object'
      ? data.shoppingImageSlots
      : {};
    SHOPPING_IMAGE_SETTINGS_SLOTS.forEach((item) => {
      const remote = slots[item.slot] || {};
      shoppingImageSettingsState.sources[item.slot] = String(remote.source || '').trim();
      shoppingImageSettingsState.defaults[item.slot] = String(remote.defaultSource || '').trim();
    });
    shoppingImageSettingsState.loaded = true;
    setShoppingImageSettingsFeedback('');
    renderShoppingImageSettingsSlots();
  } catch (error) {
    setShoppingImageSettingsFeedback(`이미지 설정을 불러오지 못했습니다: ${error.message || '잠시 후 다시 시도해 주세요.'}`);
  } finally {
    shoppingImageSettingsState.loading = false;
  }
}

function restoreShoppingImageSettingsDefault(slot) {
  const meta = shoppingImageSettingsMeta(slot);
  if (!meta) return;
  clearStagedShoppingImageSettingsFile(slot);
  const source = String(shoppingImageSettingsState.defaults[slot] || '').trim();
  if (!source) {
    setShoppingImageSettingsFeedback(`${meta.label}의 기본 이미지가 없습니다.`);
    return;
  }
  shoppingImageSettingsState.sources[slot] = source;
  setShoppingImageSettingsFeedback('');
  renderShoppingImageSettingsSlot(slot);
}

function clearShoppingImageSettingsSlot(slot) {
  const meta = shoppingImageSettingsMeta(slot);
  if (!meta || meta.required) return;
  clearStagedShoppingImageSettingsFile(slot);
  shoppingImageSettingsState.sources[slot] = '';
  setShoppingImageSettingsFeedback('');
  renderShoppingImageSettingsSlot(slot);
}

async function saveShoppingImageSettings() {
  if (shoppingImageSettingsState.saving) return;
  const saveBtn = document.getElementById('shopping-image-save-btn');
  shoppingImageSettingsState.saving = true;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.setAttribute('aria-busy', 'true');
  }
  setShoppingImageSettingsFeedback('이미지를 저장하는 중입니다.');
  try {
    for (const item of SHOPPING_IMAGE_SETTINGS_SLOTS) {
      const file = shoppingImageSettingsState.stagedFiles[item.slot];
      if (!file) continue;
      const dataUrl = await readShoppingImageSettingsFile(file);
      const data = await postJson('/api/v1/settings/shopping-image', {
        slot: item.slot,
        fileName: file.name,
        mimeType: file.type || '',
        base64Data: dataUrl
      });
      const sourceValue = String(data?.value || '').trim();
      if (!sourceValue) throw new Error(`${item.label} 업로드 결과를 확인하지 못했습니다.`);
      shoppingImageSettingsState.sources[item.slot] = sourceValue;
      clearStagedShoppingImageSettingsFile(item.slot);
    }
    for (const item of SHOPPING_IMAGE_SETTINGS_SLOTS) {
      if (!item.required) continue;
      if (!String(shoppingImageSettingsState.sources[item.slot] || '').trim()) {
        throw new Error(`${item.label}는 필수입니다. 이미지를 선택하거나 기본 이미지로 복원해 주세요.`);
      }
    }
    const payload = {};
    SHOPPING_IMAGE_SETTINGS_SLOTS.forEach((item) => {
      payload[item.key] = String(shoppingImageSettingsState.sources[item.slot] || '').trim();
    });
    await postJson('/api/v1/settings/major', payload);
    setShoppingImageSettingsFeedback('이미지를 저장했습니다.');
    renderShoppingImageSettingsSlots();
  } catch (error) {
    setShoppingImageSettingsFeedback(`이미지 저장에 실패했습니다: ${error.message || '잠시 후 다시 시도해 주세요.'}`);
  } finally {
    shoppingImageSettingsState.saving = false;
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.setAttribute('aria-busy', 'false');
    }
  }
}

function initShoppingImageSettings() {
  if (shoppingImageSettingsState.initialized) return;
  const details = document.getElementById('shopping-quick-image-settings');
  if (!details) return;
  shoppingImageSettingsState.initialized = true;
  details.addEventListener('toggle', () => {
    if (details.open) void loadShoppingImageSettings();
  });
  SHOPPING_IMAGE_SETTINGS_SLOTS.forEach((item) => {
    const root = shoppingImageSettingsRoot(item.slot);
    if (!root) return;
    root.querySelector('[data-shopping-image-pick]')?.addEventListener('click', () => {
      root.querySelector('[data-shopping-image-file]')?.click();
    });
    root.querySelector('[data-shopping-image-file]')?.addEventListener('change', (event) => {
      const file = event.target?.files?.[0] || null;
      if (!file) return;
      shoppingImageSettingsState.stagedFiles[item.slot] = file;
      setShoppingImageSettingsFeedback('');
      renderShoppingImageSettingsSlot(item.slot);
    });
    root.querySelector('[data-shopping-image-restore]')?.addEventListener('click', () => {
      restoreShoppingImageSettingsDefault(item.slot);
    });
    root.querySelector('[data-shopping-image-clear]')?.addEventListener('click', () => {
      clearShoppingImageSettingsSlot(item.slot);
    });
  });
  document.getElementById('shopping-image-save-btn')?.addEventListener('click', () => {
    void saveShoppingImageSettings();
  });
}
