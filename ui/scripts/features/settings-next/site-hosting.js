let settingsNextCloudflareFlowId = '';
let settingsNextCloudflareBusy = false;
let settingsNextCloudflareStatusKnown = false;

function settingsNextCloudflareRenderStatus(status = {}) {
  const badge = document.getElementById('settings-next-cloudflare-status');
  const detail = document.getElementById('settings-next-cloudflare-detail');
  const connect = document.getElementById('settings-next-cloudflare-connect');
  const disconnect = document.getElementById('settings-next-cloudflare-disconnect');
  const accountList = document.getElementById('settings-next-cloudflare-account-list');
  const description = document.getElementById('settings-next-cloudflare-description');
  if (!badge || !detail || !connect || !disconnect || !accountList) return;

  settingsNextCloudflareStatusKnown = true;
  const accounts = Array.isArray(status.accounts) ? status.accounts : [];
  const connected = status.connected === true;
  const readiness = document.getElementById('settings-next-cloudflare-readiness');
  const readinessDot = document.getElementById('settings-next-cloudflare-readiness-dot');
  const hasDeployableAccounts = connected && accounts.length > 0;
  badge.textContent = hasDeployableAccounts ? '연결됨' : (connected ? '권한 확인 필요' : '연결 필요');
  badge.dataset.state = hasDeployableAccounts ? 'success' : (connected ? 'warning' : 'neutral');
  badge.dataset.connected = connected ? 'true' : 'false';
  if (readiness) readiness.textContent = hasDeployableAccounts ? '연결됨' : (connected ? '권한 확인 필요' : '연결 필요');
  if (readinessDot) readinessDot.dataset.tone = hasDeployableAccounts ? 'success' : (connected ? 'warning' : 'danger');
  if (description) description.textContent = hasDeployableAccounts
    ? '사이트 배포에 사용할 수 있는 Cloudflare 계정입니다.'
    : (connected
      ? 'Cloudflare는 연결됐지만 사이트 배포 권한이 확인된 계정이 없습니다. 권한을 확인한 뒤 다시 연결해 주세요.'
      : '현재 Cloudflare가 연결되어 있지 않습니다. 사이트를 배포하거나 관리하려면 연결해 주세요.');
  detail.textContent = hasDeployableAccounts ? `접근 가능한 계정 ${accounts.length}개` : '';
  accountList.replaceChildren();
  for (const account of accounts) {
    const item = document.createElement('div');
    item.className = 'settings-next-cloudflare-account';
    const name = document.createElement('strong');
    name.textContent = account.name || '이름 없는 계정';
    item.append(name);
    accountList.append(item);
  }
  if (connected && accounts.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'settings-next-cloudflare-empty';
    empty.textContent = '배포 가능한 계정이 없습니다.';
    accountList.append(empty);
  }
  connect.textContent = settingsNextCloudflareFlowId
    ? '인증 취소'
    : (connected ? '다시 연결' : 'Cloudflare 연결');
  connect.disabled = settingsNextCloudflareBusy && !settingsNextCloudflareFlowId;
  disconnect.hidden = !connected || Boolean(settingsNextCloudflareFlowId);
  disconnect.disabled = settingsNextCloudflareBusy;
}

function settingsNextCloudflareFeedback(message = '', tone = 'neutral') {
  settingsNextSetFeedback('settings-next-cloudflare-feedback', message, tone);
}

function settingsNextCloudflareCurrentStatus() {
  return {
    connected: document.getElementById('settings-next-cloudflare-status')?.dataset.connected === 'true',
    accounts: [...document.querySelectorAll('.settings-next-cloudflare-account')].map((item) => ({
      name: item.querySelector('strong')?.textContent || ''
    }))
  };
}

async function settingsNextSiteHostingRefresh() {
  const card = document.getElementById('settings-next-cloudflare-card');
  if (!card) return;
  card.setAttribute('aria-busy', 'true');
  try {
    settingsNextCloudflareRenderStatus(await fetchJson('/api/v1/site-hosting/cloudflare/status'));
    settingsNextCloudflareFeedback('');
  } catch (error) {
    if (!settingsNextCloudflareStatusKnown) {
      const badge = document.getElementById('settings-next-cloudflare-status');
      const readiness = document.getElementById('settings-next-cloudflare-readiness');
      const readinessDot = document.getElementById('settings-next-cloudflare-readiness-dot');
      const description = document.getElementById('settings-next-cloudflare-description');
      if (badge) {
        badge.textContent = '상태 확인 실패';
        badge.dataset.state = 'error';
      }
      if (readiness) readiness.textContent = '상태 확인 실패';
      if (readinessDot) readinessDot.dataset.tone = 'danger';
      if (description) description.textContent = 'Cloudflare 연결 상태를 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.';
    }
    settingsNextCloudflareFeedback(error.message || 'Cloudflare 연결 상태를 확인하지 못했습니다.', 'danger');
  } finally {
    card.setAttribute('aria-busy', 'false');
  }
}

