
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

async function navigateToSettingsNextTarget(tabName, targetId) {
  await navigateTo('settings-next', tabName);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const target = document.getElementById(String(targetId || '').trim());
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.remove('settings-navigation-target');
      void target.offsetWidth;
      target.classList.add('settings-navigation-target');
      setTimeout(() => target.classList.remove('settings-navigation-target'), 1800);
    });
  });
}

function dismissSetupBanner() {
  const banner = document.getElementById('setup-guide-banner');
  if (banner) banner.style.display = 'none';
  localStorage.setItem(SETUP_BANNER_DISMISS_KEY, 'true');
}
// ─────────────────────────────────────────────────────────────────
