async function navigateTo(viewName, subTab) {
  const requestedView = String(viewName || '').trim();
  const requestedSubTab = String(subTab || '').trim();
  if (isMobileQuickMode) {
    if (!['dashboard', 'blog', 'social', 'account'].includes(requestedView)) {
      viewName = 'blog';
      subTab = 'quick';
    } else if (requestedView === 'blog') {
      subTab = 'quick';
    }
  }

  if (viewName !== 'settings' && isSettingsViewActive() && settingsMajorHasPendingBasicChanges) {
    const canLeaveSettings = await confirmDiscardUnsavedSettings();
    if (!canLeaveSettings) return;
  }

  const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
  const views = Array.from(document.querySelectorAll('.view'));
  navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewName));
  views.forEach(view => view.classList.toggle('active', view.id === `view-${viewName}`));
  if (viewName === 'dashboard') {
    void ensureUpdateCheckFresh({ silent: true });
    loadDashboard();
    return;
  }
  if (viewName === 'logs') {
    const activeTab = document.querySelector('.logs-tab-btn.active');
    if (activeTab && activeTab.getAttribute('data-logs-tab') === 'system') {
      loadLogFiles();
    } else {
      loadDashboardLogs();
    }
    return;
  }
  if (viewName === 'account') {
    loadAccountOverview().catch((error) => console.warn('[Account Overview]', error.message));
    return;
  }
  if (viewName === 'social') {
    await loadManualSnsComposer({ force: true });
    return;
  }
  if (viewName === 'blog') {
    const ready = await ensureSheetsPreflightUi();
    if (!ready) return;
    if (subTab) {
      blogActiveTab = String(subTab).trim() || blogActiveTab;
    }
    activateBlogTab(blogActiveTab, { forceReload: true });
    return;
  }
  if (viewName === 'blog-next') {
    initBlogNextShell();
    initBlogNextQuickQueue();
    initBlogNextRunner();
    activateBlogNextTab(requestedSubTab || blogNextActiveTab);
    return;
  }
  if (viewName === 'shopping') {
    const ready = await ensureSheetsPreflightUi();
    if (!ready) return;
    if (subTab) {
      shoppingActiveTab = String(subTab).trim() || shoppingActiveTab;
    }
    activateShoppingTab(shoppingActiveTab, { forceReload: true });
    return;
  }
  if (viewName === 'settings') {
    void ensureUpdateCheckFresh({ silent: true });
    const tab = subTab || settingsActiveTab;
    if (isSettingsViewActive()) {
      activateSettingsTab(tab, { forceReload: false });
      return;
    }
    loadSettingsMajor();
    activateSettingsTab(tab, { forceReload: true });
    return;
  }
}

function bindNavigation() {
  const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      void navigateTo(btn.dataset.view);
    });
  });
}

function applyMobileQuickMode() {
  const nextMobileMode = window.innerWidth <= MOBILE_QUICK_MODE_BREAKPOINT;
  isMobileQuickMode = nextMobileMode;
  document.body.classList.toggle('mobile-quick-mode', nextMobileMode);

  if (!nextMobileMode) {
    hasInitializedMobileQuickEntry = false;
    return;
  }

  blogActiveTab = 'quick';

  const activeView = document.querySelector('.view.active')?.id?.replace(/^view-/, '') || '';
  const activeBlogTab = document.querySelector('.blog-tab-panel.active')?.id?.replace(/^blog-tab-/, '') || '';

  if (!hasInitializedMobileQuickEntry) {
    hasInitializedMobileQuickEntry = true;
    if (activeView !== 'blog' || activeBlogTab !== 'quick') {
      void navigateTo('blog', 'quick');
    }
    return;
  }

  if (activeView === 'blog' && activeBlogTab !== 'quick') {
    activateBlogTab('quick', { forceReload: false });
    return;
  }

  if (activeView && !['dashboard', 'blog'].includes(activeView)) {
    void navigateTo('blog', 'quick');
  }
}
