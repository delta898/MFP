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
  const keywordAiReadiness = document.getElementById('keyword-ai-readiness');
  const keywordAiSettingsBtn = document.getElementById('keyword-ai-settings-btn');
  const keywordModalState = {
    analysis: null,
    analysisError: '',
    selectedKeywords: [],
    titles: [],
    isAnalyzing: false,
    isGeneratingTitles: false,
    titleRequestId: 0,
    aiReadinessRequestId: 0,
    aiConfigured: uiAiTextReady,
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

  const syncKeywordAnalysisAction = () => {
    const hasSubject = Boolean(String(keywordModalInput?.value || '').trim());
    if (keywordModalSearchBtn) {
      keywordModalSearchBtn.disabled = keywordModalState.isAnalyzing || !hasSubject;
      keywordModalSearchBtn.textContent = keywordModalState.isAnalyzing ? '분석 중…' : '키워드 분석';
      keywordModalSearchBtn.setAttribute('aria-busy', String(keywordModalState.isAnalyzing));
    }
    if (keywordModalInput) keywordModalInput.disabled = keywordModalState.isAnalyzing;
  };

  const syncKeywordAiReadiness = () => {
    if (keywordAiReadiness) {
      keywordAiReadiness.classList.toggle('hidden', keywordModalState.aiConfigured !== false);
    }
  };

  const refreshKeywordAiReadiness = async () => {
    const requestId = keywordModalState.aiReadinessRequestId + 1;
    keywordModalState.aiReadinessRequestId = requestId;
    try {
      if (typeof refreshAiTextReadiness === 'function') {
        await refreshAiTextReadiness();
      } else {
        const status = await fetchJson('/api/v1/config/status');
        uiAiTextReady = status?.setup?.ai?.configured === true;
      }
      if (keywordModalState.aiReadinessRequestId !== requestId) return;
      keywordModalState.aiConfigured = uiAiTextReady;
      syncKeywordAiReadiness();
      if (keywordModalState.analysis) renderKeywordAnalysisResult();
    } catch (_error) {
      if (keywordModalState.aiReadinessRequestId !== requestId) return;
      keywordModalState.aiConfigured = uiAiTextReady;
      syncKeywordAiReadiness();
    }
  };

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
    keywordModalState.isAnalyzing = isLoading;
    if (keywordModalLoading) keywordModalLoading.classList.toggle('hidden', !isLoading);
    if (keywordModalLoadingText && message) keywordModalLoadingText.textContent = message;
    if (keywordModalContent) keywordModalContent.setAttribute('aria-busy', String(isLoading));
    syncKeywordAnalysisAction();
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
    keywordModalState.analysisError = '';
    keywordModalState.selectedKeywords = [];
    keywordModalState.titles = [];
    keywordModalState.isAnalyzing = false;
    keywordModalState.isGeneratingTitles = false;
    keywordModalState.titleRequestId += 1;
    keywordModalState.aiConfigured = uiAiTextReady;
    keywordModalState.smartUsageSessionId = createSmartUsageSessionId();
    if (keywordModalInput) keywordModalInput.value = initialQuery;
    syncKeywordAnalysisAction();
    syncKeywordAiReadiness();
    keywordModal.classList.remove('hidden');
    keywordModal.setAttribute('aria-hidden', 'false');
    void refreshKeywordAiReadiness();
    if (initialQuery) {
      void runKeywordAnalysis(initialQuery);
    }
  };

  const closeKeywordModal = () => {
    keywordModal.classList.add('hidden');
    keywordModal.setAttribute('aria-hidden', 'true');
  };

  const runKeywordAnalysis = async (query) => {
    if (keywordModalState.isAnalyzing) return;
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
    const previousAnalysis = keywordModalState.analysis;
    keywordModalState.analysisError = '';
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
      keywordModalState.analysisError = '';
      keywordModalState.selectedKeywords = [];
      keywordModalState.titles = [];
      keywordModalState.isGeneratingTitles = false;
      keywordModalState.titleRequestId += 1;
      renderKeywordAnalysisResult();
    } catch (err) {
      const message = String(err?.message || '검색 지표를 불러오지 못했습니다.');
      if (previousAnalysis) {
        keywordModalState.analysis = previousAnalysis;
        keywordModalState.analysisError = `새 분석 결과를 불러오지 못해 이전 결과를 유지합니다. ${message}`;
      } else {
        keywordModalState.analysis = {
          analysis_note: message,
          input_keywords: seedKeywords.map((keyword) => ({ keyword })),
          related_candidates: []
        };
      }
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
    const titleActionDisabled = keywordModalState.isGeneratingTitles
      || keywordModalState.selectedKeywords.length === 0
      || keywordModalState.aiConfigured === false;
    const titleActionHint = keywordModalState.aiConfigured === false
      ? 'AI 글쓰기 모델 설정이 필요합니다.'
      : (keywordModalState.selectedKeywords.length === 0 ? '키워드를 1개 이상 선택해 주세요.' : '');
    html += `
      <div class="keyword-title-action-row keyword-title-action-row-top">
        <div>
          <strong>AI 제목 추천</strong>
          <p>${selectedKeywordText ? escapeHtml(selectedKeywordText) : '표에서 키워드를 1~3개 선택해 제목 추천에 사용합니다.'} <span class="smart-usage-hint">${escapeHtml(formatSmartUsageHint('title_recommendation'))}</span></p>
        </div>
        <button id="keyword-generate-titles-btn" class="primary" type="button" ${titleActionDisabled ? 'disabled' : ''}${titleActionHint ? ` title="${escapeHtml(titleActionHint)}"` : ''}>선택 키워드로 제목 추천</button>
      </div>
    `;

    if (keywordModalState.analysisError) {
      html += `<div class="keyword-analysis-note" data-state="attention" role="status">${escapeHtml(keywordModalState.analysisError)}</div>`;
    }

    if (analysis.analysis_note) {
      html += `<div class="keyword-analysis-note" role="status">${escapeHtml(analysis.analysis_note)}</div>`;
    }

    if (keywordModalState.isGeneratingTitles) {
      html += `
        <div class="keyword-title-generation-status" role="status">
          <span>선택한 글감과 키워드로 제목을 준비하고 있습니다.</span>
          <div class="ui-progress-indeterminate" role="progressbar" aria-label="AI 제목 추천 진행 중"><span></span></div>
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
        let compState = compLevel === '낮음' ? 'ready' : (compLevel === '높음' ? 'danger' : 'attention');
        if (weeklyDocuments.capped) {
          compLevel = '300+ 제외';
          compState = 'attention';
        } else if (!item.competition_strength?.level) {
          compState = '';
        }
        const oppScore = formatKeywordOpportunityMetric(item);

        const isChecked = keywordModalState.selectedKeywords.some((keyword) => normalizeKeywordKey(keyword) === normalizeKeywordKey(item.keyword));
        const keywordIndex = keywordIndexByKey.get(normalizeKeywordKey(item.keyword));

        section += `
          <tr>
            <td class="keyword-selection-column"><input class="keyword-selection-checkbox" type="checkbox" data-keyword-index="${keywordIndex}" ${isChecked ? 'checked' : ''} aria-label="${escapeHtml(item.keyword)} 선택"></td>
            <td>${escapeHtml(item.keyword)} ${item.is_input_keyword ? '<span class="ui-status-badge">입력</span>' : ''}</td>
            <td><strong>${totalVol}</strong> (${mobVol} / ${pcVol})</td>
            <td>${weeklySearch}</td>
            <td>${docCount}</td>
            <td><span class="ui-status-badge"${compState ? ` data-state="${compState}"` : ''}>${compLevel}</span></td>
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

        html += `
          <div class="title-card">
            <div class="title-card-header">
              <span class="ui-status-badge">${escapeHtml(role)}</span>
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
    if (keywordModalState.aiConfigured === false) {
      showUiPopup('AI 제목 추천을 사용하려면 AI 설정에서 글쓰기 모델을 먼저 설정해 주세요.');
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
        const message = String(err?.message || '알 수 없는 오류');
        if (/api\s*key|credential|인증 정보|키 누락/i.test(message)) {
          keywordModalState.aiConfigured = false;
          uiAiTextReady = false;
          syncKeywordAiReadiness();
          showUiPopup('AI 제목 추천을 사용하려면 AI 설정에서 글쓰기 모델을 확인해 주세요.');
        } else {
          showUiPopup(`제목 추천에 실패했습니다: ${message}`);
        }
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
  if (keywordAiSettingsBtn) keywordAiSettingsBtn.addEventListener('click', () => {
    closeKeywordModal();
    void navigateToSettingsNextTarget('ai', 'settings-next-ai-text-form');
  });
  if (keywordModalInput) {
    keywordModalInput.addEventListener('input', syncKeywordAnalysisAction);
    keywordModalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (keywordModalSearchBtn?.disabled) return;
        void runKeywordAnalysis();
      }
    });
  }
}
