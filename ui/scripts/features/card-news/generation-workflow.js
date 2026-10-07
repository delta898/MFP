// Card News composition and image generation workflow.
function renderCardNewsCompositionSkeleton(slideCount, aspectRatio = '4:5') {
  const panel = document.getElementById('card-news-result-panel');
  const grid = document.getElementById('card-news-result-grid');
  if (!panel || !grid) return;
  panel.hidden = false;
  syncCardNewsImageModelControlLocation();
  panel.dataset.aspectRatio = aspectRatio;
  document.getElementById('card-news-result-title').textContent = '카드뉴스 구성 중';
  document.getElementById('card-news-result-summary').textContent = `${slideCount}장의 카드 구성을 준비하고 있습니다.`;
  ['card-news-regenerate', 'card-news-bulk-image-action'].forEach((id) => {
    const action = document.getElementById(id);
    if (action) {
      action.hidden = false;
      action.disabled = true;
    }
  });
  const exportAll = document.getElementById('card-news-export-all');
  if (exportAll) exportAll.hidden = true;
  const publishOpen = document.getElementById('card-news-publish-open');
  if (publishOpen) publishOpen.hidden = true;
  const publishingPanel = document.getElementById('card-news-publishing-panel');
  if (publishingPanel) publishingPanel.hidden = true;
  grid.innerHTML = Array.from({ length: slideCount }, (_, offset) => `
    <article class="card-news-result-item is-composing" aria-label="${offset + 1}번째 카드 구성 생성 중">
      <div class="card-news-result-image-empty card-news-result-skeleton" aria-hidden="true">
        <span class="ui-spinner ui-spinner-lg ui-spinner-accent"></span>
        <strong>카드 구성 생성 중</strong>
      </div>
      <div class="card-news-result-copy" aria-hidden="true">
        <span class="card-news-skeleton-line"></span>
        <span class="card-news-skeleton-line is-short"></span>
      </div>
    </article>`).join('');
  UiGridTailSpacers.sync(grid, {
    itemSelector: '.card-news-result-item',
    spacerClass: 'ui-grid-tail-spacer card-news-result-grid-spacer'
  });
  panel.setAttribute('aria-busy', 'true');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function updateCardNewsImageProgress(generation) {
  const previous = cardNewsViewState.generation;
  const changed = !previous || previous.id !== generation.id
    || (generation.cards || []).some((card, index) => card.image_url !== previous.cards?.[index]?.image_url);
  if (changed) renderCardNewsGeneration(generation, { scroll: false });
  const total = generation.cards?.length || 0;
  const ready = (generation.cards || []).filter((card) => card.image_url).length;
  const currentIndex = Number(generation.current_image_index || 0);
  const operation = cardNewsViewState.imageOperation;
  document.querySelectorAll('[data-card-news-result-index]').forEach((cardElement) => {
    const overlay = cardElement.querySelector('[data-card-news-image-working]');
    if (!overlay) return;
    const cardIndex = Number(cardElement.dataset.cardNewsResultIndex);
    const active = operation?.mode === 'single'
      ? cardIndex === Number(operation.cardIndex)
      : currentIndex > 0 && cardIndex === currentIndex;
    overlay.hidden = !active;
    const label = overlay.querySelector('strong');
    if (label && active) {
      label.textContent = operation?.mode === 'single'
        ? `${cardIndex}번째 이미지 만드는 중…`
        : `${currentIndex}/${total}번째 이미지 만드는 중…`;
    }
  });
  setCardNewsGenerationStatus(
    operation?.state === 'cancel_requested'
      ? `이미지 생성 중지를 요청했습니다. ${ready}/${total}장 완료`
      : `이미지를 만들고 있습니다. ${ready}/${total}장 완료`,
    'loading'
  );
  setCardNewsResultControlsDisabled(true);
  syncCardNewsImageStopControls();
}

async function monitorCardNewsImageGeneration(generationId, operationRequest) {
  const operation = {
    generationId,
    mode: operationRequest.mode,
    cardIndex: operationRequest.cardIndex,
    replacing: operationRequest.replacing,
    operationId: '',
    state: 'starting',
    canCancel: true,
    confirmingStop: false,
    remoteJobPossible: false
  };
  cardNewsViewState.imageOperation = operation;
  try {
    const started = await postJson('/api/v1/card-news/image-operations', {
      generation_id: generationId,
      mode: operation.mode,
      card_index: operation.cardIndex || undefined,
      image_model_selection: getCardNewsImageModelSelection()
    });
    if (cardNewsViewState.imageOperation !== operation) return;
    operation.operationId = started.operationId;
    operation.state = started.state || 'accepted';
    operation.canCancel = started.canCancel !== false;
    operation.remoteJobPossible = started.remoteJobPossible === true;
    syncCardNewsImageStopControls();
    let finalOperation = null;
    let pollFailures = 0;
    while (cardNewsViewState.imageOperation === operation) {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      let current;
      try {
        current = await fetchJson(`/api/v1/card-news/image-operations/${encodeURIComponent(operation.operationId)}`);
        pollFailures = 0;
      } catch (_) {
        pollFailures += 1;
        if (pollFailures >= 5) setCardNewsGenerationStatus('이미지 생성 상태를 다시 확인하고 있습니다.', 'warning');
        continue;
      }
      operation.state = current.state;
      operation.canCancel = current.canCancel !== false;
      operation.remoteJobPossible = current.remoteJobPossible === true;
      try {
        const result = await fetchJson(`/api/v1/card-news/generations/${encodeURIComponent(generationId)}`);
        updateCardNewsImageProgress(result.generation);
      } catch (_) { /* Keep polling the operation; its result remains authoritative. */ }
      syncCardNewsImageStopControls();
      if (['completed', 'failed', 'canceled'].includes(current.state)) {
        finalOperation = current;
        break;
      }
    }
    if (cardNewsViewState.imageOperation !== operation) return;
    if (finalOperation?.state === 'completed' && finalOperation.result?.generation) {
      const generation = finalOperation.result.generation;
      renderCardNewsGeneration(generation, { scroll: false });
      setCardNewsGenerationStatus(
        generation.status === 'partial'
          ? (generation.error?.message || '완성한 이미지는 유지했습니다. 미완성 카드는 다시 시도해 주세요.')
          : '카드 이미지를 준비했습니다.',
        generation.status === 'partial' ? 'warning' : 'ready'
      );
    } else if (finalOperation?.state === 'canceled') {
      const result = await fetchJson(`/api/v1/card-news/generations/${encodeURIComponent(generationId)}`);
      renderCardNewsGeneration(result.generation, { scroll: false });
      setCardNewsGenerationStatus('이미지 생성을 중지했습니다. 완성된 이미지는 유지됩니다.', 'warning', {
        title: operation.remoteJobPossible
          ? '완성된 이미지는 유지됩니다. 이미 접수된 외부 이미지 작업은 계속되거나 비용이 발생할 수 있습니다.'
          : '완성된 이미지는 유지됩니다.'
      });
    } else {
      const message = finalOperation?.error?.message || '카드 이미지를 만들지 못했습니다. 다시 시도해 주세요.';
      setCardNewsGenerationStatus(message, 'error');
    }
  } finally {
    if (cardNewsViewState.imageOperation === operation) cardNewsViewState.imageOperation = null;
  }
}

async function monitorCardNewsCompositionGeneration(payload, imageMode) {
  const operation = {
    imageMode,
    operationId: '',
    state: 'starting',
    canCancel: true,
    confirmingStop: false
  };
  cardNewsViewState.compositionOperation = operation;
  try {
    const started = await postJson('/api/v1/card-news/composition-operations', payload);
    if (cardNewsViewState.compositionOperation !== operation) return null;
    operation.operationId = started.operationId;
    operation.state = started.state || 'accepted';
    operation.canCancel = started.canCancel !== false;
    syncCardNewsImageStopControls();
    let finalOperation = null;
    let pollFailures = 0;
    while (cardNewsViewState.compositionOperation === operation) {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      let current;
      try {
        current = await fetchJson(`/api/v1/card-news/composition-operations/${encodeURIComponent(operation.operationId)}`);
        pollFailures = 0;
      } catch (_) {
        pollFailures += 1;
        if (pollFailures >= 5) setCardNewsGenerationStatus('카드 구성 생성 상태를 다시 확인하고 있습니다.', 'warning');
        continue;
      }
      operation.state = current.state;
      operation.canCancel = current.canCancel !== false;
      syncCardNewsImageStopControls();
      if (['completed', 'failed', 'canceled'].includes(current.state)) {
        finalOperation = current;
        break;
      }
    }
    if (cardNewsViewState.compositionOperation !== operation) return null;
    if (finalOperation?.state === 'completed' && finalOperation.result?.generation) {
      return finalOperation.result.generation;
    }
    if (finalOperation?.state === 'canceled') {
      const error = new Error('카드 구성 생성을 중지했습니다.');
      error.code = 'AI_GENERATION_CANCELED';
      throw error;
    }
    const error = new Error(finalOperation?.error?.message || '카드 구성을 만들지 못했습니다. AI 설정을 확인한 뒤 다시 시도해 주세요.');
    error.code = finalOperation?.error?.code || 'CARD_NEWS_GENERATION_FAILED';
    throw error;
  } finally {
    if (cardNewsViewState.compositionOperation === operation) {
      cardNewsViewState.compositionOperation = null;
      syncCardNewsImageStopControls();
    }
  }
}

function continueCardNewsImageGeneration() {
  const operation = cardNewsViewState.imageOperation;
  if (!operation?.confirmingStop || operation.state === 'cancel_requested' || operation.canCancel === false) return;
  operation.confirmingStop = false;
  syncCardNewsImageStopControls();
}

async function handleCardNewsImageStop() {
  const operation = cardNewsViewState.imageOperation;
  if (!operation || operation.canCancel === false || ['cancel_requested', 'starting', 'too_late'].includes(operation.state)) return;
  if (!operation.confirmingStop) {
    operation.confirmingStop = true;
    syncCardNewsImageStopControls();
    return;
  }
  operation.confirmingStop = false;
  operation.state = 'cancel_requested';
  syncCardNewsImageStopControls();
  setCardNewsGenerationStatus('이미지 생성 중지를 요청했습니다.', 'loading');
  try {
    const result = await postJson(`/api/v1/card-news/image-operations/${encodeURIComponent(operation.operationId)}/cancel`);
    if (result.cancelOutcome === 'too_late' || result.state === 'completed') {
      operation.state = 'too_late';
      operation.canCancel = false;
      setCardNewsGenerationStatus('중지하기 전에 이미지 생성이 완료되었습니다.', 'warning');
    }
  } catch (error) {
    operation.state = 'running';
    setCardNewsGenerationStatus(error.message || '이미지 생성을 중지하지 못했습니다.', 'error');
  }
  syncCardNewsImageStopControls();
}

async function handleCardNewsStop() {
  const compositionOperation = cardNewsViewState.compositionOperation;
  if (compositionOperation) {
    if (compositionOperation.canCancel === false || ['cancel_requested', 'starting', 'too_late'].includes(compositionOperation.state)) return;
    if (!compositionOperation.confirmingStop) {
      compositionOperation.confirmingStop = true;
      syncCardNewsImageStopControls();
      return;
    }
    compositionOperation.confirmingStop = false;
    compositionOperation.state = 'cancel_requested';
    syncCardNewsImageStopControls();
    setCardNewsGenerationStatus('카드 구성 생성을 중지 요청했습니다.', 'loading');
    try {
      const result = await postJson(`/api/v1/card-news/composition-operations/${encodeURIComponent(compositionOperation.operationId)}/cancel`);
      if (result.cancelOutcome === 'too_late' || result.state === 'completed') {
        compositionOperation.state = 'too_late';
        compositionOperation.canCancel = false;
      }
    } catch (error) {
      compositionOperation.state = 'running';
      setCardNewsGenerationStatus(error.message || '카드 구성 생성을 중지하지 못했습니다.', 'error');
    }
    syncCardNewsImageStopControls();
    return;
  }
  await handleCardNewsImageStop();
}

function handleCardNewsGenerationSettingChange() {
  saveCardNewsGenerationSettings();
  if (cardNewsViewState.generation && !cardNewsViewState.generating) {
    setCardNewsGenerationStatus('설정이 변경되었습니다. 다시 만들면 새 설정이 적용됩니다.', 'warning');
  }
}

function renderCardNewsGeneration(generation, options = {}) {
  const previousGenerationId = cardNewsViewState.generation?.id || '';
  cardNewsViewState.generation = generation;
  cardNewsViewState.projectId = generation?.project_id || '';
  if (previousGenerationId && previousGenerationId !== generation?.id) {
    const publishingPanel = document.getElementById('card-news-publishing-panel');
    if (publishingPanel) publishingPanel.hidden = true;
    cardNewsViewState.publishingRequestId += 1;
    const publishingText = document.getElementById('card-news-publishing-text');
    if (publishingText) publishingText.value = '';
    const publishingStatus = document.getElementById('card-news-publishing-status');
    if (publishingStatus) {
      publishingStatus.textContent = '';
      publishingStatus.dataset.state = '';
    }
    const publishingResult = document.getElementById('card-news-publishing-result');
    if (publishingResult) {
      publishingResult.hidden = true;
      publishingResult.innerHTML = '';
    }
    cardNewsViewState.publishingConfig = null;
    cardNewsViewState.publishingOutcome = '';
  }
  const panel = document.getElementById('card-news-result-panel');
  const grid = document.getElementById('card-news-result-grid');
  if (!panel || !grid) return;
  panel.hidden = false;
  panel.dataset.aspectRatio = generation.settings?.aspect_ratio || '4:5';
  document.getElementById('card-news-result-title').textContent = generation.title || '만든 카드뉴스';
  const imageCount = (generation.cards || []).filter((card) => card.image_url).length;
  const importedGeneration = generation.image_mode === 'imported';
  const bulkImageAction = document.getElementById('card-news-bulk-image-action');
  const regenerate = document.getElementById('card-news-regenerate');
  if (regenerate) {
    regenerate.hidden = importedGeneration
      || options.allowCompositionRegeneration === false
      || !cardNewsViewState.preview
      || !cardNewsViewState.projectId;
  }
  if (bulkImageAction) {
    bulkImageAction.hidden = importedGeneration;
    const label = imageCount === 0
      ? '이미지 생성'
      : (imageCount < (generation.cards?.length || 0) ? '누락 이미지 생성' : '전체 재생성');
    const imageOperation = cardNewsViewState.imageOperation;
    const isStopAction = imageOperation && imageOperation.mode !== 'single';
    setUiAiActionButton(bulkImageAction, isStopAction ? '중지' : label, { ai: !isStopAction });
    bulkImageAction.classList.toggle('primary', imageCount < (generation.cards?.length || 0));
    bulkImageAction.classList.toggle('secondary', imageCount === (generation.cards?.length || 0));
  }
  const exportAll = document.getElementById('card-news-export-all');
  const publishOpen = document.getElementById('card-news-publish-open');
  if (exportAll) {
    const complete = imageCount > 0 && imageCount === (generation.cards?.length || 0);
    exportAll.hidden = !complete;
    exportAll.href = complete
      ? cardNewsUrlWithSignature(`/api/v1/card-news/exports/${encodeURIComponent(generation.id)}.zip`)
      : '#';
  }
  if (publishOpen) publishOpen.hidden = true;
  document.getElementById('card-news-result-summary').textContent = imageCount > 0
    ? `${generation.cards?.length || 0}장의 구성 · 이미지 ${imageCount}/${generation.cards?.length || 0}장 준비`
    : `${generation.cards?.length || 0}장의 구성과 이미지 프롬프트가 준비되었습니다.`;
  grid.innerHTML = (generation.cards || []).map((card) => `
    <article class="card-news-result-item${card.image_status === 'failed' && !card.image_url ? ' is-image-failed' : ''}" data-card-news-result-index="${card.index}">
      <div class="card-news-result-image-wrap${card.image_url ? '' : ' is-empty'}">
        ${card.image_url
          ? `<img src="${escapeHtml(cardNewsUrlWithSignature(card.image_url))}" alt="${escapeHtml(`${card.index}번째 카드: ${card.headline}`)}">`
          : `<div class="card-news-result-image-empty"><span>${card.image_status === 'failed' ? '이미지 생성 실패' : '이미지 미지정'}</span><small>${card.image_status === 'failed' ? escapeHtml(card.image_error || '다시 시도하거나 내 이미지로 채울 수 있습니다.') : 'AI로 만들거나 내 이미지로 채울 수 있습니다.'}</small></div>`}
        <div class="card-news-media-actions${card.image_url ? '' : ' is-empty'}${cardNewsViewState.imageOperation?.mode === 'single' && Number(cardNewsViewState.imageOperation.cardIndex) === Number(card.index) ? ' is-working' : ''}">
          ${importedGeneration ? '' : (() => {
            const operation = cardNewsViewState.imageOperation;
            const activeSingle = operation?.mode === 'single' && Number(operation.cardIndex) === Number(card.index);
            const label = activeSingle
              ? (operation.state === 'cancel_requested' ? '중지 요청 중…' : operation.canCancel === false ? '마무리 중…' : operation.confirmingStop ? '중지 확인' : '중지')
              : card.image_url ? '이미지 재생성' : '이미지 생성';
            const classes = activeSingle ? 'ghost ui-danger-action compact' : `${card.image_url ? 'secondary' : 'primary'} compact`;
            return `<button class="${classes}" type="button" data-card-news-image-action="${card.index}"${activeSingle ? ' data-card-news-image-stop' : ''}${activeSingle && (operation.state === 'cancel_requested' || operation.canCancel === false || !operation.operationId) ? ' disabled' : ''}>${label}</button>`;
          })()}
          <button class="secondary compact card-news-local-image-picker" type="button" data-card-news-local-picker="${card.index}" aria-label="${card.image_url ? '내 이미지로 교체' : '내 이미지에서 선택'}" title="${card.image_url ? '내 이미지로 교체' : '내 이미지에서 선택'}">＋</button>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" data-card-news-local-image="${card.index}" hidden>
          ${card.download_url ? `<a class="ui-button-link secondary compact" href="${escapeHtml(cardNewsUrlWithSignature(card.download_url))}" download>받기</a>` : ''}
        </div>
        <span class="ui-sequence-badge">${card.index}</span>
        <div class="card-news-image-working" data-card-news-image-working hidden>
          <span class="ui-spinner ui-spinner-lg ui-spinner-accent" aria-hidden="true"></span>
          <strong>이미지 만드는 중…</strong>
        </div>
      </div>
      <div class="card-news-result-copy">
        <strong>${escapeHtml(card.headline)}</strong>
        <p>${escapeHtml(card.body || '')}</p>
        ${card.image_prompt ? `<div class="card-news-prompt-section">
          <details class="card-news-prompt-details">
            <summary>프롬프트 보기</summary>
            <p>${escapeHtml(card.image_prompt || '')}</p>
          </details>
          <button class="ui-text-action compact card-news-prompt-copy" type="button" data-card-news-prompt-copy="${card.index}">복사</button>
        </div>` : ''}
      </div>
    </article>`).join('');
  UiGridTailSpacers.sync(grid, {
    itemSelector: '.card-news-result-item',
    spacerClass: 'ui-grid-tail-spacer card-news-result-grid-spacer'
  });
  grid.querySelectorAll('[data-card-news-prompt-copy]').forEach((button) => {
    button.addEventListener('click', () => void copyCardNewsPrompt(Number(button.dataset.cardNewsPromptCopy), button));
  });
  grid.querySelectorAll('[data-card-news-image-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const activeOperation = cardNewsViewState.imageOperation;
      if (activeOperation?.mode === 'single' && Number(activeOperation.cardIndex) === Number(button.dataset.cardNewsImageAction)) {
        void handleCardNewsImageStop();
      } else {
        void runCardNewsImageGeneration({ mode: 'single', cardIndex: Number(button.dataset.cardNewsImageAction) });
      }
    });
  });
  grid.querySelectorAll('[data-card-news-local-image]').forEach((input) => {
    input.addEventListener('change', () => void importCardNewsLocalImage(Number(input.dataset.cardNewsLocalImage), input));
  });
  grid.querySelectorAll('[data-card-news-local-picker]').forEach((button) => {
    button.addEventListener('click', () => {
      grid.querySelector(`[data-card-news-local-image="${button.dataset.cardNewsLocalPicker}"]`)?.click();
    });
  });
  grid.querySelectorAll('.card-news-result-image-wrap').forEach((wrap) => {
    const cardIndex = Number(wrap.closest('[data-card-news-result-index]')?.dataset.cardNewsResultIndex);
    const hint = document.createElement('div');
    hint.className = 'card-news-image-drop-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.innerHTML = '<span aria-hidden="true">＋</span><strong>이미지를 놓아 추가</strong>';
    const feedback = document.createElement('div');
    feedback.className = 'card-news-image-drop-feedback';
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    feedback.hidden = true;
    wrap.append(hint, feedback);
    let dragDepth = 0;
    const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');
    const fileInput = wrap.querySelector(`[data-card-news-local-image="${cardIndex}"]`);
    const acceptDroppedFile = (file) => {
      const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);
      const type = String(file?.type || '').toLowerCase();
      const extension = String(file?.name || '').split('.').pop().toLowerCase();
      if (!file || (type ? !allowedTypes.has(type) : !['png', 'jpg', 'jpeg', 'webp', 'avif'].includes(extension))) {
        feedback.textContent = 'PNG, JPEG, WebP 또는 AVIF 이미지를 선택해 주세요.';
        feedback.hidden = false;
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        feedback.textContent = '이미지는 최대 10MB까지 선택할 수 있습니다.';
        feedback.hidden = false;
        return;
      }
      if (cardNewsViewState.generating || cardNewsViewState.imageOperation) {
        feedback.textContent = '이미지 작업이 끝난 뒤 다시 시도해 주세요.';
        feedback.hidden = false;
        return;
      }
      feedback.textContent = '';
      feedback.hidden = true;
      const transfer = new DataTransfer();
      transfer.items.add(file);
      fileInput.files = transfer.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    };
    wrap.addEventListener('dragenter', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      dragDepth += 1;
      if (!cardNewsViewState.generating && !cardNewsViewState.imageOperation) wrap.classList.add('is-drag-over');
    });
    wrap.addEventListener('dragover', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = cardNewsViewState.generating || cardNewsViewState.imageOperation ? 'none' : 'copy';
    });
    wrap.addEventListener('dragleave', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) wrap.classList.remove('is-drag-over');
    });
    wrap.addEventListener('drop', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      dragDepth = 0;
      wrap.classList.remove('is-drag-over');
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length !== 1) {
        feedback.textContent = '한 번에 이미지 한 장씩 추가해 주세요.';
        feedback.hidden = false;
        return;
      }
      acceptDroppedFile(files[0]);
    });
  });
  const complete = imageCount > 0 && imageCount === (generation.cards?.length || 0);
  if (complete) {
    void openCardNewsPublishing({ scroll: false });
  } else {
    const publishingPanel = document.getElementById('card-news-publishing-panel');
    if (publishingPanel) publishingPanel.hidden = true;
    if (typeof setCardNewsPublishingReadiness === 'function') setCardNewsPublishingReadiness();
  }
  setCardNewsResultControlsDisabled(cardNewsViewState.generating);
  syncCardNewsImageStopControls();
  if (options.scroll !== false) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setCardNewsImageWorking(working, message = '', options = {}) {
  cardNewsViewState.generating = working;
  setCardNewsResultControlsDisabled(working);
  document.getElementById('card-news-result-panel')?.setAttribute('aria-busy', String(working));
  const targetIndexes = new Set((options.cardIndexes || []).map(Number));
  document.querySelectorAll('[data-card-news-result-index]').forEach((cardElement) => {
    const isTarget = working && targetIndexes.has(Number(cardElement.dataset.cardNewsResultIndex));
    const overlay = cardElement.querySelector('[data-card-news-image-working]');
    if (!overlay) return;
    overlay.hidden = !isTarget;
    const label = overlay.querySelector('strong');
    if (label && isTarget) label.textContent = options.replacing ? '새 이미지 만드는 중…' : '이미지 만드는 중…';
  });
  if (working && message) setCardNewsGenerationStatus(message, 'loading');
  updateCardNewsGenerationAvailability();
  syncCardNewsImageStopControls();
}

