function readManualSnsFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

function renderManualSnsPublishResult(data = {}) {
  const notice = data.media_cleanup?.retained === true
    ? '발행 상태를 확인하지 못해 임시 이미지가 Google Drive에 남아 있습니다.'
    : '';
  renderBufferPublishingResults(
    document.getElementById('manual-sns-publish-result'),
    data.results,
    { notice }
  );
}

async function startNewManualSnsPost() {
  if (!manualSnsLastPublishedSignature || manualSnsPublishingInFlight || manualSnsImageGenerationInFlight) return;
  if (getManualSnsPublishSignature() !== manualSnsLastPublishedSignature) {
    const confirmed = await showUiDialog({
      title: '새 게시물 작성',
      message: '현재 작성 중인 내용과 이미지를 지우고 새 게시물을 시작할까요?',
      showCancel: true,
      confirmText: '새 게시물 작성',
      cancelText: '계속 작성'
    });
    if (!confirmed) return;
  }

  const textEl = document.getElementById('manual-sns-text');
  if (textEl) {
    textEl.value = '';
    textEl.dispatchEvent(new Event('input', { bubbles: true }));
  }
  manualSnsLocalImages.forEach(({ previewUrl }) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  });
  manualSnsLocalImages = [];
  manualSnsPreviewImageIndex = 0;
  manualSnsOptimizationSnapshot = null;
  manualSnsOptimizationConfirmOpen = false;
  manualSnsAiStatusMessage = '';
  manualSnsAiStatusIsError = false;
  manualSnsLastPublishedSignature = '';
  manualSnsPublishSummaryMessage = '';
  manualSnsImagePromptOpen = false;
  manualSnsImageInstruction = '';
  manualSnsImagePromptTargetIndex = null;
  const resultEl = document.getElementById('manual-sns-publish-result');
  resultEl?.replaceChildren();
  resultEl?.classList.remove('is-visible');
  renderManualSnsImageGenerationStatus('');
  renderManualSnsAiStatus('');
  syncManualSnsImagePreview();
  syncManualSnsComposerState();
  textEl?.focus();
}

async function publishManualSns() {
  syncManualSnsComposerState();
  const publishBtn = document.getElementById('manual-sns-publish-btn');
  if (!publishBtn || publishBtn.disabled || manualSnsPublishingInFlight) return;
  const text = String(document.getElementById('manual-sns-text')?.value || '').trim();
  const selectedChannels = getManualSnsSelectedChannels();
  const image = getManualSnsImageValidation();
  if (!image.valid) {
    await showUiDialog({
      title: '이미지를 확인해 주세요',
      message: image.message,
      showCancel: false,
      confirmText: '확인'
    });
    return;
  }
  const assetLimitExceeded = getManualSnsAssetLimitExceededChannel(image.files);
  if (assetLimitExceeded) {
    await showUiDialog({
      title: '채널별 이미지 개수 확인',
      message: `${assetLimitExceeded.name || assetLimitExceeded.service} 채널은 이미지를 최대 ${assetLimitExceeded.max_assets}장까지 지원합니다. 이미지를 줄이거나 해당 채널을 해제한 뒤 다시 발행해 주세요.`,
      showCancel: false,
      confirmText: '확인'
    });
    return;
  }
  const confirmed = await showUiDialog({
    title: 'SNS 즉시 발행',
    message: `${selectedChannels.map((channel) => channel.name || channel.service).join(', ')}에 지금 발행할까요?`,
    showCancel: true,
    confirmText: '지금 발행',
    cancelText: '취소'
  });
  if (!confirmed) return;

  const resultEl = document.getElementById('manual-sns-publish-result');
  manualSnsPublishSummaryMessage = '';
  manualSnsPublishingInFlight = true;
  syncManualSnsComposerState();
  resultEl?.replaceChildren();
  resultEl?.classList.remove('is-visible');
  try {
    const localImages = image.hasImage
      ? await Promise.all((image.files || []).map(async (file) => ({
          fileName: file.name,
          mimeType: file.type,
          base64Data: await readManualSnsFileAsDataUrl(file)
        })))
      : [];
    const data = await postJson('/api/v1/social/manual/publish', {
      organizationId: manualSnsConfig.organizationId,
      channelIds: selectedChannels.map((channel) => channel.id),
      text,
      localImages
    });
    const successCount = Number(data?.success_count || 0);
    const failureCount = Number(data?.failure_count || 0);
    const successfulIds = new Set((Array.isArray(data?.results) ? data.results : [])
      .filter((item) => item.success === true)
      .map((item) => String(item.channel_id || '')));
    document.querySelectorAll('[data-manual-sns-channel]').forEach((control) => {
      if (!successfulIds.has(String(control.value || '')) || !control.checked) return;
      control.checked = false;
      control.dispatchEvent(new Event('change', { bubbles: true }));
    });
    manualSnsLastPublishedSignature = data?.success === true
      ? getManualSnsPublishSignature()
      : '';
    manualSnsPublishSummaryMessage = failureCount > 0
      ? `성공 ${successCount}개, 실패 ${failureCount}개입니다.`
      : `${successCount}개 채널에 발행했습니다.`;
    renderManualSnsPublishResult(data);
  } catch (error) {
    manualSnsPublishSummaryMessage = `발행하지 못했습니다: ${error.message}`;
    renderManualSnsPublishResult({ results: [{ success: false, channel_name: '발행', message: error.message }] });
  } finally {
    manualSnsPublishingInFlight = false;
    syncManualSnsComposerState();
  }
}
