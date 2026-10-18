const UPDATE_AUTO_CHECK_STALE_MS = 6 * 60 * 60 * 1000;
const UPDATE_AUTO_CHECK_POLL_MS = 30 * 60 * 1000;

function formatUpdatePublishDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildUpdateDetailsMessage(info) {
  const details = info?.details || {};
  const lines = [];
  const summary = String(details.summary || info?.body || '').trim();
  const highlights = Array.isArray(details.highlights) ? details.highlights.filter(Boolean) : [];
  const publishDate = formatUpdatePublishDate(info?.publishDate);

  if (summary) lines.push(summary);
  if (publishDate) lines.push(`배포일: ${publishDate}`);
  if (highlights.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('주요 변경');
    highlights.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
  }
  if (!summary && highlights.length === 0) {
    lines.push(`v${info?.latestVersion || ''} 업데이트 안내 정보가 아직 없습니다.`);
  }

  return lines.join('\n');
}

async function openUpdateDetailsDialog() {
  if (!uiUpdateInfo) return;
  await showUiDialog({
    title: `v${uiUpdateInfo.latestVersion} 업데이트 안내`,
    message: buildUpdateDetailsMessage(uiUpdateInfo),
    showCancel: false,
    confirmText: '확인'
  });
}

function highlightUpdateBanner() {
  const banner = document.getElementById('update-banner');
  if (!banner) return;
  banner.classList.remove('update-banner-attention');
  void banner.offsetWidth;
  banner.classList.add('update-banner-attention');
  window.setTimeout(() => {
    banner.classList.remove('update-banner-attention');
  }, 1800);
}

function scrollToUpdateBanner({ emphasize = false } = {}) {
  const banner = document.getElementById('update-banner');
  if (!banner || banner.classList.contains('hidden')) return;
  banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (emphasize) highlightUpdateBanner();
}

function setUpdateBannerState(state = 'available') {
  const banner = document.getElementById('update-banner');
  if (!banner) return;
  banner.dataset.updateState = state;
}

function clearUpdateBannerState() {
  uiUpdateInfo = null;
  const banner = document.getElementById('update-banner');
  const updateCancelBtn = document.getElementById('update-cancel-btn');
  if (banner) banner.classList.add('hidden');
  setUpdateBannerState('available');
  if (updateCancelBtn) updateCancelBtn.disabled = false;
}

function shouldRefreshUpdateCheck() {
  return !uiUpdateLastCheckedAt || (Date.now() - uiUpdateLastCheckedAt) >= UPDATE_AUTO_CHECK_STALE_MS;
}

async function ensureUpdateCheckFresh(options = {}) {
  const { silent = true, force = false } = options;
  if (uiUpdateCheckInFlight) return;
  if (!force && !shouldRefreshUpdateCheck()) return;
  uiUpdateCheckInFlight = true;
  try {
    await checkUpdate(!silent, force);
  } finally {
    uiUpdateCheckInFlight = false;
  }
}

async function checkUpdate(isManual = false, isForce = false) {
  try {
    uiUpdateLastCheckedAt = Date.now();
    if (isManual) {
      showUiPopup(isForce ? '전체 환경을 다시 점검하며 강제 업데이트를 확인 중입니다...' : '최신 버전을 확인하고 있습니다...');
    }

    const url = isForce ? '/api/v1/system/update/check?force=true' : '/api/v1/system/update/check';
    const info = await fetchJson(url);
    if (info && info.hasUpdate) {
      uiUpdateInfo = { ...info, forced: isForce };
      const banner = document.getElementById('update-banner');
      const bannerText = document.getElementById('update-banner-text');
      if (banner && bannerText) {
        bannerText.textContent = isForce
          ? `강제 업데이트 준비 완료 (대상 버전: v${info.latestVersion})`
          : `새로운 버전(v${info.latestVersion})이 출시되었습니다!`;
        banner.classList.remove('hidden');
        setUpdateBannerState('available');
      }
      if (isManual) {
        const msg = isForce
          ? `현재 버전과 동일하더라도 업데이트가 가능합니다.\n상단 알림 배너의 '지금 업데이트'를 눌러 재설치를 진행하세요.`
          : `새로운 버전 v${info.latestVersion}을 찾았습니다!\n상단 알림 배너의 '지금 업데이트'를 눌러 진행하세요.`;
        showUiPopup(msg).then(() => {
          scrollToUpdateBanner({ emphasize: true });
        });
      }
    } else {
      clearUpdateBannerState();
      if (isManual) showUiPopup('현재 최신 버전을 사용 중입니다.');
    }
  } catch (e) {
    console.warn('업데이트 체크 실패:', e);
    if (isManual) showUiPopup(`업데이트 확인 실패: ${e.message}`);
  }
}

