function initManualSnsComposer() {
  const textEl = document.getElementById('manual-sns-text');
  const imageUrlEl = document.getElementById('manual-sns-image-url');
  const imageRemoveBtn = document.getElementById('manual-sns-image-remove-btn');
  const imageFileEl = document.getElementById('manual-sns-image-file');
  const imageFileRemoveBtn = document.getElementById('manual-sns-image-file-remove-btn');
  const imageSourceUrlEl = document.getElementById('manual-sns-image-source-url');
  const imageSourceLocalEl = document.getElementById('manual-sns-image-source-local');
  const selectAllEl = document.getElementById('manual-sns-select-all');
  const publishBtn = document.getElementById('manual-sns-publish-btn');
  const optimizeBtn = document.getElementById('manual-sns-ai-optimize-btn');
  const undoBtn = document.getElementById('manual-sns-ai-undo-btn');
  textEl?.addEventListener('input', syncManualSnsComposerState);
  imageUrlEl?.addEventListener('input', () => {
    syncManualSnsImagePreview();
    syncManualSnsComposerState();
  });
  imageRemoveBtn?.addEventListener('click', () => {
    if (imageUrlEl) imageUrlEl.value = '';
    syncManualSnsImagePreview();
    syncManualSnsComposerState();
    imageUrlEl?.focus();
  });
  imageFileEl?.addEventListener('change', () => {
    setManualSnsLocalImageFile(imageFileEl.files?.[0] || null);
    syncManualSnsImagePreview();
    syncManualSnsComposerState();
  });
  imageFileRemoveBtn?.addEventListener('click', () => {
    setManualSnsLocalImageFile(null);
    if (imageFileEl) imageFileEl.value = '';
    syncManualSnsImagePreview();
    syncManualSnsComposerState();
    imageFileEl?.focus();
  });
  [imageSourceUrlEl, imageSourceLocalEl].forEach((radio) => {
    radio?.addEventListener('change', () => {
      syncManualSnsImagePreview();
      syncManualSnsComposerState();
    });
  });
  selectAllEl?.addEventListener('change', () => {
    const enabledInputs = Array.from(document.querySelectorAll('[data-manual-sns-channel]:not(:disabled)'));
    const shouldSelect = selectAllEl.checked;
    enabledInputs.forEach((input) => { input.checked = shouldSelect; });
    persistManualSnsSelectedChannels();
    syncManualSnsComposerState();
  });
  publishBtn?.addEventListener('click', () => void publishManualSns());
  optimizeBtn?.addEventListener('click', () => void optimizeManualSnsText());
  undoBtn?.addEventListener('click', undoManualSnsOptimization);
  syncManualSnsImageSourceUi();
  syncManualSnsComposerState();
}