async function runCardNewsImageGeneration({ mode = 'missing', cardIndex = 0 } = {}) {
  const generation = cardNewsViewState.generation;
  if (cardNewsViewState.generating || !generation) return;
  const card = generation.cards?.find((item) => Number(item.index) === Number(cardIndex));
  const replacing = mode === 'all' || (mode === 'single' && Boolean(card?.image_url));
  if (replacing) {
    const message = mode === 'all'
      ? '현재 이미지를 모두 다시 만들까요? 새 이미지가 완성된 카드부터 교체됩니다.'
      : '이 카드의 이미지를 다시 만들까요? 새 이미지가 완성된 후 교체됩니다.';
    const confirmed = await showUiConfirm(message, {
      title: '이미지 다시 만들기', confirmText: '다시 만들기', cancelText: '취소'
    });
    if (confirmed === false) return;
  }
  const targetCards = mode === 'single'
    ? (card ? [card] : [])
    : generation.cards.filter((item) => mode === 'all' || !item.image_url);
  setCardNewsImageWorking(
    true,
    mode === 'single' ? '카드 이미지를 만들고 있습니다.' : '카드 이미지를 차례로 만들고 있습니다.',
    { cardIndexes: mode === 'single' ? targetCards.map((item) => item.index) : [], replacing }
  );
  try {
    await monitorCardNewsImageGeneration(generation.id, { mode, cardIndex, replacing });
  } catch (error) {
    try {
      const latest = await fetchJson(`/api/v1/card-news/generations/${encodeURIComponent(generation.id)}`);
      renderCardNewsGeneration(latest.generation, { scroll: false });
    } catch (_) { }
    setCardNewsGenerationStatus(error.message || '카드 이미지를 만들지 못했습니다. 다시 시도해 주세요.', 'error');
  } finally {
    cardNewsViewState.imageOperation = null;
    setCardNewsImageWorking(false);
  }
}

