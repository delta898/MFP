
function loadManualSnsSelectedChannelIds() {
  try {
    const raw = localStorage.getItem(MANUAL_SNS_SELECTED_CHANNELS_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return new Set(parsed.map((id) => String(id || '').trim()).filter(Boolean));
  } catch (_error) {
    return null;
  }
}

function persistManualSnsSelectedChannels() {
  const selectedIds = Array.from(document.querySelectorAll('[data-manual-sns-channel]:checked'))
    .map((input) => String(input.value || '').trim())
    .filter(Boolean);
  try {
    localStorage.setItem(MANUAL_SNS_SELECTED_CHANNELS_STORAGE_KEY, JSON.stringify(selectedIds));
  } catch (_error) {
    // Local Storage가 차단되어도 SNS 발행 자체는 계속 사용할 수 있어야 합니다.
  }
}

function getManualSnsSelectedChannels() {
  const selectedIds = new Set(Array.from(document.querySelectorAll('[data-manual-sns-channel]:checked'))
    .map((input) => String(input.value || '').trim()));
  return (Array.isArray(manualSnsConfig.channels) ? manualSnsConfig.channels : [])
    .filter((channel) => selectedIds.has(String(channel.id || '').trim()));
}

function getManualSnsImageValidation() {
  const localMode = document.getElementById('manual-sns-image-source-local')?.checked === true;
  if (localMode) {
    if (manualSnsConfig.local_media_available !== true) {
      return { valid: false, mode: 'local', hasImage: false, message: '로컬 이미지를 사용하려면 WordPress 연결 설정이 필요합니다.' };
    }
    if (!manualSnsLocalImageFile) return { valid: true, mode: 'local', hasImage: false, file: null, url: '' };
    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    if (!allowedTypes.has(String(manualSnsLocalImageFile.type || '').toLowerCase())) {
      return { valid: false, mode: 'local', hasImage: false, message: 'png, jpg, webp, gif 이미지만 사용할 수 있습니다.' };
    }
    if (manualSnsLocalImageFile.size > 10 * 1024 * 1024) {
      return { valid: false, mode: 'local', hasImage: false, message: '이미지 파일은 최대 10MB까지 사용할 수 있습니다.' };
    }
    return { valid: true, mode: 'local', hasImage: true, file: manualSnsLocalImageFile, url: '' };
  }
  const raw = String(document.getElementById('manual-sns-image-url')?.value || '').trim();
  if (!raw) return { valid: true, mode: 'url', hasImage: false, url: '' };
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) {
      return { valid: false, mode: 'url', hasImage: false, url: '', message: '공개 HTTPS 이미지 URL을 입력하세요.' };
    }
    return { valid: true, mode: 'url', hasImage: true, url: url.toString() };
  } catch (_error) {
    return { valid: false, mode: 'url', hasImage: false, url: '', message: '이미지 URL 형식을 확인하세요.' };
  }
}

function setManualSnsLocalImageFile(file = null) {
  if (manualSnsLocalImagePreviewUrl) URL.revokeObjectURL(manualSnsLocalImagePreviewUrl);
  manualSnsLocalImageFile = file || null;
  manualSnsLocalImagePreviewUrl = file ? URL.createObjectURL(file) : '';
}

function syncManualSnsImageSourceUi() {
  const localRadio = document.getElementById('manual-sns-image-source-local');
  const localLabel = document.getElementById('manual-sns-image-source-local-label');
  const urlRadio = document.getElementById('manual-sns-image-source-url');
  const urlPanel = document.getElementById('manual-sns-image-url-panel');
  const localPanel = document.getElementById('manual-sns-image-local-panel');
  const localAvailable = manualSnsConfig.local_media_available === true;
  if (localRadio) localRadio.disabled = !localAvailable;
  if (localLabel) {
    localLabel.classList.toggle('is-disabled', !localAvailable);
    localLabel.title = localAvailable ? '' : '설정 > 블로그에서 WordPress 연결 정보를 먼저 저장해 주세요.';
  }
  if (!localAvailable && localRadio?.checked && urlRadio) urlRadio.checked = true;
  const localMode = localRadio?.checked === true;
  if (urlPanel) urlPanel.hidden = localMode;
  if (localPanel) localPanel.hidden = !localMode;
}

