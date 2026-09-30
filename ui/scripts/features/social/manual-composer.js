
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

function loadManualSnsOrganizationId() {
  try { return String(localStorage.getItem(MANUAL_SNS_ORGANIZATION_STORAGE_KEY) || '').trim(); }
  catch (_error) { return ''; }
}

function persistManualSnsOrganizationId() {
  try { localStorage.setItem(MANUAL_SNS_ORGANIZATION_STORAGE_KEY, String(manualSnsConfig.organizationId || '')); }
  catch (_error) { /* recent selection is optional */ }
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

function applyManualSnsWorkspaceSnapshot(snapshot) {
  if (!snapshot) return false;
  manualSnsConfig = {
    ...manualSnsConfig,
    organizations: snapshot.organizations,
    organizationId: snapshot.organizationId,
    channels: snapshot.channels,
    workspacesLoaded: true,
    workspaceFetchedAt: snapshot.fetchedAt
  };
  persistManualSnsOrganizationId();
  return true;
}

function invalidateManualSnsWorkspaceState({ preserveCache = false } = {}) {
  if (!preserveCache) clearManualSnsWorkspaceCache();
  manualSnsConfig = {
    ...manualSnsConfig,
    configured: false,
    organizations: [],
    organizationId: '',
    channels: [],
    workspacesLoaded: false,
    workspaceFetchedAt: 0
  };
}

function getManualSnsSelectedChannels() {
  const selectedIds = new Set(Array.from(document.querySelectorAll('[data-manual-sns-channel]:checked'))
    .map((input) => String(input.value || '').trim()));
  return (Array.isArray(manualSnsConfig.channels) ? manualSnsConfig.channels : [])
    .filter((channel) => selectedIds.has(String(channel.id || '').trim()));
}

function getManualSnsPublishSignature() {
  const text = String(document.getElementById('manual-sns-text')?.value || '').trim();
  const channelIds = getManualSnsSelectedChannels()
    .map((channel) => String(channel.id || '').trim())
    .filter(Boolean)
    .sort();
  const image = getManualSnsImageValidation();
  const imageIdentity = (image.files || []).map((file) => ({
        name: String(file.name || ''),
        size: Number(file.size || 0),
        type: String(file.type || ''),
        lastModified: Number(file.lastModified || 0)
      }));
  return JSON.stringify({ organizationId: manualSnsConfig.organizationId, text, channelIds, imageIdentity });
}

function getManualSnsImageValidation() {
  const files = manualSnsLocalImages.map(({ file }) => file);
  if (files.length > 0 && manualSnsConfig.local_media_available !== true) {
    return { valid: false, mode: 'local', hasImage: false, files, message: '로컬 이미지를 사용하려면 Google 계정을 먼저 연결해 주세요.' };
  }
  if (files.length === 0) return { valid: true, mode: 'local', hasImage: false, files };
  const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
  if (files.some((file) => !allowedTypes.has(String(file.type || '').toLowerCase()))) {
    return { valid: false, mode: 'local', hasImage: false, files, message: 'png, jpg, webp, gif 이미지만 사용할 수 있습니다.' };
  }
  const hasGif = files.some((file) => String(file.type || '').toLowerCase() === 'image/gif');
  const gifSupportedServices = new Set(['facebook', 'twitter', 'mastodon', 'bluesky', 'pinterest']);
  const incompatibleGifChannel = hasGif && getManualSnsSelectedChannels()
    .find((channel) => !gifSupportedServices.has(String(channel.service || '').toLowerCase()));
  if (incompatibleGifChannel) {
    return {
      valid: false,
      mode: 'local',
      hasImage: true,
      files,
      message: `GIF는 ${incompatibleGifChannel.name || incompatibleGifChannel.service} 채널에서 지원되지 않을 수 있습니다. PNG, JPG 또는 WEBP로 바꾸거나 해당 채널을 선택 해제하세요.`
    };
  }
  if (files.some((file) => file.size > 10 * 1024 * 1024)) {
    return { valid: false, mode: 'local', hasImage: false, files, message: '이미지 파일은 한 장당 최대 10MB까지 사용할 수 있습니다.' };
  }
  const totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
  if (totalBytes > 60 * 1024 * 1024) {
    return { valid: false, mode: 'local', hasImage: true, files, message: '선택한 이미지의 전체 크기는 최대 60MB까지 사용할 수 있습니다.' };
  }
  if (files.length > 10) {
    return { valid: false, mode: 'local', hasImage: true, files, message: '로컬 이미지는 최대 10장까지 선택할 수 있습니다.' };
  }
  return { valid: true, mode: 'local', hasImage: true, files, file: files[0] };
}

function addManualSnsLocalImageFiles(files = [], { generated = false, instruction = '' } = {}) {
  if (manualSnsPublishingInFlight || (manualSnsImageGenerationInFlight && !generated)) return;
  const existingKeys = new Set(manualSnsLocalImages.map(({ file }) => `${file.name}:${file.size}:${file.lastModified}`));
  Array.from(files).forEach((file) => {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (!existingKeys.has(key)) {
      manualSnsLocalImages.push({
        file,
        previewUrl: URL.createObjectURL(file),
        generatedInstruction: generated ? String(instruction || '').trim() : null
      });
      existingKeys.add(key);
    }
  });
}

function replaceManualSnsLocalImage(index, file, instruction = '') {
  if (!Number.isInteger(index) || index < 0 || index >= manualSnsLocalImages.length || !file) return false;
  const previous = manualSnsLocalImages[index];
  manualSnsLocalImages[index] = {
    file,
    previewUrl: URL.createObjectURL(file),
    generatedInstruction: String(instruction || '').trim()
  };
  if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
  return true;
}

function removeManualSnsLocalImage(index) {
  if (manualSnsPublishingInFlight || manualSnsImageGenerationInFlight) return;
  const [removed] = manualSnsLocalImages.splice(index, 1);
  if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
}

function moveManualSnsLocalImage(fromIndex, toIndex) {
  if (manualSnsPublishingInFlight || manualSnsImageGenerationInFlight) return;
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return;
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= manualSnsLocalImages.length || toIndex >= manualSnsLocalImages.length) return;
  if (fromIndex === toIndex) return;
  const [moved] = manualSnsLocalImages.splice(fromIndex, 1);
  manualSnsLocalImages.splice(toIndex, 0, moved);
}