function readCardNewsFileAsDataUrl(file, label = '이미지') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`${label} 파일을 읽지 못했습니다.`));
    reader.readAsDataURL(file);
  });
}

async function importCardNewsLocalImage(cardIndex, input) {
  const file = input?.files?.[0];
  const generation = cardNewsViewState.generation;
  if (!file || !generation || cardNewsViewState.generating) return;
  if (file.size > 10 * 1024 * 1024) {
    setCardNewsGenerationStatus('이미지는 최대 10MB까지 선택할 수 있습니다.', 'error');
    input.value = '';
    return;
  }
  setCardNewsImageWorking(true, '선택한 이미지를 적용하고 있습니다.', { cardIndexes: [cardIndex], replacing: true });
  try {
    const base64Data = await readCardNewsFileAsDataUrl(file);
    const result = await postJson('/api/v1/card-news/images/import', {
      generation_id: generation.id,
      card_index: cardIndex,
      file_name: file.name,
      mime_type: file.type || '',
      base64_data: base64Data
    });
    renderCardNewsGeneration(result.generation, { scroll: false });
    setCardNewsGenerationStatus('선택한 이미지를 카드에 적용했습니다.', 'ready');
  } catch (error) {
    setCardNewsGenerationStatus(error.message || '선택한 이미지를 적용하지 못했습니다.', 'error');
  } finally {
    input.value = '';
    setCardNewsImageWorking(false);
  }
}

