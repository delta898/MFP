
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

function getManualSnsImageCapacityMessage() {
  const selectedChannels = getManualSnsSelectedChannels();
  if (selectedChannels.length === 0) return '채널별 이미지 제한은 채널을 선택한 뒤 표시됩니다. (앱 첨부 상한 10장)';

  const limits = selectedChannels
    .map((channel) => Number(channel.max_assets))
    .filter((limit) => Number.isFinite(limit) && limit > 0);
  if (limits.length === 0) return '선택 채널의 이미지 제한 정보를 확인할 수 없습니다. 작업 공간을 다시 불러오세요.';

  return `선택 채널 중 가장 낮은 이미지 수 제한은 ${Math.min(...limits)}장입니다.`;
}

function getManualSnsChannelTextLimit(channel = {}) {
  const limit = Number(channel.limit);
  return Number.isFinite(limit) && limit > 0 ? limit : 0;
}

function getManualSnsAssetLimitExceededChannel(images = manualSnsLocalImages) {
  const imageCount = Array.isArray(images) ? images.length : 0;
  if (imageCount === 0) return null;
  const exceeded = getManualSnsSelectedChannels()
    .filter((channel) => {
      const limit = Number(channel.max_assets);
      return Number.isFinite(limit) && limit > 0 && imageCount > limit;
    })
    .sort((left, right) => Number(left.max_assets || 1) - Number(right.max_assets || 1));
  return exceeded[0] || null;
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
  if (files.length > 10) {
    return { valid: false, mode: 'local', hasImage: true, files, message: '이미지는 최대 10장까지 선택할 수 있습니다.' };
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
  return { valid: true, mode: 'local', hasImage: true, files, file: files[0] };
}

function addManualSnsLocalImageFiles(files = [], { generated = false, instruction = '' } = {}) {
  if (manualSnsPublishingInFlight || (manualSnsImageGenerationInFlight && !generated)) return;
  const existingKeys = new Set(manualSnsLocalImages.map(({ file }) => `${file.name}:${file.size}:${file.lastModified}`));
  let skippedForCapacity = false;
  Array.from(files).forEach((file) => {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (!existingKeys.has(key)) {
      if (manualSnsLocalImages.length >= 10) {
        skippedForCapacity = true;
        return;
      }
      manualSnsLocalImages.push({
        file,
        previewUrl: URL.createObjectURL(file),
        generatedInstruction: generated ? String(instruction || '').trim() : null
      });
      existingKeys.add(key);
    }
  });
  if (skippedForCapacity) renderManualSnsImageGenerationStatus('이미지는 최대 10장까지 추가할 수 있습니다. 초과한 파일은 추가되지 않았습니다.', true);
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
  const canAddImage = manualSnsLocalImages.length < 10 || manualSnsImagePromptTargetIndex !== null;
  const stopConfirming = activeOperation?.confirmingStop === true;
  const hasPostText = Boolean(String(document.getElementById('manual-sns-text')?.value || '').trim());
  const canGenerate = !manualSnsPublishingInFlight && !manualSnsImageGenerationInFlight
    && hasPostText
    && manualSnsConfig.image_ai?.available === true
    && manualSnsConfig.local_media_available === true;
  if (imageFileEl) imageFileEl.disabled = manualSnsPublishingInFlight || manualSnsImageGenerationInFlight || manualSnsConfig.local_media_available !== true || !canAddImage;
  document.querySelectorAll('.social-local-image-ai-trigger').forEach((button) => {
    button.disabled = !canGenerate || !canAddImage;
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
  if (localButton) localButton.disabled = manualSnsPublishingInFlight || manualSnsImageGenerationInFlight || manualSnsConfig.local_media_available !== true || !canAddImage;
}

function syncManualSnsImagePreview() {
  const imageFileEl = document.getElementById('manual-sns-image-file');
  const gridEl = document.getElementById('manual-sns-image-grid');
  const capacityEl = document.getElementById('manual-sns-image-capacity');
  const countEl = document.getElementById('manual-sns-image-count');
  if (capacityEl) capacityEl.textContent = getManualSnsImageCapacityMessage();
  if (countEl) countEl.textContent = `${manualSnsLocalImages.length}/10장`;
  syncManualSnsImageSourceUi();
  if (imageFileEl) imageFileEl.disabled = manualSnsPublishingInFlight || manualSnsImageGenerationInFlight || manualSnsConfig.local_media_available !== true || manualSnsLocalImages.length >= 10;
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
      image.alt = `${index + 1}번 이미지`;
      image.tabIndex = 0;
      image.setAttribute('role', 'button');
      image.setAttribute('aria-label', `${index + 1}번 이미지를 미리보기에 표시`);
      image.setAttribute('aria-pressed', String(index === manualSnsPreviewImageIndex));
      tile.classList.toggle('is-preview-active', index === manualSnsPreviewImageIndex);
      const selectForPreview = () => {
        manualSnsPreviewImageIndex = index;
        gridEl.querySelectorAll('.social-local-image-tile').forEach((element) => {
          const isActive = Number(element.dataset.imageIndex) === index;
          element.classList.toggle('is-preview-active', isActive);
          element.querySelector('img')?.setAttribute('aria-pressed', String(isActive));
        });
        syncManualSnsLivePreview();
      };
      image.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        selectForPreview();
      });
      tile.addEventListener('click', (event) => {
        if (event.target.closest('button, a')) return;
        selectForPreview();
      });
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
      tile.append(image, order, remove, actions);
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
      const generateActionLabel = operationPending
        ? operation?.state === 'cancel_requested' ? '중지 요청 중…'
          : operation?.state === 'starting' ? '준비 중…'
          : operation?.canCancel === false ? '마무리 중…'
            : stopConfirming ? '중지 확인' : '중지'
        : manualSnsImagePromptTargetIndex !== null ? '이미지 재생성' : '이미지 생성';
      const modelName = String(manualSnsConfig.image_ai?.model_name || '').trim();
      generate.title = operationPending
        ? '이미지 생성 중지'
        : `AI 이미지 모델${modelName ? `: ${modelName}` : ''} · 사용량에 따라 비용이 발생할 수 있습니다.`;
      const makeActionIcon = (paths) => {
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('fill', 'none');
        icon.setAttribute('aria-hidden', 'true');
        for (const pathData of paths) {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', pathData);
          icon.appendChild(path);
        }
        return icon;
      };
      if (operationPending) {
        const generateText = document.createElement('span');
        generateText.className = 'visually-hidden';
        generateText.textContent = generateActionLabel;
        generate.replaceChildren(makeActionIcon(stopConfirming ? ['m5 12 4 4L19 6'] : ['M8 8h8v8H8z']), generateText);
        generate.classList.remove('ui-ai-action-button');
        generate.dataset.uiAiAction = 'false';
        generate.setAttribute('aria-label', generateActionLabel);
      } else {
        setUiAiActionButton(generate, generateActionLabel, {
          visuallyHiddenLabel: true,
          accessibleLabel: `AI ${generateActionLabel}`
        });
      }
      generate.addEventListener('click', () => {
        if (operationPending) void handleManualSnsImageStop();
        else void generateManualSnsImage();
      });

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'secondary compact social-local-image-cancel';
      cancel.setAttribute('aria-label', operationPending && stopConfirming ? '계속 진행' : operationPending ? '중지 확인 취소' : '이미지 요청 취소');
      cancel.title = operationPending ? (stopConfirming ? '계속 진행' : '중지 확인') : '요청 편집 취소';
      cancel.textContent = operationPending && stopConfirming ? '계속 진행' : '취소';
      const cancelText = document.createElement('span');
      cancelText.className = 'visually-hidden';
      cancelText.textContent = operationPending && stopConfirming ? '계속 진행' : '취소';
      cancel.replaceChildren(makeActionIcon(operationPending && stopConfirming
        ? ['M8 5v14l11-7-11-7z']
        : ['M6 6l12 12M18 6 6 18']), cancelText);
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
      footer.classList.add('is-idle-actions');
      const actions = document.createElement('div');
      actions.className = 'social-local-image-add-actions';
      const aiButton = document.createElement('button');
      aiButton.type = 'button';
      aiButton.className = 'secondary compact social-local-image-ai-trigger';
      aiButton.setAttribute('aria-label', 'AI 이미지 생성');
      aiButton.title = 'AI 이미지 생성';
      const aiImageIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      aiImageIcon.setAttribute('class', 'ui-ai-icon social-local-image-ai-icon');
      aiImageIcon.setAttribute('viewBox', '0 0 24 24');
      aiImageIcon.setAttribute('aria-hidden', 'true');
      aiImageIcon.innerHTML = '<use href="#ui-icon-ai"></use>';
      aiButton.appendChild(aiImageIcon);
      const canAddImage = manualSnsLocalImages.length < 10;
      aiButton.disabled = manualSnsPublishingInFlight || manualSnsImageGenerationInFlight || !canAddImage
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
      localButton.disabled = manualSnsPublishingInFlight || manualSnsImageGenerationInFlight || manualSnsConfig.local_media_available !== true || !canAddImage;
      localButton.addEventListener('click', () => imageFileEl?.click());
      actions.append(aiButton, localButton);
      footer.append(actions);
    }
    addTile.append(footer);
    gridEl.prepend(addTile);
  }
  syncManualSnsImageGenerationControls();
  syncManualSnsLivePreview();
}

