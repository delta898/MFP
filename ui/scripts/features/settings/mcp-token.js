async function regenerateSettingsMcpToken() {
  try {
    const data = await postJson('/api/v1/settings/mcp-token', {});
    setSettingsMcpTokenValue(String(data?.token || ''), { visible: true });
    syncSettingsMcpUi();
    refreshSettingsMajorPendingState();
    updateSettingsStatus('.settings-major-result', '새 MCP bearer token을 생성했습니다. 저장하면 파일에 반영됩니다.', 'success');
  } catch (e) {
    updateSettingsStatus('.settings-major-result', `MCP token 재발급 실패: ${e.message}`, 'error');
  }
}

function toggleSettingsMcpTokenVisibility() {
  settingsMcpTokenVisible = !settingsMcpTokenVisible;
  syncSettingsMcpUi();
}

async function copySettingsMcpToken() {
  const token = getSettingsMcpTokenValue();
  if (!token) {
    updateSettingsStatus('.settings-major-result', '복사할 Bearer Token이 없습니다.', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(token);
    updateSettingsStatus('.settings-major-result', 'Bearer Token을 클립보드에 복사했습니다.', 'success');
  } catch (e) {
    updateSettingsStatus('.settings-major-result', `Bearer Token 복사 실패: ${e.message}`, 'error');
  }
}

