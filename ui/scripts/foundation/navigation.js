async function navigateTo(viewName, subTab) {
  const requestedView = String(viewName || '').trim();
  const requestedSubTab = String(subTab || '').trim();
  const currentViewName = document.querySelector('.view.active')?.id?.replace(/^view-/, '') || '';
  if (isMobileQuickMode) {
    if (!['dashboard', 'dashboard-beta', 'blog', 'blog-next', 'card-news', 'social', 'account', 'settings-next', 'help'].includes(requestedView)) {
      viewName = 'blog-next';
      subTab = 'quick';
    } else if (requestedView === 'blog') {
      viewName = 'blog-next';
      subTab = 'quick';
    } else if (requestedView === 'blog-next') {
      subTab = 'quick';
    }
  }

  if (viewName !== 'settings' && isSettingsViewActive() && settingsMajorHasPendingBasicChanges) {
    const canLeaveSettings = await confirmDiscardUnsavedSettings();
    if (!canLeaveSettings) return;
  }

  if (viewName !== 'settings-next' && isSettingsNextViewActive() && hasPendingSettingsNextChanges()) {
    const canLeaveSettingsNext = await confirmDiscardUnsavedSettingsNext();
    if (!canLeaveSettingsNext) return;
  }

  const blogNextViewActive = document.getElementById('view-blog-next')?.classList.contains('active') === true;
  if (viewName !== 'blog-next'
    && blogNextViewActive
    && typeof confirmDiscardUnsavedBlogNextAutomationSettings === 'function') {
    const canLeaveBlogNext = await confirmDiscardUnsavedBlogNextAutomationSettings();
    if (!canLeaveBlogNext) return;
  }

  const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
  const views = Array.from(document.querySelectorAll('.view'));
  if (currentViewName === 'card-news' && viewName !== 'card-news' && typeof rememberCardNewsScrollPosition === 'function') {
    rememberCardNewsScrollPosition();
  }
  navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewName));
  views.forEach(view => view.classList.toggle('active', view.id === `view-${viewName}`));
  if (viewName === 'dashboard') {
    void ensureUpdateCheckFresh({ silent: true });
    void initDashboardDynamicContent();
    loadDashboard();
    return;
  }
  if (viewName === 'dashboard-beta') {
    loadDashboardBeta();
    return;
  }
  if (viewName === 'logs') {
    if (document.querySelector('.nav-btn[data-view="logs"]')?.hidden !== false) {
      await navigateTo('dashboard-beta');
      return;
    }
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
  if (viewName === 'help') {
    initHelpView();
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
    initBlogNextDraftInputs();
    initBlogNextAutomationSettings();
    initBlogNextRunner();
    if (typeof refreshUiCapabilityReadiness === 'function') {
      await refreshUiCapabilityReadiness();
      if (typeof syncBlogNextTopicActionAvailability === 'function') syncBlogNextTopicActionAvailability();
      if (typeof syncBlogNextDraftExecutionState === 'function') syncBlogNextDraftExecutionState();
    }
    if (requestedSubTab === 'automation') {
      const activated = await requestActivateBlogNextTab('queue');
      if (activated) await requestActivateBlogNextManagementTab('automation');
    } else {
      await requestActivateBlogNextTab(requestedSubTab || blogNextActiveTab);
    }
    return;
  }
  if (viewName === 'card-news') {
    initCardNewsView();
    if (typeof restoreCardNewsScrollPosition === 'function') restoreCardNewsScrollPosition();
    return;
  }
  if (viewName === 'shopping') {
    if (typeof refreshUiCapabilityReadiness === 'function') {
      await refreshUiCapabilityReadiness();
    }
    if (subTab) {
      shoppingActiveTab = String(subTab).trim() || shoppingActiveTab;
    }
    activateShoppingTab(shoppingActiveTab, { forceReload: true });
    if (typeof updateShoppingQuickActionAvailability === 'function') updateShoppingQuickActionAvailability();
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
  if (viewName === 'settings-next') {
    initSettingsNext();
    settingsNextActivateTab(subTab || settingsNextActiveTab);
    await loadSettingsNext({ force: true });
    return;
  }
}

async function navigateToBlogQuickCreate() {
  await navigateTo('blog-next', 'quick');
  const blogView = document.getElementById('view-blog-next');
  if (!blogView?.classList.contains('active')) return false;
  if (typeof activateBlogNextInputMode === 'function') {
    activateBlogNextInputMode('ai');
  }
  requestAnimationFrame(() => document.getElementById('blog-next-subject')?.focus());
  return true;
}

function bindNavigation() {
  const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      void navigateTo(btn.dataset.view);
    });
  });
  document.addEventListener('click', (event) => {
    const guide = event.target.closest('[data-help-guide-url]');
    if (!guide) return;
    event.preventDefault();
    void navigateToHelpGuide(guide.dataset.helpGuideUrl);
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

  blogNextActiveTab = 'quick';

  const activeView = document.querySelector('.view.active')?.id?.replace(/^view-/, '') || '';
  const activeBlogNextTab = document.querySelector('.blog-next-tab-btn.active')?.dataset.blogNextTab || '';

  if (!hasInitializedMobileQuickEntry) {
    hasInitializedMobileQuickEntry = true;
    if (activeView !== 'blog-next') {
      void navigateTo('blog-next', 'quick');
    }
    return;
  }

  if (activeView === 'blog-next' && activeBlogNextTab !== 'quick') {
    activateBlogNextTab('quick');
    return;
  }

  if (activeView && !['dashboard', 'dashboard-beta', 'blog-next', 'card-news', 'settings-next', 'help'].includes(activeView)) {
    void navigateTo('blog-next', 'quick');
  }
}