function syncManualSnsImageSourceUi() {
  const localPanel = document.getElementById('manual-sns-image-local-panel');
  if (localPanel) localPanel.classList.toggle('is-disabled', manualSnsPublishingInFlight || manualSnsImageGenerationInFlight);
}

function syncManualSnsImageGenerationControls() {
  const imageFileEl = document.getElementById('manual-sns-image-file');
  const activeOperation = manualSnsImageOperation;
  const stopButton = document.getElementById('manual-sns-image-generate-btn');
  const stopConfirming = activeOperation?.confirmingStop === true;
  const hasPostText = Boolean(String(document.getElementById('manual-sns-text')?.value || '').trim());
  const canGenerate = !manualSnsPublishingInFlight && !manualSnsImageGenerationInFlight
    && hasPostText
    && manualSnsConfig.image_ai?.available === true
    && manualSnsConfig.local_media_available === true;
  if (imageFileEl) imageFileEl.disabled = manualSnsPublishingInFlight || manualSnsImageGenerationInFlight || manualSnsConfig.local_media_available !== true;
  document.querySelectorAll('.social-local-image-ai-trigger').forEach((button) => {
    button.disabled = !canGenerate;
  });
  document.querySelectorAll('.social-local-image-regenerate').forEach((button) => {
    button.disabled = manualSnsPublishingInFlight || manualSnsImageGenerationInFlight
      || manualSnsConfig.image_ai?.available !== true
      || manualSnsConfig.local_media_available !== true;
  });
  if (stopButton) {
    stopButton.disabled = manualSnsPublishingInFlight || (activeOperation
      ? activeOperation.state === 'cancel_requested' || activeOperation.state === 'starting'
        || activeOperation.canCancel === false && !stopConfirming
      : !canGenerate);
  }
  const localButton = document.querySelector('.social-local-image-plus');
  if (localButton) localButton.disabled = manualSnsPublishingInFlight || manualSnsImageGenerationInFlight || manualSnsConfig.local_media_available !== true;
}