function syncManualSnsImagePreview() {
  const inputEl = document.getElementById('manual-sns-image-url');
  const removeBtn = document.getElementById('manual-sns-image-remove-btn');
  const fileRemoveBtn = document.getElementById('manual-sns-image-file-remove-btn');
  const filePickerEl = document.getElementById('manual-sns-image-file-picker');
  const fileNameEl = document.getElementById('manual-sns-image-file-name');
  const fileActionEl = document.getElementById('manual-sns-image-file-action');
  const previewEl = document.getElementById('manual-sns-image-preview');
  const imageEl = document.getElementById('manual-sns-image-preview-img');
  const statusEl = document.getElementById('manual-sns-image-preview-status');
  const raw = String(inputEl?.value || '').trim();
  syncManualSnsImageSourceUi();
  const validation = getManualSnsImageValidation();
  if (removeBtn) removeBtn.hidden = !raw;
  if (fileRemoveBtn) fileRemoveBtn.hidden = !manualSnsLocalImageFile;
  if (filePickerEl) filePickerEl.classList.toggle('has-file', Boolean(manualSnsLocalImageFile));
  if (fileNameEl) fileNameEl.textContent = manualSnsLocalImageFile?.name || '이미지 파일 선택';
  if (fileActionEl) fileActionEl.textContent = manualSnsLocalImageFile ? '변경' : '파일 찾기';
  if (!previewEl || !imageEl || !statusEl) return;

  if (!validation.hasImage || !validation.valid) {
    previewEl.hidden = true;
    imageEl.removeAttribute('src');
    return;
  }
  previewEl.hidden = false;
  if (validation.mode === 'local') {
    imageEl.onload = null;
    imageEl.onerror = null;
    imageEl.src = manualSnsLocalImagePreviewUrl;
    statusEl.textContent = `${validation.file.name} · WordPress를 통해 임시 업로드됩니다.`;
    return;
  }
  statusEl.textContent = '이미지 미리보기를 불러오는 중입니다.';
  imageEl.onerror = () => {
    statusEl.textContent = '미리보기를 불러오지 못했습니다. Buffer에서 접근 가능한 직접 이미지 URL인지 확인하세요.';
  };
  imageEl.onload = () => {
    statusEl.textContent = '이미지 URL 1개가 함께 발행됩니다.';
  };
  imageEl.src = validation.url;
}

function syncManualSnsComposerState() {
  syncManualSnsImageSourceUi();
  const textEl = document.getElementById('manual-sns-text');
  const countEl = document.getElementById('manual-sns-character-count');
  const limitEl = document.getElementById('manual-sns-limit-status');
  const summaryEl = document.getElementById('manual-sns-publish-summary');
  const publishBtn = document.getElementById('manual-sns-publish-btn');
  const selectAllEl = document.getElementById('manual-sns-select-all');
  const optimizeBtn = document.getElementById('manual-sns-ai-optimize-btn');
  const optimizeActionEl = document.getElementById('manual-sns-ai-action');
  const undoBtn = document.getElementById('manual-sns-ai-undo-btn');
  const text = String(textEl?.value || '').trim();
  const characterCount = Array.from(text).length;
  const selectedChannels = getManualSnsSelectedChannels();
  const image = getManualSnsImageValidation();
  let errorMessage = '';

  const exceeded = selectedChannels.find((channel) => characterCount > Number(channel.limit || 0));
  if (exceeded) {
    errorMessage = `${exceeded.name || exceeded.service} 글자 수 제한을 ${characterCount - Number(exceeded.limit || 0)}자 초과했습니다. (${characterCount}/${exceeded.limit}자)`;
  } else if (!image.valid) {
    errorMessage = image.message;
  } else {
    const imageRequired = selectedChannels.find((channel) => channel.image_required === true);
    if (imageRequired && !image.hasImage) {
      errorMessage = `${imageRequired.name || imageRequired.service} 채널은 이미지가 필요합니다.`;
    }
  }

  if (countEl) {
    const selectedLimits = selectedChannels.map((channel) => Number(channel.limit || 0)).filter((limit) => limit > 0);
    const shortestLimit = selectedLimits.length > 0 ? Math.min(...selectedLimits) : 0;
    countEl.textContent = shortestLimit > 0 ? `${characterCount}/${shortestLimit}자` : `${characterCount}자`;
    countEl.classList.toggle('is-over', Boolean(exceeded));
  }
  if (limitEl) {
    limitEl.textContent = errorMessage || (selectedChannels.length > 0 ? '선택한 모든 채널의 글자 수 제한 안에 있습니다.' : '');
    limitEl.classList.toggle('is-error', Boolean(errorMessage));
  }
  if (summaryEl) {
    summaryEl.textContent = selectedChannels.length > 0
      ? `${selectedChannels.length}개 채널에 즉시 발행합니다${image.hasImage ? ' · 이미지 포함' : ''}.`
      : '발행할 채널을 선택하세요.';
  }
  if (publishBtn) {
    publishBtn.textContent = selectedChannels.length > 0 ? `${selectedChannels.length}개 채널에 지금 발행` : '지금 발행';
    publishBtn.disabled = manualSnsOptimizationInFlight || !manualSnsConfig.configured || selectedChannels.length === 0 || !text || Boolean(errorMessage);
  }
  if (optimizeBtn) {
    const aiAvailable = manualSnsConfig.ai?.available === true;
    if (optimizeActionEl) optimizeActionEl.hidden = !aiAvailable;
    optimizeBtn.disabled = manualSnsOptimizationInFlight || selectedChannels.length === 0 || !text;
    optimizeBtn.textContent = manualSnsOptimizationInFlight ? 'AI 최적화 중...' : 'AI 최적화';
  }
  if (undoBtn) {
    undoBtn.hidden = manualSnsOptimizationSnapshot === null;
    undoBtn.disabled = manualSnsOptimizationInFlight;
  }

  document.querySelectorAll('.social-channel-option').forEach((label) => {
    const input = label.querySelector('[data-manual-sns-channel]');
    label.classList.toggle('is-selected', Boolean(input?.checked));
  });
  if (selectAllEl) {
    const enabledInputs = Array.from(document.querySelectorAll('[data-manual-sns-channel]:not(:disabled)'));
    const selectedCount = enabledInputs.filter((input) => input.checked).length;
    selectAllEl.disabled = enabledInputs.length === 0;
    selectAllEl.checked = enabledInputs.length > 0 && selectedCount === enabledInputs.length;
    selectAllEl.indeterminate = selectedCount > 0 && selectedCount < enabledInputs.length;
  }
}

