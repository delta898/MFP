function activateShoppingTab(tabName, options = {}) {
  const allowed = ['quick', 'batch'];
  const target = allowed.includes(String(tabName)) ? String(tabName) : 'quick';
  shoppingActiveTab = target;

  const tabButtons = Array.from(document.querySelectorAll('.shopping-tab-btn'));
  const tabPanels = Array.from(document.querySelectorAll('.shopping-tab-panel'));
  tabButtons.forEach((btn) => {
    const active = btn.dataset.shoppingTab === target;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.tabIndex = active ? 0 : -1;
  });
  tabPanels.forEach((panel) => {
    const active = panel.id === `shopping-tab-${target}`;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
  syncScopedMajorSaveActions();

  const forceReload = options.forceReload !== false;
  if (!forceReload) return;

  if (target === 'batch') {
    if (typeof isUiCapabilityUnavailable === 'function' && isUiCapabilityUnavailable('content.sheet')) {
      const status = document.getElementById('shopping-management-status');
      if (status) {
        status.hidden = false;
        status.dataset.state = 'empty';
        status.textContent = '글감 관리를 사용하려면 Google Spreadsheet를 먼저 연결해 주세요.';
      }
      return;
    }
    loadBlogShopping();
    return;
  }
}

function activateSettingsTab(tabName, options = {}) {
  const allowed = ['general', 'mcp', 'writing', 'naver-blog', 'shopping-connect', 'sns', 'card-news', 'notification', 'ai'];
  const requested = allowed.includes(String(tabName)) ? String(tabName) : 'general';
  const target = requested === 'mcp' ? 'ai' : requested;
  settingsActiveTab = target;

  const tabButtons = Array.from(document.querySelectorAll('.settings-tab-btn[data-settings-tab]'));
  const tabPanels = Array.from(document.querySelectorAll('.settings-tab-panel'));
  tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.settingsTab === target));
  tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === `settings-tab-${target}`));
  if (target === 'naver-blog' && options.forceReload !== false) {
    void loadNaverSessionStatus();
  }
  if (target === 'writing' && options.forceReload !== false) {
    void loadSettingsWritingProfile();
  }
}