async function settingsNextCloudflareWait(flowId) {
  while (settingsNextCloudflareFlowId === flowId) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    let state;
    try {
      state = await fetchJson(`/api/v1/site-hosting/cloudflare/flows/${encodeURIComponent(flowId)}`);
    } catch (error) {
      settingsNextCloudflareFeedback(error.message || 'Cloudflare 인증 상태를 확인하지 못했습니다.', 'danger');
      break;
    }
    if (state.status === 'pending') continue;
    settingsNextCloudflareFlowId = '';
    if (state.status === 'completed') {
      settingsNextCloudflareFeedback('');
      await settingsNextSiteHostingRefresh();
    } else {
      settingsNextCloudflareFeedback(state.message || 'Cloudflare 연결을 완료하지 못했습니다.', 'danger');
      settingsNextCloudflareRenderStatus(settingsNextCloudflareCurrentStatus());
    }
    break;
  }
  settingsNextCloudflareBusy = false;
  settingsNextCloudflareRenderStatus(settingsNextCloudflareCurrentStatus());
}

async function settingsNextCloudflareConnect() {
  if (settingsNextCloudflareFlowId) {
    const flowId = settingsNextCloudflareFlowId;
    try {
      const result = await postJson(`/api/v1/site-hosting/cloudflare/flows/${encodeURIComponent(flowId)}/cancel`, {});
      if (!result.cancelled) {
        settingsNextCloudflareFeedback('Cloudflare 응답을 확인하고 있습니다. 잠시 기다려 주세요.');
        return;
      }
      settingsNextCloudflareFlowId = '';
      settingsNextCloudflareFeedback('Cloudflare 연결을 취소했습니다.');
    } catch (error) {
      settingsNextCloudflareFeedback(error.message || '연결을 취소하지 못했습니다.', 'danger');
      return;
    }
    settingsNextCloudflareBusy = false;
    settingsNextCloudflareRenderStatus(settingsNextCloudflareCurrentStatus());
    return;
  }
  settingsNextCloudflareBusy = true;
  settingsNextCloudflareRenderStatus(settingsNextCloudflareCurrentStatus());
  settingsNextCloudflareFeedback('시스템 브라우저에서 Cloudflare 로그인과 권한 승인을 진행해 주세요.');
  try {
    const flow = await postJson('/api/v1/site-hosting/cloudflare/connect', {});
    settingsNextCloudflareFlowId = flow.flowId;
    settingsNextCloudflareRenderStatus(settingsNextCloudflareCurrentStatus());
    await settingsNextCloudflareWait(flow.flowId);
  } catch (error) {
    settingsNextCloudflareBusy = false;
    settingsNextCloudflareFlowId = '';
    settingsNextCloudflareFeedback(error.message || 'Cloudflare 연결을 시작하지 못했습니다.', 'danger');
    settingsNextCloudflareRenderStatus(settingsNextCloudflareCurrentStatus());
  }
}

async function settingsNextCloudflareDisconnect() {
  const confirmed = await showUiDialog({
    title: 'Cloudflare 연결 해제',
    message: 'Cloudflare 연결과 권한을 해제할까요?',
    showCancel: true,
    confirmText: '연결 해제',
    cancelText: '취소'
  });
  if (!confirmed) return;
  settingsNextCloudflareBusy = true;
  const connect = document.getElementById('settings-next-cloudflare-connect');
  const disconnect = document.getElementById('settings-next-cloudflare-disconnect');
  if (connect) connect.disabled = true;
  if (disconnect) disconnect.disabled = true;
  try {
    await postJson('/api/v1/site-hosting/cloudflare/disconnect', {});
    settingsNextCloudflareFeedback('');
    settingsNextCloudflareRenderStatus({ connected: false, accounts: [] });
  } catch (error) {
    settingsNextCloudflareFeedback(error.message || 'Cloudflare 연결을 해제하지 못했습니다.', 'danger');
  } finally {
    settingsNextCloudflareBusy = false;
    if (connect) connect.disabled = false;
    if (disconnect) disconnect.disabled = false;
  }
}

function initSettingsNextSiteHosting() {
  const connect = document.getElementById('settings-next-cloudflare-connect');
  const disconnect = document.getElementById('settings-next-cloudflare-disconnect');
  if (!connect || connect.dataset.bound === 'true') return;
  connect.dataset.bound = 'true';
  connect.addEventListener('click', () => void settingsNextCloudflareConnect());
  disconnect?.addEventListener('click', () => void settingsNextCloudflareDisconnect());
}
