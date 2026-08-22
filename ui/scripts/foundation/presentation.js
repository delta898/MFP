function formatRemaining(value) {
  if (typeof value === 'number' && value < 0) return '무제한';
  if (typeof value === 'number') return `${value}회`;
  return '-';
}

/**
 * 설정 화면의 상태 메시지 UI를 공통된 스타일로 업데이트합니다.
 * @param {string} selector - 대상 엘리먼트 선택자 (id 또는 class)
 * @param {string} message - 표시할 메시지
 * @param {'info'|'success'|'error'} type - 메시지 타입 (색상 결정)
 */
function updateSettingsStatus(selector, message, type = 'info') {
  const els = document.querySelectorAll(selector);
  if (els.length === 0) return;

  const colors = {
    info: '',
    success: '#10b981', // green
    error: '#ef4444'    // red
  };

  els.forEach(el => {
    el.textContent = message;
    el.style.color = colors[type] || '';
  });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function syncFooterVersion(version) {
  const el = document.getElementById('footer-version-display');
  if (el && version) el.textContent = `v${version}`;
}

function syncAppVersionDisplays(version) {
  const normalizedVersion = String(version || '').trim();
  if (!normalizedVersion) return;

  const versionBadge = document.getElementById('badge-version');
  if (versionBadge) versionBadge.textContent = `v${normalizedVersion}`;
  const settingsVersionDisplay = document.getElementById('settings-current-version-display');
  if (settingsVersionDisplay) settingsVersionDisplay.textContent = `v${normalizedVersion}`;
  syncFooterVersion(normalizedVersion);
}

function setPre(id, data) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = JSON.stringify(data, null, 2);
}

function scrollLogTargetIntoView(targetEl) {
  if (!targetEl || typeof targetEl.scrollIntoView !== 'function') return;
  requestAnimationFrame(() => {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

