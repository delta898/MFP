function normalizeSettingsBufferChannels(value) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  return source
    .map((item) => ({
      id: String(item?.id || '').trim(),
      name: String(item?.display_name || item?.name || item?.descriptor || '').trim(),
      display_name: String(item?.display_name || item?.name || item?.descriptor || '').trim(),
      service: String(item?.service || '').trim().toLowerCase(),
      avatar: String(item?.avatar || '').trim(),
      is_disconnected: item?.is_disconnected === true,
      is_locked: item?.is_locked === true
    }))
    .filter((item) => {
      if (!item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}

function isSettingsBufferChannelUnsupported(channel) {
  const service = String(channel?.service || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['tiktok', 'youtube', 'youtubeshorts'].includes(service);
}

function getSelectedSettingsBufferChannels() {
  return settingsBufferChannels
    .filter((channel) => (
      settingsBufferSelectedChannelIds.has(channel.id)
      && !isSettingsBufferChannelUnsupported(channel)
    ))
    .slice(0, 3)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      display_name: channel.display_name,
      service: channel.service,
      avatar: channel.avatar
    }));
}

function renderSettingsBufferOrganizations(selectedId = '') {
  const selectEl = document.getElementById('settings-buffer-organization');
  if (!selectEl) return;
  const targetId = String(selectedId || '').trim();
  selectEl.innerHTML = '';

  if (settingsBufferOrganizations.length === 0) {
    const option = document.createElement('option');
    option.value = targetId;
    option.textContent = targetId ? `저장된 Organization (${targetId})` : 'API Key 연결 확인이 필요합니다';
    selectEl.appendChild(option);
    return;
  }

  if (settingsBufferOrganizations.length > 1) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Organization을 선택하세요';
    selectEl.appendChild(placeholder);
  }
  settingsBufferOrganizations.forEach((organization) => {
    const option = document.createElement('option');
    option.value = organization.id;
    option.textContent = organization.name || organization.id;
    selectEl.appendChild(option);
  });
  selectEl.value = settingsBufferOrganizations.some((item) => item.id === targetId) ? targetId : '';
}

function renderSettingsBufferChannels() {
  const containerEl = document.getElementById('settings-buffer-channel-list');
  if (!containerEl) return;
  containerEl.innerHTML = '';

  if (settingsBufferChannels.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'sns-empty-message';
    emptyEl.textContent = 'Organization을 선택하고 연결 확인을 완료하면 채널이 표시됩니다.';
    containerEl.appendChild(emptyEl);
    return;
  }

  settingsBufferChannels.forEach((channel) => {
    const unsupported = isSettingsBufferChannelUnsupported(channel);
    if (unsupported) settingsBufferSelectedChannelIds.delete(channel.id);
    const labelEl = document.createElement('label');
    labelEl.className = 'settings-checkbox-label';
    const checkEl = document.createElement('input');
    checkEl.type = 'checkbox';
    checkEl.checked = settingsBufferSelectedChannelIds.has(channel.id);
    checkEl.disabled = channel.is_disconnected || channel.is_locked || unsupported;
    checkEl.addEventListener('change', () => {
      if (checkEl.checked && settingsBufferSelectedChannelIds.size >= 3) {
        checkEl.checked = false;
        showUiToast({
          level: 'warning',
          title: '채널 선택 제한',
          message: 'SNS 발행 채널은 최대 3개까지 선택할 수 있습니다.',
          dedupeKey: 'buffer-channel-limit'
        });
        return;
      }
      if (checkEl.checked) settingsBufferSelectedChannelIds.add(channel.id);
      else settingsBufferSelectedChannelIds.delete(channel.id);
      scheduleSettingsMajorAutoSave({ immediate: true });
    });

    const textEl = document.createElement('span');
    const stateLabel = channel.is_disconnected
      ? ' · 연결 끊김'
      : (channel.is_locked ? ' · 잠김' : (unsupported ? ' · 지원 제외' : ''));
    textEl.textContent = `${channel.display_name || channel.name || channel.id} · ${channel.service || 'unknown'}${stateLabel}`;
    labelEl.append(checkEl, textEl);
    containerEl.appendChild(labelEl);
  });
}

