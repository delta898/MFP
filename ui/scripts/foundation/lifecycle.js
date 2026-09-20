window.addEventListener('DOMContentLoaded', () => {
  let criticalNavigationBound = false;
  let startupLifecycleError = null;
  try {
  window.addEventListener('beforeunload', (event) => {
    if (!settingsMajorHasPendingBasicChanges
      && !settingsWritingProfileDirty
      && !hasPendingSettingsNextChanges()
      && !(typeof blogNextSmartCommentDirty !== 'undefined' && blogNextSmartCommentDirty)
      && !(typeof blogNextAutomationDirty !== 'undefined' && blogNextAutomationDirty)) return;
    event.preventDefault();
    event.returnValue = '';
  });

  try { initManagedSettingsSecretFields(); } catch (e) { console.warn('initManagedSettingsSecretFields error:', e); }
  try { initSettingsWritingProfileUi(); } catch (e) { console.warn('initSettingsWritingProfileUi error:', e); }
  try { initSettingsNext(); } catch (e) { console.warn('initSettingsNext error:', e); }
  try { initManualSnsComposer(); } catch (e) { console.warn('initManualSnsComposer error:', e); }
  try { if (typeof initShoppingImageSettings === 'function') initShoppingImageSettings(); } catch (e) { console.warn('initShoppingImageSettings error:', e); }
  try { if (typeof initSettingsNextAppearance === 'function') initSettingsNextAppearance(); } catch (e) { console.warn('initSettingsNextAppearance error:', e); }
  checkSetupBanner();
  void initSidebarDynamicContent();
  const settingsCheckUpdateBtn = document.getElementById('settings-check-update-btn');
  if (settingsCheckUpdateBtn) {
    settingsCheckUpdateBtn.addEventListener('click', () => {
      checkUpdate(true, false);
    });
  }

  const settingsForceUpdateBtn = document.getElementById('settings-force-update-btn');
  if (settingsForceUpdateBtn) {
    settingsForceUpdateBtn.addEventListener('click', () => {
      checkUpdate(true, true);
    });
  }

  try { initClockWidget(); } catch (e) { console.warn('initClockWidget error:', e); }
  void showPendingUpdateCelebration();
  try { initGlobalPublishingStatus(); } catch (e) { console.warn('initGlobalPublishingStatus error:', e); }
  try { ensureUpdateCheckFresh({ silent: true }); } catch (e) { console.warn('checkUpdate error:', e); }
  try { applyMobileQuickMode(); } catch (e) { console.warn('applyMobileQuickMode error:', e); }
  window.addEventListener('resize', applyMobileQuickMode);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      flushPendingQuickPostingCelebration();
      void ensureUpdateCheckFresh({ silent: true });
      void refreshSidebarDynamicContent();
      if (document.getElementById('view-dashboard')?.classList.contains('active')) {
        void initDashboardDynamicContent();
      }
      if (document.getElementById('view-dashboard-beta')?.classList.contains('active')) {
        void loadDashboardBeta({ force: true });
      }
      if (document.getElementById('view-help')?.classList.contains('active')) {
        void refreshHelpCatalog();
      }
    }
  });
  window.addEventListener('focus', () => {
    flushPendingQuickPostingCelebration({ windowFocused: true });
    void ensureUpdateCheckFresh({ silent: true });
    void refreshSidebarDynamicContent();
    if (document.getElementById('view-dashboard')?.classList.contains('active')) {
      void initDashboardDynamicContent();
    }
    if (document.getElementById('view-dashboard-beta')?.classList.contains('active')) {
      void loadDashboardBeta({ force: true });
    }
    if (document.getElementById('view-help')?.classList.contains('active')) {
      void refreshHelpCatalog();
    }
  });
  setInterval(() => {
    void ensureUpdateCheckFresh({ silent: true });
  }, UPDATE_AUTO_CHECK_POLL_MS);

  const accountRetryBtn = document.getElementById('account-retry-btn');
  accountRetryBtn?.addEventListener('click', () => {
    loadAccountOverview({ force: true }).catch((error) => console.warn('[Account Overview Retry]', error.message));
  });
  bindAccountUpgradeFreeClick();
  bindAccountEmailClick();
  bindAccountPlanInfoClick();
  document.querySelectorAll('[data-account-settings-next-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      void navigateToSettingsNextTarget(
        button.getAttribute('data-account-settings-next-tab') || 'core',
        button.getAttribute('data-account-settings-next-target') || '',
        button.getAttribute('data-account-settings-next-local-tab') || ''
      );
    });
  });

  // Sidebar Toggle (Desktop)
  try {
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebar = document.getElementById('sidebar');

    // Restore state
    const isCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    if (isCollapsed && sidebar) {
      sidebar.classList.add('collapsed');
    }
    syncCollapsedSidebarTooltips();

    if (sidebarToggleBtn && sidebar) {
      sidebarToggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const nowCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('sidebar-collapsed', nowCollapsed);
        syncCollapsedSidebarTooltips();

        // Trigger a window resize event to let other components (like tables) adjust if needed
        window.dispatchEvent(new Event('resize'));
      });
    }
  } catch (e) { console.warn('Sidebar toggle init error:', e); }

  // Mobile Menu Toggle
  try {
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    if (mobileMenuBtn && sidebar && sidebarOverlay) {
      function toggleMenu() {
        sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
      }
      mobileMenuBtn.addEventListener('click', toggleMenu);
      sidebarOverlay.addEventListener('click', toggleMenu);

      // Close menu when a navigation button is clicked on mobile
      const navBtns = document.querySelectorAll('.nav-btn');
      navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          if (window.innerWidth <= 960 && sidebar.classList.contains('open')) {
            toggleMenu();
          }
        });
      });
    }
  } catch (e) { console.warn('Mobile menu init error:', e); }

  // Server Control Buttons
  try {
    const restartBtn = document.getElementById('server-restart-btn');
    const stopBtn = document.getElementById('server-stop-btn');

    if (restartBtn) {
      restartBtn.addEventListener('click', async () => {
        const confirmed = await showUiDialog({
          title: '서버 재시작',
          message: '서버를 재시작하시겠습니까?\n잠시 후 자동으로 페이지가 새로고침됩니다.',
          showCancel: true,
          confirmText: '재시작',
          cancelText: '취소'
        });
        if (!confirmed) return;
        restartBtn.disabled = true;
        restartBtn.textContent = '재시작 중...';
        try {
          await postJson('/api/v1/system/restart');
          setTimeout(() => { location.reload(); }, 3500);
        } catch (e) {
          restartBtn.disabled = false;
          restartBtn.textContent = '🔄 재시작';
          await showUiDialog({ title: '오류', message: '재시작에 실패했습니다: ' + e.message });
        }
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener('click', async () => {
        const confirmed = await showUiDialog({
          title: '⚠️ 서버 종료',
          message: '서버를 완전히 종료하시겠습니까?\n\n종료 후에는 이 페이지도 연결이 끊기며,\n다시 시작하려면 터미널에서 수동으로 실행해야 합니다.',
          showCancel: true,
          confirmText: '종료',
          cancelText: '취소'
        });
        if (!confirmed) return;
        stopBtn.disabled = true;
        stopBtn.textContent = '종료 중...';
        try {
          await postJson('/api/v1/system/stop');
        } catch (e) {
          // Connection refused is expected after stop
        }
      });
    }
  } catch (e) { console.warn('Server control init error:', e); }

  // Update Banner Events
  try {
    const updateCloseBtn = document.getElementById('update-close-btn');
    if (updateCloseBtn) {
      updateCloseBtn.addEventListener('click', () => {
        const banner = document.getElementById('update-banner');
        if (banner) banner.classList.add('hidden');
      });
    }

    const updateDetailsBtn = document.getElementById('update-details-btn');
    if (updateDetailsBtn) {
      updateDetailsBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void openUpdateDetailsDialog();
      });
    }

    const updateNowBtn = document.getElementById('update-now-btn');
    if (updateNowBtn) {
      updateNowBtn.addEventListener('click', () => {
        applyUpdate();
      });
    }
  } catch (e) { console.warn('Update banner init error:', e); }


