async function loadBlogCollectSettings({ force = false, skipPendingConfirm = false } = {}) {
  const canReload = await shouldProceedWithMajorSettingsReload({
    force,
    skipPendingConfirm,
    contextLabel: '블로그 자동글감 설정'
  });
  if (!canReload) return false;

  const modeEl = document.getElementById('blog-collect-trends-enabled');
  const trendsTimeEl = document.getElementById('blog-collect-trends-time');
  const variationNewEl = document.getElementById('blog-collect-trends-filter-new');
  const variationDashEl = document.getElementById('blog-collect-trends-filter-dash');
  const variationNumberEnabledEl = document.getElementById('blog-collect-trends-filter-number-enabled');
  const variationMinEl = document.getElementById('blog-collect-trends-filter-min');
  const variationTopEl = document.getElementById('blog-collect-trends-filter-top');
  const keywordReuseGapEl = document.getElementById('blog-collect-trends-reuse-gap');
  setBlogCollectResultText('불러오는 중...');
  try {
    const [data] = await Promise.all([
      fetchJson('/api/v1/settings/major'),
      loadBlogAutoCategoryCatalog({ silent: true })
    ]);
    const fields = data?.fields || {};
    if (modeEl) modeEl.checked = Boolean(fields.COLLECT_TRENDS_ENABLED);
    setSelectedBlogAutoCategories(fields.COLLECT_TRENDS_CATEGORIES || '');
    renderBlogAutoCategoryUi();

    const catVal = String(fields.COLLECT_TRENDS_WP_CATEGORY || '');
    const triggerText = document.getElementById('blog-collect-trends-wp-category-text');
    if (triggerText) {
      triggerText.textContent = catVal || '카테고리 선택 (미지정 시 기본)';
    }
    localStorage.setItem('blog_collect_trends_wp_category_value', catVal);
    localStorage.setItem('blog_collect_trends_wp_category_name', catVal || '카테고리 선택 (미지정 시 기본)');

    // Async Init
    initWpCategorySelector({
      optionsContainerId: 'blog-collect-trends-wp-category-options',
      triggerTextId: 'blog-collect-trends-wp-category-text',
      containerId: 'blog-collect-trends-wp-category-container',
      storagePrefix: 'blog_collect_trends_',
      initialValue: fields.COLLECT_TRENDS_WP_CATEGORY || '',
      initialText: fields.COLLECT_TRENDS_WP_CATEGORY || '카테고리 선택 (또는 직접 입력)',
      onValueChange: (val) => {
        scheduleSettingsMajorAutoSave({ immediate: true });
      }
    });


    if (trendsTimeEl) trendsTimeEl.value = String(fields.COLLECT_TRENDS_TIME || '07:30');

    if (variationNewEl) variationNewEl.checked = Boolean(fields.COLLECT_TRENDS_FILTER_INCLUDE_NEW);
    if (variationDashEl) variationDashEl.checked = Boolean(fields.COLLECT_TRENDS_FILTER_INCLUDE_DASH);
    const variationTypeEl = document.getElementById('blog-collect-trends-filter-type');
    if (variationNumberEnabledEl) {
      variationNumberEnabledEl.checked = Boolean(fields.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER);
    }
    if (variationTypeEl) {
      variationTypeEl.value = String(fields.COLLECT_TRENDS_FILTER_TYPE || 'min');
    }
    if (variationMinEl) {
      const val = normalizeBlogAutoVariationNumberValue(fields.COLLECT_TRENDS_FILTER_MIN_INCR, 50);
      variationMinEl.value = val === '' ? '' : String(val);
    }
    if (variationTopEl) {
      const val = normalizeBlogAutoVariationNumberValue(fields.COLLECT_TRENDS_FILTER_TOP_N, 5);
      variationTopEl.value = val === '' ? '' : String(val);
    }
    syncBlogAutoVariationTypeUi();
    syncBlogAutoVariationNumberUi();
    if (keywordReuseGapEl) {
      keywordReuseGapEl.value = String(fields.COLLECT_TRENDS_REUSE_GAP_DAYS || 15);
    }

    const rssGlobalEnabledEl = document.getElementById('blog-collect-rss-enabled');
    if (rssGlobalEnabledEl) rssGlobalEnabledEl.checked = Boolean(fields.COLLECT_RSS_ENABLED ?? false);

    let rssArr = [];
    try { rssArr = typeof fields.COLLECT_RSS_CONFIGS === 'string' ? JSON.parse(fields.COLLECT_RSS_CONFIGS) : fields.COLLECT_RSS_CONFIGS; } catch (e) { }
    renderBlogCollectRssUi(rssArr);

    setBlogCollectResultText([
      '불러오기 완료',
      '- 수집 기준을 확인했습니다.',
      '- 변경 후 상단의 저장 및 적용 버튼으로 반영할 수 있습니다.'
    ].join('\n'));
    return true;
  } catch (e) {
    setBlogCollectResultText(`오류: ${e.message}`);
    return false;
  }
}

