function bindActions() {
  document.querySelectorAll('.app-title').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelector('.nav-btn[data-view="dashboard"]').click();
    });
  });

  // Logs 위젯 이벤트 (Pill 탭 전환)
  const logsTabBtns = Array.from(document.querySelectorAll('.logs-tab-btn'));
  logsTabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      logsTabBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      const tabName = e.target.getAttribute('data-logs-tab');
      document.querySelectorAll('.logs-tab-panel').forEach(p => p.style.display = 'none');
      document.getElementById(`logs-tab-${tabName}`).style.display = 'block';
      if (tabName === 'system') loadLogFiles();
      else loadDashboardLogs();
    });
  });

  const logsActivityRefreshBtn = document.getElementById('logs-activity-refresh-btn');
  if (logsActivityRefreshBtn) {
    logsActivityRefreshBtn.addEventListener('click', () => {
      loadDashboardLogs();
      logsActivityRefreshBtn.textContent = '불러오는 중...';
      setTimeout(() => logsActivityRefreshBtn.textContent = '새로고침', 500);
    });
  }

  const logsSystemFileSelect = document.getElementById('logs-system-file-select');
  const logsSystemRefreshBtn = document.getElementById('logs-system-refresh-btn');
  if (logsSystemFileSelect) {
    logsSystemFileSelect.addEventListener('change', loadSystemLog);
  }
  if (logsSystemRefreshBtn) {
    logsSystemRefreshBtn.addEventListener('click', () => {
      loadSystemLog();
      logsSystemRefreshBtn.textContent = '불러오는 중...';
      setTimeout(() => logsSystemRefreshBtn.textContent = '현재 파일 새로고침', 500);
    });
  }

  const dialogBackdrop = document.getElementById('ui-dialog-backdrop');
  const dialogConfirmBtn = document.getElementById('ui-dialog-confirm');
  const dialogCancelBtn = document.getElementById('ui-dialog-cancel');
  const dialogInputEl = document.getElementById('ui-dialog-input');
  if (dialogConfirmBtn) {
    dialogConfirmBtn.addEventListener('click', () => closeUiDialog(true));
  }
  if (dialogCancelBtn) {
    dialogCancelBtn.addEventListener('click', () => closeUiDialog(false));
  }
  if (dialogBackdrop) {
    dialogBackdrop.addEventListener('click', (e) => {
      if (e.target === dialogBackdrop) closeUiDialog(false);
    });
  }
  if (dialogInputEl) {
    dialogInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        closeUiDialog(true);
      }
    });
  }
  document.querySelectorAll('.label-help').forEach((helpEl) => {
    helpEl.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    helpEl.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const backdrop = document.getElementById('ui-dialog-backdrop');
    if (backdrop && !backdrop.classList.contains('hidden')) {
      closeUiDialog(false);
    }
  });

  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadConfigStatus().finally(() => loadDashboard());
    });
  }

  const quickModeAiBtn = document.getElementById('quick-mode-ai-btn');
  const quickModeManuscriptBtn = document.getElementById('quick-mode-manuscript-btn');
  const quickModePastedBtn = document.getElementById('quick-mode-pasted-btn');
  const quickSubjectInput = document.getElementById('quick-subject');
  const quickKeywordsInput = document.getElementById('quick-keywords');
  const quickRecommendationList = document.getElementById('quick-topic-recommendations-list');
  const quickRecommendationRefresh = document.getElementById('quick-topic-recommendations-refresh');
  const quickDiscoveryOpenBtn = document.getElementById('quick-discovery-open-btn');
  const quickKeywordDiscoveryOpenBtn = document.getElementById('quick-keyword-discovery-open-btn');
  const quickDiscoveryCloseBtn = document.getElementById('quick-discovery-modal-close');
  const quickDiscoveryCloseFooter = document.getElementById('quick-discovery-modal-close-footer');
  const quickKeywordDiscoverySearchBtn = document.getElementById('quick-keyword-discovery-search');
  const quickKeywordDiscoveryClearBtn = document.getElementById('quick-keyword-discovery-clear');
  const quickKeywordDiscoveryQuery = document.getElementById('quick-keyword-discovery-query');
  const quickTopicRecommendationQuery = document.getElementById('quick-topic-recommendations-query');
  const quickTopicRecommendationClearBtn = document.getElementById('quick-topic-recommendations-clear');
  quickModeAiBtn?.addEventListener('click', () => applyQuickInputMode('ai'));
  quickModeManuscriptBtn?.addEventListener('click', () => applyQuickInputMode('manuscript'));
  quickModePastedBtn?.addEventListener('click', () => applyQuickInputMode('pasted'));
  applyQuickInputMode(quickInputMode);
  quickSubjectInput?.addEventListener('input', handleQuickTopicIdentityInput);
  quickKeywordsInput?.addEventListener('input', handleQuickTopicIdentityInput);
  quickDiscoveryOpenBtn?.addEventListener('click', () => {
    setQuickDiscoveryInputTarget('quick');
    setQuickDiscoveryTab('topic');
    setQuickDiscoveryModalOpen(true);
  });
  quickKeywordDiscoveryOpenBtn?.addEventListener('click', () => {
    setQuickDiscoveryInputTarget('quick');
    if (quickKeywordDiscoveryQuery) {
      quickKeywordDiscoveryQuery.value = String(quickKeywordsInput?.value || '').trim();
      syncQuickKeywordDiscoveryControls();
    }
    setQuickDiscoveryTab('keyword');
    setQuickDiscoveryModalOpen(true);
  });
  quickDiscoveryCloseBtn?.addEventListener('click', () => setQuickDiscoveryModalOpen(false));
  quickDiscoveryCloseFooter?.addEventListener('click', () => setQuickDiscoveryModalOpen(false));
  document.querySelectorAll('[data-quick-discovery-tab]').forEach((button) => {
    button.addEventListener('click', () => setQuickDiscoveryTab(button.dataset.quickDiscoveryTab));
  });
  quickKeywordDiscoverySearchBtn?.addEventListener('click', () => {
    const keywords = parseQuickKeywordDiscoveryInput(quickKeywordDiscoveryQuery?.value);
    void loadQuickKeywordDiscovery(keywords.length > 0
      ? { keywords }
      : { refresh: quickKeywordDiscoveryState.loaded });
  });
  quickKeywordDiscoveryClearBtn?.addEventListener('click', () => {
    if (!quickKeywordDiscoveryQuery) return;
    quickKeywordDiscoveryQuery.value = '';
    syncQuickKeywordDiscoveryControls();
    quickKeywordDiscoveryQuery.focus();
  });
  quickKeywordDiscoveryQuery?.addEventListener('input', syncQuickKeywordDiscoveryControls);
  quickKeywordDiscoveryQuery?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    quickKeywordDiscoverySearchBtn?.click();
  });
  syncQuickKeywordDiscoveryControls();
  quickTopicRecommendationQuery?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    quickRecommendationRefresh?.click();
  });
  quickTopicRecommendationQuery?.addEventListener('input', () => syncQuickDiscoveryClearControl({
    inputId: 'quick-topic-recommendations-query',
    clearId: 'quick-topic-recommendations-clear',
    loading: quickTopicRecommendationState.loading
  }));
  quickTopicRecommendationClearBtn?.addEventListener('click', () => {
    if (!quickTopicRecommendationQuery) return;
    quickTopicRecommendationQuery.value = '';
    syncQuickDiscoveryClearControl({
      inputId: 'quick-topic-recommendations-query',
      clearId: 'quick-topic-recommendations-clear',
      loading: quickTopicRecommendationState.loading
    });
    quickTopicRecommendationQuery.focus();
  });
  syncQuickDiscoveryClearControl({
    inputId: 'quick-topic-recommendations-query',
    clearId: 'quick-topic-recommendations-clear',
    loading: quickTopicRecommendationState.loading
  });
  quickRecommendationRefresh?.addEventListener('click', () => loadQuickTopicRecommendations({
    refresh: quickTopicRecommendationState.loaded
  }));
  quickRecommendationList?.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-recommendation-action]');
    const row = event.target.closest('[data-recommendation-id]');
    if (!actionButton || !row) return;
    const item = quickTopicRecommendationState.items.find((entry) => String(entry.id || '') === String(row.dataset.recommendationId || ''));
    if (!item) return;
    const action = String(actionButton.dataset.recommendationAction || '');
    if (action === 'reason') {
      const reason = row.querySelector('.quick-topic-recommendation-reason');
      const expanded = actionButton.getAttribute('aria-expanded') === 'true';
      actionButton.setAttribute('aria-expanded', String(!expanded));
      if (reason) reason.hidden = expanded;
      return;
    }
    if (action === 'dismiss') {
      await recordQuickTopicRecommendationOutcome(item, 'feedback', { feedback: 'not_helpful' });
      quickTopicRecommendationState.items = quickTopicRecommendationState.items.filter((entry) => entry !== item);
      renderQuickTopicRecommendations();
      return;
    }
    actionButton.disabled = true;
    try {
      const applied = await applyQuickTopicRecommendation(item);
      if (applied) setQuickDiscoveryModalOpen(false);
    } finally {
      actionButton.disabled = false;
    }
  });

  const saveBtn = document.getElementById('quick-save-btn');
  const directPublishBtn = document.getElementById('quick-direct-publish-btn');
  const generateBtn = document.getElementById('quick-generate-btn');
  const previewPublishBtn = document.getElementById('quick-preview-publish-btn');
  const clearBtn = document.getElementById('quick-clear-btn');
  const resultEl = document.getElementById('quick-result');
  let quickPublishInFlight = false;
  let shoppingQuickPublishInFlight = false;

  const buildQuickPayload = (mode) => {
    const targets = [];
    if (document.getElementById('quick-target-naver')?.checked) targets.push('naver');
    if (document.getElementById('quick-target-wordpress')?.checked) targets.push('wordpress');

    const naverCat = (document.getElementById('quick-naver-category')?.value || '').trim();
    const wpCat = (document.getElementById('quick-wp-category')?.value || '').trim();

    const trendContext = getActiveQuickTrendContext();
    const recommendationContext = getActiveQuickRecommendationContext();
    const payload = {
      subject: (document.getElementById('quick-subject')?.value || '').trim(),
      title: (document.getElementById('quick-title')?.value || '').trim(),
      keywords: (document.getElementById('quick-keywords')?.value || '').trim(),
      instruction: (document.getElementById('quick-instruction')?.value || '').trim(),
      writingStrategy: getSelectedSettingsRadioValue(
        'quick-writing-strategy',
        currentBlogWritingStrategy
      ),
      referenceUrl: (document.getElementById('quick-reference-url')?.value || '').trim(),
      imageMode: (document.getElementById('quick-image-mode')?.value || 'prompt_only').trim(),
      externalReference: Boolean(document.getElementById('quick-external-reference')?.checked),
      headless: Boolean(document.getElementById('quick-headless')?.checked),
      publishMode: mode,
      targets,
      naverCategory: naverCat,
      wordpressCategory: wpCat,
      postStatus: (document.getElementById('quick-wp-post-status')?.value || 'publish').trim(),
      scheduleDate: (document.getElementById('quick-wp-schedule-date')?.value || '').trim()
    };
    if (trendContext) {
      payload.source = trendContext.source;
      payload.trendDate = trendContext.trendDate;
    } else if (recommendationContext) {
      payload.source = 'topic_recommendation';
      payload.recommendation = recommendationContext.recommendation;
    }

    // [Consolidated] Individual options are now persisted via initGlobalPublishSettingsSync change listeners.

    return payload;
  };

  const buildQuickPreviewPublishPayload = () => ({
    previewId: quickGeneratedPreviewState.previewId,
    targets: [
      document.getElementById('quick-target-naver')?.checked ? 'naver' : '',
      document.getElementById('quick-target-wordpress')?.checked ? 'wordpress' : ''
    ].filter(Boolean),
    naverCategory: (document.getElementById('quick-naver-category')?.value || '').trim(),
    wordpressCategory: (document.getElementById('quick-wp-category')?.value || '').trim(),
    postStatus: (document.getElementById('quick-wp-post-status')?.value || 'publish').trim(),
    scheduleDate: (document.getElementById('quick-wp-schedule-date')?.value || '').trim(),
    headless: Boolean(document.getElementById('quick-headless')?.checked)
  });

  function getQuickPreviewActiveTarget() {
    const stateTarget = String(quickGeneratedPreviewState.activeTarget || '').trim();
    if (stateTarget && quickGeneratedPreviewState.previews?.[stateTarget]) return stateTarget;
    const primaryTarget = String(quickGeneratedPreviewState.primaryTarget || '').trim();
    if (primaryTarget && quickGeneratedPreviewState.previews?.[primaryTarget]) return primaryTarget;
    const previewTargets = Object.keys(quickGeneratedPreviewState.previews || {});
    return previewTargets[0] || '';
  }

  function setQuickPreviewActiveTarget(target) {
    const normalized = String(target || '').trim().toLowerCase();
    if (!normalized || !quickGeneratedPreviewState.previews?.[normalized]) return;
    quickGeneratedPreviewState.activeTarget = normalized;
    renderQuickGeneratedPreview();
  }

  function renderQuickPreviewValidation(validation = null) {
    const el = document.getElementById('quick-preview-validation');
    if (!el) return;
    el.classList.remove('has-error', 'has-warning', 'is-ok');
    if (!validation) {
      el.textContent = '아직 생성된 preview가 없습니다.';
      return;
    }
    const lines = [];
    if (Array.isArray(validation.errors) && validation.errors.length > 0) {
      el.classList.add('has-error');
      lines.push('[오류]');
      validation.errors.forEach((item) => lines.push(`- ${item}`));
    }
    if (Array.isArray(validation.warnings) && validation.warnings.length > 0) {
      if (!el.classList.contains('has-error')) el.classList.add('has-warning');
      if (lines.length > 0) lines.push('');
      lines.push('[경고]');
      validation.warnings.forEach((item) => lines.push(`- ${item}`));
    }
    if (lines.length === 0) {
      el.classList.add('is-ok');
      lines.push('검증 통과: 생성된 preview에 표시할 경고가 없습니다.');
    }
    el.textContent = lines.join('\n');
  }

  function renderQuickPreviewBodyHtml(data = null) {
    const items = Array.isArray(data?.contentItems) ? data.contentItems : [];
    const images = Array.isArray(data?.images) ? data.images : [];
    const imageMap = new Map(images.map((image) => [Number(image.index), image]));
    const fragments = [];
    let activeListType = '';

    const closeList = () => {
      if (!activeListType) return;
      fragments.push(activeListType === 'ordered' ? '</ol>' : '</ul>');
      activeListType = '';
    };

    const renderImageFigure = (item = {}) => {
      const image = imageMap.get(Number(item.index));
      const previewUrl = image?.previewUrl || '';
      const imageBody = previewUrl
        ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(image?.title || item.text || '')}" loading="lazy">`
        : `<div class="local-markdown-inline-image-missing">매칭되는 생성 이미지가 없습니다.</div>`;
      return `
        <figure>
          ${imageBody}
          <figcaption>
            <div class="image-caption-title">${escapeHtml(image?.title || item.text || `IMAGE_${item.index}`)}</div>
            ${image?.prompt || item.prompt ? `<div class="image-caption-prompt">${escapeHtml(image?.prompt || item.prompt || '')}</div>` : ''}
          </figcaption>
        </figure>
      `;
    };

    items.forEach((item) => {
      const type = String(item?.type || 'paragraph');
      const text = renderInlinePreviewHtml(item?.text || '', item?.boldRanges);
      if (type !== 'list-item') closeList();

      if (type === 'header-h2') {
        fragments.push(`<h2>${text}</h2>`);
        return;
      }
      if (type === 'header-h3') {
        fragments.push(`<h3>${text}</h3>`);
        return;
      }
      if (type === 'quote') {
        fragments.push(`<blockquote><p>${text}</p></blockquote>`);
        return;
      }
      if (type === 'list-item') {
        const nextListType = item?.listType === 'ordered' ? 'ordered' : 'unordered';
        if (activeListType !== nextListType) {
          closeList();
          fragments.push(nextListType === 'ordered' ? '<ol>' : '<ul>');
          activeListType = nextListType;
        }
        fragments.push(`<li>${text}</li>`);
        return;
      }
      if (type === 'image') {
        fragments.push(renderImageFigure(item));
        return;
      }
      if (type === 'separator') {
        fragments.push('<div class="local-markdown-preview-separator" role="separator" aria-label="구분선"></div>');
        return;
      }
      if (type === 'newline') {
        fragments.push('<div style="height:8px"></div>');
        return;
      }
      fragments.push(`<p>${text}</p>`);
    });

    closeList();
    return fragments.join('') || '<div class="local-markdown-empty">본문 preview를 표시할 내용이 없습니다.</div>';
  }

  function renderQuickGeneratedPreview(data) {
    const emptyEl = document.getElementById('quick-preview-empty');
    const panelEl = document.getElementById('quick-preview-panel');
    const tabsEl = document.getElementById('quick-preview-tabs');
    const tabButtons = Array.from(document.querySelectorAll('#quick-preview-tabs .preview-target-tab'));
    const titleEl = document.getElementById('quick-preview-title');
    const metaEl = document.getElementById('quick-preview-meta');
    const badgeEl = document.getElementById('quick-preview-target-badge');
    const bodyEl = document.getElementById('quick-body-preview');
    const imageListEl = document.getElementById('quick-image-list');

    const activeTarget = getQuickPreviewActiveTarget();
    const resolvedData = typeof data === 'undefined'
      ? (quickGeneratedPreviewState.previews?.[activeTarget] || null)
      : data;

    if (!resolvedData) {
      renderQuickPreviewValidation(null);
      if (emptyEl) emptyEl.hidden = false;
      if (panelEl) panelEl.hidden = true;
      if (panelEl) panelEl.classList.remove('is-expanded', 'is-compact');
      if (tabsEl) tabsEl.hidden = true;
      if (bodyEl) bodyEl.innerHTML = '';
      if (imageListEl) imageListEl.innerHTML = '';
      if (badgeEl) badgeEl.textContent = '미리보기 기준: -';
      if (previewPublishBtn) previewPublishBtn.disabled = true;
      return;
    }

    const activePreview = quickGeneratedPreviewState.previews?.[activeTarget] || resolvedData;
    const previewTargets = Object.keys(quickGeneratedPreviewState.previews || {});

    renderQuickPreviewValidation(activePreview.validation || null);
    if (emptyEl) emptyEl.hidden = true;
    if (panelEl) panelEl.hidden = false;
    if (tabsEl) tabsEl.hidden = previewTargets.length <= 1;
    tabButtons.forEach((button) => {
      const target = String(button.dataset.target || '').trim();
      button.hidden = !previewTargets.includes(target);
      button.classList.toggle('is-active', target === activeTarget);
    });
    if (titleEl) titleEl.textContent = activePreview.title || '제목 없음';
    if (metaEl) {
      const source = activePreview.source || {};
      const stats = activePreview.stats || {};
      metaEl.textContent = [
        source.fileName || '',
        source.folderName || source.directoryPath || '',
        `${stats.contentCount || 0}개 블록`,
        `이미지 ${stats.imageResolvedCount || 0}/${stats.imageBlockCount || 0}개`
      ].filter(Boolean).join(' | ');
    }
    if (badgeEl) {
      const label = activeTarget === 'wordpress' ? '워드프레스' : '네이버 블로그';
      badgeEl.textContent = `미리보기 기준: ${label}`;
    }
    if (bodyEl) bodyEl.innerHTML = renderQuickPreviewBodyHtml(activePreview);
    if (imageListEl) {
      const images = Array.isArray(activePreview.images) ? activePreview.images : [];
      imageListEl.innerHTML = images.length === 0
        ? '<div class="local-markdown-empty">이미지 블록이 없습니다.</div>'
        : images.map((image) => {
          const statusClass = image.exists ? 'ok' : 'missing';
          const statusText = image.exists ? '매칭됨' : '누락';
          const preview = image.previewUrl
            ? `<div class="local-markdown-image-card-preview"><img src="${escapeHtml(image.previewUrl)}" alt="${escapeHtml(image.title || '')}" loading="lazy"></div>`
            : '<div class="local-markdown-image-card-preview"><div class="local-markdown-image-card-placeholder">매칭되는 생성 이미지가 없습니다.</div></div>';
          return `
            <article class="local-markdown-image-card">
              <div class="local-markdown-image-card-header">
                <div>
                  <div class="local-markdown-image-card-title">IMAGE_${escapeHtml(String(image.index))} ${escapeHtml(image.title || '')}</div>
                  <div class="local-markdown-image-card-meta">${escapeHtml(image.fileName || '파일 미매칭')}</div>
                </div>
                <span class="local-markdown-image-card-status ${statusClass}">${statusText}</span>
              </div>
              ${preview}
              <p class="local-markdown-image-card-prompt">${escapeHtml(image.prompt || '')}</p>
            </article>
          `;
        }).join('');
    }
    setLocalMarkdownPreviewDensity(panelEl, bodyEl, imageListEl, activePreview.stats || {});
    if (previewPublishBtn) previewPublishBtn.disabled = false;
  }

  function clearQuickGeneratedPreview() {
    quickGeneratedPreviewState = {
      previewId: '',
      rowIndex: null,
      rowNumber: null,
      primaryTarget: '',
      targets: [],
      activeTarget: '',
      previews: {}
    };
    renderQuickGeneratedPreview(null);
  }

  const runQuickPublish = async (mode, payloadOverride = null) => {
    if (!resultEl) return;
    if (!guardUiConfigReady('빠른발행')) return;
    if (quickPublishInFlight) {
      resultEl.textContent = '이미 요청이 진행 중입니다. 잠시만 기다려주세요.';
      return;
    }
    clearQuickGeneratedPreview();
    quickPublishInFlight = true;
    if (saveBtn) saveBtn.disabled = true;
    if (directPublishBtn) directPublishBtn.disabled = true;
    if (generateBtn) generateBtn.disabled = true;
    if (previewPublishBtn) previewPublishBtn.disabled = true;

    const dummyPayload = payloadOverride || buildQuickPayload(mode);
    if (mode === 'publish') dummyPayload.operationId = crypto.randomUUID();

    if (dummyPayload.postStatus === 'schedule') {
      if (!dummyPayload.scheduleDate) {
        if (resultEl) resultEl.textContent = '⚠️ 예약 발행을 위해서는 예약 일시를 선택해야 합니다.';
        showUiPopup('예약 발행을 위해서는 예약 일시를 입력해야 합니다.');
        if (saveBtn) saveBtn.disabled = false;
        if (directPublishBtn) directPublishBtn.disabled = false;
        if (generateBtn) generateBtn.disabled = false;
        if (previewPublishBtn) previewPublishBtn.disabled = !quickGeneratedPreviewState.previewId;
        quickPublishInFlight = false;
        return;
      }
    }

    // [New] Require at least one of Subject, Keywords, or Reference URL
    if (!dummyPayload.subject && !dummyPayload.keywords && !dummyPayload.referenceUrl) {
        const msg = 'Subject, Keywords, 참고 URL 중 최소 하나는 입력해 주세요.';
        if (resultEl) resultEl.textContent = `⚠️ ${msg}`;
        showUiPopup(msg);
        if (saveBtn) saveBtn.disabled = false;
        if (directPublishBtn) directPublishBtn.disabled = false;
        if (generateBtn) generateBtn.disabled = false;
        if (previewPublishBtn) previewPublishBtn.disabled = !quickGeneratedPreviewState.previewId;
        quickPublishInFlight = false;
        return;
    }

    const preCheck = checkPublishPrerequisites(dummyPayload.targets);
    if (!preCheck.ok) {
      resultEl.textContent = preCheck.message;
      quickPublishInFlight = false;
      if (saveBtn) saveBtn.disabled = false;
      if (directPublishBtn) directPublishBtn.disabled = false;
      if (generateBtn) generateBtn.disabled = false;
      if (previewPublishBtn) previewPublishBtn.disabled = !quickGeneratedPreviewState.previewId;
      return;
    }

    if (mode === 'publish') {
      try {
        const quota = await getPublishQuotaPreflight(1);
        if (quota.executable === 0 || await showUiConfirm(quota.message, { title: '발행 사용량 확인', confirmText: '실행', cancelText: '취소' }) === false) {
          resultEl.textContent = quota.executable === 0 ? quota.message : '발행이 취소되었습니다.';
          quickPublishInFlight = false;
          if (saveBtn) saveBtn.disabled = false;
          if (directPublishBtn) directPublishBtn.disabled = false;
          if (generateBtn) generateBtn.disabled = false;
          if (previewPublishBtn) previewPublishBtn.disabled = !quickGeneratedPreviewState.previewId;
          return;
        }
      } catch (error) {
        resultEl.textContent = `사용량 확인 실패: ${error.message}`;
        quickPublishInFlight = false;
        if (saveBtn) saveBtn.disabled = false;
        if (directPublishBtn) directPublishBtn.disabled = false;
        if (generateBtn) generateBtn.disabled = false;
        if (previewPublishBtn) previewPublishBtn.disabled = !quickGeneratedPreviewState.previewId;
        return;
      }
    }

    try {
      scrollLogTargetIntoView(resultEl);
      const actionText = mode === 'append_and_generate'
        ? '미리보기 생성'
        : (mode === 'publish'
          ? (dummyPayload.postStatus === 'draft'
            ? '빠른 포스팅 임시 저장'
            : (dummyPayload.postStatus === 'schedule' ? '빠른 포스팅 예약 등록' : '빠른 포스팅 실행'))
          : '글감 저장');
      const data = await runWithLiveProgress({
        targetEl: resultEl,
        requestLabel: actionText,
        requestFn: () => postJson('/api/v1/blog/quick-publish', dummyPayload)
      });
      if (mode === 'publish' && isQuickPostingCelebrationStatus(dummyPayload.postStatus)) {
        showOrQueueQuickPostingCelebration();
      }
      if (mode === 'append_and_generate' && data?.previews) {
        quickGeneratedPreviewState.previewId = data.previewId || '';
        quickGeneratedPreviewState.rowIndex = Number.isFinite(Number(data.rowIndex)) ? Number(data.rowIndex) : null;
        quickGeneratedPreviewState.rowNumber = Number.isFinite(Number(data.rowNumber)) ? Number(data.rowNumber) : null;
        quickGeneratedPreviewState.primaryTarget = String(data.primaryTarget || '').trim();
        quickGeneratedPreviewState.targets = Array.isArray(data.targets) ? data.targets.slice() : [];
        quickGeneratedPreviewState.activeTarget = quickGeneratedPreviewState.primaryTarget || quickGeneratedPreviewState.targets[0] || '';
        quickGeneratedPreviewState.previews = typeof data.previews === 'object' && data.previews
          ? data.previews
          : {};
        renderQuickGeneratedPreview(data.previews?.[quickGeneratedPreviewState.activeTarget] || null);
      }
      await loadDashboard();
    } catch (e) {
      // runWithLiveProgress에서 상세 로그/오류를 이미 표기함
    } finally {
      if (saveBtn) saveBtn.disabled = false;
      if (directPublishBtn) directPublishBtn.disabled = false;
      if (generateBtn) generateBtn.disabled = false;
      if (previewPublishBtn) previewPublishBtn.disabled = !quickGeneratedPreviewState.previewId;
      quickPublishInFlight = false;
    }
  };

  const runQuickGeneratedPublish = async () => {
    if (!resultEl) return;
    if (!guardUiConfigReady('빠른발행')) return;
    if (!quickGeneratedPreviewState.previewId) {
      showUiPopup('먼저 `미리보기 생성`을 실행해 주세요.');
      return;
    }
    if (quickPublishInFlight) {
      resultEl.textContent = '이미 요청이 진행 중입니다. 잠시만 기다려주세요.';
      return;
    }
    const payload = buildQuickPreviewPublishPayload();
    if (!Array.isArray(payload.targets) || payload.targets.length === 0) {
      showUiPopup('포스팅할 대상을 하나 이상 선택해 주세요.');
      return;
    }
    const missingTargets = payload.targets.filter((target) => !quickGeneratedPreviewState.previews?.[target]);
    if (missingTargets.length > 0) {
      showUiPopup(`${missingTargets.join(', ')} 대상의 생성 preview가 없습니다. 미리보기 생성을 다시 해주세요.`);
      return;
    }
    if (payload.postStatus === 'schedule' && !payload.scheduleDate) {
      showUiPopup('예약 발행을 위해서는 예약 일시를 입력해야 합니다.');
      return;
    }

    try {
      const quota = await getPublishQuotaPreflight(1);
      if (quota.executable === 0) {
        resultEl.textContent = quota.message;
        return;
      }
      if (await showUiConfirm(quota.message, { title: '발행 사용량 확인', confirmText: '실행', cancelText: '취소' }) === false) return;
    } catch (error) {
      resultEl.textContent = `사용량 확인 실패: ${error.message}`;
      return;
    }

    scrollLogTargetIntoView(resultEl);
    quickPublishInFlight = true;
    if (saveBtn) saveBtn.disabled = true;
    if (directPublishBtn) directPublishBtn.disabled = true;
    if (generateBtn) generateBtn.disabled = true;
    if (previewPublishBtn) previewPublishBtn.disabled = true;
    try {
      await runWithLiveProgress({
        targetEl: resultEl,
        requestLabel: payload.postStatus === 'draft'
          ? '빠른 포스팅 임시 저장'
          : (payload.postStatus === 'schedule' ? '빠른 포스팅 예약 등록' : '빠른 포스팅 실행'),
        requestFn: () => postJson('/api/v1/blog/quick-preview/publish', payload)
      });
      if (isQuickPostingCelebrationStatus(payload.postStatus)) showOrQueueQuickPostingCelebration();
      await loadDashboard();
    } catch (_error) {
      // runWithLiveProgress already renders logs/errors
    } finally {
      quickPublishInFlight = false;
      if (saveBtn) saveBtn.disabled = false;
      if (directPublishBtn) directPublishBtn.disabled = false;
      if (generateBtn) generateBtn.disabled = false;
      if (previewPublishBtn) previewPublishBtn.disabled = !quickGeneratedPreviewState.previewId;
    }
  };

  if (saveBtn) {
    saveBtn.addEventListener('click', () => runQuickPublish('append_only'));
  }
  if (directPublishBtn) {
    directPublishBtn.addEventListener('click', () => runQuickPublish('publish'));
  }
  if (generateBtn) {
    generateBtn.addEventListener('click', () => runQuickPublish('append_and_generate'));
  }
  if (previewPublishBtn) {
    previewPublishBtn.addEventListener('click', () => runQuickGeneratedPublish());
  }
  document.querySelectorAll('#quick-preview-tabs .preview-target-tab').forEach((button) => {
    button.addEventListener('click', () => {
      setQuickPreviewActiveTarget(button.dataset.target || '');
    });
  });
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const subjectEl = document.getElementById('quick-subject');
      const keywordsEl = document.getElementById('quick-keywords');
      const titleEl = document.getElementById('quick-title');
      const instructionEl = document.getElementById('quick-instruction');
      const referenceUrlEl = document.getElementById('quick-reference-url');
      if (subjectEl) subjectEl.value = '';
      if (keywordsEl) keywordsEl.value = '';
      if (titleEl) titleEl.value = '';
      if (instructionEl) instructionEl.value = '';
      if (referenceUrlEl) referenceUrlEl.value = '';
      quickTrendTopicContext = null;
      quickRecommendationTopicContext = null;
      syncQuickTopicOrigin();
      setSelectedSettingsRadioValue('quick-writing-strategy', currentBlogWritingStrategy, 'search');

      // [New] Clear Categories
      const naverCatEl = document.getElementById('quick-naver-category');
      const wpCatEl = document.getElementById('quick-wp-category');
      if (naverCatEl) {
        naverCatEl.value = '';
        localStorage.setItem('last_quick_naver_category', '');
      }
      if (wpCatEl) {
        wpCatEl.value = '';
        localStorage.setItem('last_quick_wp_category', '');
      }

      clearQuickGeneratedPreview();
      if (resultEl) resultEl.textContent = '입력 내용과 생성 preview를 지웠습니다.';
      subjectEl?.focus();
    });
  }

  function normalizeLocalMarkdownRelativePath(value) {
    return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  }

  function isLocalMarkdownFileName(fileName) {
    return /\.(md|markdown)$/i.test(String(fileName || '').trim());
  }

  function isLocalMarkdownImageEntry(entry = {}) {
    const fileName = String(entry?.name || '').trim();
    const contentType = String(entry?.type || '').trim().toLowerCase();
    if (contentType.startsWith('image/')) return true;
    return /\.(png|jpg|jpeg|webp|avif)$/i.test(fileName);
  }

  function getLocalMarkdownFolderLabelFromFiles(files = []) {
    const firstRelativePath = normalizeLocalMarkdownRelativePath(files?.[0]?.webkitRelativePath || files?.[0]?.name);
    if (!firstRelativePath) return '';
    const parts = firstRelativePath.split('/').filter(Boolean);
    return parts.length > 1 ? parts[0] : '';
  }

  async function buildLocalMarkdownSelectedFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) {
      return {
        folderLabel: '',
        selectedFiles: [],
        selectedFilesPayload: []
      };
    }

    const selectedFiles = files.map((file) => ({
      file,
      name: file.name || '',
      type: file.type || '',
      size: Number.isFinite(Number(file.size)) ? Number(file.size) : 0,
      relativePath: normalizeLocalMarkdownRelativePath(file.webkitRelativePath || file.name)
    }));
    const folderLabel = getLocalMarkdownFolderLabelFromFiles(files);
    const selectedFilesPayload = await Promise.all(selectedFiles.map(async (entry) => ({
      relativePath: entry.relativePath,
      name: entry.name,
      contentType: entry.type,
      size: entry.size,
      textContent: isLocalMarkdownFileName(entry.name) ? await entry.file.text() : ''
    })));

    return {
      folderLabel,
      selectedFiles,
      selectedFilesPayload
    };
  }

  function renderLocalMarkdownBodyHtml(data = null, getImageObjectUrl = () => '') {
    const items = Array.isArray(data?.contentItems) ? data.contentItems : [];
    const images = Array.isArray(data?.images) ? data.images : [];
    const imageMap = new Map(images.map((image) => [Number(image.index), image]));
    const fragments = [];
    let activeListType = '';

    const closeList = () => {
      if (!activeListType) return;
      fragments.push(activeListType === 'ordered' ? '</ol>' : '</ul>');
      activeListType = '';
    };

    const renderImageFigure = (item = {}) => {
      const image = imageMap.get(Number(item.index));
      const previewUrl = image?.exists ? getImageObjectUrl(image.imagePath) : '';
      const imageBody = previewUrl
        ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(image?.title || item.text || '')}" loading="lazy">`
        : `<div class="local-markdown-inline-image-missing">매칭되는 로컬 이미지가 없습니다.</div>`;
      return `
        <figure>
          ${imageBody}
          <figcaption>
            <div class="image-caption-title">${escapeHtml(image?.title || item.text || `IMAGE_${item.index}`)}</div>
            ${image?.prompt || item.prompt ? `<div class="image-caption-prompt">${escapeHtml(image?.prompt || item.prompt || '')}</div>` : ''}
          </figcaption>
        </figure>
      `;
    };

    items.forEach((item) => {
      const type = String(item?.type || 'paragraph');
      const text = renderInlinePreviewHtml(item?.text || '', item?.boldRanges);
      if (type !== 'list-item') closeList();

      if (type === 'header-h2') {
        fragments.push(`<h2>${text}</h2>`);
        return;
      }
      if (type === 'header-h3') {
        fragments.push(`<h3>${text}</h3>`);
        return;
      }
      if (type === 'quote') {
        fragments.push(`<blockquote><p>${text}</p></blockquote>`);
        return;
      }
      if (type === 'list-item') {
        const nextListType = item?.listType === 'ordered' ? 'ordered' : 'unordered';
        if (activeListType !== nextListType) {
          closeList();
          fragments.push(nextListType === 'ordered' ? '<ol>' : '<ul>');
          activeListType = nextListType;
        }
        fragments.push(`<li>${text}</li>`);
        return;
      }
      if (type === 'image') {
        fragments.push(renderImageFigure(item));
        return;
      }
      if (type === 'separator') {
        fragments.push('<div class="local-markdown-preview-separator" role="separator" aria-label="구분선"></div>');
        return;
      }
      if (type === 'newline') {
        fragments.push('<div style="height:8px"></div>');
        return;
      }
      fragments.push(`<p>${text}</p>`);
    });

    closeList();
    return fragments.join('') || '<div class="local-markdown-empty">본문 preview를 표시할 내용이 없습니다.</div>';
  }

  function createLocalMarkdownController(config) {
    let publishInFlight = false;
    let previewTimer = null;
    let previewRequestId = 0;
    const ids = config.ids || {};
    const getState = config.getState;
    const setState = config.setState;
    const sourceType = config.sourceType === 'pasted' ? 'pasted' : 'folder';

    const getEl = (key) => document.getElementById(ids[key]);
    const getPathEl = () => getEl('pathInput');
    const getFolderInputEl = () => getEl('folderInput');
    const getMarkdownInputEl = () => getEl('markdownInput');
    const hasSource = () => {
      if (sourceType === 'pasted') return Boolean((getMarkdownInputEl()?.value || '').trim());
      const state = getState();
      return Array.isArray(state.selectedFilesPayload) && state.selectedFilesPayload.length > 0;
    };

    const buildPreviewPayload = () => {
      const state = getState();
      const targets = [];
      if (getEl('targetNaver')?.checked) targets.push('naver');
      if (getEl('targetWordpress')?.checked) targets.push('wordpress');

      const payload = {
        folderName: state.folderLabel || (getPathEl()?.value || '').trim(),
        targets,
        postStatus: (getEl('postStatus')?.value || 'publish').trim(),
        scheduleDate: (getEl('scheduleDate')?.value || '').trim(),
        imageMode: (getEl('imageMode')?.value || 'prompt_only').trim()
      };
      if (sourceType === 'pasted') {
        const markdownText = getMarkdownInputEl()?.value || '';
        payload.markdownText = markdownText;
        payload.selectedFiles = [{
          relativePath: 'pasted-manuscript/contents.md',
          name: 'contents.md',
          contentType: 'text/markdown',
          size: new Blob([markdownText]).size,
          textContent: markdownText
        }];
      } else {
        payload.selectedFiles = Array.isArray(state.selectedFilesPayload) ? state.selectedFilesPayload : [];
      }
      return payload;
    };

    const buildPublishPayload = async () => {
      const state = getState();
      const selectedFiles = Array.isArray(state.selectedFiles) ? state.selectedFiles : [];
      const serializedFiles = [];

      for (const entry of selectedFiles) {
        if (!entry?.file) continue;
        if (!isLocalMarkdownFileName(entry.name) && !isLocalMarkdownImageEntry(entry)) continue;

        const serialized = {
          relativePath: entry.relativePath,
          name: entry.name,
          contentType: entry.type,
          size: entry.size
        };

        if (isLocalMarkdownFileName(entry.name)) {
          serialized.textContent = await entry.file.text();
        } else if (isLocalMarkdownImageEntry(entry)) {
          serialized.base64Data = await readFileAsDataUrl(entry.file);
        }

        serializedFiles.push(serialized);
      }

      const payload = {
        folderName: state.folderLabel || '',
        targets: [
          getEl('targetNaver')?.checked ? 'naver' : '',
          getEl('targetWordpress')?.checked ? 'wordpress' : ''
        ].filter(Boolean),
        naverCategory: (getEl('naverCategory')?.value || '').trim(),
        wordpressCategory: (getEl('wpCategory')?.value || '').trim(),
        postStatus: (getEl('postStatus')?.value || 'publish').trim(),
        scheduleDate: (getEl('scheduleDate')?.value || '').trim(),
        headless: Boolean(getEl('headless')?.checked),
        imageMode: (getEl('imageMode')?.value || 'prompt_only').trim()
      };
      if (sourceType === 'pasted') {
        const markdownText = getMarkdownInputEl()?.value || '';
        payload.markdownText = markdownText;
        payload.selectedFiles = [{
          relativePath: 'pasted-manuscript/contents.md',
          name: 'contents.md',
          contentType: 'text/markdown',
          size: new Blob([markdownText]).size,
          textContent: markdownText
        }];
      } else {
        payload.selectedFiles = serializedFiles;
      }
      return payload;
    };

    const revokeObjectUrls = () => {
      const state = getState();
      const urlMap = state.imageObjectUrls || {};
      Object.keys(urlMap).forEach((key) => {
        try {
          URL.revokeObjectURL(urlMap[key]);
        } catch (_error) { }
      });
      setState({
        ...state,
        imageObjectUrls: {}
      });
    };

    const getImageObjectUrl = (relativePath) => {
      const normalizedPath = normalizeLocalMarkdownRelativePath(relativePath);
      if (!normalizedPath) return '';
      const state = getState();
      if (state.imageObjectUrls?.[normalizedPath]) {
        return state.imageObjectUrls[normalizedPath];
      }

      const fileEntry = (Array.isArray(state.selectedFiles) ? state.selectedFiles : [])
        .find((entry) => normalizeLocalMarkdownRelativePath(entry.relativePath) === normalizedPath);
      if (!fileEntry || !isLocalMarkdownImageEntry(fileEntry)) return '';

      const objectUrl = URL.createObjectURL(fileEntry.file);
      setState({
        ...state,
        imageObjectUrls: {
          ...(state.imageObjectUrls || {}),
          [normalizedPath]: objectUrl
        }
      });
      return objectUrl;
    };

    const toggleScheduleDate = () => {
      const input = getEl('scheduleDate');
      const status = getEl('postStatus')?.value || 'publish';
      if (!input) return;
      input.disabled = status !== 'schedule';
      if (status === 'schedule' && !input.value) {
        const now = new Date(Date.now() + 10 * 60 * 1000);
        const pad = (n) => String(n).padStart(2, '0');
        input.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
        if (config.scheduleStorageKey) {
          localStorage.setItem(config.scheduleStorageKey, input.value);
        }
      }
    };

    const renderValidation = (validation = null) => {
      const el = getEl('validation');
      if (!el) return;

      el.classList.remove('has-error', 'has-warning', 'is-ok');
      if (!validation) {
        el.textContent = config.emptyValidationText || '아직 원고 폴더를 선택하지 않았습니다.';
        return;
      }

      const lines = [];
      if (Array.isArray(validation.errors) && validation.errors.length > 0) {
        el.classList.add('has-error');
        lines.push('[오류]');
        validation.errors.forEach((item) => lines.push(`- ${item}`));
      }
      if (Array.isArray(validation.warnings) && validation.warnings.length > 0) {
        if (!el.classList.contains('has-error')) el.classList.add('has-warning');
        if (lines.length > 0) lines.push('');
        lines.push('[경고]');
        validation.warnings.forEach((item) => lines.push(`- ${item}`));
      }
      if (lines.length === 0) {
        el.classList.add('is-ok');
        lines.push('검증 통과: 현재 입력값 기준으로 preview/validation 문제가 없습니다.');
      }
      el.textContent = lines.join('\n');
    };

    const renderPreview = (data = null) => {
      const state = getState();
      const emptyEl = getEl('previewEmpty');
      const panelEl = getEl('previewPanel');
      const titleEl = getEl('previewTitle');
      const metaEl = getEl('previewMeta');
      const bodyEl = getEl('bodyPreview');
      const imageListEl = getEl('imageList');

      if (!data) {
        setState({
          ...state,
          data: null
        });
        renderValidation(null);
        if (emptyEl) emptyEl.hidden = false;
        if (panelEl) panelEl.hidden = true;
        if (panelEl) panelEl.classList.remove('is-expanded', 'is-compact');
        if (titleEl) titleEl.textContent = '제목 없음';
        if (metaEl) metaEl.textContent = '-';
        if (bodyEl) bodyEl.innerHTML = '';
        if (imageListEl) imageListEl.innerHTML = '';
        return;
      }

      setState({
        ...state,
        data
      });
      renderValidation(data.validation || null);
      if (emptyEl) emptyEl.hidden = true;
      if (panelEl) panelEl.hidden = false;
      if (titleEl) titleEl.textContent = data.title || '제목 없음';
      if (metaEl) {
        const source = data.source || {};
        const stats = data.stats || {};
        metaEl.textContent = [
          source.fileName || '',
          source.folderName || source.directoryPath || '',
          `${stats.contentCount || 0}개 블록`,
          `이미지 ${stats.imageResolvedCount || 0}/${stats.imageBlockCount || 0}개`
        ].filter(Boolean).join(' | ');
      }
      if (bodyEl) bodyEl.innerHTML = renderLocalMarkdownBodyHtml(data, getImageObjectUrl);
      if (imageListEl) {
        const images = Array.isArray(data.images) ? data.images : [];
        imageListEl.innerHTML = images.length === 0
          ? '<div class="local-markdown-empty">이미지 블록이 없습니다.</div>'
          : images.map((image) => {
            const statusClass = image.exists ? 'ok' : 'missing';
            const statusText = image.exists ? '매칭됨' : '누락';
            const previewUrl = image.exists ? getImageObjectUrl(image.imagePath) : '';
            const preview = image.exists
              ? `<div class="local-markdown-image-card-preview"><img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(image.title || '')}" loading="lazy"></div>`
              : `<div class="local-markdown-image-card-preview"><div class="local-markdown-image-card-placeholder">${escapeHtml(config.missingImageText || '매칭되는 로컬 이미지가 없습니다.')}</div></div>`;
            return `
              <article class="local-markdown-image-card">
                <div class="local-markdown-image-card-header">
                  <div>
                    <div class="local-markdown-image-card-title">IMAGE_${escapeHtml(String(image.index))} ${escapeHtml(image.title || '')}</div>
                    <div class="local-markdown-image-card-meta">${escapeHtml(image.fileName || '파일 미매칭')}</div>
                  </div>
                  <span class="local-markdown-image-card-status ${statusClass}">${statusText}</span>
                </div>
                ${preview}
                <p class="local-markdown-image-card-prompt">${escapeHtml(image.prompt || '')}</p>
              </article>
            `;
          }).join('');
      }
      setLocalMarkdownPreviewDensity(panelEl, bodyEl, imageListEl, data.stats || {});
    };

    const renderPreviewError = (message) => {
      const state = getState();
      const emptyEl = getEl('previewEmpty');
      const panelEl = getEl('previewPanel');
      setState({
        ...state,
        data: null
      });
      renderValidation({
        errors: [String(message || '원고 미리보기에 실패했습니다.')],
        warnings: []
      });
      if (emptyEl) emptyEl.hidden = false;
      if (panelEl) panelEl.hidden = true;
    };

    const loadPreview = async () => {
      const requestId = ++previewRequestId;
      const payload = buildPreviewPayload();
      const sourceReady = sourceType === 'pasted'
        ? Boolean(String(payload.markdownText || '').trim())
        : (Array.isArray(payload.selectedFiles) && payload.selectedFiles.length > 0);
      if (!sourceReady) {
        renderPreview(null);
        return;
      }

      try {
        const data = await postJson('/api/v1/blog/local-markdown/preview', payload);
        if (requestId !== previewRequestId) return;
        renderPreview(data);
      } catch (e) {
        if (requestId !== previewRequestId) return;
        renderPreviewError(e.message);
        throw e;
      }
    };

    const clearSelection = () => {
      previewRequestId++;
      if (previewTimer) {
        clearTimeout(previewTimer);
        previewTimer = null;
      }
      revokeObjectUrls();
      if (getPathEl()) getPathEl().value = '';
      if (getFolderInputEl()) getFolderInputEl().value = '';
      if (getMarkdownInputEl()) getMarkdownInputEl().value = '';
      if (config.draftStorageKey) localStorage.removeItem(config.draftStorageKey);
      setState(createLocalMarkdownPreviewState());
      renderPreview(null);
    };

    const runPublishAction = async () => {
      const resultEl = getEl('result');
      if (!guardUiConfigReady(config.featureLabel || '원고 포스팅')) return;
      if (publishInFlight) return;
      const state = getState();
      if (!state.data) {
        showUiPopup(config.emptySourceMessage || '먼저 원고 폴더를 선택해 주세요.');
        return;
      }
      if (!state.data.validation?.ok) {
        showUiPopup('현재 validation 오류가 있어 실행할 수 없습니다. 원고와 옵션을 먼저 확인해 주세요.');
        return;
      }

      const publishPayload = await buildPublishPayload();
      const preCheck = checkPublishPrerequisites(publishPayload.targets);
      if (!preCheck.ok) {
        if (resultEl) resultEl.textContent = preCheck.message;
        return;
      }

      const actionLabel = publishPayload.postStatus === 'draft'
        ? `${config.actionPrefix || '원고'} 임시 저장`
        : (publishPayload.postStatus === 'schedule' ? `${config.actionPrefix || '원고'} 예약 포스팅` : `${config.actionPrefix || '원고'} 포스팅`);
      let quota;
      try {
        quota = await getPublishQuotaPreflight(1);
      } catch (error) {
        if (resultEl) resultEl.textContent = `사용량 확인 실패: ${error.message}`;
        return;
      }
      if (quota.executable === 0) {
        if (resultEl) resultEl.textContent = quota.message;
        return;
      }
      const confirmMessage = `${config.confirmMessage || `${actionLabel}을 진행하시겠습니까?`}\n\n${quota.message}`;
      const confirmed = await showUiConfirm(confirmMessage, {
        title: '실행 확인',
        confirmText: '진행',
        cancelText: '취소'
      });
      if (confirmed === false) {
        if (resultEl) resultEl.textContent = `${config.actionPrefix || '원고'} 포스팅 실행이 취소되었습니다.`;
        return;
      }

      scrollLogTargetIntoView(resultEl);
      publishInFlight = true;
      const publishButtons = (ids.publishButtons || []).map((id) => document.getElementById(id)).filter(Boolean);
      publishButtons.forEach((button) => { button.disabled = true; });
      try {
        await runWithLiveProgress({
          targetEl: resultEl,
          requestLabel: actionLabel,
          requestFn: () => postJson('/api/v1/blog/local-markdown/publish', publishPayload)
        });
        if (isQuickPostingCelebrationStatus(publishPayload.postStatus)) showOrQueueQuickPostingCelebration();
      } catch (_error) {
        // runWithLiveProgress already renders logs/errors
      } finally {
        publishInFlight = false;
        publishButtons.forEach((button) => { button.disabled = false; });
      }
    };

    const selectBtn = getEl('selectBtn');
    const folderInput = getFolderInputEl();
    const clearBtn = getEl('clearBtn');
    const postStatusEl = getEl('postStatus');
    const markdownInputEl = getMarkdownInputEl();

    selectBtn?.addEventListener('click', () => {
      folderInput?.click();
    });

    folderInput?.addEventListener('change', async (event) => {
      try {
        const nextSelection = await buildLocalMarkdownSelectedFiles(event.target?.files);
        if (!Array.isArray(nextSelection.selectedFiles) || nextSelection.selectedFiles.length === 0) return;
        revokeObjectUrls();
        setState({
          ...getState(),
          folderLabel: nextSelection.folderLabel,
          selectedFiles: nextSelection.selectedFiles,
          selectedFilesPayload: nextSelection.selectedFilesPayload,
          data: null,
          imageObjectUrls: {}
        });
        if (getPathEl()) getPathEl().value = nextSelection.folderLabel || '';
        await loadPreview();
      } catch (e) {
        renderPreviewError(e.message);
        showUiPopup(`${config.selectErrorLabel || '원고 폴더 선택 실패'}: ${e.message}`);
      } finally {
        event.target.value = '';
      }
    });

    if (markdownInputEl) {
      const savedDraft = config.draftStorageKey ? localStorage.getItem(config.draftStorageKey) : '';
      if (savedDraft) {
        markdownInputEl.value = savedDraft;
      }
      markdownInputEl.addEventListener('input', () => {
        if (config.draftStorageKey) {
          localStorage.setItem(config.draftStorageKey, markdownInputEl.value);
        }
        if (previewTimer) clearTimeout(previewTimer);
        previewTimer = setTimeout(() => {
          loadPreview().catch((e) => {
            showUiPopup(`${config.previewErrorLabel || '원고 미리보기 실패'}: ${e.message}`);
          });
        }, 350);
      });
      if (markdownInputEl.value.trim()) {
        setTimeout(() => {
          loadPreview().catch(() => {});
        }, 0);
      }
    }

    clearBtn?.addEventListener('click', () => {
      clearSelection();
    });

    (ids.publishButtons || []).forEach((id) => {
      const button = document.getElementById(id);
      button?.addEventListener('click', () => {
        runPublishAction().catch((e) => {
          showUiPopup(`${config.publishErrorLabel || '원고 포스팅 실행 실패'}: ${e.message}`);
        });
      });
    });

    postStatusEl?.addEventListener('change', () => {
      toggleScheduleDate();
      if (hasSource()) {
        loadPreview().catch((e) => {
          showUiPopup(`${config.previewErrorLabel || '원고 미리보기 실패'}: ${e.message}`);
        });
      }
    });

    [
      ids.targetNaver,
      ids.targetWordpress,
      ids.imageMode,
      ids.scheduleDate
    ].filter(Boolean).forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        if (hasSource()) {
          loadPreview().catch((e) => {
            showUiPopup(`${config.previewErrorLabel || '원고 미리보기 실패'}: ${e.message}`);
          });
        }
      });
    });

    return {
      toggleScheduleDate,
      renderPreview,
      loadPreview,
      clearSelection
    };
  }

  const quickManuscriptController = createLocalMarkdownController({
    featureLabel: '빠른 포스팅 원고 모드',
    actionPrefix: '원고',
    confirmMessage: '포스팅을 실행하겠습니까?',
    scheduleStorageKey: 'quick_manuscript_schedule_date',
    getState: () => quickManuscriptPreviewState,
    setState: (nextState) => {
      quickManuscriptPreviewState = nextState;
    },
    ids: {
      selectBtn: 'quick-manuscript-select-btn',
      clearBtn: 'quick-manuscript-clear-btn',
      folderInput: 'quick-manuscript-folder-input',
      pathInput: 'quick-manuscript-path',
      naverCategory: 'quick-manuscript-naver-category',
      wpCategory: 'quick-manuscript-wp-category',
      postStatus: 'quick-manuscript-post-status',
      scheduleDate: 'quick-manuscript-schedule-date',
      targetNaver: 'quick-manuscript-target-naver',
      targetWordpress: 'quick-manuscript-target-wordpress',
      headless: 'quick-manuscript-headless',
      imageMode: 'quick-manuscript-image-mode',
      validation: 'quick-manuscript-validation',
      previewEmpty: 'quick-manuscript-preview-empty',
      previewPanel: 'quick-manuscript-preview-panel',
      previewTitle: 'quick-manuscript-preview-title',
      previewMeta: 'quick-manuscript-preview-meta',
      bodyPreview: 'quick-manuscript-body-preview',
      imageList: 'quick-manuscript-image-list',
      result: 'quick-manuscript-result',
      publishButtons: ['quick-manuscript-publish-btn', 'quick-manuscript-publish-inline-btn']
    }
  });

  window.toggleQuickManuscriptScheduleDate = quickManuscriptController.toggleScheduleDate;
  window.renderQuickManuscriptPreview = quickManuscriptController.renderPreview;

  const quickPastedController = createLocalMarkdownController({
    sourceType: 'pasted',
    featureLabel: '빠른 포스팅 원고 붙여넣기',
    actionPrefix: '붙여넣은 원고',
    confirmMessage: '붙여넣은 원고로 포스팅을 실행하겠습니까?',
    emptySourceMessage: '먼저 Markdown 원고를 붙여넣어 주세요.',
    emptyValidationText: 'Markdown 원고를 붙여넣어 주세요.',
    missingImageText: '붙여넣기 원고에는 매칭된 로컬 이미지가 없습니다.',
    draftStorageKey: 'quick_pasted_markdown_draft',
    scheduleStorageKey: 'quick_pasted_schedule_date',
    getState: () => quickPastedPreviewState,
    setState: (nextState) => {
      quickPastedPreviewState = nextState;
    },
    ids: {
      clearBtn: 'quick-pasted-clear-btn',
      markdownInput: 'quick-pasted-markdown',
      naverCategory: 'quick-pasted-naver-category',
      wpCategory: 'quick-pasted-wp-category',
      postStatus: 'quick-pasted-post-status',
      scheduleDate: 'quick-pasted-schedule-date',
      targetNaver: 'quick-pasted-target-naver',
      targetWordpress: 'quick-pasted-target-wordpress',
      headless: 'quick-pasted-headless',
      imageMode: 'quick-pasted-image-mode',
      validation: 'quick-pasted-validation',
      previewEmpty: 'quick-pasted-preview-empty',
      previewPanel: 'quick-pasted-preview-panel',
      previewTitle: 'quick-pasted-preview-title',
      previewMeta: 'quick-pasted-preview-meta',
      bodyPreview: 'quick-pasted-body-preview',
      imageList: 'quick-pasted-image-list',
      result: 'quick-pasted-result',
      publishButtons: ['quick-pasted-publish-btn', 'quick-pasted-publish-inline-btn']
    }
  });

  window.toggleQuickPastedScheduleDate = quickPastedController.toggleScheduleDate;

  const shoppingQuickSaveBtn = document.getElementById('shopping-quick-save-btn');
  const shoppingQuickPublishBtn = document.getElementById('shopping-quick-publish-btn');
  const shoppingQuickResultEl = document.getElementById('shopping-quick-result');
  const shoppingQuickUrlInput = document.getElementById('shopping-quick-url');
  const shoppingQuickProductInput = document.getElementById('shopping-quick-product');
  const buildShoppingQuickPayload = (mode) => {
    const targets = [];
    if (document.getElementById('shopping-quick-target-naver')?.checked) targets.push('naver');
    if (document.getElementById('shopping-quick-target-wordpress')?.checked) targets.push('wordpress');

    const naverCat = (document.getElementById('shopping-quick-naver-category')?.value || '').trim();
    const wpCat = (document.getElementById('shopping-quick-wp-category')?.value || '').trim();

    const payload = {
      shortUrl: (shoppingQuickUrlInput?.value || '').trim(),
      product: (shoppingQuickProductInput?.value || '').trim(),
      instruction: (document.getElementById('shopping-quick-instruction')?.value || '').trim(),
      headless: Boolean(document.getElementById('shopping-quick-headless')?.checked),
      publishMode: mode,
      targets,
      naverCategory: naverCat,
      wordpressCategory: wpCat,
      postStatus: (document.getElementById('shopping-quick-wp-post-status')?.value || 'publish').trim(),
      scheduleDate: (document.getElementById('shopping-quick-wp-schedule-date')?.value || '').trim()
    };

    // category 필드는 하위 호환성을 위해 유지
    payload.category = wpCat;

    return payload;
  };
  const runShoppingQuickPublish = async (mode) => {
    if (!shoppingQuickResultEl) return;
    if (!guardUiConfigReady('쇼핑커넥트 빠른발행')) return;
    if (shoppingQuickPublishInFlight) {
      shoppingQuickResultEl.textContent = '이미 요청이 진행 중입니다. 잠시만 기다려주세요.';
      return;
    }
    shoppingQuickPublishInFlight = true;
    if (shoppingQuickSaveBtn) shoppingQuickSaveBtn.disabled = true;
    if (shoppingQuickPublishBtn) shoppingQuickPublishBtn.disabled = true;

    const dummyPayload = buildShoppingQuickPayload(mode);
    if (mode === 'append_and_publish') dummyPayload.operationId = crypto.randomUUID();
    const preCheck = checkPublishPrerequisites(dummyPayload.targets);
    if (!preCheck.ok) {
      shoppingQuickResultEl.textContent = preCheck.message;
      shoppingQuickPublishInFlight = false;
      if (shoppingQuickSaveBtn) shoppingQuickSaveBtn.disabled = false;
      if (shoppingQuickPublishBtn) shoppingQuickPublishBtn.disabled = false;
      return;
    }

    if (dummyPayload.postStatus === 'schedule' && !dummyPayload.scheduleDate) {
      shoppingQuickResultEl.textContent = '⚠️ 예약 발행을 위해서는 예약 일시를 선택해야 합니다.';
      showUiPopup('예약 발행을 위해서는 예약 일시를 입력해야 합니다.');
      shoppingQuickPublishInFlight = false;
      if (shoppingQuickSaveBtn) shoppingQuickSaveBtn.disabled = false;
      if (shoppingQuickPublishBtn) shoppingQuickPublishBtn.disabled = false;
      return;
    }

    if (mode === 'append_and_publish') {
      try {
        const quota = await getPublishQuotaPreflight(1);
        if (quota.executable === 0 || await showUiConfirm(quota.message, { title: '발행 사용량 확인', confirmText: '실행', cancelText: '취소' }) === false) {
          shoppingQuickResultEl.textContent = quota.executable === 0 ? quota.message : '발행이 취소되었습니다.';
          shoppingQuickPublishInFlight = false;
          if (shoppingQuickSaveBtn) shoppingQuickSaveBtn.disabled = false;
          if (shoppingQuickPublishBtn) shoppingQuickPublishBtn.disabled = false;
          return;
        }
      } catch (error) {
        shoppingQuickResultEl.textContent = `사용량 확인 실패: ${error.message}`;
        shoppingQuickPublishInFlight = false;
        if (shoppingQuickSaveBtn) shoppingQuickSaveBtn.disabled = false;
        if (shoppingQuickPublishBtn) shoppingQuickPublishBtn.disabled = false;
        return;
      }
    }

    try {
      const actionText = mode === 'append_and_publish'
        ? (dummyPayload.postStatus === 'draft'
          ? '쇼핑 글감 저장 & 임시 저장'
          : (dummyPayload.postStatus === 'schedule' ? '쇼핑 글감 저장 & 예약 등록' : '쇼핑 글감 저장 & 즉시 발행'))
        : '쇼핑 글감 저장';
      await runWithLiveProgress({
        targetEl: shoppingQuickResultEl,
        requestLabel: actionText,
        requestFn: () => postJson('/api/v1/shopping/quick-publish', dummyPayload)
      });
      await Promise.all([loadDashboard(), loadBlogShopping({ silent: true })]);
    } catch (e) {
      // runWithLiveProgress에서 상세 로그/오류를 이미 표기함
    } finally {
      if (shoppingQuickSaveBtn) shoppingQuickSaveBtn.disabled = false;
      if (shoppingQuickPublishBtn) shoppingQuickPublishBtn.disabled = false;
      shoppingQuickPublishInFlight = false;
    }
  };

  if (shoppingQuickSaveBtn) {
    shoppingQuickSaveBtn.addEventListener('click', () => runShoppingQuickPublish('append_only'));
  }
  if (shoppingQuickPublishBtn) {
    shoppingQuickPublishBtn.addEventListener('click', () => runShoppingQuickPublish('append_and_publish'));
  }

  const blogTabButtons = Array.from(document.querySelectorAll('.blog-tab-btn'));
  const shoppingTabButtons = Array.from(document.querySelectorAll('.shopping-tab-btn'));
  const blogTrendsDateInput = document.getElementById('blog-trends-date');
  const naverCommentDraftSaveBtn = document.getElementById('naver-comment-draft-save-btn');
  const naverCommentDraftRunBtn = document.getElementById('naver-comment-draft-run-btn');
  const naverCommentDraftListEl = document.getElementById('naver-comment-draft-list');
  const blogTrendsQFilter = document.getElementById('blog-trends-q-filter');
  const blogTrendsQClearBtn = document.getElementById('blog-trends-q-clear-btn');
  const blogTrendsCollectBtn = document.getElementById('blog-trends-collect-btn');
  const blogTrendsRefreshBtn = document.getElementById('blog-trends-refresh-btn');
  const blogTrendsSearchBtn = document.getElementById('blog-trends-search-btn');
  const blogTrendsToTopicsBtn = document.getElementById('blog-trends-to-topics-btn');
  const blogTrendsPrevBtn = document.getElementById('blog-trends-page-prev');
  const blogTrendsNextBtn = document.getElementById('blog-trends-page-next');
  const blogRefreshBtn = document.getElementById('blog-refresh-btn');
  const blogBatchBtn = document.getElementById('blog-batch-btn');
  const blogTopicsPrevBtn = document.getElementById('blog-topics-page-prev');
  const blogTopicsNextBtn = document.getElementById('blog-topics-page-next');
  const blogTopicsQClearBtn = document.getElementById('blog-topics-q-clear-btn');
  const shoppingRefreshBtn = document.getElementById('shopping-refresh-btn');
  const shoppingQClearBtn = document.getElementById('shopping-q-clear-btn');
  const shoppingBatchBtn = document.getElementById('shopping-batch-btn');
  const shoppingStatusFilter = document.getElementById('shopping-status-filter');
  const shoppingQFilter = document.getElementById('shopping-q-filter');
  const shoppingPrevBtn = document.getElementById('shopping-page-prev');
  const shoppingNextBtn = document.getElementById('shopping-page-next');
  const blogStatusFilter = document.getElementById('blog-status-filter');
  const blogQFilter = document.getElementById('blog-q-filter');
  const blogTrendsTableBody = document.getElementById('blog-trends-table-body');
  const trendPostingPeriod = document.getElementById('trend-posting-period');
  const trendPostingCategories = document.getElementById('trend-posting-categories');
  const trendPostingQueryBtn = document.getElementById('trend-posting-query-btn');
  const trendPostingResultFilters = document.getElementById('trend-posting-result-filters');
  const trendPostingFilterReset = document.getElementById('trend-posting-filter-reset');
  const trendPostingExcludeRecent = document.getElementById('trend-posting-filter-exclude-recent');
  const trendPostingTableBody = document.getElementById('trend-posting-table-body');
  const blogTopicsTableBody = document.getElementById('blog-table-body');
  const shoppingTableBody = document.getElementById('shopping-table-body');
  const sortableHeaders = Array.from(document.querySelectorAll('.data-table th.sortable'));

  blogTabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = String(btn.dataset.blogTab || '');
      activateBlogTab(tabName, { forceReload: true });
    });
  });
  trendPostingPeriod?.addEventListener('change', syncTrendPostingPeriodUi);
  trendPostingCategories?.addEventListener('click', (event) => {
    const button = event.target?.closest('[data-trend-posting-category]');
    if (!button || button.disabled) return;
    const nextActive = !button.classList.contains('active');
    button.classList.toggle('active', nextActive);
    button.setAttribute('aria-pressed', nextActive ? 'true' : 'false');
    syncTrendPostingCategoryLimit();
  });
  trendPostingQueryBtn?.addEventListener('click', queryTrendPostingKeywords);
  trendPostingResultFilters?.addEventListener('input', (event) => {
    if (event.target === trendPostingExcludeRecent) return;
    renderTrendPostingResults();
  });
  trendPostingExcludeRecent?.addEventListener('change', () => {
    if (trendPostingExcludeRecent.checked && !trendPostingState.recentTopicsLoaded) {
      void loadRecentTrendPostingTopics();
      return;
    }
    renderTrendPostingResults();
  });
  trendPostingFilterReset?.addEventListener('click', () => {
    const keywordEl = document.getElementById('trend-posting-filter-keyword');
    const viewEl = document.getElementById('trend-posting-filter-view');
    if (keywordEl) keywordEl.value = '';
    if (viewEl) viewEl.value = 'all';
    if (trendPostingExcludeRecent) trendPostingExcludeRecent.checked = false;
    renderTrendPostingResults();
  });
  trendPostingTableBody?.addEventListener('click', (event) => {
    const button = event.target?.closest('[data-trend-posting-action]');
    if (!button) return;
    const item = trendPostingState.itemsById.get(String(button.dataset.itemId || ''));
    if (!item) return;
    if (button.dataset.trendPostingAction === 'write') {
      void openTrendTopicInQuickPosting(item);
    } else if (button.dataset.trendPostingAction === 'save') {
      void saveTrendPostingTopic(item, button);
    }
  });
  shoppingTabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = String(btn.dataset.shoppingTab || '');
      activateShoppingTab(tabName, { forceReload: true });
    });
  });

  if (blogTrendsCollectBtn) {
    blogTrendsCollectBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      runBlogTrendsCollect();
    });
  }
  if (blogTrendsRefreshBtn) blogTrendsRefreshBtn.addEventListener('click', () => loadBlogTrends());
  if (blogTrendsSearchBtn) {
    blogTrendsSearchBtn.addEventListener('click', () => {
      setPageInfo('trends', { offset: 0 });
      loadBlogTrends();
    });
  }
  if (blogTrendsQClearBtn) {
    blogTrendsQClearBtn.addEventListener('click', () => {
      if (blogTrendsQFilter) blogTrendsQFilter.value = '';
      setPageInfo('trends', { offset: 0 });
      loadBlogTrends();
      blogTrendsQFilter?.focus();
    });
  }
  if (blogTrendsToTopicsBtn) blogTrendsToTopicsBtn.addEventListener('click', runTrendsToTopics);
  if (blogTrendsQFilter) {
    blogTrendsQFilter.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        setPageInfo('trends', { offset: 0 });
        loadBlogTrends();
      }
    });
  }
  // 날짜 입력창 Enter로 수집을 바로 실행하지 않는다.
  // (중복 호출/오동작 방지)
  if (blogTrendsPrevBtn) {
    blogTrendsPrevBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('trends');
      setPageInfo('trends', { offset: Math.max(0, pageInfo.offset - pageInfo.limit) });
      loadBlogTrends();
    });
  }
  if (blogTrendsNextBtn) {
    blogTrendsNextBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('trends');
      setPageInfo('trends', { offset: Math.max(0, pageInfo.offset + pageInfo.limit) });
      loadBlogTrends();
    });
  }

  if (blogRefreshBtn) blogRefreshBtn.addEventListener('click', loadBlogTopics);
  if (naverCommentDraftSaveBtn) naverCommentDraftSaveBtn.addEventListener('click', saveNaverCommentDraftSettings);
  if (naverCommentDraftRunBtn) naverCommentDraftRunBtn.addEventListener('click', runNaverCommentDraft);
  if (naverCommentDraftListEl) {
    naverCommentDraftListEl.addEventListener('click', async (event) => {
      const copyBtn = event.target.closest('[data-comment-draft-copy]');
      if (copyBtn) {
        const raw = String(copyBtn.getAttribute('data-comment-draft-copy') || '');
        const [cardIndexRaw, draftIndexRaw] = raw.split(':');
        const cardIndex = Number(cardIndexRaw);
        const draftIndex = Number(draftIndexRaw);
        const cardEl = naverCommentDraftListEl.querySelector(`[data-comment-draft-card="${cardIndex}"]`);
        const textEls = Array.from(cardEl?.querySelectorAll('.comment-draft-item-text') || []);
        const text = textEls[draftIndex]?.textContent || '';
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          const original = copyBtn.textContent;
          copyBtn.textContent = '복사됨';
          setTimeout(() => {
            copyBtn.textContent = original || '복사';
          }, 1200);
        } catch (e) {
          showUiPopup(`복사 실패: ${e.message}`);
        }
        return;
      }

      const redraftBtn = event.target.closest('[data-comment-draft-redraft]');
      if (redraftBtn) {
        const itemIndex = Number(redraftBtn.getAttribute('data-comment-draft-redraft'));
        if (Number.isInteger(itemIndex)) {
          await redraftNaverCommentDraft(itemIndex);
        }
      }
    });
  }
  if (blogTopicsQClearBtn) {
    blogTopicsQClearBtn.addEventListener('click', () => {
      if (blogQFilter) blogQFilter.value = '';
      setPageInfo('topics', { offset: 0 });
      loadBlogTopics();
      blogQFilter?.focus();
    });
  }
  if (blogBatchBtn) blogBatchBtn.addEventListener('click', runBlogBatchAction);
  const blogDeleteBatchBtn = document.getElementById('blog-delete-batch-btn');
  if (blogDeleteBatchBtn) {
    blogDeleteBatchBtn.addEventListener('click', async () => {
      const rowIndices = Array.from(blogSelectedRowIndices);
      if (rowIndices.length === 0) {
        showUiPopup('삭제할 글감을 선택해 주세요.');
        return;
      }
      if (!confirm(`선택한 ${rowIndices.length}개의 글감을 삭제하시겠습니까?\n구글 시트에서도 행이 영구 삭제됩니다.`)) {
        return;
      }
      const resultBox = document.getElementById('blog-action-result');
      if (resultBox) resultBox.textContent = '글감 삭제 중...';
      try {
        await postJson('/api/v1/blog/topics/delete', { rowIndices });
        blogSelectedRowIndices.clear();
        updateBlogSelectionUi();
        await loadBlogTopics();
        if (resultBox) resultBox.textContent = `성공: ${rowIndices.length}개의 글감을 삭제했습니다.`;
      } catch (err) {
        if (resultBox) resultBox.textContent = `삭제 실패: ${err.message}`;
        showUiPopup(`삭제 실패: ${err.message}`);
      }
    });
  }
  if (shoppingRefreshBtn) shoppingRefreshBtn.addEventListener('click', loadBlogShopping);
  if (shoppingQClearBtn) {
    shoppingQClearBtn.addEventListener('click', () => {
      if (shoppingQFilter) shoppingQFilter.value = '';
      setPageInfo('shopping', { offset: 0 });
      loadBlogShopping();
      shoppingQFilter?.focus();
    });
  }
  if (shoppingBatchBtn) shoppingBatchBtn.addEventListener('click', runShoppingBatchAction);
  const shoppingDeleteBatchBtn = document.getElementById('shopping-delete-batch-btn');
  if (shoppingDeleteBatchBtn) {
    shoppingDeleteBatchBtn.addEventListener('click', async () => {
      const rowIndices = Array.from(blogShoppingSelectedRowIndices);
      if (rowIndices.length === 0) {
        showUiPopup('삭제할 상품을 선택해 주세요.');
        return;
      }
      if (!confirm(`선택한 ${rowIndices.length}개의 상품을 삭제하시겠습니까?\n구글 시트에서도 행이 영구 삭제됩니다.`)) {
        return;
      }
      const shoppingResultBox = document.getElementById('shopping-action-result');
      if (shoppingResultBox) shoppingResultBox.textContent = '상품 삭제 중...';
      try {
        await postJson('/api/v1/shopping/topics/delete', { rowIndices });
        blogShoppingSelectedRowIndices.clear();
        updateShoppingSelectionUi();
        await loadBlogShopping();
        if (shoppingResultBox) shoppingResultBox.textContent = `성공: ${rowIndices.length}개의 상품을 삭제했습니다.`;
      } catch (err) {
        if (shoppingResultBox) shoppingResultBox.textContent = `삭제 실패: ${err.message}`;
        showUiPopup(`삭제 실패: ${err.message}`);
      }
    });
  }
  if (shoppingStatusFilter) {
    shoppingStatusFilter.addEventListener('change', () => {
      setPageInfo('shopping', { offset: 0 });
      loadBlogShopping();
    });
  }
  if (shoppingQFilter) {
    shoppingQFilter.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        setPageInfo('shopping', { offset: 0 });
        loadBlogShopping();
      }
    });
  }
  if (shoppingPrevBtn) {
    shoppingPrevBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('shopping');
      setPageInfo('shopping', { offset: Math.max(0, pageInfo.offset - pageInfo.limit) });
      loadBlogShopping();
    });
  }
  if (shoppingNextBtn) {
    shoppingNextBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('shopping');
      setPageInfo('shopping', { offset: Math.max(0, pageInfo.offset + pageInfo.limit) });
      loadBlogShopping();
    });
  }
  if (blogStatusFilter) {
    blogStatusFilter.addEventListener('change', () => {
      setPageInfo('topics', { offset: 0 });
      loadBlogTopics();
    });
  }
  if (blogQFilter) {
    blogQFilter.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        setPageInfo('topics', { offset: 0 });
        loadBlogTopics();
      }
    });
  }
  if (blogTopicsPrevBtn) {
    blogTopicsPrevBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('topics');
      setPageInfo('topics', { offset: Math.max(0, pageInfo.offset - pageInfo.limit) });
      loadBlogTopics();
    });
  }
  if (blogTopicsNextBtn) {
    blogTopicsNextBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('topics');
      setPageInfo('topics', { offset: Math.max(0, pageInfo.offset + pageInfo.limit) });
      loadBlogTopics();
    });
  }

  // --- Topic Edit Modal Events ---
  const blogEditCloseBtn = document.getElementById('blog-edit-close-btn');
  const blogEditCancelBtn = document.getElementById('blog-edit-cancel-btn');
  const blogEditSaveBtn = document.getElementById('blog-edit-save-btn');
  const blogEditModalBackdrop = document.getElementById('blog-edit-modal-backdrop');

  if (blogEditCloseBtn) blogEditCloseBtn.onclick = closeBlogTopicEditor;
  if (blogEditCancelBtn) blogEditCancelBtn.onclick = closeBlogTopicEditor;
  if (blogEditSaveBtn) blogEditSaveBtn.onclick = saveBlogTopicModifications;

  // Custom Select Triggers within Modal
  ['modal-blog-category', 'modal-blog-status', 'modal-blog-post-status'].forEach(id => {
    const trigger = document.getElementById(`${id}-trigger`);
    const container = document.getElementById(`${id}-container`);
    if (trigger && container) {
      trigger.onclick = (e) => {
        e.stopPropagation();
        const isOpen = container.classList.contains('open');
        // Close all other custom selects first
        document.querySelectorAll('.custom-select-container.open').forEach(el => {
          if (el !== container) el.classList.remove('open');
        });
        container.classList.toggle('open');
      };
    }

    // Static Modal Option Click handling (for Status, Post Status - Category is dynamic)
    if (id !== 'modal-blog-category') {
      const options = container?.querySelectorAll('.custom-select-option');
      options?.forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = opt.dataset.value;
          const text = opt.textContent;
          const textEl = document.getElementById(`${id}-text`);
          if (textEl) {
            textEl.textContent = text;
            textEl.dataset.value = val;
          }
          container.classList.remove('open');
        });
      });
    }
  });

  // Table Double Click Editing
  if (blogTopicsTableBody) {
    blogTopicsTableBody.addEventListener('dblclick', (e) => {
      const td = e.target.closest('td.editable-cell');
      if (!td) return;
      const row = td.closest('tr[data-row-index]');
      if (!row) return;
      const rowIndex = Number(row.dataset.rowIndex);
      if (Number.isInteger(rowIndex)) {
        openBlogTopicEditor(rowIndex);
      }
    });

  }

  // Modal Backdrop Click to Close
  if (blogEditModalBackdrop) {
    blogEditModalBackdrop.onclick = (e) => {
      if (e.target === blogEditModalBackdrop) closeBlogTopicEditor();
    };
  }

  // Select All Header Checkbox Listeners
  const trendsSelectAll = document.getElementById('blog-trends-table-select-all');
  if (trendsSelectAll) {
    trendsSelectAll.addEventListener('change', () => {
      const checked = trendsSelectAll.checked;
      const selectors = Array.from(document.querySelectorAll('input.trend-row-selector'));
      selectors.forEach(s => {
        s.checked = checked;
        const rowIndex = Number(s.value);
        if (checked) blogTrendsSelectedRowIndices.add(rowIndex);
        else blogTrendsSelectedRowIndices.delete(rowIndex);
      });
      updateTrendsSelectionUi();
    });
  }

  const blogSelectAll = document.getElementById('blog-table-select-all');
  if (blogSelectAll) {
    blogSelectAll.addEventListener('change', () => {
      const checked = blogSelectAll.checked;
      const selectors = Array.from(document.querySelectorAll('input.row-selector'));
      selectors.forEach(s => {
        s.checked = checked;
        const rowIndex = Number(s.value);
        if (checked) blogSelectedRowIndices.add(rowIndex);
        else blogSelectedRowIndices.delete(rowIndex);
      });
      updateBlogSelectionUi();
    });
  }

  const shoppingSelectAll = document.getElementById('shopping-table-select-all');
  if (shoppingSelectAll) {
    shoppingSelectAll.addEventListener('change', () => {
      const checked = shoppingSelectAll.checked;
      const selectors = Array.from(document.querySelectorAll('input.shopping-row-selector'));
      selectors.forEach(s => {
        s.checked = checked;
        const rowIndex = Number(s.value);
        if (checked) blogShoppingSelectedRowIndices.add(rowIndex);
        else blogShoppingSelectedRowIndices.delete(rowIndex);
      });
      updateShoppingSelectionUi();
    });
  }

  if (blogTrendsTableBody) {
    blogTrendsTableBody.addEventListener('change', (e) => {
      const selector = e.target?.closest('input.trend-row-selector');
      if (!selector) return;
      const rowIndex = Number(selector.value);
      if (!Number.isInteger(rowIndex) || !findTrendByRowIndex(rowIndex)) return;
      if (selector.checked) {
        blogTrendsSelectedRowIndices.add(rowIndex);
      } else {
        blogTrendsSelectedRowIndices.delete(rowIndex);
      }
      updateTrendsSelectionUi();
    });
  }

  if (blogTopicsTableBody) {
    blogTopicsTableBody.addEventListener('change', async (e) => {
      const selector = e.target?.closest('input.row-selector');
      if (selector) {
        const rowIndex = Number(selector.value);
        if (!Number.isInteger(rowIndex)) return;
        if (selector.checked) {
          blogSelectedRowIndices.add(rowIndex);
        } else {
          blogSelectedRowIndices.delete(rowIndex);
        }
        updateBlogSelectionUi();
        return;
      }

      const toggle = e.target?.closest('input.inline-toggle');
      if (toggle) {
        const rowIndex = Number(toggle.dataset.rowIndex);
        const field = String(toggle.dataset.field || '');
        if (!Number.isInteger(rowIndex) || !['imageGeneration', 'externalReference'].includes(field)) return;
        const patch = {};
        patch[field] = Boolean(toggle.checked);
        try {
          await saveBlogRowPatch(rowIndex, patch, { silent: true });
        } catch (err) {
          toggle.checked = !toggle.checked;
          const resultBox = document.getElementById('blog-action-result');
          if (resultBox) resultBox.textContent = `오류: ${err.message}`;
        }
      }

      const imageModeSelect = e.target?.closest('select.inline-image-mode');
      if (imageModeSelect) {
        const rowIndex = Number(imageModeSelect.dataset.rowIndex);
        if (!Number.isInteger(rowIndex)) return;
        const previous = normalizeBlogTopicImageMode(findTopicByRowIndex(rowIndex));
        try {
          await saveBlogRowPatch(rowIndex, { imageMode: imageModeSelect.value }, { silent: true });
        } catch (err) {
          imageModeSelect.value = previous;
          const resultBox = document.getElementById('blog-action-result');
          if (resultBox) resultBox.textContent = `오류: ${err.message}`;
        }
      }
    });

    blogTopicsTableBody.addEventListener('click', (e) => {
      if (e.target?.closest('.inline-editor')) return;
      const cell = e.target?.closest('td.editable-cell');
      if (!cell) return;
      startBlogInlineEdit(cell);
    });
  }

  if (shoppingTableBody) {
    shoppingTableBody.addEventListener('change', (e) => {
      const selector = e.target?.closest('input.shopping-row-selector');
      if (!selector) return;
      const rowIndex = Number(selector.value);
      if (!Number.isInteger(rowIndex) || !findShoppingByRowIndex(rowIndex)) return;
      if (selector.checked) {
        blogShoppingSelectedRowIndices.add(rowIndex);
      } else {
        blogShoppingSelectedRowIndices.delete(rowIndex);
      }
      updateShoppingSelectionUi();
    });

    shoppingTableBody.addEventListener('dblclick', (e) => {
      if (e.target?.closest('input[type="checkbox"]')) return;
      const tr = e.target?.closest('tr[data-row-index]');
      if (!tr) return;
      const rowIndex = Number(tr.dataset.rowIndex);
      if (Number.isInteger(rowIndex)) openShoppingEditor(rowIndex);
    });
  }

  // Shopping Edit Modal
  const shoppingEditCloseBtn = document.getElementById('shopping-edit-close-btn');
  const shoppingEditCancelBtn = document.getElementById('shopping-edit-cancel-btn');
  const shoppingEditSaveBtn = document.getElementById('shopping-edit-save-btn');
  const shoppingEditModalBackdrop = document.getElementById('shopping-edit-modal-backdrop');

  if (shoppingEditCloseBtn) shoppingEditCloseBtn.onclick = closeShoppingEditor;
  if (shoppingEditCancelBtn) shoppingEditCancelBtn.onclick = closeShoppingEditor;
  if (shoppingEditSaveBtn) shoppingEditSaveBtn.onclick = saveShoppingModifications;
  if (shoppingEditModalBackdrop) {
    shoppingEditModalBackdrop.addEventListener('click', (e) => {
      if (e.target === shoppingEditModalBackdrop) closeShoppingEditor();
    });
  }

  // Custom Select Triggers within Shopping Modal
  ['modal-shopping-post-status', 'modal-shopping-status'].forEach(id => {
    const trigger = document.getElementById(`${id}-trigger`);
    const container = document.getElementById(`${id}-container`);
    if (trigger && container) {
      trigger.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.custom-select-container.open').forEach(el => {
          if (el !== container) el.classList.remove('open');
        });
        container.classList.toggle('open');
      };
      const options = container.querySelectorAll('.custom-select-option');
      options.forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = opt.dataset.value;
          const text = opt.textContent;
          const textEl = document.getElementById(`${id}-text`);
          if (textEl) { textEl.textContent = text; textEl.dataset.value = val; }
          container.classList.remove('open');
        });
      });
    }
  });

  sortableHeaders.forEach((th) => {
    const onSort = () => {
      const tableName = String(th.dataset.sortTable || '').trim();
      const key = String(th.dataset.sortKey || '').trim();
      if (!tableName || !key) return;
      toggleTableSort(tableName, key);
    };
    th.addEventListener('click', onSort);
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSort();
      }
    });
  });

  const settingsMajorRefreshBtns = document.querySelectorAll('.settings-major-refresh-btn');
  const settingsMajorSaveBtns = document.querySelectorAll('.settings-major-save-btn');
  const settingsNaverLoginBtn = document.getElementById('settings-naver-login-btn');
  const settingsNaverLogoutBtn = document.getElementById('settings-naver-logout-btn');
  const settingsOpenGoogleSheetBtn = document.getElementById('settings-open-google-sheet-btn');
  const settingsGoogleOauthConnectBtn = document.getElementById('settings-google-oauth-connect-btn');
  const settingsGoogleOauthDisconnectBtn = document.getElementById('settings-google-oauth-disconnect-btn');
  const settingsGoogleOauthTestBtn = document.getElementById('settings-google-oauth-test-btn');
  const settingsTypingSpeedEl = document.getElementById('settings-typing-speed');
  const blogCollectRefreshBtn = document.getElementById('blog-collect-trends-refresh-btn');
  const blogCollectTrendsRunBtn = document.getElementById('blog-collect-trends-run-btn');
  const blogCollectRssRunBtn = document.getElementById('blog-collect-rss-run-btn');
  const blogCollectRssAddBtn = document.getElementById('blog-collect-rss-add-btn');
  const blogAutoRefreshBtn = document.getElementById('blog-publish-auto-refresh-btn');
  const blogAutoSaveBtn = document.getElementById('blog-publish-auto-save-btn');
  const blogAutoCategoryOptionsEls = Array.from(document.querySelectorAll('[data-blog-category-options]'));
  const blogAutoVariationNumberEnabledEl = document.getElementById('blog-collect-trends-filter-number-enabled');
  const blogAutoVariationNumberInputEl = document.getElementById('blog-collect-trends-filter-min');
  const blogAutoVariationTypeEl = document.getElementById('blog-collect-trends-filter-type');
  const blogAutoRunBtn = document.getElementById('blog-publish-auto-run-btn');
  const shoppingAutoRefreshBtn = document.getElementById('shopping-auto-refresh-btn');
  const shoppingAutoSaveBtn = document.getElementById('shopping-auto-save-btn');
  const shoppingAutoRunBtn = document.getElementById('shopping-publish-auto-run-btn');
  const shoppingAutoDailyPostsInputEl = document.getElementById('shopping-auto-daily-posts');
  const settingsTypingPreviewInputEl = document.getElementById('settings-typing-preview-input');
  const settingsTypingPreviewReplayBtn = document.getElementById('settings-typing-preview-replay');
  const settingsTabButtons = Array.from(document.querySelectorAll('.settings-tab-btn[data-settings-tab]'));
  const settingsMajorAutoSaveInputs = [
    document.getElementById('settings-listen-port'),
    document.getElementById('settings-mcp-remote-port'),
    document.getElementById('settings-mcp-remote-path'),
    document.getElementById('settings-mcp-remote-auth-token-display'),
    document.getElementById('settings-naver-id'),
    document.getElementById('settings-wordpress-url'),
    document.getElementById('settings-wordpress-user-id'),
    document.getElementById('settings-wordpress-app-password'),
    document.getElementById('settings-google-sheet-url'),
    document.getElementById('settings-update-mirror-repo'),
    document.getElementById('settings-custom-update-check-url'),
    document.getElementById('settings-text-model-name'),
    document.getElementById('settings-text-model-base-url'),
    document.getElementById('settings-text-model-api-key'),
    document.getElementById('settings-image-model-name'),
    document.getElementById('settings-image-model-base-url'),
    document.getElementById('settings-image-model-api-key'),
    document.getElementById('settings-chat-model-name'),
    document.getElementById('settings-chat-model-base-url'),
    document.getElementById('settings-chat-model-api-key'),
    document.getElementById('blog-collect-trends-time'),
    document.getElementById('blog-collect-trends-filter-min'),
    document.getElementById('blog-collect-trends-filter-top'),
    document.getElementById('blog-collect-trends-reuse-gap'),
    document.getElementById('blog-collect-trends-naver-category'),
    document.getElementById('blog-collect-trends-wordpress-category'),
    document.getElementById('blog-publish-auto-interval'),
    document.getElementById('blog-publish-auto-batch'),
    document.getElementById('blog-publish-auto-start-time'),
    document.getElementById('blog-publish-auto-end-time'),
    document.getElementById('shopping-publish-auto-interval'),
    document.getElementById('shopping-publish-auto-batch'),
    document.getElementById('shopping-publish-auto-start-time'),
    document.getElementById('shopping-publish-auto-end-time'),
    document.getElementById('settings-notify-telegram-bot-token'),
    document.getElementById('settings-notify-telegram-chat-id'),
    document.getElementById('settings-notify-bitly-token'),
    document.getElementById('settings-notify-slack-webhook-url'),
    document.getElementById('settings-buffer-api-key'),
    document.getElementById('settings-sns-publish-interval'),
  ].filter(Boolean);
  const settingsMajorAutoSaveSelects = [
    document.getElementById('settings-listen-host'),
    document.getElementById('settings-update-server-type'),
    document.getElementById('settings-text-model-preset-provider'),
    document.getElementById('settings-text-model-preset-code'),
    document.getElementById('settings-image-model-preset-provider'),
    document.getElementById('settings-image-model-preset-code'),
    document.getElementById('settings-chat-model-preset-provider'),
    document.getElementById('settings-chat-model-preset-code'),
    document.getElementById('settings-mcp-remote-host'),
    document.getElementById('settings-sns-ai-mode'),
    document.getElementById('settings-typing-speed'),
    document.getElementById('blog-publish-auto-post-status'),
    document.getElementById('blog-publish-auto-image-mode'),
    document.getElementById('blog-collect-trends-filter-type')
  ].filter(Boolean);
  const settingsMajorAutoSaveChecks = [
    document.getElementById('settings-mcp-remote-enabled'),
    document.getElementById('settings-image-optimization'),
    document.getElementById('blog-collect-trends-enabled'),
    document.getElementById('blog-collect-trends-filter-new'),
    document.getElementById('blog-collect-trends-filter-dash'),
    document.getElementById('blog-collect-trends-filter-number-enabled'),
    document.getElementById('blog-publish-auto-enabled'),
    document.getElementById('blog-publish-auto-headless'),
    document.getElementById('shopping-publish-auto-enabled'),
    document.getElementById('shopping-publish-auto-headless'),
    document.getElementById('blog-publish-auto-notify-enabled'),
    document.getElementById('shopping-publish-auto-notify-enabled'),
    document.getElementById('settings-notify-telegram-enabled'),
    document.getElementById('settings-notify-slack-enabled'),
    document.getElementById('settings-sns-publish-enabled'),
    document.getElementById('settings-sns-source-naver'),
    document.getElementById('settings-sns-source-wordpress'),
    ...Array.from(document.querySelectorAll('input[name="settings-chat-model-source"]')),
    ...Array.from(document.querySelectorAll('[data-publish-target]')),
    ...Array.from(document.querySelectorAll('[data-shopping-publish-target]'))
  ].filter(Boolean);

  settingsMajorRefreshBtns.forEach(btn => btn.addEventListener('click', () => loadSettingsMajor({ force: true })));
  settingsMajorSaveBtns.forEach(btn => btn.addEventListener('click', () => saveSettingsMajor({ mode: 'manual' })));
  [
    document.getElementById('settings-notify-telegram-enabled'),
    document.getElementById('settings-notify-telegram-bot-token'),
    document.getElementById('settings-notify-telegram-chat-id'),
    document.getElementById('settings-mcp-remote-enabled'),
    document.getElementById('settings-mcp-remote-host'),
    document.getElementById('settings-mcp-remote-port'),
    document.getElementById('settings-mcp-remote-path'),
    document.getElementById('settings-mcp-remote-auth-token-display'),
    document.getElementById('settings-update-server-type'),
    document.getElementById('settings-text-model-preset-provider'),
    document.getElementById('settings-text-model-preset-code'),
    document.getElementById('settings-image-model-preset-provider'),
    document.getElementById('settings-image-model-preset-code'),
    document.getElementById('settings-chat-model-preset-provider'),
    document.getElementById('settings-chat-model-preset-code'),
    ...Array.from(document.querySelectorAll('input[name="settings-chat-model-source"]'))
  ].filter(Boolean).forEach((el) => {
    const eventName = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(eventName, () => {
      if (el.id === 'settings-text-model-preset-provider') {
        handleSettingsAiProviderChange('text');
      } else if (el.id === 'settings-text-model-preset-code') {
        captureSettingsAiModelDesiredState('text');
      }
      if (el.id === 'settings-image-model-preset-provider') {
        handleSettingsAiProviderChange('image');
      } else if (el.id === 'settings-image-model-preset-code') {
        captureSettingsAiModelDesiredState('image');
      }
      if (el.id === 'settings-chat-model-preset-provider') {
        handleSettingsAiProviderChange('chat');
      } else if (el.id === 'settings-chat-model-preset-code') {
        captureSettingsAiModelDesiredState('chat');
      }
      syncSettingsTelegramUi();
      syncSettingsMcpUi();
      syncSettingsUpdateSourceUi();
      syncSettingsAiModelUi('text');
      syncSettingsAiModelUi('image');
      syncSettingsChatModelUi();
      if (el.name === 'settings-chat-model-source') resetSettingsAiModelTestResult('chat');
    });
  });
  const settingsMcpRemoteAuthTokenDisplay = document.getElementById('settings-mcp-remote-auth-token-display');
  if (settingsMcpRemoteAuthTokenDisplay) {
    settingsMcpRemoteAuthTokenDisplay.addEventListener('input', () => {
      if (!settingsMcpTokenVisible) return;
      setSettingsMcpTokenValue(settingsMcpRemoteAuthTokenDisplay.value, { visible: true });
      refreshSettingsMajorPendingState();
    });
  }
  const settingsMcpRemoteAuthToggleBtn = document.getElementById('settings-mcp-remote-auth-toggle-btn');
  if (settingsMcpRemoteAuthToggleBtn) {
    settingsMcpRemoteAuthToggleBtn.addEventListener('click', toggleSettingsMcpTokenVisibility);
  }
  const settingsMcpRemoteAuthCopyBtn = document.getElementById('settings-mcp-remote-auth-copy-btn');
  if (settingsMcpRemoteAuthCopyBtn) {
    settingsMcpRemoteAuthCopyBtn.addEventListener('click', copySettingsMcpToken);
  }
  const settingsMcpRemoteAuthRegenerateBtn = document.getElementById('settings-mcp-remote-auth-regenerate-btn');
  if (settingsMcpRemoteAuthRegenerateBtn) {
    settingsMcpRemoteAuthRegenerateBtn.addEventListener('click', regenerateSettingsMcpToken);
  }
  if (settingsNaverLoginBtn) settingsNaverLoginBtn.addEventListener('click', startNaverLoginFromUi);
  if (settingsNaverLogoutBtn) settingsNaverLogoutBtn.addEventListener('click', logoutNaverFromUi);
  const settingsWordPressVerifyBtn = document.getElementById('settings-wordpress-verify-btn');
  if (settingsWordPressVerifyBtn) settingsWordPressVerifyBtn.addEventListener('click', verifyWordPressAuthFromUi);
  const settingsBufferConnectBtn = document.getElementById('settings-buffer-connect-btn');
  const settingsBufferOrganizationEl = document.getElementById('settings-buffer-organization');
  if (settingsBufferConnectBtn) {
    settingsBufferConnectBtn.addEventListener('click', () => {
      inspectSettingsBufferConnection(settingsBufferOrganizationEl?.value || '');
    });
  }
  if (settingsBufferOrganizationEl) {
    settingsBufferOrganizationEl.addEventListener('change', () => {
      settingsBufferChannels = [];
      settingsBufferSelectedChannelIds = new Set();
      renderSettingsBufferChannels();
      inspectSettingsBufferConnection(settingsBufferOrganizationEl.value);
    });
  }
  const settingsSnsCheckNowBtn = document.getElementById('settings-sns-check-now-btn');
  if (settingsSnsCheckNowBtn) {
    settingsSnsCheckNowBtn.addEventListener('click', runSettingsSnsCheckNow);
  }
  const settingsSnsPublishNowBtn = document.getElementById('settings-sns-publish-now-btn');
  if (settingsSnsPublishNowBtn) {
    settingsSnsPublishNowBtn.addEventListener('click', runSettingsSnsPublishNow);
  }
  const settingsSnsAiModeEl = document.getElementById('settings-sns-ai-mode');
  if (settingsSnsAiModeEl) {
    settingsSnsAiModeEl.addEventListener('change', syncSettingsSnsAiHint);
  }
  [
    document.getElementById('settings-text-model-preset-code'),
    document.getElementById('settings-text-model-name'),
    document.getElementById('settings-text-model-api-key'),
    document.getElementById('settings-chat-model-preset-code'),
    document.getElementById('settings-chat-model-name')
  ].filter(Boolean).forEach((element) => {
    element.addEventListener('input', syncSettingsSnsAiHint);
    element.addEventListener('change', syncSettingsSnsAiHint);
  });
  if (settingsOpenGoogleSheetBtn) settingsOpenGoogleSheetBtn.addEventListener('click', openGoogleSheetFromUi);
  if (settingsGoogleOauthConnectBtn) settingsGoogleOauthConnectBtn.addEventListener('click', startGoogleOauth);
  if (settingsGoogleOauthDisconnectBtn) settingsGoogleOauthDisconnectBtn.addEventListener('click', disconnectGoogleOauth);
  if (settingsGoogleOauthTestBtn) settingsGoogleOauthTestBtn.addEventListener('click', testGoogleOauth);
  if (settingsTypingSpeedEl) settingsTypingSpeedEl.addEventListener('change', playSettingsTypingPreview);
  if (blogCollectRefreshBtn) blogCollectRefreshBtn.addEventListener('click', () => loadBlogCollectSettings({ force: true }));
  if (blogCollectTrendsRunBtn) blogCollectTrendsRunBtn.addEventListener('click', runBlogCollectTrendsManual);
  if (blogCollectRssRunBtn) blogCollectRssRunBtn.addEventListener('click', runBlogCollectRssManual);
  if (blogCollectRssAddBtn) blogCollectRssAddBtn.addEventListener('click', window.addRssConfig);
  if (blogAutoRefreshBtn) blogAutoRefreshBtn.addEventListener('click', () => loadBlogAutoSettings({ force: true }));
  if (blogAutoSaveBtn) blogAutoSaveBtn.addEventListener('click', saveBlogAutoSettings);
  if (blogAutoRunBtn) blogAutoRunBtn.addEventListener('click', runBlogPublishAutoManual);
  if (blogAutoVariationNumberEnabledEl) {
    blogAutoVariationNumberEnabledEl.addEventListener('change', syncBlogAutoVariationNumberUi);
  }
  if (blogAutoVariationTypeEl) {
    blogAutoVariationTypeEl.addEventListener('change', syncBlogAutoVariationTypeUi);
  }
  if (shoppingAutoRefreshBtn) shoppingAutoRefreshBtn.addEventListener('click', () => loadShoppingAutoSettings({ force: true }));
  if (shoppingAutoSaveBtn) shoppingAutoSaveBtn.addEventListener('click', saveShoppingAutoSettings);
  if (shoppingAutoRunBtn) shoppingAutoRunBtn.addEventListener('click', runShoppingAutoManual);
  blogAutoCategoryOptionsEls.forEach((containerEl) => {
    containerEl.addEventListener('click', (e) => {
      const btn = e.target?.closest('button[data-blog-collect-trends-category-toggle]');
      if (!btn) return;
      const category = normalizeCategoryToken(btn.dataset.blogCollectTrendsCategoryToggle || '');
      if (!category) return;
      if (blogAutoCategorySelected.has(category)) blogAutoCategorySelected.delete(category);
      else blogAutoCategorySelected.add(category);
      renderBlogAutoCategoryUi();
      scheduleSettingsMajorAutoSave({ immediate: true });
    });
  });
  if (blogAutoVariationNumberInputEl) {
    blogAutoVariationNumberInputEl.addEventListener('blur', () => {
      const normalized = normalizeBlogAutoVariationNumberValue(blogAutoVariationNumberInputEl.value, 50);
      blogAutoVariationNumberInputEl.value = normalized === '' ? '' : String(normalized);
    });
  }
  if (blogAutoVariationNumberEnabledEl) {
    blogAutoVariationNumberEnabledEl.addEventListener('change', () => {
      syncBlogAutoVariationNumberUi();
    });
  }
  if (shoppingAutoDailyPostsInputEl) {
    shoppingAutoDailyPostsInputEl.addEventListener('input', () => {
      clampShoppingAutoDailyPostsInputValue({ force: false });
    });
    shoppingAutoDailyPostsInputEl.addEventListener('blur', () => {
      clampShoppingAutoDailyPostsInputValue({ force: true });
    });
  }
  const settingsNotifyTelegramTestBtn = document.getElementById('settings-notify-telegram-test-btn');
  if (settingsNotifyTelegramTestBtn) {
    settingsNotifyTelegramTestBtn.addEventListener('click', async () => {
      const botToken = getSettingsInputValue('settings-notify-telegram-bot-token').trim();
      const chatId = (document.getElementById('settings-notify-telegram-chat-id')?.value || '').trim();
      const resultEl = document.getElementById('settings-notify-telegram-test-result');

      if (!botToken || !chatId) {
        if (resultEl) {
          resultEl.textContent = '❌ 봇 토큰과 챗 ID를 입력해주세요.';
          resultEl.style.color = 'var(--danger)';
        }
        return;
      }

      settingsNotifyTelegramTestBtn.disabled = true;
      if (resultEl) {
        resultEl.textContent = '⏳ 테스트 중...';
        resultEl.style.color = 'var(--text-muted)';
      }

      try {
        const res = await postJson('/api/v1/settings/test-telegram', { botToken, chatId });
        if (resultEl) {
          resultEl.textContent = '✅ 성공! 텔레그램 메시지를 확인하세요.';
          resultEl.style.color = 'var(--success)';
        }
      } catch (e) {
        if (resultEl) {
          resultEl.textContent = '❌ 실패: ' + e.message;
          resultEl.style.color = 'var(--danger)';
        }
      } finally {
        settingsNotifyTelegramTestBtn.disabled = false;
      }
    });
  }

  ['text', 'image', 'chat'].forEach((kind) => {
    const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
    const testButtonEl = document.getElementById(`settings-${prefix}-model-test-btn`);
    if (testButtonEl) {
      testButtonEl.addEventListener('click', () => runSettingsAiModelTest(kind));
    }
    [
      document.getElementById(`settings-${prefix}-model-preset-provider`),
      document.getElementById(`settings-${prefix}-model-preset-code`),
      document.getElementById(`settings-${prefix}-model-name`),
      document.getElementById(`settings-${prefix}-model-base-url`),
      document.getElementById(`settings-${prefix}-model-api-key`)
    ].filter(Boolean).forEach((element) => {
      element.addEventListener('input', () => {
        resetSettingsAiModelTestResult(kind);
        if (kind === 'text' && getSelectedSettingsRadioValue('settings-chat-model-source', 'writing') === 'writing') {
          resetSettingsAiModelTestResult('chat');
        }
      });
      element.addEventListener('change', () => {
        resetSettingsAiModelTestResult(kind);
        if (kind === 'text' && getSelectedSettingsRadioValue('settings-chat-model-source', 'writing') === 'writing') {
          resetSettingsAiModelTestResult('chat');
        }
      });
    });
  });

  const settingsNotifySlackTestBtn = document.getElementById('settings-notify-slack-test-btn');
  if (settingsNotifySlackTestBtn) {
    settingsNotifySlackTestBtn.addEventListener('click', async () => {
      const webhookUrl = getSettingsInputValue('settings-notify-slack-webhook-url').trim();
      const resultEl = document.getElementById('settings-notify-slack-test-result');

      if (!webhookUrl) {
        if (resultEl) {
          resultEl.textContent = '❌ Webhook URL을 입력해주세요.';
          resultEl.style.color = 'var(--danger)';
        }
        return;
      }

      settingsNotifySlackTestBtn.disabled = true;
      if (resultEl) {
        resultEl.textContent = '⏳ 테스트 중...';
        resultEl.style.color = 'var(--text-muted)';
      }

      try {
        const res = await postJson('/api/v1/settings/test-slack', { webhookUrl });
        if (resultEl) {
          resultEl.textContent = '✅ 성공! Slack 채널을 확인하세요.';
          resultEl.style.color = 'var(--success)';
        }
      } catch (e) {
        if (resultEl) {
          resultEl.textContent = '❌ 실패: ' + e.message;
          resultEl.style.color = 'var(--danger)';
        }
      } finally {
        settingsNotifySlackTestBtn.disabled = false;
      }
    });
  }
  if (settingsTypingPreviewReplayBtn) settingsTypingPreviewReplayBtn.addEventListener('click', playSettingsTypingPreview);
  if (settingsTypingPreviewInputEl) {
    settingsTypingPreviewInputEl.placeholder = SETTINGS_TYPING_PREVIEW_DEFAULT_TEXT;
    settingsTypingPreviewInputEl.addEventListener('input', () => {
      setSettingsTypingPreviewMeta('문구가 변경되었습니다. [다시 재생]을 누르거나 입력창을 벗어나면 재생됩니다.');
    });
    settingsTypingPreviewInputEl.addEventListener('blur', () => {
      playSettingsTypingPreview();
    });
  }
  settingsTabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activateSettingsTab(btn.dataset.settingsTab, { forceReload: true });
    });
  });
  settingsMajorAutoSaveInputs.forEach((inputEl) => {
    inputEl.addEventListener('input', () => scheduleSettingsMajorAutoSave());
    inputEl.addEventListener('blur', () => scheduleSettingsMajorAutoSave({ immediate: true }));
    // type="time" 필드는 change 이벤트가 더 확실하게 저장 트리거임
    if (inputEl.type === 'time') {
      inputEl.addEventListener('change', () => scheduleSettingsMajorAutoSave({ immediate: true }));
    }
  });
  settingsMajorAutoSaveSelects.forEach((selectEl) => {
    selectEl.addEventListener('change', () => scheduleSettingsMajorAutoSave({ immediate: true }));
  });
  settingsMajorAutoSaveChecks.forEach((checkEl) => {
    checkEl.addEventListener('change', () => {
      if (checkEl.name === 'settings-chat-model-source') {
        syncSettingsChatModelUi();
      }
      scheduleSettingsMajorAutoSave({ immediate: true });
    });
  });
  SETTINGS_SHOPPING_SLOT_ORDER.forEach((slot) => {
    const fileInput = document.getElementById(`settings-image-file-${slot}`);
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (file) {
          settingsShoppingImageFileState[slot] = file;
        } else {
          clearStagedSettingsShoppingImage(slot);
        }
        renderSettingsShoppingImageSlot(slot);
        scheduleSettingsMajorAutoSave({ immediate: true });
      });
    }

    const resetBtn = document.getElementById(`settings-image-reset-${slot}`);
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        restoreSettingsShoppingDefault(slot);
        scheduleSettingsMajorAutoSave({ immediate: true });
      });
    }

    const clearBtn = document.getElementById(`settings-image-clear-${slot}`);
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        clearSettingsShoppingOptional(slot);
        scheduleSettingsMajorAutoSave({ immediate: true });
      });
    }
  });
}
