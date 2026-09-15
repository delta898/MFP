async function loadConfigStatus() {
  try {
    const status = await fetchJson('/api/v1/config/status');
    console.log('[Config Status] Received:', status);
    uiConfigReady = status?.ready === true;
    uiAiTextReady = status?.setup?.ai?.configured === true;
    uiNaverReady = status?.isNaverSet === true;
    uiWpReady = status?.isWpSet === true;
    uiConfigStatusMessage = String(status?.message || '').trim();

    // 플랫폼 UI 상태 동기화 (네이버 & 워드프레스)
    syncPlatformUiState('naver', uiNaverReady);
    syncPlatformUiState('wordpress', uiWpReady);

    // 앱 버전 즉시 표시
    if (status?.version) {
      syncAppVersionDisplays(status.version);
      console.log('[UI] Version displays updated to:', status.version);
    }

    if (!uiConfigReady && !uiConfigPopupShown) {
      uiConfigPopupShown = true;
      const popupText = [
        '설정 파일이 준비되지 않았습니다.',
        '',
        '설정 메뉴에서 주요 항목을 입력 후 저장하세요.',
        '',
        uiConfigStatusMessage || '- config/config.json 또는 config/config.json.sample 확인 필요'
      ].join('\n');
      showUiPopup(popupText);
    }
    return status;
  } catch (e) {
    uiConfigReady = false;
    uiAiTextReady = null;
    uiNaverReady = false;
    uiWpReady = false;
    uiConfigStatusMessage = String(e.message || '');
    syncPlatformUiState('naver', false);
    syncPlatformUiState('wordpress', false);
    if (!uiConfigPopupShown) {
      uiConfigPopupShown = true;
      showUiPopup(`설정 상태 확인 중 오류가 발생했습니다.\n${uiConfigStatusMessage}`);
    }
    return null;
  }
}

function syncPlatformUiState(platform, isReady) {
  const targetIds = {
    naver: [
      'quick-target-naver',
      'local-markdown-target-naver',
      'blog-batch-target-naver',
      'shopping-quick-target-naver',
      'blog-publish-auto-target-naver',
      'blog-next-target-naver'
    ],
    wordpress: [
      'quick-target-wordpress',
      'local-markdown-target-wordpress',
      'blog-batch-target-wordpress',
      'shopping-quick-target-wordpress',
      'blog-publish-auto-target-wordpress',
      'blog-next-target-wordpress'
    ]
  };

  const ids = targetIds[platform] || [];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    // 비활성화 처리
    el.disabled = !isReady;

    // 설정 미비 시 체크 해제
    if (!isReady) el.checked = false;

    // 안내 아이콘 (Emoji) 제어
    const container = el.closest('label') || el.parentElement;
    if (!container) return;

    let hint = container.querySelector('.platform-setup-hint');
    if (!isReady) {
      if (!hint) {
        hint = document.createElement('span');
        hint.className = 'platform-setup-hint';
        hint.style.cursor = 'pointer';
        hint.style.marginLeft = '-3px';
        hint.style.fontSize = '12px';
        hint.innerHTML = '❗';
        hint.title = `${platform === 'naver' ? '네이버' : '워드프레스'} 설정이 필요합니다. 클릭하여 [설정 > 블로그] 탭으로 이동합니다.`;

        // 클릭 시 설정 -> 블로그 탭으로 이동
        hint.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof navigateTo === 'function') {
            navigateTo('settings-next', 'core');
          }
        };

        container.appendChild(hint);
      }
    } else {
      if (hint) hint.remove();
    }
  });
}

// Legacy function removed (integrated into syncPlatformUiState)
function syncWordPressUiState() { }

function guardUiConfigReady(featureLabel = '이 기능') {
  if (uiConfigReady) return true;
  showUiPopup([
    `${featureLabel}을(를) 실행하려면 설정이 필요합니다.`,
    '상단 메뉴의 [설정]에서 주요 항목 저장 후 다시 시도하세요.',
    '',
    uiConfigStatusMessage || ''
  ].join('\n'));
  return false;
}

async function ensureSheetsPreflightUi(options = {}) {
  const force = options?.force === true;
  const silent = options?.silent === true;

  if (!uiConfigReady) return false;
  if (!force && uiSheetsReady) return true;

  if (uiSheetsPreflightInFlight && !force) {
    try {
      await uiSheetsPreflightInFlight;
      return true;
    } catch (_e) {
      return false;
    }
  }

  const query = force ? '?force=true' : '';
  uiSheetsPreflightInFlight = fetchJson(`/api/v1/sheets/ensure${query}`)
    .then(() => {
      uiSheetsReady = true;
      return true;
    })
    .catch((e) => {
      uiSheetsReady = false;
      if (!silent) {
        showUiPopup([
          '필수 시트 준비에 실패했습니다.',
          '설정의 GOOGLE_SHEET_URL과 서비스 계정 공유 상태를 확인해 주세요.',
          '',
          String(e?.message || 'unknown')
        ].join('\n'));
      }
      throw e;
    })
    .finally(() => {
      uiSheetsPreflightInFlight = null;
    });

  try {
    await uiSheetsPreflightInFlight;
    return true;
  } catch (_e) {
    return false;
  }
}
