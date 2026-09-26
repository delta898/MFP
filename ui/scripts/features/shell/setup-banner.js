
const LOGS_NAV_VISIBLE_ENVIRONMENTS = ['local', 'development'];

function syncLogsNavVisibility(status) {
  const button = document.querySelector('.nav-btn[data-view="logs"]');
  if (!button) return;
  const environment = String(status?.runtimeEnvironment?.environment || '').trim().toLowerCase();
  button.hidden = !LOGS_NAV_VISIBLE_ENVIRONMENTS.includes(environment);
}

async function checkSetupBanner() {
  const dismissed = localStorage.getItem(SETUP_BANNER_DISMISS_KEY) === 'true';
  try {
    const status = await fetchJson('/api/v1/config/status');
    syncLogsNavVisibility(status);
    if (dismissed) return;
    const banner = document.getElementById('setup-guide-banner');
    if (!banner) return;
    if (status && status.isEssentialSet === false) {
      banner.style.display = 'flex';
    } else {
      banner.style.display = 'none';
      localStorage.removeItem(SETUP_BANNER_DISMISS_KEY);
    }
  } catch (e) {
    console.warn('Setup banner check failed:', e.message);
  }
}

function goToSettings() {
  const settingsBtn = document.querySelector('[data-view="settings-next"]');
  if (settingsBtn) settingsBtn.click();
}

async function navigateToSettingsNextTarget(tabName, targetId, localTab = '') {
  const normalizedTab = String(tabName || '').trim();
  const normalizedLocalTab = String(localTab || '').trim();
  if (normalizedTab === 'core' && normalizedLocalTab && typeof settingsNextActivateCoreTab === 'function') {
    settingsNextActivateCoreTab(normalizedLocalTab);
  }
  const scrollToTarget = () => {
    const target = document.getElementById(String(targetId || '').trim());
    if (typeof scrollUiSettingsTargetIntoView === 'function') {
      void scrollUiSettingsTargetIntoView(target, { highlight: true });
    }
  };
  // View toggle inside navigateTo() runs before its data reload. Scroll now so a
  // hanging settings reload (fetchJson has no timeout) cannot trap the user at the
  // top of the tab, then scroll again once loading settles.
  scrollToTarget();
  await navigateTo('settings-next', tabName);
  scrollToTarget();
}

function dismissSetupBanner() {
  const banner = document.getElementById('setup-guide-banner');
  if (banner) banner.style.display = 'none';
  localStorage.setItem(SETUP_BANNER_DISMISS_KEY, 'true');
}
// ─────────────────────────────────────────────────────────────────
