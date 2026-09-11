function initManualSnsComposer() {
  const textEl = document.getElementById('manual-sns-text');
  const imageUrlEl = document.getElementById('manual-sns-image-url');
  const imageRemoveBtn = document.getElementById('manual-sns-image-remove-btn');
  const imageFileEl = document.getElementById('manual-sns-image-file');
  const imageSourceUrlEl = document.getElementById('manual-sns-image-source-url');
  const imageSourceLocalEl = document.getElementById('manual-sns-image-source-local');
  const imageLocalPanelEl = document.getElementById('manual-sns-image-local-panel');
  const selectAllEl = document.getElementById('manual-sns-select-all');
  const publishBtn = document.getElementById('manual-sns-publish-btn');
  const optimizeBtn = document.getElementById('manual-sns-ai-optimize-btn');
  const undoBtn = document.getElementById('manual-sns-ai-undo-btn');
  const settingsLink = document.getElementById('manual-sns-settings-link');
  const workspaceLoad = document.getElementById('manual-sns-workspaces-load');
  const organization = document.getElementById('manual-sns-organization');
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
  workspaceLoad?.addEventListener('click', () => void loadManualSnsWorkspaces());
  organization?.addEventListener('change', () => void loadManualSnsWorkspaces());
  publishBtn?.addEventListener('click', () => void publishManualSns());
  optimizeBtn?.addEventListener('click', () => void optimizeManualSnsText());
  undoBtn?.addEventListener('click', undoManualSnsOptimization);
  settingsLink?.addEventListener('click', async () => {
    await navigateTo('settings-next', 'extras');
    settingsNextActivateExtrasTab?.('social');
  });
  syncManualSnsImageSourceUi();
  syncManualSnsComposerState();
}