async function saveBlogCollectSettings() {
  setBlogCollectResultText('저장 중...');
  try {
    const major = await fetchJson('/api/v1/settings/major');
    const fields = { ...(major?.fields || {}) };

    const uiSettings = getBlogAutoSettingsFromUi();

    const payload = {
      ...fields,
      ...uiSettings,
      COLLECT_RSS_ENABLED: Boolean(document.getElementById('blog-collect-rss-enabled')?.checked),
      COLLECT_RSS_CONFIGS: JSON.stringify(currentRssConfigs)
    };
    await postJson('/api/v1/settings/major', payload);

    setBlogCollectResultText([
      '저장 완료',
      '- 자동수집 설정이 반영되었습니다.',
      '- 수동 실행으로 즉시 동작을 검증할 수 있습니다.'
    ].join('\n'));
  } catch (e) {
    setBlogCollectResultText(`오류: ${e.message}`);
  }
}

async function loadBlogAutoSettings({ force = false, skipPendingConfirm = false } = {}) {
  const canReload = await shouldProceedWithMajorSettingsReload({
    force,
    skipPendingConfirm,
    contextLabel: '블로그 자동 포스팅 설정'
  });
  if (!canReload) return false;

  const publishEnabledEl = document.getElementById('blog-publish-auto-enabled');
  const publishIntervalEl = document.getElementById('blog-publish-auto-interval');
  const publishBatchEl = document.getElementById('blog-publish-auto-batch');
  const postStatusEl = document.getElementById('blog-publish-auto-post-status');
  const imageModeEl = document.getElementById('blog-publish-auto-image-mode');
  const headlessEl = document.getElementById('blog-publish-auto-headless');

  setBlogAutoResultText('불러오는 중...');
  try {
    const data = await fetchJson('/api/v1/settings/major');
    const fields = data?.fields || {};

    if (publishEnabledEl) publishEnabledEl.checked = Boolean(fields.PUBLISH_AUTO_ENABLED);
    if (publishIntervalEl) publishIntervalEl.value = String(fields.PUBLISH_AUTO_INTERVAL_MIN || 60);
    if (publishBatchEl) publishBatchEl.value = String(fields.PUBLISH_AUTO_BATCH_SIZE || 1);
    if (postStatusEl) postStatusEl.value = fields.PUBLISH_AUTO_POST_STATUS === 'draft' ? 'draft' : 'publish';
    if (imageModeEl) imageModeEl.value = ['generate', 'prompt_only', 'none'].includes(fields.PUBLISH_AUTO_IMAGE_MODE)
      ? fields.PUBLISH_AUTO_IMAGE_MODE : 'generate';

    const targetChannels = String(fields.PUBLISH_AUTO_TARGET_CHANNELS || 'naver').split(',').map(v => v.trim()).filter(Boolean);
    document.querySelectorAll('[data-publish-target]').forEach(el => {
      el.checked = targetChannels.includes(el.getAttribute('data-publish-target'));
    });

    if (headlessEl) headlessEl.checked = Boolean(fields.PUBLISH_AUTO_HEADLESS ?? true);
    if (document.getElementById('blog-publish-auto-start-time')) document.getElementById('blog-publish-auto-start-time').value = String(fields.PUBLISH_AUTO_START_TIME || '00:00');
    if (document.getElementById('blog-publish-auto-end-time')) document.getElementById('blog-publish-auto-end-time').value = String(fields.PUBLISH_AUTO_END_TIME || '23:59');

    setBlogAutoResultText([
      '불러오기 완료',
      '- 자동발행 기준을 확인했습니다.',
      '- 변경 후 상단의 저장 및 적용 버튼으로 반영할 수 있습니다.'
    ].join('\n'));
    return true;
  } catch (e) {
    setBlogAutoResultText(`오류: ${e.message}`);
    return false;
  }
}

