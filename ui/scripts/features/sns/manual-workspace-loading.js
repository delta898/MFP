async function loadManualSnsWorkspaces({ background = false } = {}) {
  if (!manualSnsConfig.configured || manualSnsConfigLoading || manualSnsWorkspaceLoading) return;
  const select = document.getElementById('manual-sns-organization');
  const organizationId = String(select?.value || manualSnsConfig.organizationId || loadManualSnsOrganizationId()).trim();
  manualSnsWorkspaceLoading = true;
  renderManualSnsChannels();
  try {
    const data = await postJson('/api/v1/social/manual/workspaces', { organizationId });
    const channels = Array.isArray(data?.channels) ? data.channels : [];
    if (!hasCompleteManualSnsChannelLimits(channels)) {
      const error = new Error('Buffer에서 채널별 제한 정보를 완전히 받지 못했습니다.');
      error.code = 'MANUAL_SNS_CHANNEL_LIMITS_INCOMPLETE';
      throw error;
    }
    const resolvedOrganizationId = String(data?.organization_id || organizationId).trim();
    const fetchedAt = Date.now();
    manualSnsConfig = {
      ...manualSnsConfig,
      organizations: Array.isArray(data?.organizations) ? data.organizations : [],
      organizationId: resolvedOrganizationId,
      channels,
      workspacesLoaded: true,
      workspaceFetchedAt: fetchedAt,
      workspaceLoadMessage: '',
      workspaceReconnectRequired: false
    };
    persistManualSnsWorkspaceCache(manualSnsConfig, fetchedAt);
    persistManualSnsOrganizationId();
  } catch (error) {
    const reconnectRequired = [401, 403].includes(Number(error?.status)) || error?.code === 'BUFFER_AUTH_INVALID';
    const invalidSnapshot = shouldInvalidateManualSnsWorkspaceCache(error);
    const hasUsableSnapshot = manualSnsConfig.workspacesLoaded
      && hasCompleteManualSnsChannelLimits(manualSnsConfig.channels);
    if (invalidSnapshot) {
      clearManualSnsWorkspaceCache();
      manualSnsConfig = {
        ...manualSnsConfig,
        configured: reconnectRequired ? false : manualSnsConfig.configured,
        channels: [],
        organizations: [],
        organizationId: '',
        workspacesLoaded: false,
        workspaceFetchedAt: 0,
        workspaceReconnectRequired: reconnectRequired,
        workspaceLoadMessage: reconnectRequired
          ? 'Buffer 연결 또는 작업 공간 권한을 확인해 주세요. 설정에서 다시 연결할 수 있습니다.'
          : '작업 공간 정보를 확인할 수 없습니다. 연결 상태를 확인한 뒤 다시 불러오세요.'
      };
    } else if (!background && !manualSnsConfig.workspacesLoaded) {
      manualSnsConfig = {
        ...manualSnsConfig,
        channels: [],
        workspacesLoaded: false,
        workspaceFetchedAt: 0,
        workspaceLoadMessage: hasUsableSnapshot
          ? '최신 정보를 가져오지 못했습니다. 이전 채널 정보를 표시합니다.'
          : '채널 정보를 가져오지 못했습니다. 연결 상태를 확인하고 다시 불러오세요.'
      };
    } else if (!hasUsableSnapshot) {
      manualSnsConfig = {
        ...manualSnsConfig,
        channels: [],
        workspacesLoaded: false,
        workspaceFetchedAt: 0,
        workspaceLoadMessage: '채널 정보를 가져오지 못했습니다. 연결 상태를 확인하고 다시 불러오세요.'
      };
    } else {
      manualSnsConfig = {
        ...manualSnsConfig,
        workspaceLoadMessage: '최신 정보를 가져오지 못해 이전 채널 정보를 표시합니다. 연결을 확인한 뒤 다시 불러오세요.'
      };
    }
  } finally {
    manualSnsWorkspaceLoading = false;
    renderManualSnsChannels();
  }
}