function syncSettingsBufferHelpLink(url = '') {
  const wrapEl = document.getElementById('settings-buffer-help-wrap');
  const linkEl = document.getElementById('settings-buffer-help-link');
  const normalizedUrl = String(url || '')
    .trim()
    .replace(/^https:\/\/blog\.naver\.com\//i, 'https://m.blog.naver.com/') || DEFAULT_BUFFER_HELP_URL;
  if (linkEl) linkEl.dataset.helpGuideUrl = normalizedUrl;
  if (wrapEl) wrapEl.style.display = '';
}

function syncSettingsSnsAiHint() {
  const modeEl = document.getElementById('settings-sns-ai-mode');
  const hintEl = document.getElementById('settings-sns-ai-hint');
  if (!modeEl || !hintEl) return;

  if (modeEl.value === 'blog_text') {
    const modelName = (
      document.getElementById('settings-text-model-name')?.value
      || document.getElementById('settings-text-model-preset-code')?.value
      || ''
    ).trim();
    const hasApiKey = Boolean(getSettingsInputValue('settings-text-model-api-key').trim());
    hintEl.textContent = hasApiKey
      ? `설정된 Text Model${modelName ? ` (${modelName})` : ''}을 SNS 콘텐츠 처리에 사용합니다. 현재는 글당 해시태그 생성에 사용합니다.`
      : 'Text Model API Key가 없어 현재 SNS AI 작업을 실행하지 않습니다. AI 설정에서 확인해 주세요.';
    return;
  }

  if (modeEl.value === 'chat') {
    const source = getSelectedSettingsRadioValue('settings-chat-model-source', 'writing');
    const prefix = source === 'writing' ? 'text' : 'chat';
    const modelName = (
      document.getElementById(`settings-${prefix}-model-name`)?.value
      || document.getElementById(`settings-${prefix}-model-preset-code`)?.value
      || ''
    ).trim();
    hintEl.textContent = `Chat Model${modelName ? ` (${modelName})` : ''}을 SNS 콘텐츠 처리에 사용합니다. 현재는 글당 해시태그 생성에 사용합니다.`;
    return;
  }

  hintEl.textContent = 'SNS 콘텐츠 처리에 AI를 사용하지 않습니다.';
}

function formatSettingsSnsRuntimeStatus(sns = {}) {
  const lines = [];
  if (sns.running) {
    lines.push('현재 RSS 확인 또는 SNS 발행을 처리하고 있습니다.');
  } else if (sns.enabled) {
    lines.push('자동 처리 대기 중');
  } else {
    lines.push('SNS 자동 발행이 비활성화되어 있습니다.');
  }

  if (sns.nextRunAt) {
    lines.push(`다음 자동 처리: ${formatDateTimeAbsolute(sns.nextRunAt)} (${formatNextRunText(sns.nextRunAt)})`);
  } else if (sns.enabled && !sns.running) {
    lines.push('다음 자동 처리 시각이 아직 예약되지 않았습니다.');
  }

  if (sns.lastRunAt) {
    lines.push(`마지막 실행: ${formatDateTimeAbsolute(sns.lastRunAt)}`);
  } else {
    lines.push('마지막 실행: 아직 실행되지 않음');
  }

  const lastResult = sns.lastResult;
  const automationData = lastResult?.data?.discovery || lastResult?.data?.distribution
    ? lastResult.data
    : null;
  const discoveryResult = automationData?.discovery || (
    String(lastResult?.code || '').startsWith('SNS_DISCOVERY_') ? lastResult : null
  );
  const distributionResult = automationData?.distribution || (
    String(lastResult?.code || '').startsWith('SNS_DISTRIBUTION_') ? lastResult : null
  );

  if (discoveryResult?.success) {
    const data = discoveryResult.data || {};
    lines.push(
      `RSS 결과: 발견 ${Number(data.discoveredCount || 0)}건 · 신규 원문 ${Number(data.newEntryCount || 0)}건 · SNS 행 ${Number(data.addedDeliveryCount || 0)}건 · 중복 ${Number(data.duplicateCount || 0)}건`
    );
    const unavailableSources = Array.isArray(data.unavailableSourceBlogs)
      ? data.unavailableSourceBlogs
      : [];
    if (unavailableSources.length > 0) {
      const labels = unavailableSources.map((source) => source === 'naver' ? '네이버 블로그' : 'WordPress');
      lines.push(`미설정으로 제외: ${labels.join(', ')}`);
    }
  }
  if (distributionResult) {
    const data = distributionResult.data || {};
    if (distributionResult.code === 'SNS_DISTRIBUTION_EMPTY') {
      lines.push('발행 결과: 대기 중인 원문 글 없음');
    } else {
      lines.push(
        `발행 결과: 성공 ${Number(data.completedCount || 0)}건 · 실패 ${Number(data.failedCount || 0)}건 · 건너뜀 ${Number(data.skippedCount || 0)}건`
      );
    }
  }
  if (!discoveryResult && !distributionResult && lastResult?.message) {
    lines.push(`마지막 결과: ${lastResult.message}`);
  }
  return lines.join('\n');
}
