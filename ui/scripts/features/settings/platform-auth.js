async function startNaverLoginFromUi() {
  renderNaverSessionStatus(null, { checking: true, detail: '로그인 완료를 기다리는 중...' });
  updateSettingsStatus('.settings-major-result', '로그인 시작 요청 중...', 'info');
  try {
    await postJson('/api/v1/session/naver-login/start', {});
    updateSettingsStatus('.settings-major-result', '브라우저에서 네이버 로그인을 완료해 주세요.', 'info');
    const loginResult = await pollNaverLoginStatus();
    await loadNaverSessionStatus({ force: true });
    if (String(loginResult?.status || '') === 'success') {
      updateSettingsStatus('.settings-major-result', '네이버 로그인이 완료되었습니다.', 'success');
    } else {
      updateSettingsStatus(
        '.settings-major-result',
        `네이버 로그인에 실패했습니다: ${loginResult?.error || loginResult?.message || '로그인 완료를 확인하지 못했습니다.'}`,
        'error'
      );
    }
  } catch (e) {
    await loadNaverSessionStatus({ force: true });
    updateSettingsStatus('.settings-major-result', `오류: ${e.message}`, 'error');
  }
}

function renderNaverSessionStatus(data, options = {}) {
  const badge = document.getElementById('settings-naver-session-badge');
  const detail = document.getElementById('settings-naver-session-detail');
  const loginBtn = document.getElementById('settings-naver-login-btn');
  const logoutBtn = document.getElementById('settings-naver-logout-btn');
  if (!badge || !detail) return;

  if (options.checking) {
    badge.textContent = '확인 중';
    badge.className = 'status-badge';
    detail.textContent = options.detail || '네이버 로그인 상태를 확인하고 있습니다.';
    if (loginBtn) loginBtn.disabled = true;
    if (logoutBtn) logoutBtn.disabled = true;
    return;
  }

  const valid = data?.valid === true;
  const reason = String(data?.reason || '').trim();
  if (valid) {
    badge.textContent = '로그인됨';
    badge.className = 'status-badge success';
    detail.textContent = '네이버 로그인 세션이 정상입니다.';
  } else if (reason === 'expired') {
    badge.textContent = '로그인 만료';
    badge.className = 'status-badge error';
    detail.textContent = '세션이 만료되었습니다. 다시 로그인해 주세요.';
  } else if (reason === 'check_failed') {
    badge.textContent = '확인 실패';
    badge.className = 'status-badge error';
    detail.textContent = data?.message || '로그인 상태를 확인하지 못했습니다.';
  } else {
    badge.textContent = '로그아웃됨';
    badge.className = 'status-badge';
    detail.textContent = '저장된 네이버 로그인 정보가 없습니다.';
  }

  if (loginBtn) {
    loginBtn.hidden = valid;
    loginBtn.disabled = false;
  }
  if (logoutBtn) {
    logoutBtn.hidden = !valid;
    logoutBtn.disabled = false;
  }
}

async function loadNaverSessionStatus({ force = false } = {}) {
  renderNaverSessionStatus(null, { checking: true });
  try {
    const suffix = force ? '?force=1' : '';
    const data = await fetchJson(`/api/v1/session/naver${suffix}`);
    renderNaverSessionStatus(data);
    return data;
  } catch (e) {
    renderNaverSessionStatus({
      valid: false,
      reason: 'check_failed',
      message: e.message
    });
    return null;
  }
}

async function pollNaverLoginStatus(maxAttempts = 150, intervalMs = 2000) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    const data = await fetchJson('/api/v1/session/naver-login');
    const status = String(data?.status || '').trim().toLowerCase();
    if (status === 'success' || status === 'failed') return data;
  }
  return {
    status: 'failed',
    message: '로그인 확인 시간이 초과되었습니다.'
  };
}

async function logoutNaverFromUi() {
  const confirmed = await showUiConfirm(
    '이 기기에 저장된 네이버 로그인 정보를 삭제하고 로그아웃할까요?',
    {
      title: '네이버 로그아웃',
      confirmText: '로그아웃',
      cancelText: '취소'
    }
  );
  if (!confirmed) return;

  renderNaverSessionStatus(null, { checking: true, detail: '로그아웃 중...' });
  try {
    await postJson('/api/v1/session/naver-login/logout', {});
    await loadNaverSessionStatus({ force: true });
    updateSettingsStatus('.settings-major-result', '이 기기의 네이버 로그인 정보를 삭제했습니다.', 'success');
  } catch (e) {
    await loadNaverSessionStatus({ force: true });
    updateSettingsStatus('.settings-major-result', `로그아웃 실패: ${e.message}`, 'error');
  }
}

async function verifyWordPressAuthFromUi() {
  const resultEl = document.getElementById('settings-wordpress-verify-result');
  const btn = document.getElementById('settings-wordpress-verify-btn');
  if (!resultEl) return;

  const wordpressUrl = (document.getElementById('settings-wordpress-url')?.value || '').trim();
  const wordpressUserId = (document.getElementById('settings-wordpress-user-id')?.value || '').trim();
  const wordpressAppPassword = getSettingsInputValue('settings-wordpress-app-password').trim();

  updateSettingsStatus('#settings-wordpress-verify-result', '연동 확인 중...', 'info');
  if (btn) btn.disabled = true;

  try {
    const res = await postJson('/api/v1/session/wordpress-verify', {
      wordpressUrl,
      wordpressUserId,
      wordpressAppPassword
    });
    if (res.success) {
      updateSettingsStatus('#settings-wordpress-verify-result', '✅ ' + res.message, 'success');
      invalidateWpCategoryCache(); // 인증 성공 시 카테고리 정보 갱신을 위해 캐시 초기화
      fetchWpCategories(); // 백그라운드에서 즉시 갱신 시작
    } else {
      updateSettingsStatus('#settings-wordpress-verify-result', '❌ ' + res.message, 'error');
    }
  } catch (e) {
    updateSettingsStatus('#settings-wordpress-verify-result', `❌ 오류: ${e.message}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}