async function applyUpdate() {
  if (!uiUpdateInfo) return;

  const forceNotice = uiUpdateInfo.forced
    ? '현재 설치 버전과 관계없이 선택된 최신 버전을 다시 내려받아 설치합니다.\n\n'
    : '';
  const confirmed = await showUiConfirm(`${forceNotice}BlogGenius v${uiUpdateInfo.latestVersion} 업데이트를 시작할까요?\n\n업데이트 완료 후 앱이 자동으로 재시작됩니다.`);
  if (!confirmed) return;

  const banner = document.getElementById('update-banner');
  const progressMessage = document.getElementById('update-progress-message');
  const progressPercent = document.getElementById('update-progress-percent');
  const progressBar = document.getElementById('update-progress-bar');
  const progressIcon = document.getElementById('update-progress-icon');
  const updateCancelBtn = document.getElementById('update-cancel-btn');

  // Show progress UI
  if (banner) banner.classList.remove('hidden');
  setUpdateBannerState('applying');

  const stageIcons = { downloading: '⬇️', verifying: '🔐', extracting: '📦', syncing: '🔄', done: '✅', error: '❌', idle: '⏳' };

  function setProgressUi({ message, percent, stage }) {
    // message에 대한 텍스트 (퍼센트 제외, 별도로 표시)
    const stageLabels = {
      downloading: '다운로드 중...',
      verifying: '무결성 검증 중...',
      extracting: '압축 해제 중...',
      syncing: '파일 동기화 중...',
      done: '업데이트 완료! 재시작 중...',
      error: message || '오류 발생',
      idle: '준비 중...'
    };
    if (progressMessage) progressMessage.textContent = stageLabels[stage] || message || '진행 중...';
    if (progressIcon) progressIcon.textContent = stageIcons[stage] || '⏳';

    // 퍼센트는 다운로드 단계에서만 표시
    if (stage === 'downloading') {
      const pct = typeof percent === 'number' ? percent : 0;
      if (progressPercent) progressPercent.textContent = pct > 0 ? `${pct}%` : '';
      if (progressBar) progressBar.value = pct;
      setUpdateBannerState('downloading');
    } else {
      if (progressPercent) progressPercent.textContent = '';
      if (progressBar) progressBar.value = stage === 'error' ? 0 : 100;
      setUpdateBannerState(stage === 'error' ? 'error' : 'applying');
    }
  }

  let pollTimer = null;
  let cancelled = false;

  if (updateCancelBtn) {
    updateCancelBtn.onclick = async () => {
      cancelled = true;
      clearTimeout(pollTimer);
      if (updateCancelBtn) updateCancelBtn.disabled = true;
      if (progressMessage) progressMessage.textContent = '취소 중...';
      setUpdateBannerState('applying');
      try { await postJson('/api/v1/system/update/cancel'); } catch (_) { }
      // Restore normal state
      setTimeout(() => {
        setUpdateBannerState('available');
        if (updateCancelBtn) updateCancelBtn.disabled = false;
      }, 1000);
    };
  }

  async function pollProgress() {
    if (cancelled) return;
    try {
      const p = await fetchJson('/api/v1/system/update/progress');
      setProgressUi(p);
      if (p.stage !== 'done' && p.stage !== 'error') pollTimer = setTimeout(pollProgress, 800);
    } catch (_) {
      if (!cancelled) pollTimer = setTimeout(pollProgress, 1000);
    }
  }

  try {
    const applyPromise = postJson('/api/v1/system/update/apply');
    pollTimer = setTimeout(pollProgress, 400);
    await applyPromise;
    if (cancelled) return;
    clearTimeout(pollTimer);
    setProgressUi({ stage: 'done', percent: 100 });
    setTimeout(async () => {
      try {
        await postJson('/api/v1/system/update/restart');
      } catch (e) {
        setProgressUi({
          stage: 'error',
          message: `업데이트 재시작 실패: ${e.message}`,
          percent: 0
        });
      }
    }, 1500);
  } catch (e) {
    if (cancelled) return;
    clearTimeout(pollTimer);
    setProgressUi({ stage: 'error', message: `업데이트 실패: ${e.message}`, percent: 0 });
    setTimeout(() => {
      setUpdateBannerState('available');
    }, 4000);
  }
}
