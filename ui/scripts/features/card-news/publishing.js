function selectedCardNewsPublishingChannels() {
  return [...document.querySelectorAll('[data-card-news-publish-channel]:checked')]
    .map((input) => input.value)
    .filter(Boolean);
}

function syncCardNewsPublishingChannelAvailability() {
  const selectedCount = selectedCardNewsPublishingChannels().length;
  const maxChannels = Math.max(1, Number(cardNewsViewState.publishingConfig?.max_channels || 1));
  document.querySelectorAll('[data-card-news-publish-channel]').forEach((control) => {
    const unavailable = control.dataset.cardNewsPublishCompatible !== 'true'
      || control.dataset.cardNewsPublishCompleted === 'true';
    const selectionLimitReached = !control.checked && selectedCount >= maxChannels;
    control.disabled = cardNewsViewState.publishing || unavailable || selectionLimitReached;
    control.closest('.card-news-publishing-channel')?.classList.toggle('is-disabled', control.disabled);
  });
  const limit = document.getElementById('card-news-publishing-channel-limit');
  if (limit) limit.textContent = `최대 ${maxChannels}개 · ${selectedCount}개 선택`;
}

function syncCardNewsPublishButton() {
  const button = document.getElementById('card-news-publish-button');
  if (!button) return;
  const outcome = cardNewsViewState.publishingOutcome;
  const finished = outcome === 'completed' || outcome === 'accepted';
  button.textContent = cardNewsViewState.publishing
    ? '발행 중…'
    : (outcome === 'completed'
      ? '발행 완료'
      : (outcome === 'accepted' ? '발행 요청 완료' : (outcome === 'partial' ? '실패 채널 다시 시도' : (outcome === 'failed' ? '다시 시도' : '지금 발행'))));
  button.hidden = finished;
  button.disabled = cardNewsViewState.publishing
    || finished
    || selectedCardNewsPublishingChannels().length === 0;
  syncCardNewsPublishingChannelAvailability();
}

function renderCardNewsPublishingConfig(config = {}) {
  cardNewsViewState.publishingConfig = config;
  const channels = document.getElementById('card-news-publishing-channels');
  const text = document.getElementById('card-news-publishing-text');
  if (!channels || !text) return;
  channels.innerHTML = (config.channels || []).map((channel) => {
    const completed = cardNewsViewState.publishedChannelIds.has(String(channel.id || ''));
    const compatible = Boolean(channel.compatible);
    return `
    <label class="card-news-publishing-channel ui-selectable-card${compatible && !completed ? '' : ' is-disabled'}" title="${escapeHtml(channel.reason || '')}">
      <input type="checkbox" value="${escapeHtml(channel.id)}" data-card-news-publish-channel data-card-news-publish-compatible="${compatible ? 'true' : 'false'}" data-card-news-publish-completed="${completed ? 'true' : 'false'}" ${compatible && !completed ? '' : 'disabled'}>
      <span class="ui-selectable-card-copy"><strong>${escapeHtml(channel.name || channel.service)}</strong><small>${escapeHtml(completed ? '발행 완료' : (channel.compatible ? `${channel.max_assets}장까지` : channel.reason))}</small></span>
    </label>`;
  }).join('') || '<p class="ui-workflow-empty">설정된 Buffer 채널이 없습니다.</p>';
  if (!text.value.trim()) text.value = String(config.default_text || [config.title, config.source_url].filter(Boolean).join('\n\n'));
  channels.querySelectorAll('[data-card-news-publish-channel]').forEach((input) => {
    input.addEventListener('change', syncCardNewsPublishButton);
  });
  syncCardNewsPublishButton();
}

async function openCardNewsPublishing(options = {}) {
  const generation = cardNewsViewState.generation;
  const panel = document.getElementById('card-news-publishing-panel');
  const readiness = document.getElementById('card-news-publishing-readiness');
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
  if (readiness) {
    readiness.hidden = false;
    readiness.textContent = 'SNS 발행 조건을 확인하고 있습니다.';
    readiness.dataset.state = 'loading';
  }
  try {
    const config = await fetchJson(`/api/v1/card-news/publishing/config?generation_id=${encodeURIComponent(generation.id)}`);
    if (requestId !== cardNewsViewState.publishingRequestId || generation.id !== cardNewsViewState.generation?.id) return;
    const issues = [];
    if (!config.buffer_configured) {
      issues.push('설정 > 부가 서비스 > SNS 배포에서 Buffer 연결을 먼저 완료해 주세요.');
    }
    if (!config.media_transport) {
      issues.push('설정 > 기본 연결 > 콘텐츠 공간에서 Google 계정을 먼저 연결해 주세요.');
    }
    if (config.buffer_configured && config.media_transport && !(config.channels || []).some((channel) => channel.compatible)) {
      issues.push('현재 카드 구성을 발행할 수 있는 Buffer 채널이 없습니다.');
    }
    if (issues.length) {
      cardNewsViewState.publishingConfig = null;
      panel.hidden = true;
      if (readiness) {
        readiness.hidden = false;
        readiness.textContent = issues.join(' ');
        readiness.dataset.state = 'warning';
      }
      syncCardNewsPublishButton();
      return;
    }
    renderCardNewsPublishingConfig(config);
    panel.hidden = false;
    if (publishOpen) publishOpen.hidden = false;
    if (readiness) readiness.hidden = true;
    if (options.scroll !== false) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    if (requestId !== cardNewsViewState.publishingRequestId) return;
    cardNewsViewState.publishingConfig = null;
    panel.hidden = true;
    if (readiness) {
      readiness.hidden = false;
      readiness.textContent = error.message || 'SNS 발행 조건을 확인하지 못했습니다.';
      readiness.dataset.state = 'error';
    }
    syncCardNewsPublishButton();
  }
}

function setCardNewsPublishing(publishing) {
  cardNewsViewState.publishing = publishing;
  cardNewsViewState.generating = publishing;
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
      channel_ids: channelIds,
      text
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
    successfulChannelIds.forEach((channelId) => cardNewsViewState.publishedChannelIds.add(channelId));
    document.querySelectorAll('[data-card-news-publish-channel]').forEach((input) => {
      if (!successfulChannelIds.has(input.value)) return;
      input.checked = false;
      input.dataset.cardNewsPublishCompleted = 'true';
    });
    if (resultElement) {
      resultElement.hidden = false;
      resultElement.innerHTML = (result.results || []).map((item) => `
        <div class="card-news-publishing-result-item" data-state="${item.success ? 'ready' : 'error'}">
          <strong>${escapeHtml(item.channel_name || item.service)}</strong>
          <span class="ui-status-badge" data-state="${item.success ? 'ready' : 'error'}">${escapeHtml(item.success ? (item.status === 'sent' ? '발행 완료' : '요청 완료') : (item.message || '발행 실패'))}</span>
          ${item.external_link ? `<a class="ui-text-action compact" href="${escapeHtml(item.external_link)}" target="_blank" rel="noopener noreferrer">게시물 열기 ↗</a>` : ''}
        </div>`).join('');
    }
  } catch (error) {
    cardNewsViewState.publishingOutcome = 'failed';
    if (status) {
      status.textContent = error.message || '카드뉴스를 발행하지 못했습니다.';
      status.dataset.state = 'error';
    }
  } finally {
    setCardNewsPublishing(false);
  }
}
