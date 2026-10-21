function initManualSnsComposer() {
  const textEl = document.getElementById('manual-sns-text');
  const imageFileEl = document.getElementById('manual-sns-image-file');
  const imageLocalPanelEl = document.getElementById('manual-sns-image-local-panel');
  const publishBtn = document.getElementById('manual-sns-publish-btn');
  const newPostBtn = document.getElementById('manual-sns-new-post-btn');
  const optimizeBtn = document.getElementById('manual-sns-ai-optimize-btn');
  const optimizeConfirmBtn = document.getElementById('manual-sns-ai-confirm-btn');
  const optimizeCancelBtn = document.getElementById('manual-sns-ai-cancel-btn');
  const undoBtn = document.getElementById('manual-sns-ai-undo-btn');
  const settingsLink = document.getElementById('manual-sns-settings-link');
  textEl?.addEventListener('input', () => {
    manualSnsPublishSummaryMessage = '';
    if (String(textEl.value || '').trim()) renderManualSnsImageGenerationStatus('');
    syncManualSnsComposerState();
  });
  imageFileEl?.addEventListener('change', () => {
    addManualSnsLocalImageFiles(imageFileEl.files || []);
    imageFileEl.value = '';
    syncManualSnsImagePreview();
    syncManualSnsComposerState();
  });
  imageLocalPanelEl?.addEventListener('dragenter', (event) => {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    event.preventDefault();
    imageLocalPanelEl.classList.add('is-file-drag-over');
  });
  imageLocalPanelEl?.addEventListener('dragover', (event) => {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    imageLocalPanelEl.classList.add('is-file-drag-over');
  });
  imageLocalPanelEl?.addEventListener('dragleave', (event) => {
    if (imageLocalPanelEl.contains(event.relatedTarget)) return;
    imageLocalPanelEl.classList.remove('is-file-drag-over');
  });
  imageLocalPanelEl?.addEventListener('drop', (event) => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    imageLocalPanelEl.classList.remove('is-file-drag-over');
    addManualSnsLocalImageFiles(event.dataTransfer.files);
    syncManualSnsImagePreview();
    syncManualSnsComposerState();
  });
  publishBtn?.addEventListener('click', () => void publishManualSns());
  newPostBtn?.addEventListener('click', () => void startNewManualSnsPost());
  optimizeBtn?.addEventListener('click', openManualSnsOptimizationConfirmation);
  optimizeConfirmBtn?.addEventListener('click', () => void optimizeManualSnsText());
  optimizeCancelBtn?.addEventListener('click', cancelManualSnsOptimizationConfirmation);
  undoBtn?.addEventListener('click', undoManualSnsOptimization);
  settingsLink?.addEventListener('click', async () => {
    await navigateTo('settings-next', 'extras');
    settingsNextActivateExtrasTab?.('social');
  });
  syncManualSnsImageSourceUi();
  syncManualSnsComposerState();
}