function syncManualSnsLivePreview() {
  const textEl = document.getElementById('manual-sns-preview-text');
  const mediaEl = document.getElementById('manual-sns-preview-media');
  const paginationEl = document.getElementById('manual-sns-preview-pagination');
  if (!textEl || !mediaEl || !paginationEl) return;
  const composerLayout = mediaEl.closest('.social-composer-layout');

  const text = String(document.getElementById('manual-sns-text')?.value || '').trim();
  textEl.textContent = text || '게시물 내용이 여기에 표시됩니다.';
  textEl.classList.toggle('is-empty', !text);
  mediaEl.replaceChildren();
  paginationEl.replaceChildren();
  paginationEl.style.removeProperty('bottom');
  mediaEl.classList.remove('is-portrait');
  composerLayout?.classList.remove('is-portrait-preview');
  mediaEl._socialPreviewResizeObserver?.disconnect();
  mediaEl._socialPreviewResizeObserver = null;

  if (manualSnsLocalImages.length === 0) {
    manualSnsPreviewImageIndex = 0;
    mediaEl.classList.add('is-empty');
    mediaEl.style.removeProperty('--social-preview-ratio');
    mediaEl.style.removeProperty('width');
    const emptyState = document.createElement('div');
    emptyState.className = 'social-live-preview-empty-state';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'social-live-preview-empty-icon');
    icon.setAttribute('viewBox', '0 0 48 48');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('aria-hidden', 'true');
    const iconFrame = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    iconFrame.setAttribute('x', '5');
    iconFrame.setAttribute('y', '8');
    iconFrame.setAttribute('width', '38');
    iconFrame.setAttribute('height', '31');
    iconFrame.setAttribute('rx', '4');
    const iconSun = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    iconSun.setAttribute('cx', '32');
    iconSun.setAttribute('cy', '18');
    iconSun.setAttribute('r', '3');
    const iconLandscape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    iconLandscape.setAttribute('d', 'm9 34 10-10 7 7 5-5 8 8');
    icon.append(iconFrame, iconSun, iconLandscape);
    const empty = document.createElement('p');
    empty.className = 'social-live-preview-empty';
    empty.textContent = '이미지를 선택하면 여기에 표시됩니다.';
    emptyState.append(icon, empty);
    mediaEl.append(emptyState, paginationEl);
    paginationEl.hidden = true;
    return;
  }

  mediaEl.classList.remove('is-empty');
  manualSnsPreviewImageIndex = Math.min(manualSnsPreviewImageIndex, manualSnsLocalImages.length - 1);
  const activeImage = manualSnsLocalImages[manualSnsPreviewImageIndex];
  const image = document.createElement('img');
  image.src = activeImage.previewUrl;
  image.alt = `${manualSnsPreviewImageIndex + 1}번 이미지 미리보기`;
  image.draggable = false;
  mediaEl.appendChild(image);
  if (manualSnsLocalImages.length > 1) {
    const makeArrow = (direction) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `social-live-preview-arrow is-${direction}`;
      button.setAttribute('aria-label', direction === 'previous' ? '이전 이미지' : '다음 이미지');
      button.addEventListener('click', () => {
        const offset = direction === 'previous' ? -1 : 1;
        manualSnsPreviewImageIndex = (manualSnsPreviewImageIndex + offset + manualSnsLocalImages.length) % manualSnsLocalImages.length;
        syncManualSnsLivePreview();
      });
      return button;
    };
    mediaEl.append(makeArrow('previous'), makeArrow('next'));
  }
  const updatePreviewImageRatio = () => {
    const currentImage = mediaEl.querySelector('img');
    if (!currentImage?.naturalWidth || !currentImage?.naturalHeight) return;
    mediaEl.style.setProperty('--social-preview-ratio', `${currentImage.naturalWidth} / ${currentImage.naturalHeight}`);
    const isPortrait = currentImage.naturalHeight > currentImage.naturalWidth;
    mediaEl.classList.toggle('is-portrait', isPortrait);
    composerLayout?.classList.toggle('is-portrait-preview', isPortrait);
    const mediaWidth = mediaEl.clientWidth;
    const mediaHeight = mediaEl.clientHeight;
    if (!mediaWidth || !mediaHeight) return;
    const imageRatio = currentImage.naturalWidth / currentImage.naturalHeight;
    const displayedHeight = Math.min(mediaHeight, mediaWidth / imageRatio);
    const spaceBelowImage = (mediaHeight - displayedHeight) / 2;
    const paginationHeight = paginationEl.getBoundingClientRect().height || 36;
    paginationEl.style.bottom = `${spaceBelowImage - paginationHeight - 4}px`;
  };
  image.addEventListener('load', updatePreviewImageRatio, { once: true });
  if (image.complete) updatePreviewImageRatio();
  mediaEl.appendChild(paginationEl);
  paginationEl.hidden = manualSnsLocalImages.length < 2;
  if (typeof ResizeObserver === 'function') {
    mediaEl._socialPreviewResizeObserver = new ResizeObserver(updatePreviewImageRatio);
    mediaEl._socialPreviewResizeObserver.observe(mediaEl);
  }

  if (mediaEl.dataset.swipeBound !== 'true') {
    let pointerStartX = null;
    mediaEl.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointerStartX = event.clientX;
    });
    mediaEl.addEventListener('pointerup', (event) => {
      if (pointerStartX === null || manualSnsLocalImages.length < 2) return;
      const deltaX = event.clientX - pointerStartX;
      pointerStartX = null;
      if (Math.abs(deltaX) < 44) return;
      const direction = deltaX < 0 ? 1 : -1;
      manualSnsPreviewImageIndex = (manualSnsPreviewImageIndex + direction + manualSnsLocalImages.length) % manualSnsLocalImages.length;
      syncManualSnsLivePreview();
    });
    mediaEl.addEventListener('pointercancel', () => { pointerStartX = null; });
    mediaEl.dataset.swipeBound = 'true';
  }

  manualSnsLocalImages.forEach((_item, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'social-live-preview-dot';
    dot.classList.toggle('is-active', index === manualSnsPreviewImageIndex);
    dot.setAttribute('aria-label', `${index + 1}번 이미지 보기`);
    dot.setAttribute('aria-pressed', String(index === manualSnsPreviewImageIndex));
    dot.addEventListener('click', () => {
      manualSnsPreviewImageIndex = index;
      syncManualSnsLivePreview();
    });
    paginationEl.appendChild(dot);
  });
}

