const CARD_NEWS_BUFFER_ORGANIZATION_STORAGE_KEY = 'card_news_buffer_organization_id_v1';
const cardNewsPublishingControlDisabledStates = new Map();

function setCardNewsPublishingControlsLocked(locked) {
  const selector = [
    '#card-news-generation-panel input',
    '#card-news-generation-panel select',
    '#card-news-generation-panel textarea',
    '#card-news-generation-panel button',
    '[data-card-news-image-model-select]',
    '[data-card-news-image-provider-select]',
    '#card-news-signature-enabled',
    '#card-news-signature',
    '#card-news-publishing-panel input',
    '#card-news-publishing-panel select',
    '#card-news-publishing-panel textarea',
    '#card-news-publishing-panel button'
  ].join(', ');
  document.querySelectorAll(selector).forEach((control) => {
    if (locked) {
      if (!cardNewsPublishingControlDisabledStates.has(control)) {
        cardNewsPublishingControlDisabledStates.set(control, control.disabled);
      }
      control.disabled = true;
    } else if (cardNewsPublishingControlDisabledStates.has(control)) {
      control.disabled = cardNewsPublishingControlDisabledStates.get(control);
      cardNewsPublishingControlDisabledStates.delete(control);
    }
  });
}

function loadCardNewsBufferOrganizationId() {
  try { return String(localStorage.getItem(CARD_NEWS_BUFFER_ORGANIZATION_STORAGE_KEY) || '').trim(); }
  catch (_error) { return ''; }
}

function persistCardNewsBufferOrganizationId(value) {
  try { localStorage.setItem(CARD_NEWS_BUFFER_ORGANIZATION_STORAGE_KEY, String(value || '').trim()); }
  catch (_error) { /* remembering the last workspace is optional */ }
}

function selectedCardNewsPublishingChannels() {
  return [...document.querySelectorAll('[data-card-news-publish-channel]:checked')]
    .map((input) => input.value)
    .filter(Boolean);
}

function setCardNewsPublishingReadiness(message = '', state = '') {
  const readiness = document.getElementById('card-news-publishing-readiness');
  const status = document.getElementById('card-news-generation-status');
  if (!readiness || !status) return;
  readiness.textContent = message;
  readiness.dataset.state = state;
  readiness.hidden = !message;
  if (message) status.hidden = false;
  else {
    const main = status.querySelector('[data-card-news-generation-status-message]');
    const stopConfirmation = status.querySelector('[data-card-news-stop-confirmation]');
    status.hidden = !main?.textContent
      && stopConfirmation?.hidden !== false
      && readiness.hidden;
  }
}

function cardNewsPublishingReadinessIssues(config = {}) {
  const issues = [];
  if (!config.buffer_api_key_configured) {
    issues.push('설정 > 부가 서비스 > SNS 배포에서 Buffer API Key를 연결해 주세요.');
  } else if (!(config.organizations || []).length) {
    issues.push('Buffer 작업 공간을 찾지 못했습니다. 연결 상태를 확인해 주세요.');
  }
  if (!config.media_transport) {
    issues.push('설정 > 기본 연결 > 콘텐츠 공간에서 Google 계정을 먼저 연결해 주세요.');
  }
  if (config.buffer_channels_configured && config.media_transport
    && !(config.channels || []).some((channel) => channel.compatible)) {
    issues.push('선택한 Buffer 채널은 현재 카드 구성을 발행할 수 없습니다. 카드 수, 이미지 형식 또는 채널 상태를 확인해 주세요.');
  }
  return issues;
}

function syncCardNewsPublishingChannelAvailability() {
  const selectedCount = selectedCardNewsPublishingChannels().length;
  const maxChannels = Math.max(1, Number(cardNewsViewState.publishingConfig?.max_channels || 1));
  const controls = [...document.querySelectorAll('[data-card-news-publish-channel]')];
  document.querySelectorAll('[data-card-news-publish-channel]').forEach((control) => {
    const unavailable = control.dataset.cardNewsPublishCompatible !== 'true';
    const selectionLimitReached = !control.checked && selectedCount >= maxChannels;
    control.disabled = cardNewsViewState.publishing || unavailable || selectionLimitReached;
    control.closest('.card-news-publishing-channel')?.classList.toggle('is-disabled', control.disabled);
  });
  const limit = document.getElementById('card-news-publishing-channel-limit');
  if (limit) limit.textContent = `최대 ${maxChannels}개 · ${selectedCount}개 선택`;
  BufferPublishingControls.syncChannelSelectAll({
    master: document.getElementById('card-news-publishing-select-all'),
    controls,
    isEligible: (control) => control.dataset.cardNewsPublishCompatible === 'true',
    limit: maxChannels,
    disabled: cardNewsViewState.publishing
  });
}

