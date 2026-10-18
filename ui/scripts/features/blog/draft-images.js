// Blog Beta manuscript image rendering, editing, and generation operations.

function readBlogNextFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error(`${file?.name || '파일'}을 읽지 못했습니다.`));
    reader.readAsDataURL(file);
  });
}

function renderBlogNextDraftImages(type, preview = {}) {
  const imageItems = Array.isArray(preview.images) ? preview.images : [];
  if (imageItems.length === 0) return '<div class="local-markdown-empty">이미지 블록이 없습니다.</div>';
  const state = blogNextDraftState[type];
  const operation = state.imageOperation;
  const operationProgress = operation?.progress || {};
  const activeSlotId = operationProgress.slotId || operation?.slotId || '';
  const operationActive = Boolean(operation);
  const bulkOperationActive = operation?.action === 'generate-missing';
  const stopConfirming = operation?.confirmingStop === true;
  const stopRequested = operation?.state === 'cancel_requested';
  const ownsDraft = Boolean(preview.draftId);
  const imageAiBlocked = typeof isUiCapabilityUnavailable === 'function'
    && isUiCapabilityUnavailable('ai.image');
  const visibleItems = ownsDraft ? imageItems : imageItems.filter(image => !image.exists);
  const bulkAvailable = ownsDraft && imageItems.some((image) => !image.excluded && !image.exists && image.prompt);
  const bulkAction = bulkAvailable || operation?.action === 'generate-missing'
    ? `<div class="local-markdown-image-bulk-actions"><button class="${operation?.action === 'generate-missing' ? 'ghost ui-danger-action' : 'primary'} compact" type="button" data-manuscript-generate-missing${operation?.action === 'generate-missing' ? ' data-ai-stop-action' : ''}${imageAiBlocked && !operationActive ? ' disabled title="AI 이미지 모델 설정이 필요합니다."' : ''}>${operation?.action === 'generate-missing' ? (stopRequested ? '중지 요청 중…' : stopConfirming ? '중지 확인' : '중지') : '누락 이미지 생성'}</button>${stopConfirming && operation?.action === 'generate-missing' ? '<button class="ghost compact" type="button" data-manuscript-image-continue>계속 진행</button>' : ''}</div>`
    : '';
  const progressMessage = operationActive
    ? (operation?.state === 'too_late' ? '이미지 생성이 먼저 완료되어 중지하지 못했습니다.'
      : stopRequested ? '이미지 생성 중지를 요청했습니다.'
      : operationProgress.total > 0 ? `이미지 ${operationProgress.current || 1}/${operationProgress.total} 생성 중`
        : '이미지 생성을 준비하고 있습니다.')
    : '';
  const notice = state.imageOperationNotice;
  const operationStatus = operationActive
    ? `<div class="local-markdown-image-operation-status" role="status" aria-live="polite"><span class="local-markdown-image-spinner" aria-hidden="true"></span><span>${escapeHtml(progressMessage)}</span>${stopConfirming ? '<span class="local-markdown-image-stop-note">중지하려면 버튼을 한 번 더 누르세요. 완료된 이미지는 유지되며, 이미 접수된 요청은 비용이 발생할 수 있습니다.</span>' : ''}</div>`
    : notice?.message
      ? `<div class="local-markdown-image-operation-status is-${notice.level === 'error' ? 'error' : 'warning'}" role="status" aria-live="polite">${escapeHtml(notice.message)}</div>`
      : '';
  const readiness = ownsDraft
    ? `<div class="blog-next-action-readiness local-markdown-image-ai-readiness" data-manuscript-image-ai-readiness role="status"${imageAiBlocked ? '' : ' hidden'}>AI 이미지 모델 설정이 필요합니다. <button class="ui-text-action compact" type="button" data-manuscript-image-ai-settings>이미지 AI 설정하기</button></div>`
    : '';
  return readiness + operationStatus + bulkAction + visibleItems.map((image) => {
    const exists = Boolean(image.exists);
    const excluded = image.excluded === true;
    const imageUrl = exists ? (image.imageUrl || '') : '';
    const displayOrder = imageItems.indexOf(image) + 1;
    const imageIsActive = operationActive && activeSlotId === image.slotId;
    const activeActionButton = operation?.action === 'generate' && imageIsActive;
    const missingPrompt = !String(image.prompt || '').trim();
    return `<article class="local-markdown-image-card${exists ? '' : ' is-missing'}${excluded ? ' is-excluded' : ''}${imageIsActive ? ' is-generating' : ''}" data-manuscript-image-slot="${escapeHtml(image.slotId || '')}">
      <div class="local-markdown-image-card-preview${exists ? '' : ' is-empty'}${imageIsActive ? ' is-generating' : ''}">
        ${window.BlogGeniusManuscriptImageCard?.renderMedia
          ? window.BlogGeniusManuscriptImageCard.renderMedia({ ...image, exists: Boolean(imageUrl), imageUrl, generating: imageIsActive })
          : imageUrl
            ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(image.title || `IMAGE_${image.index}`)}" data-manuscript-card-image>`
            : `<div class="local-markdown-image-card-placeholder"><strong>${excluded ? '원고에서 제외됨' : '이미지 미지정'}</strong><span>${excluded ? '포스팅 대상에 포함되지 않습니다.' : 'AI로 만들거나 내 이미지로 채울 수 있습니다.'}</span></div>`}
        ${imageIsActive && imageUrl ? '<div class="local-markdown-image-generating-overlay" role="status"><span class="local-markdown-image-spinner" aria-hidden="true"></span><span>새 이미지 생성 중</span></div>' : ''}
        ${ownsDraft && !excluded && !bulkOperationActive ? `<div class="local-markdown-image-media-actions${exists ? '' : ' is-empty'}">
          <button class="${activeActionButton ? 'ghost ui-danger-action' : exists ? 'secondary' : 'primary'} compact" type="button" data-manuscript-image-action="generate" data-slot-id="${escapeHtml(image.slotId)}"${activeActionButton ? ' data-ai-stop-action' : ''}${!activeActionButton && missingPrompt ? ' disabled title="이미지 프롬프트를 입력해 주세요."' : imageAiBlocked && !activeActionButton ? ' disabled title="AI 이미지 모델 설정이 필요합니다."' : operationActive && !activeActionButton ? ' disabled title="이미지 작업 중에는 변경할 수 없습니다."' : ''}>${activeActionButton ? (stopRequested ? '중지 요청 중…' : stopConfirming ? '중지 확인' : '중지') : exists ? '이미지 재생성' : '이미지 생성'}</button>
          ${activeActionButton
            ? (stopConfirming ? '<button class="ghost compact" type="button" data-manuscript-image-continue>계속 진행</button>' : '')
            : `<button class="secondary compact" type="button" data-manuscript-image-picker data-slot-id="${escapeHtml(image.slotId)}"${operationActive ? ' disabled title="이미지 작업 중에는 변경할 수 없습니다."' : ''}>${exists ? '이미지 교체' : '내 이미지 선택'}</button>${exists ? `<button class="secondary compact" type="button" data-manuscript-image-action="exclude" data-slot-id="${escapeHtml(image.slotId)}" title="원본 파일은 삭제하지 않고 현재 원고에서만 이미지를 제거합니다."${operationActive ? ' disabled' : ''}>원고에서 제거</button>` : ''}`}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" data-manuscript-image-file data-slot-id="${escapeHtml(image.slotId)}" hidden>
        </div>` : ''}
        <span class="ui-sequence-badge" aria-hidden="true">${displayOrder}</span>
        <span class="local-markdown-image-card-status ${exists ? 'ok' : 'missing'} visually-hidden">${exists ? '이미지 준비됨' : '파일 없음'}</span>
      </div>
      <div class="local-markdown-image-card-copy">
        <strong class="local-markdown-image-card-title" title="${escapeHtml(image.title || `${displayOrder}번째 이미지`)}">${escapeHtml(image.title || `${displayOrder}번째 이미지`)}</strong>
        ${ownsDraft && (!exists || image.canRestore) ? `<div class="local-markdown-image-card-utility-actions">
          ${!exists && !excluded ? `<button class="ui-text-action compact" type="button" data-manuscript-image-action="exclude" data-slot-id="${escapeHtml(image.slotId)}"${operationActive ? ' disabled title="이미지 작업 중에는 변경할 수 없습니다."' : ''}>사용 안 함</button>` : ''}
          ${image.canRestore ? `<button class="ui-text-action compact" type="button" data-manuscript-image-action="restore" data-slot-id="${escapeHtml(image.slotId)}"${operationActive ? ' disabled title="이미지 작업 중에는 변경할 수 없습니다."' : ''}>${escapeHtml(image.restoreLabel || '원래 이미지 복원')}</button>` : ''}
        </div>` : ''}
        ${image.prompt ? `<div class="local-markdown-image-prompt-section">
          <details class="local-markdown-image-prompt-details">
            <summary>프롬프트 보기</summary>
            <p>${escapeHtml(image.prompt)}</p>
          </details>
          <button class="ui-text-action compact local-markdown-image-prompt-copy" type="button" data-manuscript-prompt-copy data-manuscript-type="${escapeHtml(type)}" data-slot-id="${escapeHtml(image.slotId || '')}">복사</button>
        </div>` : ''}
      </div>
    </article>`;
  }).join('');
}

function bindBlogNextManuscriptImageActions(type, container) {
  if (!container) return;
  container.querySelectorAll('[data-manuscript-image-picker]').forEach((button) => {
    button.addEventListener('click', () => {
      if (blogNextDraftState[type].publishing || blogNextDraftState[type].imageWorking) return;
      container.querySelector(`[data-manuscript-image-file][data-slot-id="${button.dataset.slotId}"]`)?.click();
    });
  });
  container.querySelectorAll('[data-manuscript-image-file]').forEach((input) => {
    input.addEventListener('change', () => void importBlogNextManuscriptImage(type, input.dataset.slotId, input));
  });
  container.querySelectorAll('[data-manuscript-image-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const operation = blogNextDraftState[type].imageOperation;
      if (operation?.action === 'generate' && operation.slotId === button.dataset.slotId) {
        handleBlogNextManuscriptImageStop(type);
        return;
      }
      void runBlogNextManuscriptImageAction(type, button.dataset.manuscriptImageAction, button.dataset.slotId);
    });
  });
  container.querySelector('[data-manuscript-generate-missing]')?.addEventListener('click', () => {
    if (blogNextDraftState[type].imageOperation?.action === 'generate-missing') {
      handleBlogNextManuscriptImageStop(type);
      return;
    }
    void generateMissingBlogNextManuscriptImages(type);
  });
  container.querySelectorAll('[data-manuscript-image-continue]').forEach((button) => {
    button.addEventListener('click', () => continueBlogNextManuscriptImageGeneration(type));
  });
  container.querySelector('[data-manuscript-image-ai-settings]')?.addEventListener('click', () => {
    if (typeof goToUiCapabilitySettings === 'function') void goToUiCapabilitySettings('ai.image');
  });
  container.querySelectorAll('[data-manuscript-prompt-copy]').forEach((button) => {
    button.addEventListener('click', () => void copyBlogNextManuscriptPrompt(button.dataset.manuscriptType, button.dataset.slotId, button));
  });
  container.querySelectorAll('[data-manuscript-card-image]').forEach((image) => {
    image.addEventListener('error', () => {
      const card = image.closest('[data-manuscript-image-slot]');
      const frame = image.closest('.local-markdown-image-card-preview');
      if (frame) {
        const placeholder = document.createElement('div');
        placeholder.className = 'local-markdown-image-card-placeholder is-error';
        placeholder.innerHTML = '<strong>이미지를 불러오지 못했습니다.</strong><span>이미지를 다시 만들거나 다른 파일로 교체해 주세요.</span>';
        image.replaceWith(placeholder);
        frame.classList.add('is-load-error');
      }
      const status = card?.querySelector('.local-markdown-image-card-status');
      if (status) {
        status.classList.remove('visually-hidden');
        status.classList.remove('ok');
        status.classList.add('missing');
        status.textContent = '불러오기 실패';
      }
    }, { once: true });
  });
}

function syncBlogNextImageAiReadiness() {
  const blocked = typeof isUiCapabilityUnavailable === 'function'
    && isUiCapabilityUnavailable('ai.image');
  document.querySelectorAll('[data-manuscript-image-ai-readiness]').forEach((notice) => {
    notice.hidden = !blocked;
  });
  document.querySelectorAll('[data-manuscript-image-action="generate"], [data-manuscript-generate-missing]').forEach((button) => {
    const type = button.closest('[data-blog-next-mode-panel]')?.dataset.blogNextModePanel;
    const state = blogNextDraftState[type];
    const operation = state?.imageOperation;
    const isActiveStopButton = Boolean(operation && (
      operation.action === 'generate-missing' ? button.hasAttribute('data-manuscript-generate-missing')
        : button.dataset.manuscriptImageAction === 'generate' && button.dataset.slotId === operation.slotId
    ));
    const image = button.dataset.manuscriptImageAction === 'generate'
      ? state?.preview?.images?.find((item) => item.slotId === button.dataset.slotId)
      : null;
    const missingPrompt = Boolean(image && !String(image.prompt || '').trim());
    const operationPending = operation?.state === 'cancel_requested';
    const otherBusy = BLOG_NEXT_DRAFT_TYPES.some((entry) => entry !== type && (
      blogNextDraftState[entry].publishing || blogNextDraftState[entry].generating || blogNextDraftState[entry].imageWorking
    ));
    button.disabled = operationPending || (!isActiveStopButton && (missingPrompt || blocked || otherBusy
      || state?.publishing || state?.generating || state?.imageWorking));
    if (missingPrompt) button.title = '이미지 프롬프트를 입력해 주세요.';
    else if (blocked) button.title = 'AI 이미지 모델 설정이 필요합니다.';
    else button.removeAttribute('title');
  });
  const activeType = BLOG_NEXT_DRAFT_TYPES.includes(blogNextActiveInputMode) ? blogNextActiveInputMode : 'ai';
  syncBlogNextDraftImageSafety(activeType, blogNextDraftState[activeType]?.preview);
}

async function copyBlogNextManuscriptPrompt(type, slotId, button) {
  const prompt = String(blogNextDraftState[type]?.preview?.images?.find((image) => image.slotId === slotId)?.prompt || '').trim();
  if (!prompt) return;
  try {
    await navigator.clipboard.writeText(prompt);
    const original = button.textContent;
    button.textContent = '복사됨';
    window.setTimeout(() => { button.textContent = original; }, 1200);
  } catch (_error) {
    showUiToast({ level: 'error', title: '프롬프트 복사 실패', message: '프롬프트를 열어 직접 복사해 주세요.' });
  }
}

function bindBlogNextManuscriptBodyImageFallback(body) {
  body?.querySelectorAll('[data-manuscript-preview-image]').forEach((image) => {
    image.addEventListener('error', () => {
      const placeholder = document.createElement('div');
      placeholder.className = 'local-markdown-inline-image-missing';
      placeholder.textContent = '이미지를 불러오지 못했습니다.';
      image.replaceWith(placeholder);
    }, { once: true });
  });
}

async function generateMissingBlogNextManuscriptImages(type) {
  const state = blogNextDraftState[type];
  if (!state.draftId || state.imageWorking || state.publishing) return;
  if (typeof ensureUiCapabilityReady === 'function' && !await ensureUiCapabilityReady('ai.image')) {
    syncBlogNextImageAiReadiness();
    return;
  }
  await startBlogNextManuscriptImageOperation(type, 'generate-missing', '');
}

function continueBlogNextManuscriptImageGeneration(type) {
  const state = blogNextDraftState[type];
  if (!state.imageOperation?.confirmingStop) return;
  clearTimeout(state.imageOperation.stopConfirmationTimer);
  state.imageOperation.confirmingStop = false;
  renderBlogNextDraftPreview(type, state.preview);
}

function handleBlogNextManuscriptImageStop(type) {
  const state = blogNextDraftState[type];
  const operation = state.imageOperation;
  if (!operation || ['cancel_requested', 'starting', 'too_late'].includes(operation.state)) return;
  if (operation.confirmingStop) {
    clearTimeout(operation.stopConfirmationTimer);
    operation.confirmingStop = false;
    operation.state = 'cancel_requested';
    renderBlogNextDraftPreview(type, state.preview);
    if (!operation.operationId) return;
    void postJson(`/api/v1/blog/manuscript-drafts/image-operations/${encodeURIComponent(operation.operationId)}/cancel`)
      .then((status) => {
        if (state.imageOperation !== operation) return;
        if (status.state === 'completed' || status.cancelOutcome === 'too_late' || status.cancelOutcome === 'already_finished') {
          operation.state = 'too_late';
          renderBlogNextDraftPreview(type, state.preview);
        }
      })
      .catch((error) => {
        if (state.imageOperation !== operation) return;
        operation.state = 'running';
        operation.confirmingStop = false;
        state.imageOperationNotice = { level: 'error', message: error.message || '이미지 생성을 중지하지 못했습니다.' };
        renderBlogNextDraftPreview(type, state.preview);
      });
    return;
  }
  operation.confirmingStop = true;
  renderBlogNextDraftPreview(type, state.preview);
}

async function startBlogNextManuscriptImageOperation(type, action, slotId) {
  const state = blogNextDraftState[type];
  if (!state.draftId || state.imageWorking || state.publishing) return null;
  if (typeof ensureUiCapabilityReady === 'function' && !await ensureUiCapabilityReady('ai.image')) {
    syncBlogNextImageAiReadiness();
    return null;
  }
  const operation = { action, slotId, operationId: '', state: 'starting', progress: null, remoteJobPossible: false, syncedCompletedCount: 0 };
  state.imageOperation = operation;
  state.imageOperationNotice = null;
  state.imageWorking = true;
  syncBlogNextDraftExecutionState();
  renderBlogNextDraftPreview(type, state.preview);
  let finalStatus = null;
  let pollFailures = 0;
  try {
    const started = await postJson('/api/v1/blog/manuscript-drafts/image-operations', {
      action, draftId: state.draftId, revision: state.revision, slotId
    });
    if (state.imageOperation !== operation) return null;
    operation.operationId = started.operationId;
    operation.state = started.state || 'accepted';
    operation.progress = started.progress || null;
    operation.remoteJobPossible = started.remoteJobPossible === true;
    renderBlogNextDraftPreview(type, state.preview);
    while (state.imageOperation === operation) {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      let current;
      try {
        current = await fetchJson(`/api/v1/blog/manuscript-drafts/image-operations/${encodeURIComponent(operation.operationId)}`);
        pollFailures = 0;
      } catch (error) {
        pollFailures += 1;
        if (pollFailures >= 5) {
          state.imageOperationNotice = { level: 'warning', message: '이미지 생성 상태를 다시 확인하고 있습니다.' };
          renderBlogNextDraftPreview(type, state.preview);
        }
        continue;
      }
      const changed = operation.state !== current.state
        || JSON.stringify(operation.progress || null) !== JSON.stringify(current.progress || null);
      operation.state = current.state;
      operation.progress = current.progress || null;
      operation.remoteJobPossible = current.remoteJobPossible === true;
      if (changed) renderBlogNextDraftPreview(type, state.preview);
      const completedCount = Math.max(0, Number(current.progress?.completed) || 0);
      if (action === 'generate-missing' && completedCount > operation.syncedCompletedCount
        && !['completed', 'failed', 'canceled'].includes(current.state)) {
        try {
          const refreshedDraft = await fetchJson(`/api/v1/blog/manuscript-drafts/${encodeURIComponent(state.draftId)}`);
          if (state.imageOperation !== operation) return null;
          if (refreshedDraft?.draftId && Number(refreshedDraft.revision) >= Number(state.revision)) {
            operation.syncedCompletedCount = completedCount;
            state.revision = refreshedDraft.revision;
            state.preview = refreshedDraft;
            renderBlogNextDraftPreview(type, refreshedDraft);
          }
        } catch (_) {
          // The terminal operation result or the next progress update will retry the preview sync.
        }
      }
      if (['completed', 'failed', 'canceled'].includes(current.state)) {
        finalStatus = current;
        break;
      }
    }
    if (state.imageOperation !== operation) return null;
    let draft = finalStatus?.state === 'completed' && finalStatus.result
      ? finalStatus.result
      : await fetchJson(`/api/v1/blog/manuscript-drafts/${encodeURIComponent(state.draftId)}`);
    if (draft?.draftId) {
      state.revision = draft.revision;
      state.preview = draft;
    }
    if (finalStatus?.state === 'canceled') {
      state.imageOperationNotice = {
        level: 'warning',
        message: `이미지 생성을 중지했습니다. 완성된 이미지는 유지됩니다.${operation.remoteJobPossible ? ' 이미 접수된 AI 요청은 완료되거나 비용이 발생할 수 있습니다.' : ''}`
      };
    } else if (finalStatus?.state === 'completed' && operation.state === 'too_late') {
      state.imageOperationNotice = { level: 'warning', message: '중지하기 전에 이미지 생성이 완료되었습니다.' };
    } else if (finalStatus?.state === 'failed') {
      state.imageOperationNotice = { level: 'error', message: finalStatus.error?.message || '이미지를 만들지 못했습니다.' };
    } else if (draft?.imageOperationWarning) {
      state.imageOperationNotice = { level: 'warning', message: draft.imageOperationWarning };
    }
    return state.preview;
  } catch (error) {
    state.imageOperationNotice = { level: 'error', message: error.message || '이미지 작업을 시작하지 못했습니다.' };
    return null;
  } finally {
    clearTimeout(operation.stopConfirmationTimer);
    if (state.imageOperation === operation) {
      state.imageOperation = null;
      state.imageWorking = false;
      state.imageMutationSlotId = '';
      renderBlogNextDraftPreview(type, state.preview);
      syncBlogNextDraftExecutionState();
    }
  }
}

async function applyBlogNextManuscriptMutation(type, action, slotId, payload = {}, options = {}) {
  const state = blogNextDraftState[type];
  const ownsImageLock = options.lockAcquired !== true;
  if (!state.draftId || (state.imageWorking && ownsImageLock) || state.publishing) return null;
  if (ownsImageLock) state.imageWorking = true;
  state.imageMutationSlotId = slotId || '';
  state.imageOperationNotice = null;
  syncBlogNextDraftExecutionState();
  const imageList = document.querySelector(`[data-blog-next-mode-panel="${type}"] [data-draft-preview-images]`);
  imageList?.setAttribute('aria-busy', 'true');
  imageList?.querySelectorAll('button, input').forEach((control) => { control.disabled = true; });
  const targetStatus = slotId ? imageList?.querySelector(`[data-manuscript-image-slot="${slotId}"] .local-markdown-image-card-status`) : null;
  if (targetStatus) targetStatus.textContent = action === 'generate' ? 'AI 생성 중…' : '적용 중…';
  let failureMessage = '';
  try {
    const endpoint = action === 'generate-missing'
      ? `/api/v1/blog/manuscript-drafts/${encodeURIComponent(state.draftId)}/images/generate-missing`
      : `/api/v1/blog/manuscript-drafts/${encodeURIComponent(state.draftId)}/image-slots/${encodeURIComponent(slotId)}/${action}`;
    const draft = await postJson(endpoint, {
      revision: state.revision,
      ...payload
    });
    state.revision = draft.revision;
    state.preview = draft;
    return draft;
  } catch (error) {
    failureMessage = error.message || '이미지 작업을 적용하지 못했습니다.';
    return null;
  } finally {
    if (ownsImageLock) state.imageWorking = false;
    state.imageMutationSlotId = '';
    imageList?.removeAttribute('aria-busy');
    renderBlogNextDraftPreview(type, state.preview);
    syncBlogNextDraftExecutionState();
    if (failureMessage) setBlogNextDraftValidation(type, { errors: [failureMessage] }, '', state.preview);
    else if (state.preview?.imageOperationWarning) setBlogNextDraftValidation(type, { warnings: [state.preview.imageOperationWarning] }, '', state.preview);
  }
}

async function runBlogNextManuscriptImageAction(type, action, slotId) {
  if (blogNextDraftState[type].publishing || blogNextDraftState[type].imageWorking) return;
  let image = blogNextDraftState[type].preview?.images?.find((item) => item.slotId === slotId);
  if (action === 'generate' && !String(image?.prompt || '').trim()) {
    blogNextDraftState[type].imageOperationNotice = { level: 'error', message: '이미지 생성 프롬프트를 입력해 주세요.' };
    renderBlogNextDraftPreview(type, blogNextDraftState[type].preview);
    return;
  }
  if (action === 'generate' && typeof ensureUiCapabilityReady === 'function'
    && !await ensureUiCapabilityReady('ai.image')) {
    syncBlogNextImageAiReadiness();
    return;
  }
  if (action === 'generate' && image?.exists) {
    const confirmed = await showUiConfirm('현재 이미지를 AI가 새로 만든 이미지로 교체할까요? 기존 이미지는 새 이미지가 완성된 후 교체됩니다.', {
      title: 'AI 이미지 다시 만들기', confirmText: '다시 만들기', cancelText: '취소'
    });
    if (!confirmed) return;
  }
  if (action === 'generate') {
    if (!await flushBlogNextAiDraftBeforeImageGeneration()) return;
    const currentImage = blogNextDraftState.ai.preview?.images?.find((item) => (
      (image?.blockId && item.blockId === image.blockId)
      || (!image?.blockId && Number(item.index) === Number(image?.index))
    ));
    if (currentImage) {
      image = currentImage;
      slotId = currentImage.slotId;
    }
    await startBlogNextManuscriptImageOperation(type, action, slotId);
    return;
  }
  await applyBlogNextManuscriptMutation(type, action, slotId);
}

async function importBlogNextManuscriptImage(type, slotId, input) {
  if (blogNextDraftState[type].publishing || blogNextDraftState[type].imageWorking) return;
  const file = input?.files?.[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    setBlogNextDraftValidation(type, { errors: ['이미지는 최대 20MB까지 선택할 수 있습니다.'] }, '', blogNextDraftState[type].preview);
    input.value = '';
    return;
  }
  try {
    const base64Data = await readBlogNextFileAsDataUrl(file);
    await applyBlogNextManuscriptMutation(type, 'import', slotId, {
      fileName: file.name || 'clipboard-image', mimeType: file.type || '', base64Data
    });
  } catch (error) {
    setBlogNextDraftValidation(type, { errors: [error?.message || '이미지 파일을 읽지 못했습니다.'] }, '', blogNextDraftState[type].preview);
  } finally {
    input.value = '';
  }
}

function getBlogNextEditorImageSyncKey(type) {
  return type === 'ai' ? getBlogNextAiSyncKey() : '';
}

async function importBlogNextEditorImage(type, file, blockId) {
  const state = blogNextDraftState[type];
  if (!file || !blockId) return null;
  if (state.publishing || state.imageWorking) throw new Error('다른 작업이 끝난 뒤 이미지를 추가해 주세요.');
  if (file.size > 20 * 1024 * 1024) throw new Error('이미지는 한 장당 최대 20MB까지 사용할 수 있습니다.');

  state.imageWorking = true;
  syncBlogNextDraftExecutionState();
  let failureMessage = '';
  try {
    let preview = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      preview = await loadBlogNextDraftPreview(type);
      if (preview && !state.previewSyncFailed && state.syncedPreviewKey === getBlogNextEditorImageSyncKey(type)) break;
      preview = null;
    }
    if (!preview) throw new Error('새 이미지 블록을 저장하지 못했습니다. 원고를 확인한 뒤 다시 시도해 주세요.');

    const image = preview.images?.find((item) => item.blockId === blockId);
    if (!image?.slotId) throw new Error('이미지 영역을 준비하지 못했습니다. 원고를 확인한 뒤 다시 시도해 주세요.');
    const base64Data = await readBlogNextFileAsDataUrl(file);
    const draft = await applyBlogNextManuscriptMutation(type, 'import', image.slotId, {
      fileName: file.name || 'clipboard-image', mimeType: file.type || '', base64Data
    }, { lockAcquired: true });
    if (!draft) throw new Error('이미지를 가져오지 못했습니다. 이미지 블록에 파일을 다시 놓아 주세요.');
    return draft;
  } catch (error) {
    failureMessage = error?.message || '이미지를 가져오지 못했습니다. 이미지 블록에 파일을 다시 놓아 주세요.';
    setBlogNextDraftValidation(type, { errors: [failureMessage] }, '', state.preview);
    return null;
  } finally {
    state.imageWorking = false;
    syncBlogNextDraftExecutionState();
    renderBlogNextDraftPreview(type, state.preview);
  }
}
