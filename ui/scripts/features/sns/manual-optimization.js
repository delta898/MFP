function renderManualSnsAiStatus(message = '', isError = false) {
  const statusEl = document.getElementById('manual-sns-ai-status');
  if (!statusEl) return;
  manualSnsAiStatusMessage = String(message || '');
  manualSnsAiStatusIsError = Boolean(isError);
  syncManualSnsComposerState();
}

function renderManualSnsImageGenerationStatus(message = '', isError = false) {
  const statusEl = document.getElementById('manual-sns-image-generation-status');
  if (!statusEl) return;
  statusEl.textContent = String(message || '');
  statusEl.classList.toggle('is-error', isError);
}

async function generateManualSnsImage() {
  const button = document.getElementById('manual-sns-image-generate-btn');
  const text = String(document.getElementById('manual-sns-text')?.value || '').trim();
  const instruction = String(manualSnsImageInstruction || '').trim();
  if (!button || button.disabled || manualSnsImageGenerationInFlight || !text) {
    if (!text) renderManualSnsImageGenerationStatus('본문을 입력한 뒤 이미지를 생성해 주세요.', true);
    return;
  }
  const originalText = text;
  const targetIndex = manualSnsImagePromptTargetIndex;
  const instructionSnapshot = instruction;
  const operation = { operationId: '', state: 'starting', confirmingStop: false, canCancel: true, remoteJobPossible: false };
  manualSnsImageOperation = operation;
  manualSnsImageGenerationInFlight = true;
  renderManualSnsImageGenerationStatus('SNS 내용과 이미지 요청을 조합해 생성 중입니다.');
  syncManualSnsImagePreview();
  syncManualSnsComposerState();
  try {
    const started = await postJson('/api/v1/social/manual/image', { text, instruction });
    operation.operationId = String(started?.operationId || '');
    operation.state = started?.state || 'accepted';
    operation.canCancel = started?.canCancel !== false;
    operation.remoteJobPossible = started?.remoteJobPossible === true;
    if (!operation.operationId) throw new Error('이미지 생성 작업을 시작하지 못했습니다.');
    syncManualSnsImagePreview();

    let data = null;
    let pollFailures = 0;
    while (manualSnsImageOperation === operation) {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      let current;
      try {
        current = await fetchJson(`/api/v1/social/manual/image-operations/${encodeURIComponent(operation.operationId)}`);
        pollFailures = 0;
      } catch (error) {
        pollFailures += 1;
        if (pollFailures >= 5) renderManualSnsImageGenerationStatus('이미지 생성 상태를 다시 확인하고 있습니다.');
        continue;
      }
      const canCancel = current.canCancel !== false;
      const changed = operation.state !== current.state
        || operation.canCancel !== canCancel;
      const confirmationInvalidated = operation.confirmingStop
        && (!canCancel || current.state === 'cancel_requested');
      operation.state = current.state;
      operation.canCancel = canCancel;
      operation.remoteJobPossible = current.remoteJobPossible === true;
      if (confirmationInvalidated) operation.confirmingStop = false;
      if (changed || confirmationInvalidated) syncManualSnsImagePreview();
      if (['completed', 'failed', 'canceled'].includes(current.state)) {
        if (current.state === 'completed') data = current.result;
        else if (current.state === 'canceled') {
          renderManualSnsImageGenerationStatus(`이미지 생성을 중지했습니다.${operation.remoteJobPossible ? ' 이미 접수된 AI 요청은 완료되거나 비용이 발생할 수 있습니다.' : ''}`);
        } else {
          throw new Error(current.error?.message || '이미지를 만들지 못했습니다.');
        }
        break;
      }
    }
    if (manualSnsImageOperation !== operation || !data) return;
    if (String(document.getElementById('manual-sns-text')?.value || '').trim() !== originalText) {
      throw new Error('SNS 내용이 생성 중 바뀌어 이미지를 추가하지 않았습니다. 다시 생성해 주세요.');
    }
    const binary = atob(String(data?.base64_data || ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const file = new File([bytes], String(data.file_name || 'sns-image.png'), { type: String(data.mime_type || 'image/png') });
    if (targetIndex === null) {
      addManualSnsLocalImageFiles([file], { generated: true, instruction: instructionSnapshot });
    } else if (!replaceManualSnsLocalImage(targetIndex, file, instructionSnapshot)) {
      throw new Error('재생성할 이미지가 더 이상 없습니다.');
    }
    manualSnsImagePromptOpen = false;
    manualSnsImageInstruction = '';
    manualSnsImagePromptTargetIndex = null;
    syncManualSnsImagePreview();
    renderManualSnsImageGenerationStatus(`이미지를 만들었습니다 · ${String(data.model_name || '이미지 생성 모델')}`);
  } catch (error) {
    if (error?.code !== 'AI_GENERATION_CANCELED') {
      renderManualSnsImageGenerationStatus(`이미지 생성 실패: ${error.message || '잠시 후 다시 시도해 주세요.'}`, true);
    }
  } finally {
    manualSnsImageGenerationInFlight = false;
    if (manualSnsImageOperation === operation) manualSnsImageOperation = null;
    syncManualSnsImagePreview();
    syncManualSnsComposerState();
  }
}

function continueManualSnsImageGeneration() {
  const operation = manualSnsImageOperation;
  if (!operation?.confirmingStop || operation.state === 'cancel_requested' || operation.canCancel === false) return;
  operation.confirmingStop = false;
  syncManualSnsImagePreview();
}

async function handleManualSnsImageStop() {
  const operation = manualSnsImageOperation;
  if (!operation || operation.canCancel === false || ['cancel_requested', 'starting', 'too_late'].includes(operation.state)) return;
  if (!operation.confirmingStop) {
    operation.confirmingStop = true;
    renderManualSnsImageGenerationStatus('중지하려면 한 번 더 누르세요. 이미 접수된 AI 요청은 완료되거나 비용이 발생할 수 있습니다.');
    syncManualSnsImagePreview();
    return;
  }
  operation.confirmingStop = false;
  operation.state = 'cancel_requested';
  renderManualSnsImageGenerationStatus('이미지 생성 중지를 요청했습니다.');
  syncManualSnsImagePreview();
  try {
    const result = await postJson(`/api/v1/social/manual/image-operations/${encodeURIComponent(operation.operationId)}/cancel`);
    if (result.cancelOutcome === 'too_late' || result.state === 'completed') {
      operation.state = 'too_late';
      operation.canCancel = false;
      renderManualSnsImageGenerationStatus('중지하기 전에 이미지 생성이 완료되었습니다.');
    }
  } catch (error) {
    operation.state = 'running';
    operation.canCancel = true;
    renderManualSnsImageGenerationStatus(error.message || '이미지 생성을 중지하지 못했습니다.', true);
  }
  syncManualSnsImagePreview();
}

function openManualSnsOptimizationConfirmation() {
  const text = String(document.getElementById('manual-sns-text')?.value || '').trim();
  if (!text || manualSnsOptimizationInFlight || manualSnsConfig.ai?.available !== true) return;
  manualSnsOptimizationConfirmOpen = true;
  renderManualSnsAiStatus('현재 본문을 AI가 다듬어 바꿉니다. 적용할까요?');
  syncManualSnsComposerState();
  document.getElementById('manual-sns-ai-confirm-btn')?.focus();
}

function cancelManualSnsOptimizationConfirmation() {
  if (!manualSnsOptimizationConfirmOpen || manualSnsOptimizationInFlight) return;
  manualSnsOptimizationConfirmOpen = false;
  renderManualSnsAiStatus('');
  syncManualSnsComposerState();
  document.getElementById('manual-sns-ai-optimize-btn')?.focus();
}

async function optimizeManualSnsText() {
  const textEl = document.getElementById('manual-sns-text');
  const confirmBtn = document.getElementById('manual-sns-ai-confirm-btn');
  if (!textEl || !confirmBtn || confirmBtn.disabled || !manualSnsOptimizationConfirmOpen || manualSnsOptimizationInFlight) return;

  const originalValue = String(textEl.value || '');
  manualSnsOptimizationConfirmOpen = false;
  const selectedChannels = getManualSnsSelectedChannels();
  manualSnsOptimizationInFlight = true;
  renderManualSnsAiStatus('Chat Model이 글과 해시태그를 다듬고 있습니다.');
  syncManualSnsComposerState();
  try {
    const data = await postJson('/api/v1/social/manual/optimize', {
      organizationId: manualSnsConfig.organizationId,
      channelIds: selectedChannels.map((channel) => channel.id),
      text: originalValue.trim()
    });
    const body = String(data?.body || '').trim();
    const hashtags = Array.isArray(data?.hashtags) ? data.hashtags.map((tag) => String(tag || '').trim()).filter(Boolean) : [];
    const optimizedText = [body, hashtags.join(' ')].filter(Boolean).join('\n\n')
      || String(data?.optimized_text || '').trim();
    if (!optimizedText) throw new Error('AI 최적화 결과가 비어 있습니다.');
    if (String(textEl.value || '') !== originalValue) {
      throw new Error('최적화 중 내용이 변경되어 결과를 반영하지 않았습니다. 다시 실행해 주세요.');
    }

    manualSnsOptimizationSnapshot = originalValue;
    textEl.value = optimizedText;
    textEl.dispatchEvent(new Event('input', { bubbles: true }));
    const withinLimit = data?.within_limit === true;
    const hasChannelLimit = data?.limit_scope === 'selected_channels';
    renderManualSnsAiStatus(!withinLimit
      ? 'AI 최적화를 완료했지만 선택 채널의 글자 수 제한을 넘었습니다. 내용을 줄여 주세요.'
      : hasChannelLimit
        ? 'AI 최적화를 완료했습니다. 내용을 확인하고 필요하면 직접 수정하세요.'
        : 'AI 최적화를 완료했습니다. 채널별 글자 수 제한은 발행 시 확인됩니다.',
    hasChannelLimit && !withinLimit);
    textEl.focus();
  } catch (error) {
    renderManualSnsAiStatus(`AI 최적화 실패: ${error.message || '잠시 후 다시 시도해 주세요.'}`, true);
  } finally {
    manualSnsOptimizationInFlight = false;
    syncManualSnsComposerState();
  }
}

function undoManualSnsOptimization() {
  const textEl = document.getElementById('manual-sns-text');
  if (!textEl || manualSnsOptimizationSnapshot === null || manualSnsOptimizationInFlight) return;
  textEl.value = manualSnsOptimizationSnapshot;
  manualSnsOptimizationSnapshot = null;
  textEl.dispatchEvent(new Event('input', { bubbles: true }));
  renderManualSnsAiStatus('최적화 전 내용으로 되돌렸습니다.');
  textEl.focus();
}
