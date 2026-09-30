function initManualSnsComposer() {
  const textEl = document.getElementById('manual-sns-text');
  const imageFileEl = document.getElementById('manual-sns-image-file');
  const imageLocalPanelEl = document.getElementById('manual-sns-image-local-panel');
  const selectAllEl = document.getElementById('manual-sns-select-all');
  const publishBtn = document.getElementById('manual-sns-publish-btn');
  const optimizeBtn = document.getElementById('manual-sns-ai-optimize-btn');
  const undoBtn = document.getElementById('manual-sns-ai-undo-btn');
  const settingsLink = document.getElementById('manual-sns-settings-link');
  const workspaceLoad = document.getElementById('manual-sns-workspaces-load');
  const organization = document.getElementById('manual-sns-organization');
  textEl?.addEventListener('input', () => {
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
  selectAllEl?.addEventListener('change', () => {
    BufferPublishingControls.applyChannelSelectAll({
      master: selectAllEl,
      controls: Array.from(document.querySelectorAll('[data-manual-sns-channel]')),
      isEligible: (input) => !input.disabled
    });
    persistManualSnsSelectedChannels();
    syncManualSnsComposerState();
  });
  BufferPublishingControls.setWorkspaceRefresh(workspaceLoad, () => void loadManualSnsWorkspaces());
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