function syncCardNewsPublishingWorkspaceControl() {
  const button = document.getElementById('card-news-publishing-workspaces-load');
  const select = document.getElementById('card-news-publishing-workspace');
  if (!button || !select) return;
  const organizations = Array.isArray(cardNewsViewState.publishingConfig?.organizations)
    ? cardNewsViewState.publishingConfig.organizations
    : [];
  const configured = cardNewsViewState.publishingConfig?.buffer_api_key_configured === true;
  BufferPublishingControls.syncWorkspace({
    button,
    select,
    configured,
    loaded: organizations.length > 0,
    loading: cardNewsViewState.publishingWorkspaceLoading,
    disabled: cardNewsViewState.publishing
  });
}

function syncCardNewsPublishButton() {
  const button = document.getElementById('card-news-publish-button');
  if (!button) return;
  const outcome = cardNewsViewState.publishingOutcome;
  const finished = outcome === 'completed' || outcome === 'accepted';
  const selectedCount = selectedCardNewsPublishingChannels().length;
  const publishLabel = selectedCount > 0 ? `${selectedCount}개 채널에 지금 발행` : '지금 발행';
  button.textContent = cardNewsViewState.publishing
    ? '발행 중…'
    : (outcome === 'completed'
      ? '발행 완료'
      : (outcome === 'accepted' ? '발행 요청 완료' : publishLabel));
  button.hidden = finished;
  button.disabled = cardNewsViewState.publishing
    || finished
    || selectedCardNewsPublishingChannels().length === 0;
  syncCardNewsPublishingChannelAvailability();
}

function renderCardNewsPublishingConfig(config = {}) {
  cardNewsViewState.publishingConfig = config;
  const pickerRoot = document.getElementById('card-news-buffer-publishing-picker');
  const text = document.getElementById('card-news-publishing-text');
  if (!pickerRoot || !text) return;
  const organizations = Array.isArray(config.organizations) ? config.organizations : [];
  const selectedOrganizationId = String(config.organization_id || '');
  if (selectedOrganizationId) persistCardNewsBufferOrganizationId(selectedOrganizationId);
  BufferPublishingPicker.render(pickerRoot, {
    ids: { workspace: 'card-news-publishing-workspace', refresh: 'card-news-publishing-workspaces-load', selectAll: 'card-news-publishing-select-all', channelLimit: 'card-news-publishing-channel-limit', channels: 'card-news-publishing-channels' },
    organizations,
    selectedOrganizationId,
    selectedChannelIds: selectedCardNewsPublishingChannels(),
    channels: config.channels || [],
    configured: config.buffer_api_key_configured === true,
    loaded: config.workspaces_loaded === true || organizations.length > 0,
    loading: cardNewsViewState.publishingWorkspaceLoading,
    disabled: cardNewsViewState.publishing,
    maxChannels: config.max_channels || 1,
    helpUrl: 'https://m.blog.naver.com/amadejjs/223940980574',
    cardClassName: 'card-news-publishing-channel',
    emptyClassName: 'ui-workflow-empty',
    emptyMessage: selectedOrganizationId ? '이 작업 공간에 발행 가능한 채널이 없습니다.' : '먼저 작업 공간을 선택해 주세요.',
    isSelectable: (channel) => Boolean(channel.compatible),
    inputData: (channel) => ({ cardNewsPublishChannel: '', cardNewsPublishCompatible: Boolean(channel.compatible) }),
    onWorkspaceChange: (id) => { persistCardNewsBufferOrganizationId(id); void loadCardNewsPublishingWorkspace(id); },
    onRefresh: (id) => void loadCardNewsPublishingWorkspace(id),
    onSelectionChange: () => syncCardNewsPublishButton(),
    onLimitReached: () => { if (typeof showToast === 'function') showToast(`최대 ${Math.max(1, Number(config.max_channels || 1))}개 채널까지 선택할 수 있습니다.`); }
  });
  if (!text.value.trim()) text.value = String(config.default_text || [config.title, config.source_url].filter(Boolean).join('\n\n'));
  syncCardNewsPublishButton();
  syncCardNewsPublishingWorkspaceControl();
}