function syncManualSnsImagePreview() {
  const imageFileEl = document.getElementById('manual-sns-image-file');
  const gridEl = document.getElementById('manual-sns-image-grid');
  syncManualSnsImageSourceUi();
  if (imageFileEl) imageFileEl.disabled = manualSnsPublishingInFlight || manualSnsImageGenerationInFlight || manualSnsConfig.local_media_available !== true;
  if (gridEl) {
    gridEl.replaceChildren();
    manualSnsLocalImages.forEach(({ file, previewUrl, generatedInstruction }, index) => {
      const isAiGenerated = generatedInstruction !== null && generatedInstruction !== undefined;
      const tile = document.createElement('figure');
      tile.className = 'social-local-image-tile';
      tile.draggable = true;
      tile.dataset.imageIndex = String(index);
      const image = document.createElement('img');
      image.src = previewUrl;
      image.alt = `${index + 1}번 이미지: ${file.name}`;
      const order = document.createElement('span');
      order.className = 'social-local-image-order';
      order.textContent = String(index + 1);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'social-local-image-remove';
      remove.setAttribute('aria-label', `${file.name} 제거`);
      remove.disabled = manualSnsPublishingInFlight || manualSnsImageGenerationInFlight;
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        removeManualSnsLocalImage(index);
        syncManualSnsImagePreview();
        syncManualSnsComposerState();
      });
      tile.addEventListener('dragstart', (event) => {
        if (manualSnsPublishingInFlight) {
          event.preventDefault();
          return;
        }
        manualSnsDraggedImageIndex = index;
        tile.classList.add('is-dragging');
        event.dataTransfer?.setData('application/x-bloggenius-sns-image-index', String(index));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      });
      tile.addEventListener('dragover', (event) => {
        if (manualSnsDraggedImageIndex === null) return;
        event.preventDefault();
        event.stopPropagation();
        document.querySelectorAll('.social-local-image-tile').forEach((element) => {
          element.classList.remove('is-drop-before', 'is-drop-after');
        });
        if (manualSnsDraggedImageIndex < index) tile.classList.add('is-drop-after');
        if (manualSnsDraggedImageIndex > index) tile.classList.add('is-drop-before');
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      });
      tile.addEventListener('dragleave', () => tile.classList.remove('is-drop-before', 'is-drop-after'));
      tile.addEventListener('drop', (event) => {
        if (manualSnsDraggedImageIndex === null) return;
        event.preventDefault();
        event.stopPropagation();
        moveManualSnsLocalImage(manualSnsDraggedImageIndex, index);
        manualSnsDraggedImageIndex = null;
        syncManualSnsImagePreview();
        syncManualSnsComposerState();
      });
      tile.addEventListener('dragend', () => {
        manualSnsDraggedImageIndex = null;
        document.querySelectorAll('.social-local-image-tile').forEach((element) => {
          element.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after');
        });
      });
      const caption = isAiGenerated ? null : document.createElement('figcaption');
      if (caption) caption.textContent = file.name;
      const actions = document.createElement('div');
      actions.className = 'social-local-image-tile-actions';
      if (isAiGenerated) {
        const regenerate = document.createElement('button');
        regenerate.type = 'button';
        regenerate.className = 'secondary compact social-local-image-regenerate';
        regenerate.textContent = 'AI 재생성';
        regenerate.disabled = manualSnsPublishingInFlight || manualSnsImageGenerationInFlight
          || !String(document.getElementById('manual-sns-text')?.value || '').trim()
          || manualSnsConfig.image_ai?.available !== true
          || manualSnsConfig.local_media_available !== true;
        regenerate.title = String(document.getElementById('manual-sns-text')?.value || '').trim()
          ? '기존 추가 요청을 불러와 현재 본문으로 이 이미지를 다시 만듭니다.'
          : '본문을 입력하면 현재 본문과 기존 추가 요청으로 다시 만들 수 있습니다.';
        regenerate.setAttribute('aria-label', `${index + 1}번 이미지 AI 재생성`);
        regenerate.addEventListener('click', () => {
          if (!String(document.getElementById('manual-sns-text')?.value || '').trim()) {
            renderManualSnsImageGenerationStatus('본문을 입력한 뒤 이미지를 재생성해 주세요.', true);
          }
          manualSnsImagePromptOpen = true;
          manualSnsImagePromptTargetIndex = index;
          manualSnsImageInstruction = String(generatedInstruction || '');
          syncManualSnsImagePreview();
          document.getElementById('manual-sns-image-instruction')?.focus();
        });
        actions.appendChild(regenerate);
      }
      const download = document.createElement('a');
      download.className = 'ui-button-link secondary compact social-local-image-download';
      download.href = previewUrl;
      download.download = file.name || `sns-image-${index + 1}`;
      download.textContent = '받기';
      download.setAttribute('aria-label', `${index + 1}번 이미지 받기`);
      actions.appendChild(download);
      tile.append(image, order, remove);
      if (caption) tile.appendChild(caption);
      tile.appendChild(actions);
      gridEl.appendChild(tile);
    });

    const addTile = document.createElement('div');
    addTile.className = 'social-local-image-add-tile';
    addTile.classList.toggle('is-prompt-open', manualSnsImagePromptOpen);
    addTile.classList.toggle('is-working', manualSnsImageGenerationInFlight);
    const artwork = document.createElement('div');
    artwork.className = 'social-local-image-add-artwork';
    artwork.classList.toggle('is-regenerating', manualSnsImagePromptTargetIndex !== null);
    if (manualSnsImagePromptOpen) {
      const instruction = document.createElement('textarea');
      instruction.id = 'manual-sns-image-instruction';
      instruction.maxLength = 1000;
      instruction.rows = 4;
      instruction.placeholder = '예: 벚꽃길을 걷는 장면, 따뜻한 봄 햇살의 수채화풍';
      instruction.setAttribute('aria-label', 'AI 이미지 추가 요청');
      instruction.value = manualSnsImageInstruction;
      instruction.disabled = manualSnsPublishingInFlight || manualSnsImageGenerationInFlight;
      instruction.addEventListener('input', () => { manualSnsImageInstruction = instruction.value; });
      artwork.append(instruction);
      if (manualSnsImagePromptTargetIndex !== null) {
        const targetLabel = document.createElement('span');
        targetLabel.className = 'social-local-image-regenerate-target';
        targetLabel.textContent = `${manualSnsImagePromptTargetIndex + 1}번 이미지 재생성`;
        artwork.append(targetLabel);
      }
    } else {
      artwork.innerHTML = window.BlogGeniusManuscriptImageCard?.renderMedia
        ? window.BlogGeniusManuscriptImageCard.renderMedia({ exists: false }, { compact: true })
        : '<div class="social-local-image-placeholder-fallback" aria-hidden="true">▧</div>';
    }
    addTile.append(artwork);

    const workingOverlay = document.createElement('div');
    workingOverlay.className = 'social-local-image-working';
    workingOverlay.hidden = !manualSnsImageGenerationInFlight;
    const spinner = document.createElement('span');
    spinner.className = 'ui-spinner ui-spinner-lg ui-spinner-accent';
    spinner.setAttribute('aria-hidden', 'true');
    const workingLabel = document.createElement('strong');
    workingLabel.textContent = manualSnsImageOperation?.state === 'cancel_requested'
      ? '이미지 생성 중지를 요청했습니다.'
      : manualSnsImageOperation?.canCancel === false ? '마무리 중…' : '이미지 만드는 중…';
    workingOverlay.append(spinner, workingLabel);
    addTile.append(workingOverlay);

    const footer = document.createElement('div');
    footer.className = 'social-local-image-add-footer';
    footer.hidden = false;
    if (manualSnsImagePromptOpen) {
      const operation = manualSnsImageOperation;
      const operationPending = manualSnsImageGenerationInFlight;
      const stopConfirming = operation?.confirmingStop === true;
      const generate = document.createElement('button');
      generate.id = 'manual-sns-image-generate-btn';
      generate.type = 'button';
      generate.className = `${operationPending ? 'ghost ui-danger-action' : 'primary'} compact social-local-image-generate`;
      generate.disabled = manualSnsPublishingInFlight || (operationPending
        ? operation?.state === 'cancel_requested' || operation?.state === 'starting' || operation?.canCancel === false && !stopConfirming
        : !String(document.getElementById('manual-sns-text')?.value || '').trim()
          || manualSnsConfig.image_ai?.available !== true
          || manualSnsConfig.local_media_available !== true);
      generate.textContent = operationPending
        ? operation?.state === 'cancel_requested' ? '중지 요청 중…'
          : operation?.state === 'starting' ? '준비 중…'
          : operation?.canCancel === false ? '마무리 중…'
            : stopConfirming ? '중지 확인' : '중지'
        : manualSnsImagePromptTargetIndex !== null ? '재생성' : '생성';
      const modelName = String(manualSnsConfig.image_ai?.model_name || '').trim();
      generate.title = operationPending
        ? '이미지 생성 중지'
        : `AI 이미지 모델${modelName ? `: ${modelName}` : ''} · 사용량에 따라 비용이 발생할 수 있습니다.`;
      generate.addEventListener('click', () => {
        if (operationPending) void handleManualSnsImageStop();
        else void generateManualSnsImage();
      });

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'secondary compact social-local-image-cancel';
      if (operationPending && stopConfirming) cancel.removeAttribute('aria-label');
      else cancel.setAttribute('aria-label', operationPending ? '중지 확인 취소' : '이미지 요청 취소');
      cancel.title = operationPending ? (stopConfirming ? '계속 진행' : '중지 확인') : '요청 편집 취소';
      cancel.textContent = operationPending && stopConfirming ? '계속 진행' : '취소';
      cancel.hidden = operationPending && !stopConfirming;
      cancel.disabled = manualSnsPublishingInFlight || (operationPending
        ? !stopConfirming || operation?.state === 'cancel_requested' || operation?.canCancel === false
        : false);
      cancel.addEventListener('click', () => {
        if (manualSnsImageGenerationInFlight) {
          continueManualSnsImageGeneration();
          return;
        }
        manualSnsImagePromptOpen = false;
        manualSnsImageInstruction = '';
        manualSnsImagePromptTargetIndex = null;
        syncManualSnsImagePreview();
      });
      if (operationPending && stopConfirming) {
        cancel.classList.remove('secondary');
        cancel.classList.add('ghost');
      }
      const promptRow = document.createElement('div');
      promptRow.className = 'social-local-image-prompt';
      promptRow.append(generate, cancel);
      footer.append(promptRow);
    } else {
      const actions = document.createElement('div');
      actions.className = 'social-local-image-add-actions';
      const aiButton = document.createElement('button');
      aiButton.type = 'button';
      aiButton.className = 'primary compact social-local-image-ai-trigger';
      aiButton.textContent = 'AI 이미지 만들기';
      aiButton.disabled = manualSnsPublishingInFlight || manualSnsImageGenerationInFlight
        || !String(document.getElementById('manual-sns-text')?.value || '').trim()
        || manualSnsConfig.image_ai?.available !== true
        || manualSnsConfig.local_media_available !== true;
      aiButton.addEventListener('click', () => {
        manualSnsImagePromptOpen = true;
        manualSnsImagePromptTargetIndex = null;
        manualSnsImageInstruction = '';
        syncManualSnsImagePreview();
        document.getElementById('manual-sns-image-instruction')?.focus();
      });
      const localButton = document.createElement('button');
      localButton.type = 'button';
      localButton.className = 'secondary compact social-local-image-plus';
      localButton.setAttribute('aria-label', '로컬 이미지 선택');
      localButton.title = '로컬 이미지 선택';
      localButton.textContent = '+';
      localButton.disabled = manualSnsPublishingInFlight || manualSnsImageGenerationInFlight || manualSnsConfig.local_media_available !== true;
      localButton.addEventListener('click', () => imageFileEl?.click());
      actions.append(aiButton, localButton);
      footer.append(actions);
    }
    addTile.append(footer);
    gridEl.appendChild(addTile);
  }
  syncManualSnsImageGenerationControls();
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
  const imageFileEl = document.getElementById('manual-sns-image-file');
  const text = String(textEl?.value || '').trim();
  const characterCount = Array.from(text).length;
  const selectedChannels = getManualSnsSelectedChannels();
  const image = getManualSnsImageValidation();
  const publishSignature = getManualSnsPublishSignature();
  const alreadyPublished = Boolean(manualSnsLastPublishedSignature)
    && manualSnsLastPublishedSignature === publishSignature;
  let errorMessage = '';

  if (textEl) textEl.disabled = manualSnsPublishingInFlight;
  if (imageFileEl) imageFileEl.disabled = manualSnsPublishingInFlight || manualSnsImageGenerationInFlight || manualSnsConfig.local_media_available !== true;

  const exceeded = selectedChannels.find((channel) => characterCount > Number(channel.limit || 0));
  if (exceeded) {
    errorMessage = `${exceeded.name || exceeded.service} 글자 수 제한을 ${characterCount - Number(exceeded.limit || 0)}자 초과했습니다. (${characterCount}/${exceeded.limit}자)`;
  } else if (!image.valid) {
    errorMessage = image.message;
  } else {
    const assetLimitExceeded = selectedChannels.find((channel) => image.hasImage && Number(channel.max_assets || 1) < (image.files?.length || 1));
    if (assetLimitExceeded) {
      errorMessage = `${assetLimitExceeded.name || assetLimitExceeded.service} 채널은 이미지를 최대 ${assetLimitExceeded.max_assets}장까지 지원합니다.`;
    }
    const imageRequired = selectedChannels.find((channel) => channel.image_required === true);
    if (!errorMessage && imageRequired && !image.hasImage) {
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
      ? `${selectedChannels.length}개 채널에 즉시 발행합니다${image.hasImage ? ` · 이미지 ${image.files?.length || 1}장` : ''}.`
      : '발행할 채널을 선택하세요.';
  }
  if (publishBtn) {
    publishBtn.textContent = manualSnsPublishingInFlight
      ? '발행 중...'
      : alreadyPublished
        ? '발행 완료'
        : selectedChannels.length > 0 ? `${selectedChannels.length}개 채널에 지금 발행` : '지금 발행';
    publishBtn.disabled = manualSnsPublishingInFlight || manualSnsImageGenerationInFlight || alreadyPublished || manualSnsOptimizationInFlight || !manualSnsConfig.configured || selectedChannels.length === 0 || !text || Boolean(errorMessage);
    publishBtn.classList.toggle('is-loading', manualSnsPublishingInFlight);
    publishBtn.classList.toggle('is-published', alreadyPublished);
    publishBtn.setAttribute('aria-busy', manualSnsPublishingInFlight ? 'true' : 'false');
  }
  if (optimizeBtn) {
    const aiAvailable = manualSnsConfig.ai?.available === true;
    if (optimizeActionEl) optimizeActionEl.hidden = !aiAvailable;
    optimizeBtn.disabled = manualSnsPublishingInFlight || manualSnsOptimizationInFlight || selectedChannels.length === 0 || !text;
    optimizeBtn.textContent = manualSnsOptimizationInFlight ? 'AI 최적화 중...' : 'AI 최적화';
  }
  if (undoBtn) {
    undoBtn.hidden = manualSnsOptimizationSnapshot === null;
    undoBtn.disabled = manualSnsPublishingInFlight || manualSnsOptimizationInFlight;
  }

  document.querySelectorAll('.social-channel-option').forEach((label) => {
    const input = label.querySelector('[data-manual-sns-channel]');
    label.classList.toggle('is-selected', Boolean(input?.checked));
    if (input) input.disabled = input.dataset.manualSnsUnavailable === 'true' || manualSnsPublishingInFlight;
    label.classList.toggle('is-locked', manualSnsPublishingInFlight);
  });
  BufferPublishingControls.syncChannelSelectAll({
    master: selectAllEl,
    controls: Array.from(document.querySelectorAll('[data-manual-sns-channel]')),
    isEligible: (input) => !input.disabled,
    disabled: manualSnsPublishingInFlight
  });
  const channelLimitEl = document.getElementById('manual-sns-channel-limit');
  if (channelLimitEl) channelLimitEl.textContent = `최대 3개 · ${selectedChannels.length}개 선택`;
  syncManualSnsImageGenerationControls();
}

