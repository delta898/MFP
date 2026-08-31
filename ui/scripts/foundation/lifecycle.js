window.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('beforeunload', (event) => {
    if (!settingsMajorHasPendingBasicChanges && !settingsWritingProfileDirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  try { initManagedSettingsSecretFields(); } catch (e) { console.warn('initManagedSettingsSecretFields error:', e); }
  try { initSettingsWritingProfileUi(); } catch (e) { console.warn('initSettingsWritingProfileUi error:', e); }
  try { initManualSnsComposer(); } catch (e) { console.warn('initManualSnsComposer error:', e); }
  checkSetupBanner();
  void initSidebarDynamicContent();
  void initDashboardDynamicContent();
  void initAccountDynamicContent();
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
  try { ensureUpdateCheckFresh({ silent: true }); } catch (e) { console.warn('checkUpdate error:', e); }
  try { applyMobileQuickMode(); } catch (e) { console.warn('applyMobileQuickMode error:', e); }
  window.addEventListener('resize', applyMobileQuickMode);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      flushPendingQuickPostingCelebration();
      void ensureUpdateCheckFresh({ silent: true });
      void refreshSidebarDynamicContent();
      void initDashboardDynamicContent();
      void refreshAccountDynamicContent();
    }
  });
  window.addEventListener('focus', () => {
    flushPendingQuickPostingCelebration();
    void ensureUpdateCheckFresh({ silent: true });
    void refreshSidebarDynamicContent();
    void initDashboardDynamicContent();
    void refreshAccountDynamicContent();
  });
  setInterval(() => {
    void ensureUpdateCheckFresh({ silent: true });
  }, UPDATE_AUTO_CHECK_POLL_MS);

  const accountRefreshBtn = document.getElementById('account-refresh-btn');
  accountRefreshBtn?.addEventListener('click', () => {
    void refreshAccountDynamicContent();
    loadAccountOverview({ force: true }).catch((error) => console.warn('[Account Overview Refresh]', error.message));
  });
  const accountRetryBtn = document.getElementById('account-retry-btn');
  accountRetryBtn?.addEventListener('click', () => {
    void refreshAccountDynamicContent();
    loadAccountOverview({ force: true }).catch((error) => console.warn('[Account Overview Retry]', error.message));
  });
  bindAccountUpgradeFreeClick();
  bindAccountEmailClick();
  bindAccountPlanInfoClick();
  document.querySelectorAll('[data-account-settings-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      void navigateToSettingsTarget(
        button.getAttribute('data-account-settings-tab') || 'general',
        button.getAttribute('data-account-settings-target') || ''
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

    if (sidebarToggleBtn && sidebar) {
      sidebarToggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const nowCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('sidebar-collapsed', nowCollapsed);

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

// =========================================================================
// Keyword Research & SEO Title Generator UI Handlers
// =========================================================================
function initKeywordResearchModal() {
  const keywordModal = document.getElementById('keyword-research-modal');
  const titleRecommendBtn = document.getElementById('quick-title-recommend-btn');
  const blogNextTitleRecommendBtn = document.getElementById('blog-next-title-recommend');
  const keywordModalCloseBtn = document.getElementById('keyword-research-modal-close');
  const keywordModalCloseFooter = document.getElementById('keyword-research-modal-close-footer');
  const keywordModalInput = document.getElementById('keyword-modal-input');
  const keywordModalSearchBtn = document.getElementById('keyword-modal-search-btn');
  const keywordModalLoading = document.getElementById('keyword-modal-loading');
  const keywordModalLoadingText = document.getElementById('keyword-modal-loading-text');
  const keywordModalContent = document.getElementById('keyword-modal-content');
  const keywordModalState = {
    analysis: null,
    selectedKeywords: [],
    titles: [],
    isGeneratingTitles: false,
    titleRequestId: 0,
    smartUsageSessionId: ''
  };

  if (!keywordModal) return;

  const normalizeKeywordKey = (value) => String(value || '').replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
  const splitKeywords = (value) => String(value || '')
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  const getQuickTitleMode = () => quickDiscoveryInputTarget === 'blogNext'
    ? (document.getElementById('blog-next-writing-strategy')?.value || currentBlogWritingStrategy)
    : getSelectedSettingsRadioValue('quick-writing-strategy', currentBlogWritingStrategy);

  const collectAnalysisKeywords = (analysis) => {
    const seen = new Set();
    return [...(analysis?.input_keywords || []), ...(analysis?.related_candidates || [])]
      .filter((item) => String(item?.keyword || '').trim())
      .filter((item) => {
        const key = normalizeKeywordKey(item.keyword);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  const setKeywordModalLoading = (isLoading, message = '') => {
    if (keywordModalLoading) keywordModalLoading.classList.toggle('hidden', !isLoading);
    if (keywordModalLoadingText && message) keywordModalLoadingText.textContent = message;
    if (keywordModalSearchBtn) keywordModalSearchBtn.disabled = isLoading;
    if (isLoading && keywordModalContent) keywordModalContent.innerHTML = '';
  };

  const focusKeywordTitleResults = () => {
    const target = document.getElementById('keyword-title-results');
    if (!target || !keywordModal.contains(target)) return;
    requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
  };

  const openKeywordModal = () => {
    const currentSubject = readQuickDiscoveryInput('subject');
    const currentKeywords = readQuickDiscoveryInput('keywords');
    const currentTitle = readQuickDiscoveryInput('title');
    const initialQuery = currentSubject || currentKeywords || currentTitle;
    keywordModalState.analysis = null;
    keywordModalState.selectedKeywords = [];
    keywordModalState.titles = [];
    keywordModalState.isGeneratingTitles = false;
    keywordModalState.titleRequestId += 1;
    keywordModalState.smartUsageSessionId = createSmartUsageSessionId();
    if (keywordModalInput) keywordModalInput.value = initialQuery;
    keywordModal.classList.remove('hidden');
    keywordModal.setAttribute('aria-hidden', 'false');
    if (initialQuery) {
      void runKeywordAnalysis(initialQuery);
    }
  };

  const closeKeywordModal = () => {
    keywordModal.classList.add('hidden');
    keywordModal.setAttribute('aria-hidden', 'true');
  };

  const runKeywordAnalysis = async (query) => {
    const q = String(query || keywordModalInput?.value || '').trim();
    if (!q) {
      showUiPopup('분석할 글감(주제)을 입력해 주세요.');
      return;
    }
    const enteredKeywords = splitKeywords(readQuickDiscoveryInput('keywords'));
    // A subject is not a keyword when the user has already supplied keywords.
    // It remains a fallback so a subject-only workflow still works.
    const seedKeywords = (enteredKeywords.length > 0 ? enteredKeywords : [q])
      .filter((keyword, index, values) => values.findIndex((item) => normalizeKeywordKey(item) === normalizeKeywordKey(keyword)) === index)
      .slice(0, 3);
    keywordModalState.analysis = null;
    keywordModalState.selectedKeywords = [];
    keywordModalState.titles = [];
    keywordModalState.isGeneratingTitles = false;
    keywordModalState.titleRequestId += 1;
    setKeywordModalLoading(true, '키워드 검색량과 경쟁도를 분석하는 중입니다...');

    try {
      const analysis = await postJson('/api/v1/keywords/analyze', {
        subject: q,
        keywords: seedKeywords,
        related_assist: true
      });

      if (!analysis) {
        throw new Error('키워드 분석 실패');
      }

      keywordModalState.analysis = analysis;
      renderKeywordAnalysisResult();
    } catch (err) {
      keywordModalState.analysis = {
        analysis_note: String(err?.message || '검색 지표를 불러오지 못했습니다.'),
        input_keywords: seedKeywords.map((keyword) => ({ keyword })),
        related_candidates: []
      };
      renderKeywordAnalysisResult();
    } finally {
      setKeywordModalLoading(false);
    }
  };

  const renderKeywordAnalysisResult = () => {
    if (!keywordModalContent || !keywordModalState.analysis) return;
    const analysis = keywordModalState.analysis;
    const titles = keywordModalState.titles;
    const allKeywords = collectAnalysisKeywords(analysis);
    const keywordIndexByKey = new Map(allKeywords.map((item, index) => [normalizeKeywordKey(item.keyword), index]));

    let html = '';

    const selectedKeywordText = keywordModalState.selectedKeywords.join(' · ');
    html += `
      <div class="keyword-title-action-row keyword-title-action-row-top">
        <div>
          <strong>AI 제목 추천</strong>
          <p>${selectedKeywordText ? escapeHtml(selectedKeywordText) : '표에서 키워드를 1~3개 선택해 제목 추천에 사용합니다.'} <span class="smart-usage-hint">${escapeHtml(formatSmartUsageHint('title_recommendation'))}</span></p>
        </div>
        <button id="keyword-generate-titles-btn" class="primary" type="button" ${keywordModalState.isGeneratingTitles ? 'disabled' : ''}>선택 키워드로 제목 추천</button>
      </div>
    `;

    if (analysis.analysis_note) {
      html += `<div class="keyword-analysis-note" role="status">${escapeHtml(analysis.analysis_note)}</div>`;
    }

    if (keywordModalState.isGeneratingTitles) {
      html += `
        <div class="keyword-title-generation-status" role="status">
          <span>선택한 글감과 키워드로 제목을 준비하고 있습니다.</span>
          <div class="keyword-modal-progress" role="progressbar" aria-label="AI 제목 추천 진행 중"><span></span></div>
        </div>
      `;
    }

    const renderMetricsTable = (items) => {
      if (items.length === 0) return '';
      let section = `
          <div class="keyword-metrics-table-wrap">
            <table class="keyword-metrics-table">
              <thead>
                <tr>
                  <th class="keyword-selection-column">선택</th>
                  <th>키워드</th>
                  <th>월간 검색수 (모바일 / PC)</th>
                  <th>주간 검색수 (추정)</th>
                  <th>최근 7일 신규 문서</th>
                  <th>경쟁강도</th>
                  <th title="추정 주간 검색 수를 최근 7일 신규 문서 수로 나눈 값입니다. 문서 수가 300+이면 계산 가능한 최대값을 'N 이하'로 표시합니다.">기회지수</th>
                </tr>
              </thead>
              <tbody>
      `;

      items.forEach((item) => {
        const totalVol = item.monthly_search_volume?.total !== null && item.monthly_search_volume?.total !== undefined
          ? item.monthly_search_volume.total.toLocaleString()
          : '-';
        const pcVol = item.monthly_search_volume?.pc !== null && item.monthly_search_volume?.pc !== undefined
          ? item.monthly_search_volume.pc.toLocaleString()
          : '-';
        const mobVol = item.monthly_search_volume?.mobile !== null && item.monthly_search_volume?.mobile !== undefined
          ? item.monthly_search_volume.mobile.toLocaleString()
          : '-';
        const weeklySearch = item.estimated_weekly_search_volume !== null && item.estimated_weekly_search_volume !== undefined
          ? Math.round(item.estimated_weekly_search_volume).toLocaleString()
          : '-';
        const weeklyDocuments = item.weekly_new_blog_documents || {};
        let docCount = weeklyDocuments.count !== null && weeklyDocuments.count !== undefined
          ? `${Number(weeklyDocuments.count).toLocaleString()}${weeklyDocuments.capped ? '+' : ''}건`
          : '-';
        let compLevel = item.competition_strength?.level || '측정 불가';
        let compClass = compLevel === '낮음' ? 'low' : (compLevel === '높음' ? 'high' : 'medium');
        if (weeklyDocuments.capped) {
          compLevel = '300+ 제외';
          compClass = 'capped';
        } else if (!item.competition_strength?.level) {
          compClass = 'incomplete';
        }
        const oppScore = formatKeywordOpportunityMetric(item);

        const isChecked = keywordModalState.selectedKeywords.some((keyword) => normalizeKeywordKey(keyword) === normalizeKeywordKey(item.keyword));
        const keywordIndex = keywordIndexByKey.get(normalizeKeywordKey(item.keyword));

        section += `
          <tr>
            <td class="keyword-selection-column"><input class="keyword-selection-checkbox" type="checkbox" data-keyword-index="${keywordIndex}" ${isChecked ? 'checked' : ''} aria-label="${escapeHtml(item.keyword)} 선택"></td>
            <td>${escapeHtml(item.keyword)} ${item.is_input_keyword ? '<span class="keyword-input-badge">입력</span>' : ''}</td>
            <td><strong>${totalVol}</strong> (${mobVol} / ${pcVol})</td>
            <td>${weeklySearch}</td>
            <td>${docCount}</td>
            <td><span class="comp-badge ${compClass}">${compLevel}</span></td>
            <td>${oppScore}</td>
          </tr>
        `;
      });

      section += `</tbody></table></div>`;
      return section;
    };

    if (allKeywords.length > 0) {
      html += `
        <section class="keyword-metrics-section">
          <div class="keyword-section-title">📊 키워드 지표 <span class="keyword-selection-count">${keywordModalState.selectedKeywords.length}/3 선택</span></div>
          <p class="keyword-section-description">주간 검색수(추정)와 최근 7일 신규 문서 수를 함께 표시합니다.</p>
          ${renderMetricsTable(allKeywords)}
        </section>
      `;
    }

    // 3. AI title results are generated only after the user confirms selected keywords.
    if (titles.length > 0) {
      html += `
        <section id="keyword-title-results" class="keyword-title-results" tabindex="-1" aria-labelledby="keyword-title-results-heading">
        <div id="keyword-title-results-heading" class="keyword-section-title">✨ AI SEO 추천 제목 (3종)</div>
        <div class="title-suggestions-grid">
      `;

      titles.forEach((t) => {
        const role = t.role || '추천 제목';
        const roleClass = role.includes('의도') ? 'intent' : (role.includes('공감') ? 'empathy' : 'scope');

        html += `
          <div class="title-card">
            <div class="title-card-header">
              <span class="title-role-badge ${roleClass}">${escapeHtml(role)}</span>
              <button class="title-apply-btn" type="button" data-title="${escapeHtml(t.title)}">이 제목과 선택 키워드 적용</button>
            </div>
            <div class="title-text">${escapeHtml(t.title)}</div>
            <div class="title-details">
              ${t.seo_reason ? `<div class="title-detail-row"><span class="title-detail-label">🎯 SEO:</span> <span>${escapeHtml(t.seo_reason)}</span></div>` : ''}
              ${t.click_reason ? `<div class="title-detail-row"><span class="title-detail-label">👀 클릭:</span> <span>${escapeHtml(t.click_reason)}</span></div>` : ''}
              ${t.tradeoff ? `<div class="title-detail-row"><span class="title-detail-label">⚖️ 유의점:</span> <span>${escapeHtml(t.tradeoff)}</span></div>` : ''}
            </div>
          </div>
        `;
      });

      html += `</div></section>`;
    }

    keywordModalContent.innerHTML = html;

    keywordModalContent.querySelectorAll('.keyword-selection-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const item = allKeywords[Number(checkbox.dataset.keywordIndex)];
        const keyword = String(item?.keyword || '').trim();
        if (!keyword) return;
        const key = normalizeKeywordKey(keyword);
        const selected = keywordModalState.selectedKeywords.filter((value) => normalizeKeywordKey(value) !== key);
        if (checkbox.checked) {
          if (selected.length >= 3) {
            showUiPopup('제목 추천 키워드는 최대 3개까지 선택할 수 있습니다.');
          } else {
            selected.push(keyword);
          }
        }
        keywordModalState.selectedKeywords = selected;
        keywordModalState.titles = [];
        keywordModalState.isGeneratingTitles = false;
        keywordModalState.titleRequestId += 1;
        renderKeywordAnalysisResult();
      });
    });

    const generateTitlesBtn = document.getElementById('keyword-generate-titles-btn');
    if (generateTitlesBtn) generateTitlesBtn.addEventListener('click', () => void runTitleRecommendations());

    // Attach apply handlers
    keywordModalContent.querySelectorAll('.title-apply-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const chosenTitle = btn.dataset.title || '';
        const titleInput = getQuickDiscoveryInputElement('title');
        const keywordInput = getQuickDiscoveryInputElement('keywords');
        const subjectInput = getQuickDiscoveryInputElement('subject');

        if (titleInput) titleInput.value = chosenTitle;
        if (keywordInput) keywordInput.value = keywordModalState.selectedKeywords.join(', ');
        if (subjectInput && keywordModalInput) subjectInput.value = keywordModalInput.value.trim();

        closeKeywordModal();
      });
    });
  };

  const runTitleRecommendations = async () => {
    const subject = String(keywordModalInput?.value || '').trim();
    const keywords = keywordModalState.selectedKeywords.slice(0, 3);
    if (!subject) {
      showUiPopup('제목 추천에 사용할 글감(주제)을 입력해 주세요.');
      return;
    }
    if (keywords.length === 0) {
      showUiPopup('제목 추천에 사용할 키워드를 1개 이상 선택해 주세요.');
      return;
    }

    const requestId = keywordModalState.titleRequestId + 1;
    keywordModalState.titleRequestId = requestId;
    keywordModalState.isGeneratingTitles = true;
    renderKeywordAnalysisResult();
    let shouldFocusTitleResults = false;
    try {
      const result = await postJson('/api/v1/keywords/suggest-titles', {
        subject,
        keywords,
        title_mode: getQuickTitleMode(),
        count: 3,
        smart_usage_session_id: keywordModalState.smartUsageSessionId || createSmartUsageSessionId(),
        smart_usage_operation_id: createSmartUsageSessionId()
      });
      if (keywordModalState.titleRequestId === requestId) {
        keywordModalState.titles = Array.isArray(result?.titles) ? result.titles : [];
        shouldFocusTitleResults = keywordModalState.titles.length > 0;
        keywordModalState.smartUsageSessionId = result?.smart_usage_session_id || keywordModalState.smartUsageSessionId;
        applySmartUsageUpdate(result?.smart_usage);
      }
    } catch (err) {
      if (keywordModalState.titleRequestId === requestId) {
        showUiPopup(`제목 추천에 실패했습니다: ${err.message}`);
      }
    } finally {
      if (keywordModalState.titleRequestId === requestId) {
        keywordModalState.isGeneratingTitles = false;
        renderKeywordAnalysisResult();
        if (shouldFocusTitleResults) focusKeywordTitleResults();
      }
    }
  };

  if (titleRecommendBtn) titleRecommendBtn.addEventListener('click', () => {
    setQuickDiscoveryInputTarget('quick');
    openKeywordModal();
  });
  if (blogNextTitleRecommendBtn) blogNextTitleRecommendBtn.addEventListener('click', () => {
    setQuickDiscoveryInputTarget('blogNext');
    openKeywordModal();
  });
  if (keywordModalCloseBtn) keywordModalCloseBtn.addEventListener('click', closeKeywordModal);
  if (keywordModalCloseFooter) keywordModalCloseFooter.addEventListener('click', closeKeywordModal);
  if (keywordModalSearchBtn) keywordModalSearchBtn.addEventListener('click', () => void runKeywordAnalysis());
  if (keywordModalInput) {
    keywordModalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void runKeywordAnalysis();
      }
    });
  }
}

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

  try { bindNavigation(); } catch (e) { console.warn('bindNavigation error:', e); }
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

  // 대시보드 별도 로드 (블로킹 방지)
  loadDashboard().finally(() => {
    console.log('[UI] Initial dashboard load attempted');
  });

  // 시트 검사는 백그라운드에서 진행
  setTimeout(() => {
    if (uiConfigReady) {
      ensureSheetsPreflightUi({ silent: true }).then(ready => {
        if (ready) loadDashboard();
      });
    }
  }, 2000);
  loadBlogCollectSettings();
  loadBlogAutoSettings();
  renderBlogLastBatchResult(blogLastBatchResult);
  updateBlogSelectionUi();
  updateTrendsSelectionUi();
  updateShoppingSelectionUi();
  updateSortableHeadersUi();
  initTrendPostingStickyStack();
  renderTrendsPagination();
  renderTopicsPagination();
  renderShoppingPagination();
  setInterval(() => {
    if (isDashboardPollingPaused()) return;
    loadDashboard();
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
});