async function copyCardNewsPrompt(cardIndex, button) {
  const card = cardNewsViewState.generation?.cards?.find((item) => Number(item.index) === Number(cardIndex));
  const prompt = String(card?.image_prompt || '').trim();
  if (!prompt) return;
  try {
    await navigator.clipboard.writeText(prompt);
    const original = button.textContent;
    button.textContent = '복사됨';
    window.setTimeout(() => { button.textContent = original; }, 1200);
  } catch (error) {
    if (typeof showUiToast === 'function') {
      showUiToast({ level: 'error', title: '프롬프트 복사 실패', message: '프롬프트를 열어 직접 복사해 주세요.' });
    } else {
      setCardNewsGenerationStatus('프롬프트를 복사하지 못했습니다. 내용을 열어 직접 복사해 주세요.', 'error');
    }
  }
}

async function generateCardNews(options = {}) {
  if (cardNewsViewState.generating || !cardNewsViewState.preview || !cardNewsPreviewMatchesCurrentSource()) return;
  const imageMode = options.imageMode || cardNewsViewState.generation?.image_mode || 'generate';
  const previousGeneration = cardNewsViewState.generation;
  let generationCreated = false;
  const settings = readCardNewsGenerationSettings();
  saveCardNewsGenerationSettings();
  setCardNewsGenerating(true, imageMode);
  renderCardNewsCompositionSkeleton(settings.slide_count, settings.aspect_ratio);
  setCardNewsGenerationStatus('카드 구성을 만들고 있습니다.', 'loading');
  try {
    const payload = {
      project_id: cardNewsViewState.projectId || '',
      source_snapshot: cardNewsViewState.preview,
      image_mode: 'prompt_only',
      settings,
      image_model_selection: getCardNewsImageModelSelection()
    };
    let generation = await monitorCardNewsCompositionGeneration(payload, imageMode);
    if (!generation) return;
    generationCreated = true;
    renderCardNewsGeneration(generation, { scroll: false });
    if (typeof refreshCardNewsSourcesAfterGeneration === 'function') refreshCardNewsSourcesAfterGeneration(generation);
    setCardNewsResultControlsDisabled(true);
    if (imageMode === 'generate') {
      setCardNewsGenerationStatus(`카드 구성을 완성했습니다. 이미지 0/${generation.cards.length}장 생성 중`, 'loading');
      try {
        await monitorCardNewsImageGeneration(generation.id, { mode: 'all', cardIndex: 0, replacing: false });
      } catch (imageError) {
        try {
          const latest = await fetchJson(`/api/v1/card-news/generations/${encodeURIComponent(generation.id)}`);
          generation = latest.generation;
          renderCardNewsGeneration(generation, { scroll: false });
        } catch (_) { }
        setCardNewsGenerationStatus(imageError.message || '이미지 생성이 끝나지 않았습니다. 완성된 카드와 구성은 유지했습니다.', 'warning');
      }
    } else {
      setCardNewsGenerationStatus('카드 구성과 프롬프트를 완성했습니다.', 'ready');
    }
  } catch (error) {
    if (previousGeneration) renderCardNewsGeneration(previousGeneration, { scroll: false });
    else {
      const panel = document.getElementById('card-news-result-panel');
      if (panel) {
        panel.hidden = false;
        syncCardNewsImageModelControlLocation();
        document.getElementById('card-news-result-title').textContent = '카드뉴스 생성 결과';
        document.getElementById('card-news-result-summary').textContent = '';
        document.getElementById('card-news-result-grid').replaceChildren();
      }
    }
    setCardNewsGenerationStatus(
      error?.code === 'AI_GENERATION_CANCELED'
        ? '카드 구성 생성을 중지했습니다.'
        : (error.message || '카드뉴스를 만들지 못했습니다. AI 설정을 확인한 뒤 다시 시도해 주세요.'),
      error?.code === 'AI_GENERATION_CANCELED' ? 'warning' : 'error'
    );
  } finally {
    setCardNewsGenerating(false, imageMode);
    if (!generationCreated && !previousGeneration) {
      ['card-news-regenerate', 'card-news-bulk-image-action'].forEach((id) => {
        const action = document.getElementById(id);
        if (action) action.hidden = true;
      });
    }
    document.getElementById('card-news-result-panel')?.setAttribute('aria-busy', 'false');
    if (generationCreated) void loadCardNewsManagedItems();
  }
}

async function regenerateCardNewsComposition() {
  if (cardNewsViewState.generating || !cardNewsViewState.generation) return;
  const hasImages = (cardNewsViewState.generation.cards || []).some((card) => Boolean(card.image_url));
  if (hasImages) {
    const confirmed = await showUiConfirm(
      '구성을 다시 만들면 현재 이미지가 초기화됩니다. 계속할까요?',
      { title: '구성 다시 만들기', confirmText: '구성 다시 만들기', cancelText: '취소' }
    );
    if (confirmed === false) return;
  }
  await generateCardNews({ imageMode: 'prompt_only' });
}