function renderManualSnsChannels() {
  const listEl = document.getElementById('manual-sns-channel-list');
  const selectAllEl = document.getElementById('manual-sns-select-all');
  if (!listEl) return;
  listEl.replaceChildren();

  const channels = Array.isArray(manualSnsConfig.channels) ? manualSnsConfig.channels : [];
  if (!manualSnsConfig.configured || channels.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'social-channel-empty ui-empty-state';
    const messageEl = document.createElement('span');
    messageEl.textContent = !manualSnsConfig.configured
      ? '설정에서 Buffer 연결을 먼저 완료해 주세요.'
      : (!manualSnsConfig.workspacesLoaded
        ? '작업 공간 불러오기를 눌러 SNS 채널을 확인해 주세요.'
        : (!manualSnsConfig.organizationId ? '작업 공간을 선택하면 SNS 채널이 표시됩니다.' : '선택한 작업 공간에 사용할 수 있는 SNS 채널이 없습니다.'));
    const linksEl = document.createElement('div');
    linksEl.className = 'buffer-resource-links social-channel-help-links';
    linksEl.setAttribute('aria-label', 'Buffer 관련 링크');
    if (!manualSnsConfig.configured) {
      const settingsButton = document.createElement('button');
      settingsButton.type = 'button';
      settingsButton.className = 'text-btn social-inline-nav-link';
      settingsButton.textContent = '설정 > SNS 배포';
      settingsButton.addEventListener('click', async () => {
        await navigateTo('settings-next', 'extras');
        settingsNextActivateExtrasTab?.('social');
      });
      linksEl.append(settingsButton);
    }
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
    label.className = `social-channel-option ui-selectable-card${unavailable ? ' is-disabled' : ''}`;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = channel.id;
    input.dataset.manualSnsChannel = 'true';
    input.dataset.manualSnsUnavailable = unavailable ? 'true' : 'false';
    input.disabled = unavailable;
    input.checked = !unavailable && savedChannelIds?.has(String(channel.id || '').trim()) === true;
    input.addEventListener('change', () => {
      persistManualSnsSelectedChannels();
      syncManualSnsComposerState();
    });
    const copy = document.createElement('span');
    copy.className = 'social-channel-copy ui-selectable-card-copy';
    const name = document.createElement('strong');
    name.textContent = channel.name || channel.service || 'Buffer 채널';
    const detail = document.createElement('span');
    detail.textContent = unavailable
      ? '현재 수동 발행 미지원'
      : `${channel.service} · 최대 ${Number(channel.limit || 0).toLocaleString('ko-KR')}자 · 이미지 ${Number(channel.max_assets || 1)}장${channel.image_required ? ' 필수' : ''}`;
    copy.append(name, detail);
    label.append(input, copy);
    listEl.appendChild(label);
  });
  if (savedChannelIds !== null) persistManualSnsSelectedChannels();
  syncManualSnsComposerState();
}

