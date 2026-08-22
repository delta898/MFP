async function loadSettingsSnsRuntimeStatus() {
  const resultEl = document.getElementById('settings-sns-runtime-result');
  if (!resultEl) return null;
  try {
    const data = await fetchJson('/api/v1/auto/status');
    resultEl.textContent = formatSettingsSnsRuntimeStatus(data?.sns || {});
    return data?.sns || {};
  } catch (error) {
    resultEl.textContent = `상태 확인 실패: ${error.message}`;
    return null;
  }
}

async function runSettingsSnsCheckNow() {
  if (settingsSnsCheckInFlight) return;
  const buttonEl = document.getElementById('settings-sns-check-now-btn');
  const resultEl = document.getElementById('settings-sns-runtime-result');
  if (settingsMajorHasPendingBasicChanges) {
    if (resultEl) resultEl.textContent = '변경한 설정을 먼저 저장한 뒤 확인해 주세요.';
    return;
  }

  settingsSnsCheckInFlight = true;
  if (buttonEl) buttonEl.disabled = true;
  if (resultEl) resultEl.textContent = 'RSS를 확인하는 중입니다...';
  try {
    const result = await postJson('/api/v1/auto/collect/sns/run', {});
    const data = result?.data || {};
    if (resultEl) {
      resultEl.textContent = [
        'RSS 확인 완료',
        `발견 ${Number(data.discoveredCount || 0)}건 · 신규 원문 ${Number(data.newEntryCount || 0)}건 · SNS 행 ${Number(data.addedDeliveryCount || 0)}건 · 중복 ${Number(data.duplicateCount || 0)}건`
      ].join('\n');
    }
    await loadSettingsSnsRuntimeStatus();
  } catch (error) {
    if (resultEl) resultEl.textContent = `RSS 확인 실패: ${error.message}`;
  } finally {
    settingsSnsCheckInFlight = false;
    if (buttonEl) buttonEl.disabled = false;
  }
}

async function runSettingsSnsPublishNow() {
  if (settingsSnsPublishInFlight) return;
  const buttonEl = document.getElementById('settings-sns-publish-now-btn');
  const resultEl = document.getElementById('settings-sns-runtime-result');
  if (settingsMajorHasPendingBasicChanges) {
    if (resultEl) resultEl.textContent = '변경한 설정을 먼저 저장한 뒤 발행해 주세요.';
    return;
  }
  const confirmed = window.confirm(
    'SNS 시트에서 가장 앞선 대기 원문 글 1건을 선택된 모든 Buffer 채널에 즉시 발행할까요?'
  );
  if (!confirmed) return;

  settingsSnsPublishInFlight = true;
  if (buttonEl) buttonEl.disabled = true;
  if (resultEl) resultEl.textContent = '대기 중인 원문 글을 SNS에 발행하는 중입니다...';
  try {
    const result = await postJson('/api/v1/auto/publish/sns/run', {});
    const data = result?.data || {};
    if (resultEl) {
      resultEl.textContent = `발행 완료: 성공 ${Number(data.completedCount || 0)}건 · 실패 ${Number(data.failedCount || 0)}건 · 건너뜀 ${Number(data.skippedCount || 0)}건`;
    }
    await loadSettingsSnsRuntimeStatus();
  } catch (error) {
    if (resultEl) resultEl.textContent = `SNS 발행 확인 필요: ${error.message}`;
    await loadSettingsSnsRuntimeStatus();
  } finally {
    settingsSnsPublishInFlight = false;
    if (buttonEl) buttonEl.disabled = false;
  }
}

async function inspectSettingsBufferConnection(organizationId = '') {
  const apiKey = getSettingsInputValue('settings-buffer-api-key').trim();
  const connectBtn = document.getElementById('settings-buffer-connect-btn');
  const resultEl = document.getElementById('settings-buffer-connection-result');
  if (!apiKey) {
    if (resultEl) resultEl.textContent = 'Buffer API Key를 입력해 주세요.';
    return;
  }

  if (connectBtn) connectBtn.disabled = true;
  if (resultEl) resultEl.textContent = 'Buffer 연결을 확인하는 중...';
  try {
    const data = await postJson('/api/v1/settings/buffer-connection', {
      apiKey,
      organizationId: String(organizationId || '').trim()
    });
    settingsBufferOrganizations = Array.isArray(data.organizations) ? data.organizations : [];
    renderSettingsBufferOrganizations(data.organization_id || organizationId);

    settingsBufferChannels = normalizeSettingsBufferChannels(data.channels);
    const availableIds = new Set(
      settingsBufferChannels
        .filter((channel) => !isSettingsBufferChannelUnsupported(channel))
        .map((channel) => channel.id)
    );
    settingsBufferSelectedChannelIds = new Set(
      Array.from(settingsBufferSelectedChannelIds).filter((id) => availableIds.has(id))
    );
    renderSettingsBufferChannels();

    if (resultEl) {
      resultEl.textContent = data.organization_id
        ? `연결됨 · Organization ${settingsBufferOrganizations.find((item) => item.id === data.organization_id)?.name || data.organization_id} · 채널 ${settingsBufferChannels.length}개`
        : `연결됨 · Organization ${settingsBufferOrganizations.length}개 중 하나를 선택해 주세요.`;
    }
    if (data.organization_id) scheduleSettingsMajorAutoSave({ immediate: true });
  } catch (error) {
    settingsBufferChannels = [];
    renderSettingsBufferChannels();
    if (resultEl) resultEl.textContent = `연결 실패: ${error.message}`;
  } finally {
    if (connectBtn) connectBtn.disabled = false;
  }
}

