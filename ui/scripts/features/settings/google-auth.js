async function loadGoogleAuthStatus() {
  const statusById = document.getElementById('settings-google-auth-status');
  const statusByClass = Array.from(document.querySelectorAll('.settings-google-auth-status'));
  const statusEls = statusById
    ? [statusById, ...statusByClass.filter(el => el !== statusById)]
    : statusByClass;
  if (statusEls.length === 0) return;

  const detailsById = document.getElementById('settings-google-auth-details');
  const detailsByClass = Array.from(document.querySelectorAll('.settings-google-auth-details'));
  const detailEls = detailsById
    ? [detailsById, ...detailsByClass.filter(el => el !== detailsById)]
    : detailsByClass;

  statusEls.forEach(el => {
    el.textContent = '상태 확인 중...';
    el.className = 'status-badge';
  });
  detailEls.forEach(el => {
    el.textContent = '연결 상태 확인 중...';
  });

  try {
    const data = await fetchJson('/api/v1/google-oauth/status');
    const state = String(data?.state || '').trim().toLowerCase();
    const connectedEmail = String(data?.connectedEmail || data?.email || '').trim();
    const lastVerifiedAt = String(data?.lastVerifiedAt || '').trim();
    const lastVerifiedText = lastVerifiedAt
      ? new Date(lastVerifiedAt).toLocaleString()
      : '';
    const detailText = state === 'connected'
      ? [
        `연결 계정: ${connectedEmail || '-'}`,
        lastVerifiedText ? `마지막 확인: ${lastVerifiedText}` : '',
        data?.message || ''
      ].filter(Boolean).join('\n')
      : [
        data?.message || 'Google 계정 연결이 필요합니다.',
        connectedEmail ? `이전 연결 계정: ${connectedEmail}` : ''
      ].filter(Boolean).join('\n');

    statusEls.forEach(el => {
      if (state === 'connected') {
        el.textContent = '연결됨';
        el.className = 'status-badge success';
      } else if (state === 'reauth_required') {
        el.textContent = '다시 로그인 필요';
        el.className = 'status-badge error';
      } else {
        el.textContent = '미연결';
        el.className = 'status-badge error';
      }
    });
    detailEls.forEach(el => {
      el.textContent = detailText;
    });
  } catch (e) {
    statusEls.forEach(el => {
      el.textContent = '상태 확인 실패';
      el.className = 'status-badge error';
    });
    detailEls.forEach(el => {
      el.textContent = `상태 조회 실패\n오류: ${String(e?.message || 'unknown')}`;
    });
  }
}

async function pollGoogleOauthStatus(maxAttempts = 60, intervalMs = 2000) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    try {
      const data = await fetchJson('/api/v1/google-oauth/status');
      if (String(data?.state || '').trim().toLowerCase() === 'connected') {
        await loadGoogleAuthStatus();
        return data;
      }
    } catch (_) {
      // ignore transient polling errors
    }
  }
  return null;
}

async function startGoogleOauth() {
  updateSettingsStatus('.settings-google-auth-result', '브라우저에서 Google 로그인을 진행하세요.', 'info');
  try {
    const data = await postJson('/api/v1/google-oauth/start', {});
    if (!data?.authUrl) {
      throw new Error('Google 인증 URL을 생성하지 못했습니다.');
    }
    let resolved = false;
    const handleOauthMessage = async (event) => {
      if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(String(event.origin || ''))) return;
      if (event.data?.source !== 'google-oauth') return;
      window.removeEventListener('message', handleOauthMessage);
      resolved = true;
      await loadGoogleAuthStatus();
      uiSheetsReady = false;
      if (event.data?.status === 'success') {
        updateSettingsStatus('.settings-google-auth-result', `연결 완료\n계정: ${event.data?.email || '-'}`, 'success');
      } else {
        updateSettingsStatus('.settings-google-auth-result', `오류: ${event.data?.message || 'Google 연결에 실패했습니다.'}`, 'error');
      }
    };
    window.addEventListener('message', handleOauthMessage);
    const popup = window.open(data.authUrl, 'google-oauth-login', 'width=620,height=760');
    if (!popup) {
      window.removeEventListener('message', handleOauthMessage);
      throw new Error('브라우저 팝업을 열지 못했습니다. 팝업 차단을 확인하세요.');
    }
    const status = await pollGoogleOauthStatus();
    window.removeEventListener('message', handleOauthMessage);
    if (resolved || String(status?.state || '').trim().toLowerCase() === 'connected') {
      updateSettingsStatus('.settings-google-auth-result', `연결 완료\n계정: ${status?.connectedEmail || status?.email || '-'}`, 'success');
      uiSheetsReady = false;
      return;
    }
    updateSettingsStatus('.settings-google-auth-result', '브라우저에서 로그인을 완료한 뒤 다시 상태를 확인하세요.', 'info');
  } catch (e) {
    updateSettingsStatus('.settings-google-auth-result', `오류: ${e.message}`, 'error');
  }
}

async function disconnectGoogleOauth() {
  updateSettingsStatus('.settings-google-auth-result', '연결 해제 중...', 'info');
  try {
    await postJson('/api/v1/google-oauth/disconnect', {});
    await loadGoogleAuthStatus();
    uiSheetsReady = false;
    updateSettingsStatus('.settings-google-auth-result', 'Google 계정 연결을 해제했습니다.', 'success');
  } catch (e) {
    updateSettingsStatus('.settings-google-auth-result', `오류: ${e.message}`, 'error');
  }
}

async function testGoogleOauth() {
  updateSettingsStatus('.settings-google-auth-result', '연결 테스트 중...', 'info');
  try {
    const data = await postJson('/api/v1/google-oauth/test', {});
    await loadGoogleAuthStatus();
    uiSheetsReady = false;
    updateSettingsStatus(
      '.settings-google-auth-result',
      [
        '연결 테스트 성공',
        data?.email ? `계정: ${data.email}` : '',
        data?.sheetTitle ? `시트: ${data.sheetTitle}` : ''
      ].filter(Boolean).join('\n'),
      'success'
    );
  } catch (e) {
    updateSettingsStatus('.settings-google-auth-result', `오류: ${e.message}`, 'error');
  }
}