function renderManualSnsWorkspaceControl() {
  const button = document.getElementById('manual-sns-workspaces-load');
  const select = document.getElementById('manual-sns-organization');
  if (!button || !select) return;
  const organizations = Array.isArray(manualSnsConfig.organizations) ? manualSnsConfig.organizations : [];
  select.replaceChildren(new Option(manualSnsConfig.configured ? '작업 공간을 선택해 주세요.' : 'Buffer 연결 후 선택할 수 있습니다.', ''));
  (manualSnsConfig.workspacesLoaded ? organizations : []).forEach((organization) => {
    const option = new Option(String(organization.name || organization.id || 'Buffer 작업 공간'), String(organization.id || ''));
    option.selected = option.value === manualSnsConfig.organizationId;
    select.append(option);
  });
  BufferPublishingControls.syncWorkspace({
    button,
    select,
    configured: manualSnsConfig.configured,
    loaded: manualSnsConfig.workspacesLoaded,
    loading: manualSnsConfigLoading || manualSnsWorkspaceLoading
  });
}

async function loadManualSnsWorkspaces({ background = false } = {}) {
  if (!manualSnsConfig.configured || manualSnsConfigLoading || manualSnsWorkspaceLoading) return;
  const select = document.getElementById('manual-sns-organization');
  const organizationId = String(select?.value || manualSnsConfig.organizationId || loadManualSnsOrganizationId()).trim();
  manualSnsWorkspaceLoading = true;
  renderManualSnsWorkspaceControl();
  try {
    const data = await postJson('/api/v1/social/manual/workspaces', { organizationId });
    const resolvedOrganizationId = String(data?.organization_id || organizationId).trim();
    const fetchedAt = Date.now();
    manualSnsConfig = {
      ...manualSnsConfig,
      organizations: Array.isArray(data?.organizations) ? data.organizations : [],
      organizationId: resolvedOrganizationId,
      channels: Array.isArray(data?.channels) ? data.channels : [],
      workspacesLoaded: true,
      workspaceFetchedAt: fetchedAt
    };
    persistManualSnsWorkspaceCache(manualSnsConfig, fetchedAt);
    persistManualSnsOrganizationId();
  } catch (error) {
    if (shouldInvalidateManualSnsWorkspaceCache(error)) {
      clearManualSnsWorkspaceCache();
      manualSnsConfig = {
        ...manualSnsConfig,
        configured: [401, 403].includes(Number(error?.status)) ? false : manualSnsConfig.configured,
        channels: [],
        organizations: [],
        organizationId: '',
        workspacesLoaded: false,
        workspaceFetchedAt: 0
      };
    } else if (!background && !manualSnsConfig.workspacesLoaded) {
      manualSnsConfig = { ...manualSnsConfig, channels: [], workspacesLoaded: false, workspaceFetchedAt: 0 };
    }
  } finally {
    manualSnsWorkspaceLoading = false;
    renderManualSnsWorkspaceControl();
    renderManualSnsChannels();
  }
}