async function saveBlogAutoSettings() {
  const publishEnabledEl = document.getElementById('blog-publish-auto-enabled');
  const publishIntervalEl = document.getElementById('blog-publish-auto-interval');
  const publishBatchEl = document.getElementById('blog-publish-auto-batch');
  const postStatusEl = document.getElementById('blog-publish-auto-post-status');
  const imageModeEl = document.getElementById('blog-publish-auto-image-mode');
  const headlessEl = document.getElementById('blog-publish-auto-headless');

  setBlogAutoResultText('저장 중...');
  try {
    const major = await fetchJson('/api/v1/settings/major');
    const fields = { ...(major?.fields || {}) };

    const payload = {
      ...fields,
      PUBLISH_AUTO_ENABLED: Boolean(publishEnabledEl?.checked),
      PUBLISH_AUTO_INTERVAL_MIN: parseInt(publishIntervalEl?.value || '60', 10),
      PUBLISH_AUTO_BATCH_SIZE: parseInt(publishBatchEl?.value || '1', 10),
      PUBLISH_AUTO_POST_STATUS: postStatusEl?.value === 'draft' ? 'draft' : 'publish',
      PUBLISH_AUTO_IMAGE_MODE: imageModeEl?.value || 'generate',
      PUBLISH_AUTO_TARGET_CHANNELS: Array.from(document.querySelectorAll('[data-publish-target]:checked')).map(el => el.getAttribute('data-publish-target')).join(','),
      PUBLISH_AUTO_HEADLESS: Boolean(headlessEl?.checked),
      PUBLISH_AUTO_START_TIME: (document.getElementById('blog-publish-auto-start-time')?.value || '00:00').trim(),
      PUBLISH_AUTO_END_TIME: (document.getElementById('blog-publish-auto-end-time')?.value || '23:59').trim()
    };

    await postJson('/api/v1/settings/major', payload);

    setBlogAutoResultText([
      '저장 완료',
      '- 자동 포스팅 설정이 반영되었습니다.',
      '- 수동 실행으로 즉시 동작을 검증할 수 있습니다.'
    ].join('\n'));
  } catch (e) {
    setBlogAutoResultText(`오류: ${e.message}`);
  }
}

async function runBlogCollectTrendsManual() {
  if (!guardUiConfigReady('트렌드 수동 실행')) return;
  const resultEl = document.getElementById('blog-collect-trends-result');
  const runDateEl = document.getElementById('blog-collect-trends-date');

  const rawDate = String(runDateEl?.value || '').trim();

  const confirmMessage = rawDate ? `${rawDate} 기준으로 트렌드 수집을 수동 실행하시겠습니까 ? ` : `오늘 날짜를 기준으로 트렌드 수집을 수동 실행하시겠습니까 ? `;
  if (await showUiConfirm(confirmMessage) === false) return;

  if (resultEl) resultEl.textContent = '트렌드 수집 실행 중...';
  try {
    const settings = getBlogAutoSettingsFromUi();
    const data = await postJson('/api/v1/auto/collect/trends/run', { trendDate: rawDate, settings });
    // Handle both data structures (nested or direct summary) gracefully
    const dataPayload = data?.data || data;
    const summary = dataPayload?.summary || dataPayload || {};

    const lines = [
      '수동 수집 완료',
      `- 트렌드 수집: ${Number(summary?.trendsCollected || 0)
      }건`,
      `- Topics 추가: ${Number(summary?.trendsToTopics || 0)
      }건`
    ];
    if (resultEl) resultEl.textContent = lines.join('\n');
    await loadBlogTopics({ silent: true });
  } catch (e) {
    if (resultEl) resultEl.textContent = `오류: ${e.message}`;
  }
}

async function runBlogCollectRssManual() {
  if (!guardUiConfigReady('RSS 1회 수집')) return;
  const resultEl = document.getElementById('blog-collect-trends-result');
  if (await showUiConfirm('RSS 수집을 수동 실행하시겠습니까?') === false) return;
  if (resultEl) resultEl.textContent = 'RSS 수집 실행 중...';
  try {
    const data = await postJson('/api/v1/auto/collect/rss/run', {
      settingsOverrides: {
        COLLECT_RSS_CONFIGS: currentRssConfigs,
        PUBLISH_AUTO_IMAGE_MODE: document.getElementById('blog-publish-auto-image-mode')?.value || 'generate'
      }
    });
    if (resultEl) resultEl.textContent = `RSS 수집 완료: ${JSON.stringify(data.data?.summary || data)}`;
  } catch (e) {
    if (resultEl) resultEl.textContent = `오류: ${e.message}`;
  }
}