function syncManualSnsComposerState() {
  syncManualSnsImageSourceUi();
  const textEl = document.getElementById('manual-sns-text');
  const countEl = document.getElementById('manual-sns-character-count');
  const feedbackEl = document.getElementById('manual-sns-ai-status');
  const summaryEl = document.getElementById('manual-sns-publish-summary');
  const publishBtn = document.getElementById('manual-sns-publish-btn');
  const newPostBtn = document.getElementById('manual-sns-new-post-btn');
  const publishActionGroup = newPostBtn?.closest('.social-publish-action-group');
  const selectAllEl = document.getElementById('manual-sns-select-all');
  const optimizeBtn = document.getElementById('manual-sns-ai-optimize-btn');
  const optimizeActionEl = document.getElementById('manual-sns-ai-action');
  const optimizeConfirmActionsEl = document.getElementById('manual-sns-ai-confirm-actions');
  const optimizeConfirmBtn = document.getElementById('manual-sns-ai-confirm-btn');
  const optimizeCancelBtn = document.getElementById('manual-sns-ai-cancel-btn');
  const undoBtn = document.getElementById('manual-sns-ai-undo-btn');
  const imageFileEl = document.getElementById('manual-sns-image-file');
  const text = String(textEl?.value || '').trim();
  const hasText = Boolean(text);
  syncManualSnsLivePreview();
  const characterCount = Array.from(text).length;
  const selectedChannels = getManualSnsSelectedChannels();
  const image = getManualSnsImageValidation();
  const publishSignature = getManualSnsPublishSignature();
  const alreadyPublished = Boolean(manualSnsLastPublishedSignature)
    && manualSnsLastPublishedSignature === publishSignature;
  let errorMessage = '';

  if (textEl) textEl.disabled = manualSnsPublishingInFlight;
  if (imageFileEl) imageFileEl.disabled = manualSnsPublishingInFlight || manualSnsImageGenerationInFlight || manualSnsConfig.local_media_available !== true;

  const missingLimitChannel = selectedChannels.find((channel) => getManualSnsChannelTextLimit(channel) <= 0
    || !(Number(channel.max_assets) > 0));
  const exceeded = selectedChannels.find((channel) => getManualSnsChannelTextLimit(channel) > 0
    && characterCount > getManualSnsChannelTextLimit(channel));
  if (missingLimitChannel) {
    errorMessage = `${missingLimitChannel.name || missingLimitChannel.service} 제한 정보를 확인할 수 없습니다. 작업 공간을 다시 불러오세요.`;
  } else if (exceeded) {
    const limit = getManualSnsChannelTextLimit(exceeded);
    errorMessage = `${exceeded.name || exceeded.service} 글자 수 제한을 ${characterCount - limit}자 초과했습니다. (${characterCount}/${limit}자)`;
  } else if (!image.valid) {
    errorMessage = image.message;
  } else {
    const imageRequired = selectedChannels.find((channel) => channel.image_required === true);
    if (imageRequired && !image.hasImage) {
      errorMessage = `${imageRequired.name || imageRequired.service} 채널은 이미지가 필요합니다.`;
    }
  }

  const selectedLimits = selectedChannels.map(getManualSnsChannelTextLimit);
  const shortestLimit = selectedLimits.length > 0 ? Math.min(...selectedLimits) : 0;
  if (countEl) {
    countEl.textContent = shortestLimit > 0
      ? `${characterCount}/${shortestLimit.toLocaleString('ko-KR')}자`
      : `${characterCount.toLocaleString('ko-KR')}자`;
    countEl.classList.toggle('is-over', Boolean(exceeded));
  }
  if (feedbackEl) {
    const feedback = errorMessage || manualSnsAiStatusMessage || (selectedChannels.length > 0
      ? (shortestLimit > 0
        ? `선택 채널 중 가장 낮은 글자 수 제한은 ${shortestLimit.toLocaleString('ko-KR')}자입니다.`
        : '선택 채널의 글자 수 제한을 확인할 수 없습니다. 작업 공간을 다시 불러오세요.')
      : '채널을 선택하면 글자 수 제한이 표시됩니다.');
    feedbackEl.textContent = feedback;
    feedbackEl.classList.toggle('is-error', Boolean(errorMessage || manualSnsAiStatusIsError));
    feedbackEl.classList.toggle('is-visible', Boolean(feedback));
  }
  if (summaryEl) {
    summaryEl.textContent = selectedChannels.length > 0
      ? hasText
        ? `${selectedChannels.length}개 채널에 즉시 발행합니다${image.hasImage ? ` · 이미지 ${image.files?.length || 1}장` : ''}.`
        : `${selectedChannels.length}개 채널 선택됨`
      : '발행할 채널을 선택하세요.';
  }
  if (newPostBtn) {
    newPostBtn.hidden = !manualSnsLastPublishedSignature;
    newPostBtn.disabled = manualSnsPublishingInFlight || manualSnsImageGenerationInFlight;
    newPostBtn.classList.toggle('primary', alreadyPublished);
    newPostBtn.classList.toggle('secondary', !alreadyPublished);
  }
  publishActionGroup?.classList.toggle('has-new-post-primary', alreadyPublished);
  if (publishBtn) {
    publishBtn.textContent = manualSnsPublishingInFlight
      ? '발행 중...'
      : alreadyPublished
        ? '발행 완료'
        : selectedChannels.length > 0 ? `${selectedChannels.length}개 채널에 지금 발행` : '지금 발행';
    publishBtn.disabled = manualSnsPublishingInFlight || manualSnsImageGenerationInFlight || alreadyPublished || manualSnsOptimizationInFlight || !manualSnsConfig.configured || selectedChannels.length === 0 || !text || Boolean(errorMessage);
    publishBtn.classList.toggle('primary', !alreadyPublished);
    publishBtn.classList.toggle('secondary', alreadyPublished);
    publishBtn.title = errorMessage || (!hasText && selectedChannels.length > 0 ? '발행할 내용을 입력해 주세요.' : '');
    publishBtn.classList.toggle('is-loading', manualSnsPublishingInFlight);
    publishBtn.classList.toggle('is-published', alreadyPublished);
    publishBtn.setAttribute('aria-busy', manualSnsPublishingInFlight ? 'true' : 'false');
  }
  if (optimizeBtn) {
    const aiAvailable = manualSnsConfig.ai?.available === true;
    setUiAiActionButton(optimizeBtn, manualSnsOptimizationInFlight ? '최적화 중…' : '최적화');
    if (optimizeActionEl) optimizeActionEl.hidden = !aiAvailable || manualSnsOptimizationConfirmOpen;
    if (optimizeConfirmActionsEl) optimizeConfirmActionsEl.hidden = !aiAvailable || !manualSnsOptimizationConfirmOpen;
    optimizeBtn.hidden = manualSnsOptimizationConfirmOpen;
    optimizeBtn.disabled = manualSnsPublishingInFlight || manualSnsOptimizationInFlight || !text;
    optimizeBtn.title = !text
      ? '내용을 입력하면 사용할 수 있습니다.'
      : selectedChannels.length > 0
        ? '선택 채널의 글자 수 제한에 맞춰 내용을 다듬습니다.'
        : '연결된 Chat Model로 내용을 다듬습니다. 채널별 글자 수 제한은 발행 시 확인합니다.';
    if (optimizeConfirmBtn) {
      setUiAiActionButton(optimizeConfirmBtn, manualSnsOptimizationInFlight ? '최적화 중…' : '최적화 적용');
      optimizeConfirmBtn.disabled = manualSnsPublishingInFlight || manualSnsOptimizationInFlight || !text;
    }
    if (optimizeCancelBtn) optimizeCancelBtn.disabled = manualSnsPublishingInFlight || manualSnsOptimizationInFlight;
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
    messageEl.textContent = manualSnsConfig.workspaceLoadMessage
      || (!manualSnsConfig.configured
        ? '설정에서 Buffer 연결을 확인하고 다시 연결해 주세요.'
      : (!manualSnsConfig.workspacesLoaded
        ? '작업 공간 불러오기를 눌러 SNS 채널을 확인해 주세요.'
        : (!manualSnsConfig.organizationId ? '작업 공간을 선택하면 SNS 채널이 표시됩니다.' : '선택한 작업 공간에 사용할 수 있는 SNS 채널이 없습니다.')));
    const linksEl = document.createElement('div');
    linksEl.className = 'buffer-resource-links social-channel-help-links';
    linksEl.setAttribute('aria-label', 'Buffer 관련 링크');
    if (!manualSnsConfig.configured || manualSnsConfig.workspaceReconnectRequired) {
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
      syncManualSnsImagePreview();
      syncManualSnsComposerState();
    });
    const copy = document.createElement('span');
    copy.className = 'social-channel-copy ui-selectable-card-copy';
    const name = document.createElement('strong');
    name.textContent = channel.name || channel.service || 'Buffer 채널';
    const detail = document.createElement('span');
    const textLimit = getManualSnsChannelTextLimit(channel);
    detail.textContent = unavailable
      ? '현재 수동 발행 미지원'
      : `${channel.service} · ${textLimit > 0 ? `최대 ${textLimit.toLocaleString('ko-KR')}자` : '글자 수 제한 확인 필요'} · ${Number(channel.max_assets) > 0 ? `이미지 ${Number(channel.max_assets)}장` : '이미지 제한 확인 필요'}${channel.image_required ? ' 필수' : ''}`;
    copy.append(name, detail);
    label.append(input, copy);
    listEl.appendChild(label);
  });
  if (manualSnsConfig.workspaceLoadMessage) {
    const statusEl = document.createElement('p');
    statusEl.className = 'muted social-channel-refresh-note';
    statusEl.textContent = manualSnsConfig.workspaceLoadMessage;
    listEl.appendChild(statusEl);
  }
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
      }
      refreshStaleSnapshot = !snapshot || !snapshot.isFresh;
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