async function loadManualSnsComposer({ force = false } = {}) {
  if (manualSnsConfigLoading) return;
  if (!force && manualSnsConfig.configured) {
    renderManualSnsWorkspaceControl();
    renderManualSnsChannels();
    if (manualSnsConfig.workspacesLoaded && !isManualSnsWorkspaceSnapshotFresh(manualSnsConfig.workspaceFetchedAt)) {
      void loadManualSnsWorkspaces({ background: true });
    }
    return;
  }
  const listEl = document.getElementById('manual-sns-channel-list');
  if (listEl && !manualSnsConfig.configured) {
    listEl.replaceChildren();
    const loadingEl = document.createElement('p');
    loadingEl.className = 'muted';
    loadingEl.textContent = 'Buffer 채널을 불러오는 중입니다.';
    listEl.appendChild(loadingEl);
  }
  manualSnsConfigLoading = true;
  let refreshStaleSnapshot = false;
  try {
    const data = await fetchJson('/api/v1/social/manual/config');
    const configured = data?.configured === true;
    const connectionState = {
      configured,
      local_media_available: data?.local_media_available === true,
      ai: data?.ai && typeof data.ai === 'object'
        ? { available: data.ai.available === true, model_name: String(data.ai.model_name || '') }
        : { available: false, model_name: '' },
      image_ai: data?.image_ai && typeof data.image_ai === 'object'
        ? { available: data.image_ai.available === true, model_name: String(data.image_ai.model_name || '') }
        : { available: false, model_name: '' }
    };
    if (configured) {
      manualSnsConfig = { ...manualSnsConfig, ...connectionState };
      const snapshot = readManualSnsWorkspaceCache();
      if (snapshot) {
        applyManualSnsWorkspaceSnapshot(snapshot);
        refreshStaleSnapshot = !snapshot.isFresh;
      }
    } else {
      clearManualSnsWorkspaceCache();
      manualSnsConfig = { ...connectionState, channels: [], organizationId: '', organizations: [], workspacesLoaded: false, workspaceFetchedAt: 0 };
    }
    renderManualSnsWorkspaceControl();
    renderManualSnsChannels();
  } catch (error) {
    manualSnsConfig = { configured: false, local_media_available: false, channels: [], organizationId: '', organizations: [], workspacesLoaded: false, workspaceFetchedAt: 0, ai: { available: false, model_name: '' }, image_ai: { available: false, model_name: '' } };
    renderManualSnsWorkspaceControl();
    renderManualSnsChannels();
  } finally {
    manualSnsConfigLoading = false;
    renderManualSnsWorkspaceControl();
    renderManualSnsChannels();
    syncManualSnsImagePreview();
  }
  if (refreshStaleSnapshot) void loadManualSnsWorkspaces({ background: true });
}