function renderManualSnsChannels() {
  const listEl = document.getElementById('manual-sns-channel-list');
  const selectAllEl = document.getElementById('manual-sns-select-all');
  if (!listEl) return;
  listEl.replaceChildren();

  const channels = Array.isArray(manualSnsConfig.channels) ? manualSnsConfig.channels : [];
  if (!manualSnsConfig.configured || channels.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'social-channel-empty';
    const messageEl = document.createElement('span');
    messageEl.textContent = 'Buffer 연결 또는 발행 채널 설정이 필요합니다.';
    const linksEl = document.createElement('div');
    linksEl.className = 'buffer-resource-links social-channel-help-links';
    linksEl.setAttribute('aria-label', 'Buffer 관련 링크');
    const helpLinkEl = document.createElement('a');
    helpLinkEl.href = DEFAULT_BUFFER_HELP_URL;
    helpLinkEl.target = '_blank';
    helpLinkEl.rel = 'noopener noreferrer';
    helpLinkEl.textContent = 'Buffer 알아보기';
    const separatorEl = document.createElement('span');
    separatorEl.setAttribute('aria-hidden', 'true');
    separatorEl.textContent = '·';
    const joinLinkEl = document.createElement('a');
    joinLinkEl.href = 'https://join.buffer.com/delta898-gmail-com';
    joinLinkEl.target = '_blank';
    joinLinkEl.rel = 'noopener noreferrer';
    joinLinkEl.textContent = 'Buffer 가입';
    linksEl.append(helpLinkEl, separatorEl, joinLinkEl);
    emptyEl.append(messageEl, linksEl);
    listEl.appendChild(emptyEl);
    if (selectAllEl) selectAllEl.disabled = true;
    syncManualSnsComposerState();
    return;
  }

  if (selectAllEl) selectAllEl.disabled = false;
  const savedChannelIds = loadManualSnsSelectedChannelIds();
  channels.forEach((channel) => {
    const unavailable = !channel.supported || channel.disabled || channel.is_disconnected || channel.is_locked;
    const label = document.createElement('label');
    label.className = `social-channel-option${unavailable ? ' is-disabled' : ''}`;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = channel.id;
    input.dataset.manualSnsChannel = 'true';
    input.disabled = unavailable;
    input.checked = !unavailable && savedChannelIds?.has(String(channel.id || '').trim()) === true;
    input.addEventListener('change', () => {
      persistManualSnsSelectedChannels();
      syncManualSnsComposerState();
    });
    const copy = document.createElement('span');
    copy.className = 'social-channel-copy';
    const name = document.createElement('strong');
    name.textContent = channel.name || channel.service || 'Buffer 채널';
    const detail = document.createElement('span');
    detail.textContent = unavailable
      ? '현재 수동 발행 미지원'
      : `${channel.service} · 최대 ${Number(channel.limit || 0).toLocaleString('ko-KR')}자${channel.image_required ? ' · 이미지 필수' : ''}`;
    copy.append(name, detail);
    label.append(input, copy);
    listEl.appendChild(label);
  });
  if (savedChannelIds !== null) persistManualSnsSelectedChannels();
  syncManualSnsComposerState();
}

async function loadManualSnsComposer({ force = false } = {}) {
  if (manualSnsConfigLoading) return;
  if (!force && Array.isArray(manualSnsConfig.channels) && manualSnsConfig.channels.length > 0) {
    renderManualSnsChannels();
    return;
  }
  const listEl = document.getElementById('manual-sns-channel-list');
  if (listEl) {
    listEl.replaceChildren();
    const loadingEl = document.createElement('p');
    loadingEl.className = 'muted';
    loadingEl.textContent = 'Buffer 채널을 불러오는 중입니다.';
    listEl.appendChild(loadingEl);
  }
  manualSnsConfigLoading = true;
  try {
    const data = await fetchJson('/api/v1/social/manual/config');
    manualSnsConfig = {
      configured: data?.configured === true,
      local_media_available: data?.local_media_available === true,
      channels: Array.isArray(data?.channels) ? data.channels : [],
      ai: data?.ai && typeof data.ai === 'object'
        ? { available: data.ai.available === true, model_name: String(data.ai.model_name || '') }
        : { available: false, model_name: '' }
    };
    renderManualSnsChannels();
  } catch (error) {
    manualSnsConfig = { configured: false, local_media_available: false, channels: [], ai: { available: false, model_name: '' } };
    renderManualSnsChannels();
  } finally {
    manualSnsConfigLoading = false;
  }
}

