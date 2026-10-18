function activateShoppingTab(tabName, options = {}) {
  // 글감 관리는 원고 미리보기 workspace와 함께 다시 제공할 때까지 진입을 막는다.
  const allowed = ['quick'];
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