try { initKeywordResearchModal(); } catch (e) { console.warn('initKeywordResearchModal error:', e); }

  document.addEventListener('click', (event) => {
    const detailsButton = event.target instanceof Element
      ? event.target.closest('#update-details-btn')
      : null;
    if (!detailsButton) return;
    event.preventDefault();
    event.stopPropagation();
    void openUpdateDetailsDialog();
  });

  try {
    const dashLogRefreshBtn = document.getElementById('dash-log-refresh-btn');
    if (dashLogRefreshBtn) {
      dashLogRefreshBtn.addEventListener('click', () => {
        loadDashboardLogs();
        dashLogRefreshBtn.textContent = '불러오는 중...';
        setTimeout(() => dashLogRefreshBtn.textContent = '새로고침', 500);
      });
    }
  } catch (e) { console.warn('Dash log refresh init error:', e); }

  try {
    const dashContentRefreshBtn = document.getElementById('dash-content-refresh-btn');
    if (dashContentRefreshBtn) {
      dashContentRefreshBtn.addEventListener('click', async () => {
        const original = dashContentRefreshBtn.textContent;
        dashContentRefreshBtn.textContent = '불러오는 중...';
        dashContentRefreshBtn.disabled = true;
        try {
          await loadDashboardExternalContent({ force: true, silent: false });
        } finally {
          dashContentRefreshBtn.disabled = false;
          dashContentRefreshBtn.textContent = original || '새로고침';
        }
      });
    }
  } catch (e) { console.warn('Dash content refresh init error:', e); }

  try {
    bindNavigation();
    criticalNavigationBound = true;
  } catch (e) { console.warn('bindNavigation error:', e); }
  try { initRecommendationCenter(); } catch (e) { console.warn('initRecommendationCenter error:', e); }
  try { bindActions(); } catch (e) { console.warn('bindActions error:', e); }
  try { syncScopedMajorSaveActions(); } catch (e) { console.warn('syncScopedMajorSaveActions error:', e); }
  try { playSettingsTypingPreview(); } catch (e) { console.warn('playSettingsTypingPreview error:', e); }
  try { loadGoogleAuthStatus(); } catch (e) { console.warn('loadGoogleAuthStatus error:', e); }

  // 🚀 설정 초기 로딩 (어느 탭에서든 즉시 발행 가능하도록)
  loadSettingsMajor();

  // 🚀 비동기 병렬 초기화 (블로킹 제거)
  loadConfigStatus().finally(() => {
    console.log('[UI] Initial config status check completed');
  });

  // Unify and Persistence Publish Settings (Headless, Targets)
  initGlobalPublishSettingsSync();

  // [Removed] Duplicated category search handlers.
  // Consolidated into initWpCategorySelector.
  // Close dropdown on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select-container').forEach(c => c.classList.remove('open'));
  });

  // Initial WP Options Sync
  window.toggleQuickWpOptions();
  initShoppingQuickCategoryPersistence();

  // 새 대시보드를 기본 화면으로 비동기 로드
  loadDashboardBeta().finally(() => {
    console.log('[UI] Initial Dashboard Beta load attempted');
  });

  // 시트 검사는 백그라운드에서 진행
  setTimeout(() => {
    if (uiConfigReady) {
      ensureSheetsPreflightUi({ silent: true }).then(ready => {
        if (ready && document.getElementById('view-dashboard-beta')?.classList.contains('active')) {
          loadDashboardBeta({ force: true });
        }
      });
    }
  }, 2000);
  loadBlogCollectSettings();
  loadBlogAutoSettings();
  renderBlogLastBatchResult(blogLastBatchResult);
  updateBlogSelectionUi();
  updateTrendsSelectionUi();
  updateSortableHeadersUi();
  initTrendPostingStickyStack();
  renderTrendsPagination();
  renderTopicsPagination();
  setInterval(() => {
    if (isDashboardPollingPaused()) return;
    if (document.getElementById('view-dashboard-beta')?.classList.contains('active')) {
      loadDashboardBeta({ force: true });
    } else if (document.getElementById('view-dashboard')?.classList.contains('active')) {
      loadDashboard();
    }
    checkSetupBanner();

    // 자동 새로고침: 로그/이력 뷰가 활성화되어 있으면 함께 갱신
    const logsViewEl = document.getElementById('view-logs');
    if (logsViewEl && logsViewEl.classList.contains('active')) {
      const activeTab = document.querySelector('.logs-tab-btn.active');
      const tabName = activeTab ? activeTab.getAttribute('data-logs-tab') : 'activity';
      if (tabName === 'system') {
        loadSystemLog();
      } else {
        loadDashboardLogs();
      }
    }
  }, 30000);

  // 대시보드 자동발행 "다음 실행"은 분 단위로 상대시간을 갱신
  setInterval(() => {
    renderDashboardAutoSchedule();
  }, 60000);

  } catch (error) {
    startupLifecycleError = error;
    console.error('[BLOGGENIUS_UI_BOOTSTRAP_ERROR]', error);
  } finally {
    const surface = document.querySelector('.view.active')?.id || '';
    if (criticalNavigationBound && surface) {
      window.__BLOGGENIUS_STARTUP__?.markReady({
        surface,
        navigationBound: true,
        degraded: Boolean(startupLifecycleError)
      });
    } else {
      console.error('[BLOGGENIUS_UI_BOOTSTRAP_INCOMPLETE]', JSON.stringify({
        navigationBound: criticalNavigationBound,
        surface: surface || 'missing'
      }));
    }
  }
});