async function loadCardNewsPublishingWorkspace(organizationId = '') {
  const generation = cardNewsViewState.generation;
  const panel = document.getElementById('card-news-publishing-panel');
  if (!generation || !panel || cardNewsViewState.publishing) return;
  const workspaceSelect = document.getElementById('card-news-publishing-workspace');
  const preserveSelection = Boolean(organizationId)
    && String(workspaceSelect?.value || '') === String(organizationId);
  const selectedChannelIds = preserveSelection ? new Set(selectedCardNewsPublishingChannels()) : new Set();
  const requestId = ++cardNewsViewState.publishingRequestId;
  cardNewsViewState.publishingWorkspaceLoading = true;
  syncCardNewsPublishingWorkspaceControl();
  const channelList = document.getElementById('card-news-publishing-channels');
  if (channelList) channelList.innerHTML = '<p class="ui-workflow-empty">발행 채널을 불러오는 중...</p>';
  const publishButton = document.getElementById('card-news-publish-button');
  if (publishButton) publishButton.disabled = true;
  setCardNewsPublishingReadiness('작업 공간과 발행 채널을 불러오고 있습니다.', 'loading');
  try {
    const query = new URLSearchParams({ generation_id: generation.id });
    if (organizationId) query.set('organization_id', organizationId);
    let config;
    try {
      config = await fetchJson(`/api/v1/card-news/publishing/config?${query.toString()}`);
    } catch (error) {
      // A remembered workspace can disappear or lose access. Reload the available list
      // without that stale selection so the user can choose another workspace.
      if (!organizationId || requestId !== cardNewsViewState.publishingRequestId) throw error;
      config = await fetchJson(`/api/v1/card-news/publishing/config?generation_id=${encodeURIComponent(generation.id)}`);
      persistCardNewsBufferOrganizationId('');
    }
    if (requestId !== cardNewsViewState.publishingRequestId || generation.id !== cardNewsViewState.generation?.id) return;
    const issues = cardNewsPublishingReadinessIssues(config);
    if (issues.length) {
      cardNewsViewState.publishingConfig = null;
      setCardNewsPublishingReadiness(issues.join(' '), 'warning');
      return;
    }
    renderCardNewsPublishingConfig(config);
    if (preserveSelection) {
      document.querySelectorAll('[data-card-news-publish-channel]').forEach((control) => {
        control.checked = selectedChannelIds.has(control.value)
          && control.dataset.cardNewsPublishCompatible === 'true';
      });
      syncCardNewsPublishButton();
    }
    setCardNewsPublishingReadiness();
  } catch (error) {
    if (requestId !== cardNewsViewState.publishingRequestId) return;
    setCardNewsPublishingReadiness(error.message || '작업 공간과 발행 채널을 불러오지 못했습니다.', 'error');
  } finally {
    if (requestId === cardNewsViewState.publishingRequestId) {
      cardNewsViewState.publishingWorkspaceLoading = false;
      syncCardNewsPublishingWorkspaceControl();
    }
  }
}

