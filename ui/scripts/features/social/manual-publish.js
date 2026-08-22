function readManualSnsFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

async function publishManualSns() {
  syncManualSnsComposerState();
  const publishBtn = document.getElementById('manual-sns-publish-btn');
  if (!publishBtn || publishBtn.disabled) return;
  const text = String(document.getElementById('manual-sns-text')?.value || '').trim();
  const selectedChannels = getManualSnsSelectedChannels();
  const image = getManualSnsImageValidation();
  const confirmed = await showUiDialog({
    title: 'SNS 즉시 발행',
    message: `${selectedChannels.map((channel) => channel.name || channel.service).join(', ')}에 지금 발행할까요?`,
    showCancel: true,
    confirmText: '지금 발행',
    cancelText: '취소'
  });
  if (!confirmed) return;

  const resultEl = document.getElementById('manual-sns-publish-result');
  publishBtn.disabled = true;
  publishBtn.textContent = '발행 중...';
  if (resultEl) {
    resultEl.classList.add('is-visible');
    resultEl.textContent = image.mode === 'local'
      ? 'WordPress에 이미지를 임시 업로드하고 Buffer로 발행하고 있습니다.'
      : 'Buffer로 즉시 발행하고 있습니다.';
  }
  try {
    const localImage = image.mode === 'local' && image.file
      ? {
          fileName: image.file.name,
          mimeType: image.file.type,
          base64Data: await readManualSnsFileAsDataUrl(image.file)
        }
      : null;
    const data = await postJson('/api/v1/social/manual/publish', {
      channelIds: selectedChannels.map((channel) => channel.id),
      text,
      imageUrl: image.url,
      localImage
    });
    renderManualSnsPublishResult(data);
  } catch (error) {
    if (resultEl) {
      resultEl.classList.add('is-visible');
      resultEl.textContent = `❌ 발행 실패: ${error.message}`;
    }
  } finally {
    syncManualSnsComposerState();
  }
}