async function openCardNewsPublishing(options = {}) {
  const generation = cardNewsViewState.generation;
  const panel = document.getElementById('card-news-publishing-panel');
  if (!generation || !panel || cardNewsViewState.publishing) return;
  if (cardNewsViewState.publishingConfig?.generation_id === generation.id && !panel.hidden) {
    const publishOpen = document.getElementById('card-news-publish-open');
    if (publishOpen) publishOpen.hidden = false;
    if (options.scroll !== false) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const requestId = ++cardNewsViewState.publishingRequestId;
  panel.hidden = true;
  const publishOpen = document.getElementById('card-news-publish-open');
  if (publishOpen) publishOpen.hidden = true;
  setCardNewsPublishingReadiness('SNS 발행 조건을 확인하고 있습니다.', 'loading');
  try {
    const organizationId = loadCardNewsBufferOrganizationId();
    const query = new URLSearchParams({ generation_id: generation.id });
    if (organizationId) query.set('organization_id', organizationId);
    let config;
    try {
      config = await fetchJson(`/api/v1/card-news/publishing/config?${query.toString()}`);
    } catch (error) {
      if (!organizationId) throw error;
      config = await fetchJson(`/api/v1/card-news/publishing/config?generation_id=${encodeURIComponent(generation.id)}`);
      persistCardNewsBufferOrganizationId('');
    }
    if (requestId !== cardNewsViewState.publishingRequestId || generation.id !== cardNewsViewState.generation?.id) return;
    const issues = cardNewsPublishingReadinessIssues(config);
    if (issues.length) {
      cardNewsViewState.publishingConfig = null;
      panel.hidden = true;
      setCardNewsPublishingReadiness(issues.join(' '), 'warning');
      syncCardNewsPublishButton();
      return;
    }
    renderCardNewsPublishingConfig(config);
    panel.hidden = false;
    if (publishOpen) publishOpen.hidden = false;
    setCardNewsPublishingReadiness();
    if (options.scroll !== false) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    if (requestId !== cardNewsViewState.publishingRequestId) return;
    cardNewsViewState.publishingConfig = null;
    panel.hidden = true;
    setCardNewsPublishingReadiness(error.message || 'SNS 발행 조건을 확인하지 못했습니다.', 'error');
    syncCardNewsPublishButton();
  }
}

function setCardNewsPublishing(publishing) {
  cardNewsViewState.publishing = publishing;
  cardNewsViewState.generating = publishing;
  setCardNewsPublishingControlsLocked(publishing);
  updateCardNewsGenerationAvailability();
  const button = document.getElementById('card-news-publish-button');
  const status = document.getElementById('card-news-publishing-status');
  document.querySelectorAll('#card-news-regenerate, #card-news-bulk-image-action, #card-news-export-all, [data-card-news-image-action], [data-card-news-local-image], #card-news-publishing-text').forEach((control) => {
    if ('disabled' in control) control.disabled = publishing;
    control.classList?.toggle('is-disabled', publishing);
  });
  syncCardNewsPublishingChannelAvailability();
  if (status && publishing) {
    status.textContent = '이미지를 준비하고 SNS에 발행하고 있습니다.';
    status.dataset.state = 'loading';
  }
  button?.classList.toggle('is-loading', publishing);
  button?.setAttribute('aria-busy', String(publishing));
  syncCardNewsPublishButton();
}

async function publishCardNews() {
  const generation = cardNewsViewState.generation;
  const channelIds = selectedCardNewsPublishingChannels();
  const text = document.getElementById('card-news-publishing-text')?.value?.trim() || '';
  if (!generation || !channelIds.length || cardNewsViewState.publishing) return;
  const confirmed = await showUiConfirm(
    `완성된 카드 ${generation.cards?.length || 0}장을 선택한 ${channelIds.length}개 채널에 지금 발행할까요?`,
    { title: '카드뉴스 발행', confirmText: '지금 발행', cancelText: '취소' }
  );
  if (confirmed === false) return;
  if (!await ensureCardNewsSignaturePreviewCurrent()) return;
  // Locking the publishing controls disables the editable signature input.
  // Capture all preview-bound values first so the publish request matches the
  // signature policy snapshot the user just reviewed.
  const signature = getCardNewsSignatureForRequest();
  const expectedSignature = cardNewsViewState.signaturePreviewEffectiveSignature;
  const previewToken = cardNewsViewState.signaturePreviewToken;
  setCardNewsPublishing(true);
  const status = document.getElementById('card-news-publishing-status');
  const resultElement = document.getElementById('card-news-publishing-result');
  if (resultElement) {
    resultElement.hidden = true;
    resultElement.innerHTML = '';
  }
  try {
    const result = await postJson('/api/v1/card-news/publishing/publish', {
      generation_id: generation.id,
      organization_id: document.getElementById('card-news-publishing-workspace')?.value || '',
      channel_ids: channelIds,
      text,
      signature,
      expected_signature: expectedSignature,
      preview_token: previewToken
    });
    if (status) {
      status.textContent = result.success
        ? (result.confirmed ? `${result.success_count}개 채널에 발행했습니다.` : `${result.success_count}개 채널에 발행 요청을 전달했습니다.`)
        : `성공 ${result.success_count}개, 실패 ${result.failure_count}개입니다.`;
      status.dataset.state = result.success ? 'ready' : 'warning';
    }
    cardNewsViewState.publishingOutcome = result.success
      ? (result.confirmed ? 'completed' : 'accepted')
      : (Number(result.success_count || 0) > 0 ? 'partial' : 'failed');
    const successfulChannelIds = new Set((result.results || [])
      .filter((item) => item.success)
      .map((item) => String(item.channel_id || '')));
    document.querySelectorAll('[data-card-news-publish-channel]').forEach((input) => {
      if (!successfulChannelIds.has(input.value)) return;
      input.checked = false;
    });
    if (resultElement) {
      resultElement.hidden = false;
      renderBufferPublishingResults(resultElement, result.results);
    }
  } catch (error) {
    cardNewsViewState.publishingOutcome = 'failed';
    if (error.code === 'CARD_NEWS_SIGNATURE_PREVIEW_STALE') {
      await handleCardNewsSignaturePreviewStale();
      if (status) {
        status.textContent = '미리보기가 갱신되었습니다. 이미지를 확인한 뒤 다시 발행해 주세요.';
        status.dataset.state = 'warning';
      }
      return;
    }
    if (status) {
      status.textContent = error.message || '카드뉴스를 발행하지 못했습니다.';
      status.dataset.state = 'error';
    }
  } finally {
    setCardNewsPublishing(false);
    // The publish endpoint records its result in the managed ledger. Refresh
    // that source of truth after both success and failure so status filters
    // and workspace counts do not remain stale until the next navigation.
    await loadCardNewsManagedItems();
  }
}
