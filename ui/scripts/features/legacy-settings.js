async function loadSettingsSnsRuntimeStatus() {
  const resultEl = document.getElementById('settings-sns-runtime-result');
  if (!resultEl) return null;
  try {
    const data = await fetchJson('/api/v1/auto/status');
    resultEl.textContent = formatSettingsSnsRuntimeStatus(data?.sns || {});
    return data?.sns || {};
  } catch (error) {
    resultEl.textContent = `상태 확인 실패: ${error.message}`;
    return null;
  }
}

async function runSettingsSnsCheckNow() {
  if (settingsSnsCheckInFlight) return;
  const buttonEl = document.getElementById('settings-sns-check-now-btn');
  const resultEl = document.getElementById('settings-sns-runtime-result');
  if (settingsMajorHasPendingBasicChanges) {
    if (resultEl) resultEl.textContent = '변경한 설정을 먼저 저장한 뒤 확인해 주세요.';
    return;
  }

  settingsSnsCheckInFlight = true;
  if (buttonEl) buttonEl.disabled = true;
  if (resultEl) resultEl.textContent = 'RSS를 확인하는 중입니다...';
  try {
    const result = await postJson('/api/v1/auto/collect/sns/run', {});
    const data = result?.data || {};
    if (resultEl) {
      resultEl.textContent = [
        'RSS 확인 완료',
        `발견 ${Number(data.discoveredCount || 0)}건 · 신규 원문 ${Number(data.newEntryCount || 0)}건 · SNS 행 ${Number(data.addedDeliveryCount || 0)}건 · 중복 ${Number(data.duplicateCount || 0)}건`
      ].join('\n');
    }
    await loadSettingsSnsRuntimeStatus();
  } catch (error) {
    if (resultEl) resultEl.textContent = `RSS 확인 실패: ${error.message}`;
  } finally {
    settingsSnsCheckInFlight = false;
    if (buttonEl) buttonEl.disabled = false;
  }
}

async function runSettingsSnsPublishNow() {
  if (settingsSnsPublishInFlight) return;
  const buttonEl = document.getElementById('settings-sns-publish-now-btn');
  const resultEl = document.getElementById('settings-sns-runtime-result');
  if (settingsMajorHasPendingBasicChanges) {
    if (resultEl) resultEl.textContent = '변경한 설정을 먼저 저장한 뒤 발행해 주세요.';
    return;
  }
  const confirmed = window.confirm(
    'SNS 시트에서 가장 앞선 대기 원문 글 1건을 선택된 모든 Buffer 채널에 즉시 발행할까요?'
  );
  if (!confirmed) return;

  settingsSnsPublishInFlight = true;
  if (buttonEl) buttonEl.disabled = true;
  if (resultEl) resultEl.textContent = '대기 중인 원문 글을 SNS에 발행하는 중입니다...';
  try {
    const result = await postJson('/api/v1/auto/publish/sns/run', {});
    const data = result?.data || {};
    if (resultEl) {
      resultEl.textContent = `발행 완료: 성공 ${Number(data.completedCount || 0)}건 · 실패 ${Number(data.failedCount || 0)}건 · 건너뜀 ${Number(data.skippedCount || 0)}건`;
    }
    await loadSettingsSnsRuntimeStatus();
  } catch (error) {
    if (resultEl) resultEl.textContent = `SNS 발행 확인 필요: ${error.message}`;
    await loadSettingsSnsRuntimeStatus();
  } finally {
    settingsSnsPublishInFlight = false;
    if (buttonEl) buttonEl.disabled = false;
  }
}

async function inspectSettingsBufferConnection(organizationId = '') {
  const apiKey = getSettingsInputValue('settings-buffer-api-key').trim();
  const connectBtn = document.getElementById('settings-buffer-connect-btn');
  const resultEl = document.getElementById('settings-buffer-connection-result');
  if (!apiKey) {
    if (resultEl) resultEl.textContent = 'Buffer API Key를 입력해 주세요.';
    return;
  }

  if (connectBtn) connectBtn.disabled = true;
  if (resultEl) resultEl.textContent = 'Buffer 연결을 확인하는 중...';
  try {
    const data = await postJson('/api/v1/settings/buffer-connection', {
      apiKey,
      organizationId: String(organizationId || '').trim()
    });
    settingsBufferOrganizations = Array.isArray(data.organizations) ? data.organizations : [];
    renderSettingsBufferOrganizations(data.organization_id || organizationId);

    settingsBufferChannels = normalizeSettingsBufferChannels(data.channels);
    const availableIds = new Set(
      settingsBufferChannels
        .filter((channel) => !isSettingsBufferChannelUnsupported(channel))
        .map((channel) => channel.id)
    );
    settingsBufferSelectedChannelIds = new Set(
      Array.from(settingsBufferSelectedChannelIds).filter((id) => availableIds.has(id))
    );
    renderSettingsBufferChannels();

    if (resultEl) {
      resultEl.textContent = data.organization_id
        ? `연결됨 · Organization ${settingsBufferOrganizations.find((item) => item.id === data.organization_id)?.name || data.organization_id} · 채널 ${settingsBufferChannels.length}개`
        : `연결됨 · Organization ${settingsBufferOrganizations.length}개 중 하나를 선택해 주세요.`;
    }
    if (data.organization_id) scheduleSettingsMajorAutoSave({ immediate: true });
  } catch (error) {
    settingsBufferChannels = [];
    renderSettingsBufferChannels();
    if (resultEl) resultEl.textContent = `연결 실패: ${error.message}`;
  } finally {
    if (connectBtn) connectBtn.disabled = false;
  }
}

function applySettingsMajorToForm(data, options = {}) {
  const fields = data?.fields || {};
  const skipFocused = options.skipFocused === true;

  // 저장 직후 폼을 다시 채울 때, 현재 포커스된 필드를 덮어쓰지 않기 위한 래퍼 함수
  const sv = (el, val) => {
    if (!el) return;
    if (skipFocused && document.activeElement === el) return;
    if (isManagedSettingsSecretField(el)) {
      setManagedSettingsSecretValue(el, val);
      return;
    }
    el.value = String(val);
  };
  const sc = (el, val) => {
    if (!el) return;
    if (skipFocused && document.activeElement === el) return;
    el.checked = Boolean(val);
  };

  const listenHostEl = document.getElementById('settings-listen-host');
  const listenPortEl = document.getElementById('settings-listen-port');
  const mcpRemoteEnabledEl = document.getElementById('settings-mcp-remote-enabled');
  const mcpRemoteHostEl = document.getElementById('settings-mcp-remote-host');
  const mcpRemotePortEl = document.getElementById('settings-mcp-remote-port');
  const mcpRemotePathEl = document.getElementById('settings-mcp-remote-path');
  const mcpRemoteAuthTokenEl = document.getElementById('settings-mcp-remote-auth-token');
  const naverIdEl = document.getElementById('settings-naver-id');
  const wordpressUrlEl = document.getElementById('settings-wordpress-url');
  const wordpressUserIdEl = document.getElementById('settings-wordpress-user-id');
  const wordpressAppPasswordEl = document.getElementById('settings-wordpress-app-password');
  const sheetUrlEl = document.getElementById('settings-google-sheet-url');
  const updateServerTypeEl = document.getElementById('settings-update-server-type');
  const updateMirrorRepoEl = document.getElementById('settings-update-mirror-repo');
  const customUpdateCheckUrlEl = document.getElementById('settings-custom-update-check-url');
  const updateChannelDisplayEl = document.getElementById('settings-update-channel-display');

  const typingEl = document.getElementById('settings-typing-speed');
  const blogCollectTrendsEnabledEl = document.getElementById('blog-collect-trends-enabled');
  const blogCollectTrendsTimeEl = document.getElementById('blog-collect-trends-time');
  const blogCollectTrendsFilterNewEl = document.getElementById('blog-collect-trends-filter-new');
  const blogCollectTrendsFilterDashEl = document.getElementById('blog-collect-trends-filter-dash');
  const blogCollectTrendsFilterNumberEnabledEl = document.getElementById('blog-collect-trends-filter-number-enabled');
  const blogCollectTrendsFilterTypeEl = document.getElementById('blog-collect-trends-filter-type');
  const blogCollectTrendsFilterMinEl = document.getElementById('blog-collect-trends-filter-min');
  const blogCollectTrendsFilterTopEl = document.getElementById('blog-collect-trends-filter-top');
  const blogCollectTrendsReuseGapEl = document.getElementById('blog-collect-trends-reuse-gap');

  const blogPublishAutoEnabledEl = document.getElementById('blog-publish-auto-enabled');
  const blogPublishAutoBatchEl = document.getElementById('blog-publish-auto-batch');
  const blogPublishAutoIntervalEl = document.getElementById('blog-publish-auto-interval');
  const blogPublishAutoPostStatusEl = document.getElementById('blog-publish-auto-post-status');
  const blogPublishAutoHeadlessEl = document.getElementById('blog-publish-auto-headless');
  const shoppingPublishAutoEnabledEl = document.getElementById('shopping-publish-auto-enabled');
  const shoppingPublishAutoBatchEl = document.getElementById('shopping-publish-auto-batch');
  const shoppingPublishAutoIntervalEl = document.getElementById('shopping-publish-auto-interval');
  const shoppingPublishAutoHeadlessEl = document.getElementById('shopping-publish-auto-headless');
  const shoppingPublishAutoNotifyEnabledEl = document.getElementById('shopping-publish-auto-notify-enabled');
  const blogPublishAutoNotifyEnabledEl = document.getElementById('blog-publish-auto-notify-enabled');

  const telegramEnabledEl = document.getElementById('settings-notify-telegram-enabled');
  const telegramBotTokenEl = document.getElementById('settings-notify-telegram-bot-token');
  const telegramChatIdEl = document.getElementById('settings-notify-telegram-chat-id');
  const bitlyTokenEl = document.getElementById('settings-notify-bitly-token');
  const textModelPresetProviderEl = document.getElementById('settings-text-model-preset-provider');
  const textModelPresetCodeEl = document.getElementById('settings-text-model-preset-code');
  const textModelNameEl = document.getElementById('settings-text-model-name');
  const textModelBaseUrlEl = document.getElementById('settings-text-model-base-url');
  const textModelApiKeyEl = document.getElementById('settings-text-model-api-key');
  const imageModelPresetProviderEl = document.getElementById('settings-image-model-preset-provider');
  const imageModelPresetCodeEl = document.getElementById('settings-image-model-preset-code');
  const imageModelNameEl = document.getElementById('settings-image-model-name');
  const imageModelBaseUrlEl = document.getElementById('settings-image-model-base-url');
  const imageModelApiKeyEl = document.getElementById('settings-image-model-api-key');
  const chatModelPresetProviderEl = document.getElementById('settings-chat-model-preset-provider');
  const chatModelPresetCodeEl = document.getElementById('settings-chat-model-preset-code');
  const chatModelNameEl = document.getElementById('settings-chat-model-name');
  const chatModelBaseUrlEl = document.getElementById('settings-chat-model-base-url');
  const chatModelApiKeyEl = document.getElementById('settings-chat-model-api-key');
  const slackEnabledEl = document.getElementById('settings-notify-slack-enabled');
  const slackWebhookUrlEl = document.getElementById('settings-notify-slack-webhook-url');
  const bufferApiKeyEl = document.getElementById('settings-buffer-api-key');
  const bufferOrganizationEl = document.getElementById('settings-buffer-organization');
  const snsPublishEnabledEl = document.getElementById('settings-sns-publish-enabled');
  const snsPublishIntervalEl = document.getElementById('settings-sns-publish-interval');
  const snsAiModeEl = document.getElementById('settings-sns-ai-mode');

  settingsMajorApplyingForm = true;

  sv(listenHostEl, fields.LISTEN_HOST || '127.0.0.1');
  sv(listenPortEl, fields.LISTEN_PORT || 4577);
  sc(mcpRemoteEnabledEl, fields.MCP_REMOTE_ENABLED ?? false);
  sv(mcpRemoteHostEl, fields.MCP_REMOTE_HOST || '127.0.0.1');
  sv(mcpRemotePortEl, fields.MCP_REMOTE_PORT || 4578);
  sv(mcpRemotePathEl, fields.MCP_REMOTE_PATH || '/mcp');
  sv(mcpRemoteAuthTokenEl, fields.MCP_REMOTE_AUTH_TOKEN || '');
  settingsMcpRuntimeStatus = data?.remoteMcpStatus || null;
  settingsMcpTokenVisible = false;
  sv(naverIdEl, fields.NAVER_ID || '');
  sv(wordpressUrlEl, fields.WORDPRESS_URL || '');
  sv(wordpressUserIdEl, fields.WORDPRESS_USER_ID || '');
  sv(wordpressAppPasswordEl, fields.WORDPRESS_APP_PASSWORD || '');
  setSelectedSettingsRadioValue('settings-blog-writing-mode', fields.BLOG_WRITING_MODE, 'conversational');
  setSelectedSettingsRadioValue('settings-blog-speech-level', fields.BLOG_SPEECH_LEVEL, 'polite');
  setSelectedSettingsRadioValue('settings-blog-writing-strategy', fields.BLOG_WRITING_STRATEGY, 'search');
  syncSettingsBlogWritingStyleDescription();
  syncSettingsBlogWritingStrategyDescription();
  sv(sheetUrlEl, fields.GOOGLE_SHEET_URL || '');
  sv(updateServerTypeEl, fields.UPDATE_SERVER_TYPE || 'github');
  sv(updateMirrorRepoEl, fields.UPDATE_MIRROR_REPO || 'delta898/NaverAutoBlog-Releases');
  sv(customUpdateCheckUrlEl, fields.CUSTOM_UPDATE_CHECK_URL || '');
  if (data?.aiPresets) {
    settingsAiPresets = data.aiPresets;
  }
  settingsAiProviderProfiles = normalizeSettingsAiProviderProfiles(data?.aiProviderProfiles);
  if (textModelPresetProviderEl) {
    textModelPresetProviderEl.dataset.desiredValue = fields.TEXT_MODEL_PROVIDER || 'google';
  }
  if (textModelPresetCodeEl) {
    textModelPresetCodeEl.dataset.desiredValue = fields.TEXT_MODEL_PRESET_CODE || '';
  }
  sv(textModelNameEl, fields.TEXT_MODEL_NAME || '');
  sv(textModelBaseUrlEl, fields.TEXT_MODEL_BASE_URL || '');
  sv(textModelApiKeyEl, fields.TEXT_MODEL_API_KEY || '');
  if (imageModelPresetProviderEl) {
    imageModelPresetProviderEl.dataset.desiredValue = fields.IMAGE_MODEL_PROVIDER || 'google';
  }
  if (imageModelPresetCodeEl) {
    imageModelPresetCodeEl.dataset.desiredValue = fields.IMAGE_MODEL_PRESET_CODE || '';
  }
  sv(imageModelNameEl, fields.IMAGE_MODEL_NAME || '');
  sv(imageModelBaseUrlEl, fields.IMAGE_MODEL_BASE_URL || '');
  sv(imageModelApiKeyEl, fields.IMAGE_MODEL_API_KEY || '');
  if (updateChannelDisplayEl) {
    updateChannelDisplayEl.textContent = `현재 채널: ${fields.UPDATE_CHANNEL || 'stable'}`;
  }
  settingsTelegramRuntimeStatus = data?.telegramBotStatus || null;

  const imageOptimizationEl = document.getElementById('settings-image-optimization');
  sc(imageOptimizationEl, fields.IMAGE_OPTIMIZATION_ENABLED ?? true);

  // 개별 섹션의 Headless 설정을 우선하며, Global 설정은 이제 레거시 호환용으로만 유지됩니다.

  sv(typingEl, fields.TYPING_SPEED || 'NORMAL');
  sc(blogCollectTrendsEnabledEl, fields.COLLECT_TRENDS_ENABLED);

  const naverCatEl = document.getElementById('blog-collect-trends-naver-category');
  sv(naverCatEl, fields.COLLECT_TRENDS_NAVER_CATEGORY || '');

  setSelectedBlogAutoCategories(fields.COLLECT_TRENDS_CATEGORIES || '');
  renderBlogAutoCategoryUi();

  sv(blogCollectTrendsTimeEl, fields.COLLECT_TRENDS_TIME || '07:30');
  sc(blogCollectTrendsFilterNewEl, fields.COLLECT_TRENDS_FILTER_INCLUDE_NEW);
  sc(blogCollectTrendsFilterDashEl, fields.COLLECT_TRENDS_FILTER_INCLUDE_DASH);
  sc(blogCollectTrendsFilterNumberEnabledEl, fields.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER);
  sv(blogCollectTrendsFilterTypeEl, fields.COLLECT_TRENDS_FILTER_TYPE || 'min');

  const wordpressCatEl = document.getElementById('blog-collect-trends-wordpress-category');
  sv(wordpressCatEl, fields.COLLECT_TRENDS_WP_CATEGORY || '');

  // RSS Configs Sync
  if (fields.COLLECT_RSS_CONFIGS) {
    try {
      window.currentRssConfigs = typeof fields.COLLECT_RSS_CONFIGS === 'string'
        ? JSON.parse(fields.COLLECT_RSS_CONFIGS)
        : fields.COLLECT_RSS_CONFIGS;
      renderRssConfigTable();
    } catch (e) {
      console.error('Failed to sync RSS configs:', e);
    }
  }

  if (blogCollectTrendsFilterMinEl) {
    const val = normalizeBlogAutoVariationNumberValue(fields.COLLECT_TRENDS_FILTER_MIN_INCR, 50);
    sv(blogCollectTrendsFilterMinEl, val === '' ? '' : String(val));
  }
  if (blogCollectTrendsFilterTopEl) {
    const val = normalizeBlogAutoVariationNumberValue(fields.COLLECT_TRENDS_FILTER_TOP_N, 5);
    sv(blogCollectTrendsFilterTopEl, val === '' ? '' : String(val));
  }
  sv(blogCollectTrendsReuseGapEl, fields.COLLECT_TRENDS_REUSE_GAP_DAYS || 15);

  sc(blogPublishAutoEnabledEl, fields.PUBLISH_AUTO_ENABLED);
  sv(blogPublishAutoBatchEl, fields.PUBLISH_AUTO_BATCH_SIZE || 1);
  sv(blogPublishAutoIntervalEl, fields.PUBLISH_AUTO_INTERVAL_MIN || 60);
  sv(blogPublishAutoPostStatusEl, fields.PUBLISH_AUTO_POST_STATUS === 'draft' ? 'draft' : 'publish');
  sc(blogPublishAutoHeadlessEl, fields.PUBLISH_AUTO_HEADLESS ?? true);
  sc(blogPublishAutoNotifyEnabledEl, fields.PUBLISH_AUTO_NOTIFY_ENABLED);

  const blogStartTimeEl = document.getElementById('blog-publish-auto-start-time');
  const blogEndTimeEl = document.getElementById('blog-publish-auto-end-time');
  sv(blogStartTimeEl, fields.PUBLISH_AUTO_START_TIME || '00:00');
  sv(blogEndTimeEl, fields.PUBLISH_AUTO_END_TIME || '23:59');

  const targetChannels = Array.isArray(fields.PUBLISH_AUTO_TARGET_CHANNELS)
    ? fields.PUBLISH_AUTO_TARGET_CHANNELS
    : String(fields.PUBLISH_AUTO_TARGET_CHANNELS || 'naver').split(',').map(v => v.trim()).filter(Boolean);
  // 자동 발행 전용 타겟 체크박스만 갱신 (수동/일괄 UI는 전역 설정에 영향받지 않도록 skip)
  ['blog-publish-auto-target-naver', 'blog-publish-auto-target-wordpress'].forEach(id => {
    const el = document.getElementById(id);
    if (!el || (skipFocused && document.activeElement === el)) return;
    el.checked = targetChannels.includes(el.getAttribute('data-publish-target'));
  });

  sc(shoppingPublishAutoEnabledEl, fields.SHOPPING_PUBLISH_AUTO_ENABLED);

  const shoppingStartTimeEl = document.getElementById('shopping-publish-auto-start-time');
  const shoppingEndTimeEl = document.getElementById('shopping-publish-auto-end-time');
  sv(shoppingStartTimeEl, fields.SHOPPING_PUBLISH_AUTO_START_TIME || '00:00');
  sv(shoppingEndTimeEl, fields.SHOPPING_PUBLISH_AUTO_END_TIME || '23:59');
  sv(shoppingPublishAutoBatchEl, fields.SHOPPING_PUBLISH_AUTO_BATCH_SIZE || 1);
  sv(shoppingPublishAutoIntervalEl, fields.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN || 60);

  const shoppingTargetChannels = Array.isArray(fields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS)
    ? fields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS
    : String(fields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS || 'naver').split(',').map(v => v.trim()).filter(Boolean);
  // 쇼핑 자동 발행 전용 타겟 체크박스만 갱신
  ['shopping-publish-auto-target-naver', 'shopping-publish-auto-target-wordpress'].forEach(id => {
    const el = document.getElementById(id);
    if (!el || (skipFocused && document.activeElement === el)) return;
    el.checked = shoppingTargetChannels.includes(el.getAttribute('data-shopping-publish-target'));
  });

  sc(shoppingPublishAutoHeadlessEl, fields.SHOPPING_PUBLISH_AUTO_HEADLESS ?? true);
  sc(shoppingPublishAutoNotifyEnabledEl, fields.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED);

  sc(telegramEnabledEl, fields.NOTIFY_TELEGRAM_ENABLED);
  sv(telegramBotTokenEl, fields.NOTIFY_TELEGRAM_BOT_TOKEN || '');
  sv(telegramChatIdEl, fields.NOTIFY_TELEGRAM_CHAT_ID || '');
  sv(bitlyTokenEl, fields.NOTIFY_BITLY_TOKEN || '');
  setSelectedSettingsRadioValue('settings-chat-model-source', fields.CHAT_MODEL_SOURCE, 'writing');
  sv(chatModelPresetProviderEl, fields.CHAT_MODEL_PROVIDER || 'direct');
  if (chatModelPresetProviderEl) chatModelPresetProviderEl.dataset.desiredValue = fields.CHAT_MODEL_PROVIDER || 'direct';
  sv(chatModelPresetCodeEl, fields.CHAT_MODEL_PRESET_CODE || '');
  if (chatModelPresetCodeEl) chatModelPresetCodeEl.dataset.desiredValue = fields.CHAT_MODEL_PRESET_CODE || '';
  sv(chatModelNameEl, fields.CHAT_MODEL_NAME || '');
  sv(chatModelBaseUrlEl, fields.CHAT_MODEL_BASE_URL || '');
  sv(chatModelApiKeyEl, fields.CHAT_MODEL_API_KEY || '');
  sc(slackEnabledEl, fields.NOTIFY_SLACK_ENABLED);
  sv(slackWebhookUrlEl, fields.NOTIFY_SLACK_WEBHOOK_URL || '');
  sv(bufferApiKeyEl, fields.BUFFER_API_KEY || '');
  sc(snsPublishEnabledEl, fields.SNS_PUBLISH_ENABLED);
  sv(snsPublishIntervalEl, Math.max(10, Number(fields.SNS_PUBLISH_INTERVAL_MIN) || 10));
  sv(snsAiModeEl, fields.SNS_AI_MODE || 'none');
  syncSettingsSnsAiHint();
  const snsSourceBlogs = Array.isArray(fields.SNS_SOURCE_BLOGS)
    ? fields.SNS_SOURCE_BLOGS
    : ['naver', 'wordpress'];
  sc(document.getElementById('settings-sns-source-naver'), snsSourceBlogs.includes('naver'));
  sc(document.getElementById('settings-sns-source-wordpress'), snsSourceBlogs.includes('wordpress'));
  settingsBufferOrganizations = [];
  settingsBufferChannels = normalizeSettingsBufferChannels(fields.BUFFER_CHANNELS);
  settingsBufferSelectedChannelIds = new Set(
    settingsBufferChannels
      .filter((channel) => !isSettingsBufferChannelUnsupported(channel))
      .map((channel) => channel.id)
      .slice(0, 3)
  );
  renderSettingsBufferOrganizations(fields.BUFFER_ORGANIZATION_ID || '');
  if (bufferOrganizationEl) bufferOrganizationEl.value = fields.BUFFER_ORGANIZATION_ID || '';
  renderSettingsBufferChannels();
  syncSettingsBufferHelpLink(fields.BUFFER_HELP_URL || '');

  syncBlogAutoVariationTypeUi();
  if (blogCollectTrendsReuseGapEl && !(skipFocused && document.activeElement === blogCollectTrendsReuseGapEl)) {
    const rawReuseGap = fields.COLLECT_TRENDS_REUSE_GAP_DAYS || fields.BLOG_AUTO_KEYWORD_REUSE_GAP_DAYS;
    const normalizedReuseGap = normalizeBlogAutoKeywordReuseGapValue(rawReuseGap, 15);
    blogCollectTrendsReuseGapEl.value = String(normalizedReuseGap);
  }
  syncBlogAutoVariationNumberUi();

  // 이미지 슬롯을 applyingForm 플래그 해제 전에 먼저 채웁니다.
  // 그래야 플래그 해제 직후 auto-save가 트리거되더라도
  // ensureRequiredSettingsShoppingImages()가 올바른 데이터를 볼 수 있습니다.
  settingsShoppingImageDefaults = { ...(data?.shoppingImageDefaults || {}) };
  settingsShoppingImageSlots = { ...(data?.shoppingImageSlots || {}) };
  SETTINGS_SHOPPING_SLOT_ORDER.forEach((slot) => {
    clearStagedSettingsShoppingImage(slot);
  });
  renderSettingsShoppingImageSlots();

  settingsMajorApplyingForm = false;
  settingsMajorLoadedOnce = true;
  syncSettingsTelegramUi();
  syncSettingsMcpUi();
  syncSettingsUpdateSourceUi();
  syncSettingsAiModelUi('text');
  syncSettingsAiModelUi('image');
  syncSettingsChatModelUi();
  playSettingsTypingPreview();

  commitSettingsMajorSavedState();
}

function getSettingsMajorBasicValuesFromDom() {
  const variationMinEl = document.getElementById('blog-collect-trends-filter-min');
  const variationTopEl = document.getElementById('blog-collect-trends-filter-top');
  const keywordReuseGapEl = document.getElementById('blog-collect-trends-reuse-gap');

  const variationMin = normalizeBlogAutoVariationNumberValue(variationMinEl?.value, 50);
  const variationTopN = normalizeBlogAutoVariationNumberValue(variationTopEl?.value, 5);
  const keywordReuseGap = normalizeBlogAutoKeywordReuseGapValue(keywordReuseGapEl?.value, 15);

  return {
    // General & Blog
    LISTEN_HOST: (document.getElementById('settings-listen-host')?.value || '127.0.0.1').trim(),
    LISTEN_PORT: parseInt((document.getElementById('settings-listen-port')?.value || '4577').trim(), 10) || 4577,
    MCP_REMOTE_ENABLED: Boolean(document.getElementById('settings-mcp-remote-enabled')?.checked),
    MCP_REMOTE_HOST: (document.getElementById('settings-mcp-remote-host')?.value || '127.0.0.1').trim(),
    MCP_REMOTE_PORT: parseInt((document.getElementById('settings-mcp-remote-port')?.value || '4578').trim(), 10) || 4578,
    MCP_REMOTE_PATH: normalizeSettingsMcpPath(document.getElementById('settings-mcp-remote-path')?.value || '/mcp'),
    MCP_REMOTE_AUTH_TOKEN: (document.getElementById('settings-mcp-remote-auth-token')?.value || '').trim(),
    NAVER_ID: (document.getElementById('settings-naver-id')?.value || '').trim(),
    WORDPRESS_URL: (document.getElementById('settings-wordpress-url')?.value || '').trim(),
    WORDPRESS_USER_ID: (document.getElementById('settings-wordpress-user-id')?.value || '').trim(),
    WORDPRESS_APP_PASSWORD: getSettingsInputValue('settings-wordpress-app-password').trim(),
    BLOG_WRITING_MODE: getSelectedSettingsRadioValue('settings-blog-writing-mode', 'conversational'),
    BLOG_SPEECH_LEVEL: getSelectedSettingsRadioValue('settings-blog-speech-level', 'polite'),
    BLOG_WRITING_STRATEGY: getSelectedSettingsRadioValue('settings-blog-writing-strategy', 'search'),
    GOOGLE_SHEET_URL: (document.getElementById('settings-google-sheet-url')?.value || '').trim(),
    UPDATE_SERVER_TYPE: (document.getElementById('settings-update-server-type')?.value || 'github').trim(),
    CUSTOM_UPDATE_CHECK_URL: (document.getElementById('settings-custom-update-check-url')?.value || '').trim(),
    UPDATE_MIRROR_REPO: (document.getElementById('settings-update-mirror-repo')?.value || 'delta898/NaverAutoBlog-Releases').trim(),
    TEXT_MODEL_PROVIDER: (document.getElementById('settings-text-model-preset-provider')?.value || 'google').trim(),
    TEXT_MODEL_PRESET_CODE: (document.getElementById('settings-text-model-preset-code')?.value || '').trim(),
    TEXT_MODEL_NAME: (document.getElementById('settings-text-model-name')?.value || '').trim(),
    TEXT_MODEL_BASE_URL: (document.getElementById('settings-text-model-base-url')?.value || '').trim(),
    TEXT_MODEL_API_KEY: getSettingsInputValue('settings-text-model-api-key').trim(),
    IMAGE_MODEL_PROVIDER: (document.getElementById('settings-image-model-preset-provider')?.value || 'google').trim(),
    IMAGE_MODEL_PRESET_CODE: (document.getElementById('settings-image-model-preset-code')?.value || '').trim(),
    IMAGE_MODEL_NAME: (document.getElementById('settings-image-model-name')?.value || '').trim(),
    IMAGE_MODEL_BASE_URL: (document.getElementById('settings-image-model-base-url')?.value || '').trim(),
    IMAGE_MODEL_API_KEY: getSettingsInputValue('settings-image-model-api-key').trim(),
    AI_MODEL_PROFILES: serializeSettingsAiProviderProfiles(),

    IMAGE_OPTIMIZATION_ENABLED: Boolean(document.getElementById('settings-image-optimization')?.checked),

    TYPING_SPEED: (document.getElementById('settings-typing-speed')?.value || 'NORMAL').trim().toUpperCase(),

    // Trend Collection
    COLLECT_TRENDS_ENABLED: Boolean(document.getElementById('blog-collect-trends-enabled')?.checked),
    COLLECT_TRENDS_CATEGORIES: serializeSelectedBlogAutoCategories(),
    COLLECT_TRENDS_NAVER_CATEGORY: (document.getElementById('blog-collect-trends-naver-category')?.value || '').trim(),
    COLLECT_TRENDS_WP_CATEGORY: (document.getElementById('blog-collect-trends-wordpress-category')?.value || '').trim(),
    COLLECT_TRENDS_TIME: (document.getElementById('blog-collect-trends-time')?.value || '07:30').trim(),
    COLLECT_TRENDS_FILTER_INCLUDE_NEW: Boolean(document.getElementById('blog-collect-trends-filter-new')?.checked),
    COLLECT_TRENDS_FILTER_INCLUDE_DASH: Boolean(document.getElementById('blog-collect-trends-filter-dash')?.checked),
    COLLECT_TRENDS_FILTER_INCLUDE_NUMBER: Boolean(document.getElementById('blog-collect-trends-filter-number-enabled')?.checked),
    COLLECT_TRENDS_FILTER_TYPE: (document.getElementById('blog-collect-trends-filter-type')?.value || 'min').trim(),
    COLLECT_TRENDS_FILTER_MIN_INCR: variationMin,
    COLLECT_TRENDS_FILTER_TOP_N: variationTopN,
    COLLECT_TRENDS_REUSE_GAP_DAYS: keywordReuseGap,

    // RSS Collection
    COLLECT_RSS_ENABLED: Boolean(document.getElementById('blog-collect-rss-enabled')?.checked),
    COLLECT_RSS_CONFIGS: JSON.stringify(typeof currentRssConfigs !== 'undefined' ? currentRssConfigs : []),

    // Auto Publishing
    PUBLISH_AUTO_ENABLED: Boolean(document.getElementById('blog-publish-auto-enabled')?.checked),
    PUBLISH_AUTO_INTERVAL_MIN: parseInt(document.getElementById('blog-publish-auto-interval')?.value || '60', 10),
    PUBLISH_AUTO_BATCH_SIZE: parseInt(document.getElementById('blog-publish-auto-batch')?.value || '1', 10),
    PUBLISH_AUTO_POST_STATUS: document.getElementById('blog-publish-auto-post-status')?.value === 'draft' ? 'draft' : 'publish',
    PUBLISH_AUTO_TARGET_CHANNELS: Array.from(document.querySelectorAll('[data-publish-target]:checked')).map(el => el.getAttribute('data-publish-target')),
    PUBLISH_AUTO_HEADLESS: Boolean(document.getElementById('blog-publish-auto-headless')?.checked),
    PUBLISH_AUTO_NOTIFY_ENABLED: Boolean(document.getElementById('blog-publish-auto-notify-enabled')?.checked),
    PUBLISH_AUTO_START_TIME: (document.getElementById('blog-publish-auto-start-time')?.value || '00:00').trim(),
    PUBLISH_AUTO_END_TIME: (document.getElementById('blog-publish-auto-end-time')?.value || '23:59').trim(),

    // Shopping Auto Refined
    SHOPPING_PUBLISH_AUTO_ENABLED: Boolean(document.getElementById('shopping-publish-auto-enabled')?.checked),
    SHOPPING_PUBLISH_AUTO_INTERVAL_MIN: parseInt(document.getElementById('shopping-publish-auto-interval')?.value || '60', 10),
    SHOPPING_PUBLISH_AUTO_BATCH_SIZE: parseInt(document.getElementById('shopping-publish-auto-batch')?.value || '1', 10),
    SHOPPING_PUBLISH_AUTO_START_TIME: (document.getElementById('shopping-publish-auto-start-time')?.value || '00:00').trim(),
    SHOPPING_PUBLISH_AUTO_END_TIME: (document.getElementById('shopping-publish-auto-end-time')?.value || '23:59').trim(),
    SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS: Array.from(document.querySelectorAll('[data-shopping-publish-target]:checked')).map(el => el.getAttribute('data-shopping-publish-target')),
    SHOPPING_PUBLISH_AUTO_HEADLESS: Boolean(document.getElementById('shopping-publish-auto-headless')?.checked),
    SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED: Boolean(document.getElementById('shopping-publish-auto-notify-enabled')?.checked),

    // Notification (Telegram)
    NOTIFY_TELEGRAM_ENABLED: Boolean(document.getElementById('settings-notify-telegram-enabled')?.checked),
    NOTIFY_TELEGRAM_BOT_TOKEN: getSettingsInputValue('settings-notify-telegram-bot-token').trim(),
    NOTIFY_TELEGRAM_CHAT_ID: (document.getElementById('settings-notify-telegram-chat-id')?.value || '').trim(),
    NOTIFY_BITLY_TOKEN: getSettingsInputValue('settings-notify-bitly-token').trim(),
    CHAT_MODEL_SOURCE: getSelectedSettingsRadioValue('settings-chat-model-source', 'writing'),
    CHAT_MODEL_PROVIDER: (document.getElementById('settings-chat-model-preset-provider')?.value || 'direct').trim(),
    CHAT_MODEL_PRESET_CODE: (document.getElementById('settings-chat-model-preset-code')?.value || '').trim(),
    CHAT_MODEL_NAME: (document.getElementById('settings-chat-model-name')?.value || '').trim(),
    CHAT_MODEL_BASE_URL: (document.getElementById('settings-chat-model-base-url')?.value || '').trim(),
    CHAT_MODEL_API_KEY: getSettingsInputValue('settings-chat-model-api-key').trim(),

    // Notification (Slack)
    NOTIFY_SLACK_ENABLED: Boolean(document.getElementById('settings-notify-slack-enabled')?.checked),
    NOTIFY_SLACK_WEBHOOK_URL: getSettingsInputValue('settings-notify-slack-webhook-url').trim(),

    // SNS publishing (Buffer)
    BUFFER_API_KEY: getSettingsInputValue('settings-buffer-api-key').trim(),
    BUFFER_ORGANIZATION_ID: (document.getElementById('settings-buffer-organization')?.value || '').trim(),
    BUFFER_CHANNELS: getSelectedSettingsBufferChannels(),
    BUFFER_HELP_URL: (() => {
      const href = document.getElementById('settings-buffer-help-link')?.getAttribute('href') || '';
      return href === '#' ? '' : href.trim();
    })(),
    SNS_PUBLISH_ENABLED: Boolean(document.getElementById('settings-sns-publish-enabled')?.checked),
    SNS_AI_MODE: (document.getElementById('settings-sns-ai-mode')?.value || 'none').trim(),
    SNS_SOURCE_BLOGS: [
      document.getElementById('settings-sns-source-naver')?.checked ? 'naver' : '',
      document.getElementById('settings-sns-source-wordpress')?.checked ? 'wordpress' : ''
    ].filter(Boolean),
    SNS_PUBLISH_INTERVAL_MIN: Math.max(
      10,
      parseInt(document.getElementById('settings-sns-publish-interval')?.value || '10', 10) || 10
    ),
  };
}

function checkPublishPrerequisites(targets) {
  if (!targets || targets.length === 0) {
    return { ok: false, message: '발행 대상을 1개 이상 선택해 주세요.' };
  }
  const settings = getSettingsMajorBasicValuesFromDom();
  if (targets.includes('naver')) {
    if (!settings.NAVER_ID) {
      return { ok: false, message: '네이버 블로그 설정(NAVER_ID)이 필요합니다. 설정 탭에서 확인해 주세요.' };
    }
  }
  if (targets.includes('wordpress')) {
    if (!settings.WORDPRESS_URL || !settings.WORDPRESS_USER_ID || !settings.WORDPRESS_APP_PASSWORD) {
      return { ok: false, message: '워드프레스 설정(URL, App ID, Password)이 필요합니다. 설정 탭에서 확인해 주세요.' };
    }
  }
  return { ok: true };
}

function buildSettingsShoppingImageDraftState() {
  const imageSources = {};
  const stagedFiles = {};
  SETTINGS_SHOPPING_SLOT_ORDER.forEach((slot) => {
    const meta = SETTINGS_SHOPPING_SLOT_META[slot];
    const sourceInput = document.getElementById(`settings-image-source-${slot}`);
    const source = String(sourceInput?.value || settingsShoppingImageSlots?.[slot]?.source || '').trim();
    imageSources[meta.key] = source;

    const stagedFile = settingsShoppingImageFileState?.[slot];
    stagedFiles[slot] = stagedFile
      ? { name: stagedFile.name, size: stagedFile.size, lastModified: stagedFile.lastModified }
      : null;
  });
  return { imageSources, stagedFiles };
}

function buildSettingsMajorBasicSignature() {
  return JSON.stringify({
    basic: getSettingsMajorBasicValuesFromDom(),
    shoppingImages: buildSettingsShoppingImageDraftState()
  });
}

function commitSettingsMajorSavedState() {
  settingsMajorLastSavedSignature = buildSettingsMajorBasicSignature();
  settingsMajorHasPendingBasicChanges = false;
  updateSettingsMajorSaveUi();
}

function normalizeSettingsMcpPath(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '/mcp';
  const prefixed = raw.startsWith('/') ? raw : `/${raw}`;
  return prefixed.length > 1 ? prefixed.replace(/\/+$/, '') : prefixed;
}

function refreshSettingsMajorPendingState() {
  scheduleSettingsMajorAutoSave({ immediate: true });
}

function getSettingsMcpTokenValue() {
  return String(document.getElementById('settings-mcp-remote-auth-token')?.value || '').trim();
}

function setSettingsMcpTokenValue(token, options = {}) {
  const hiddenEl = document.getElementById('settings-mcp-remote-auth-token');
  if (hiddenEl) {
    hiddenEl.value = String(token || '').trim();
  }
  if (options.visible !== undefined) {
    settingsMcpTokenVisible = Boolean(options.visible);
  }
  syncSettingsMcpTokenDisplay();
}

function maskSettingsMcpToken(token) {
  const value = String(token || '').trim();
  if (!value) return '';
  if (value.length <= 12) {
    return `${value.slice(0, 4)}${'•'.repeat(Math.max(0, value.length - 8))}${value.slice(-4)}`;
  }
  return `${value.slice(0, 6)}${'•'.repeat(Math.max(4, value.length - 10))}${value.slice(-4)}`;
}

function syncSettingsMcpTokenDisplay() {
  const displayEl = document.getElementById('settings-mcp-remote-auth-token-display');
  const toggleBtn = document.getElementById('settings-mcp-remote-auth-toggle-btn');
  const copyBtn = document.getElementById('settings-mcp-remote-auth-copy-btn');
  if (!displayEl) return;

  const token = getSettingsMcpTokenValue();
  const hasToken = Boolean(token);
  displayEl.readOnly = !settingsMcpTokenVisible;
  displayEl.value = settingsMcpTokenVisible ? token : (hasToken ? maskSettingsMcpToken(token) : '');
  displayEl.placeholder = hasToken ? 'Bearer token' : '비우면 인증 없음';

  if (toggleBtn) {
    toggleBtn.textContent = settingsMcpTokenVisible ? '숨기기' : '보기';
  }
  if (copyBtn) {
    copyBtn.disabled = !hasToken;
  }
}

function buildSettingsTelegramPreviewLines() {
  const enabled = Boolean(document.getElementById('settings-notify-telegram-enabled')?.checked);
  const botToken = getSettingsInputValue('settings-notify-telegram-bot-token').trim();
  const chatId = String(document.getElementById('settings-notify-telegram-chat-id')?.value || '').trim();
  const runtimeRunning = settingsTelegramRuntimeStatus?.running === true;
  const runtimeEnabled = settingsTelegramRuntimeStatus?.enabled === true;
  const runtimeConfigured = settingsTelegramRuntimeStatus?.configured === true;
  const runtimeStateLabel = runtimeRunning
    ? '실행 중'
    : (runtimeEnabled
      ? (runtimeConfigured ? '중지됨' : '설정 미완료')
      : '중지됨');

  const lines = [
    `현재 상태: ${runtimeStateLabel}`,
    `저장 후 적용: ${enabled ? '활성화' : '비활성화'}`
  ];

  if (!botToken || !chatId) {
    lines.push('봇 토큰과 챗 ID가 모두 있어야 저장 및 적용 시 텔레그램 봇이 시작됩니다.');
  } else {
    lines.push('저장 및 적용 시 현재 입력한 봇 토큰과 챗 ID로 텔레그램 봇 상태가 다시 적용됩니다.');
  }

  if (!enabled) {
    lines.push('비활성화 상태로 저장하면 텔레그램 봇은 실행되지 않습니다.');
  }

  return lines;
}

function syncSettingsTelegramUi() {
  const previewEl = document.getElementById('settings-telegram-status-preview');
  if (previewEl) {
    previewEl.textContent = buildSettingsTelegramPreviewLines().join('\n');
  }
}

function buildSettingsMcpPreviewLines() {
  const enabled = Boolean(document.getElementById('settings-mcp-remote-enabled')?.checked);
  const host = (document.getElementById('settings-mcp-remote-host')?.value || '127.0.0.1').trim() || '127.0.0.1';
  const port = parseInt((document.getElementById('settings-mcp-remote-port')?.value || '4578').trim(), 10) || 4578;
  const path = normalizeSettingsMcpPath(document.getElementById('settings-mcp-remote-path')?.value || '/mcp');
  const token = getSettingsMcpTokenValue();
  const authMode = token ? 'bearer' : 'none';
  const directHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  const runtimeRunning = settingsMcpRuntimeStatus?.running === true;
  const runtimeEnabled = settingsMcpRuntimeStatus?.enabled === true;
  const runtimeStateLabel = runtimeRunning
    ? `실행 중 (${settingsMcpRuntimeStatus?.endpoint || '-'})`
    : (runtimeEnabled ? '시작 중 또는 재시작 중' : '중지됨');

  const lines = [
    `현재 상태: ${runtimeStateLabel}`,
    `저장 후 적용: ${enabled ? '활성화' : '비활성화'}`,
    `Direct URL: http://${directHost}:${port}${path}`,
    `인증: ${authMode === 'bearer' ? 'Bearer Token' : '없음'}`
  ];

  if (host === '0.0.0.0') {
    lines.push('LAN/Public에서는 장치의 실제 IP 또는 reverse proxy URL을 MCP client에 넣어야 합니다.');
  } else {
    lines.push('같은 컴퓨터의 MCP client는 위 Direct URL을 그대로 사용하면 됩니다.');
  }

  if (authMode === 'bearer') {
    lines.push('MCP client는 Authorization: Bearer <token> 헤더를 함께 보내야 합니다.');
  } else {
    lines.push('Bearer Token이 비어 있으므로 저장 시 인증 없이 동작합니다.');
  }

  if (enabled) {
    lines.push('저장 및 적용 시 MCP 서버가 현재 설정으로 시작되거나 다시 시작됩니다.');
  } else {
    lines.push('저장 및 적용 시 MCP 서버는 실행되지 않습니다.');
  }

  return lines;
}

function syncSettingsMcpUi() {
  syncSettingsMcpTokenDisplay();
  const previewEl = document.getElementById('settings-mcp-remote-endpoint-preview');
  if (previewEl) {
    previewEl.textContent = buildSettingsMcpPreviewLines().join('\n');
  }
}

function syncSettingsUpdateSourceUi() {
  const updateServerType = (document.getElementById('settings-update-server-type')?.value || 'github').trim();
  const githubField = document.getElementById('settings-update-mirror-repo-field');
  const customField = document.getElementById('settings-custom-update-url-field');
  if (githubField) {
    githubField.style.display = updateServerType === 'github' ? '' : 'none';
  }
  if (customField) {
    customField.style.display = updateServerType === 'custom' ? '' : 'none';
  }
}

function getSettingsAiPresetCatalog(kind) {
  const catalogKind = kind === 'chat' ? 'text' : kind;
  return Array.isArray(settingsAiPresets?.[catalogKind]) ? settingsAiPresets[catalogKind] : [];
}

function getSettingsAiPresetProviders(kind) {
  const catalogKind = kind === 'chat' ? 'text' : kind;
  const configuredProviders = Array.isArray(settingsAiPresets?.providers?.[catalogKind])
    ? settingsAiPresets.providers[catalogKind]
      .map((item) => String(item?.id || '').trim())
      .filter(Boolean)
    : [];
  const presetProviders = getSettingsAiPresetCatalog(kind)
    .map((item) => String(item.provider || '').trim())
    .filter(Boolean);
  return Array.from(new Set([...configuredProviders, ...presetProviders, 'direct']));
}

function getSettingsAiProviderLabels(kind) {
  const catalogKind = kind === 'chat' ? 'text' : kind;
  const configuredProviders = Array.isArray(settingsAiPresets?.providers?.[catalogKind])
    ? settingsAiPresets.providers[catalogKind]
    : [];
  return Object.fromEntries(configuredProviders
    .map((item) => [
      String(item?.id || '').trim(),
      String(item?.name || item?.display_name || item?.id || '').trim()
    ])
    .filter(([id, name]) => id && name));
}

function populateSettingsAiProviderSelect(kind, selectEl, selectedProvider) {
  if (!selectEl) return;
  const catalogProviders = getSettingsAiPresetProviders(kind);
  const providers = selectedProvider && !catalogProviders.includes(selectedProvider)
    ? [selectedProvider, ...catalogProviders]
    : catalogProviders;
  const labels = {
    google: 'Google',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    kie: 'KIE.ai',
    ...getSettingsAiProviderLabels(kind),
    direct: '직접 입력'
  };
  const resolvedProvider = providers.includes(selectedProvider) ? selectedProvider : (providers[0] || '');
  selectEl.innerHTML = providers
    .map((provider) => {
      const isUnavailable = provider === selectedProvider && !catalogProviders.includes(provider);
      const label = labels[provider] || provider;
      return `<option value="${provider}">${isUnavailable ? `${label} (현재 설정, 카탈로그에 없음)` : label}</option>`;
    })
    .join('');
  if (resolvedProvider) {
    selectEl.value = resolvedProvider;
  }
}

function populateSettingsAiPresetModelSelect(kind, provider, selectEl, summaryEl, selectedCode) {
  if (!selectEl) return;
  const presets = getSettingsAiPresetCatalog(kind).filter((item) => String(item.provider || '') === String(provider || ''));
  const fallback = presets[0] || null;
  const configured = presets.find((item) => item.code === selectedCode) || null;
  const unavailable = selectedCode && !configured
    ? { code: selectedCode, name: `${selectedCode} (현재 설정, 카탈로그에 없음)`, unavailable: true }
    : null;
  const selected = configured || unavailable || fallback;
  selectEl.innerHTML = [...(unavailable ? [unavailable] : []), ...presets]
    .map((item) => `<option value="${item.code}">${item.name || item.code}</option>`)
    .join('');
  if (selected?.code) {
    selectEl.value = selected.code;
  }
  if (summaryEl) {
    if (selected?.unavailable) {
      summaryEl.textContent = '현재 선택한 모델은 제품 카탈로그에 없습니다. 설정을 유지하거나 지원 모델로 변경할 수 있습니다.';
    } else if (selected?.transport === 'gemini_generate_content') {
      summaryEl.textContent = 'Google Gemini API를 사용합니다.';
    } else if (String(provider || '') === 'openai') {
      summaryEl.textContent = kind === 'image'
        ? 'OpenAI Images API를 사용합니다.'
        : 'OpenAI Chat Completions API를 사용합니다.';
    } else {
      summaryEl.textContent = selected?.base_url
        ? `기본 Base URL: ${selected.base_url}`
        : '';
    }
  }
  return selected;
}

function syncSettingsAiModelUi(kind) {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const providerWrapEl = document.getElementById(`settings-${prefix}-model-provider-wrap`);
  const providerEl = document.getElementById(`settings-${prefix}-model-preset-provider`);
  const presetWrapEl = document.getElementById(`settings-${prefix}-model-preset-code-wrap`);
  const presetEl = document.getElementById(`settings-${prefix}-model-preset-code`);
  const summaryEl = document.getElementById(`settings-${prefix}-model-preset-summary`);
  const nameEl = document.getElementById(`settings-${prefix}-model-name`);
  const nameWrapEl = document.getElementById(`settings-${prefix}-model-name-wrap`);
  const baseUrlEl = document.getElementById(`settings-${prefix}-model-base-url`);
  const baseUrlWrapEl = document.getElementById(`settings-${prefix}-model-base-url-wrap`);
  const baseUrlLabelEl = baseUrlWrapEl?.querySelector('.settings-model-base-url-label');
  if (!providerEl) return;

  const desiredProvider = String(providerEl?.dataset?.desiredValue ?? providerEl?.value ?? 'google').trim();
  const selectedCode = String(presetEl?.dataset?.desiredValue ?? presetEl?.value ?? '').trim();

  populateSettingsAiProviderSelect(kind, providerEl, desiredProvider);
  const resolvedProvider = String(providerEl.value || desiredProvider || 'google').trim();
  const isDirect = resolvedProvider === 'direct';

  if (providerWrapEl) providerWrapEl.style.display = '';
  if (presetWrapEl) presetWrapEl.style.display = isDirect ? 'none' : '';
  if (nameWrapEl) nameWrapEl.style.display = isDirect ? '' : 'none';
  if (baseUrlWrapEl) baseUrlWrapEl.style.display = '';
  if (baseUrlLabelEl) {
    baseUrlLabelEl.textContent = !isDirect
      ? (resolvedProvider === 'google'
        ? 'Google AI API'
        : (resolvedProvider === 'openai'
          ? 'OpenAI API'
          : (resolvedProvider === 'kie' ? 'KIE.ai API' : 'Base URL')))
      : 'Base URL';
  }
  providerEl.dataset.desiredValue = resolvedProvider;
  providerEl.dataset.activeProvider = resolvedProvider;

  if (presetEl) {
    presetEl.disabled = isDirect;
  }
  if (nameEl) {
    nameEl.disabled = !isDirect;
  }

  if (!isDirect && providerEl) {
    const selected = populateSettingsAiPresetModelSelect(kind, resolvedProvider, presetEl, summaryEl, selectedCode);
    if (presetEl) presetEl.dataset.desiredValue = presetEl.value || '';
    if (baseUrlEl) {
      baseUrlEl.value = resolvedProvider === 'google' ? '' : (selected?.base_url || '');
      baseUrlEl.readOnly = true;
    }
    if (nameEl) {
      nameEl.readOnly = false;
    }
  } else {
    if (summaryEl) summaryEl.textContent = '';
    if (presetEl) {
      presetEl.innerHTML = '';
      presetEl.dataset.desiredValue = '';
    }
    if (baseUrlEl) {
      baseUrlEl.readOnly = false;
    }
    if (nameEl) {
      nameEl.readOnly = false;
    }
  }
}

function captureSettingsAiModelDesiredState(kind) {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const providerEl = document.getElementById(`settings-${prefix}-model-preset-provider`);
  const presetEl = document.getElementById(`settings-${prefix}-model-preset-code`);
  if (providerEl) {
    providerEl.dataset.desiredValue = String(providerEl.value || '').trim();
  }
  if (presetEl) {
    presetEl.dataset.desiredValue = String(presetEl.value || '').trim();
  }
}

function createEmptySettingsAiProviderProfiles() {
  return { text: {}, image: {}, chat: {} };
}

function normalizeSettingsAiProviderProfiles(rawProfiles) {
  const normalized = createEmptySettingsAiProviderProfiles();
  const source = rawProfiles && typeof rawProfiles === 'object' && !Array.isArray(rawProfiles)
    ? rawProfiles
    : {};
  ['text', 'image', 'chat'].forEach((role) => {
    const roleProfiles = source[role] && typeof source[role] === 'object' && !Array.isArray(source[role])
      ? source[role]
      : {};
    Object.entries(roleProfiles).slice(0, 30).forEach(([profileKey, rawProfile]) => {
      if (!rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) return;
      const provider = String(rawProfile.provider || profileKey || '').trim().toLowerCase();
      if (!provider || provider !== String(profileKey || '').trim().toLowerCase()) return;
      normalized[role][provider] = {
        provider,
        code: String(rawProfile.code || '').trim(),
        name: String(rawProfile.name || '').trim(),
        base_url: String(rawProfile.base_url || '').trim(),
        api_key: String(rawProfile.api_key || '').trim()
      };
    });
  });
  return normalized;
}

function cloneSettingsAiProviderProfiles(rawProfiles = settingsAiProviderProfiles) {
  return normalizeSettingsAiProviderProfiles(rawProfiles);
}

function readSettingsAiProviderProfile(kind, providerOverride = '') {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const provider = String(
    providerOverride || document.getElementById(`settings-${prefix}-model-preset-provider`)?.value || ''
  ).trim().toLowerCase();
  if (!provider) return null;
  const presetCode = String(document.getElementById(`settings-${prefix}-model-preset-code`)?.value || '').trim();
  const name = String(document.getElementById(`settings-${prefix}-model-name`)?.value || '').trim();
  return {
    provider,
    code: provider === 'direct' ? name : presetCode,
    name: provider === 'direct' ? name : '',
    base_url: String(document.getElementById(`settings-${prefix}-model-base-url`)?.value || '').trim(),
    api_key: getSettingsInputValue(`settings-${prefix}-model-api-key`).trim()
  };
}

function snapshotSettingsAiProviderProfile(kind, providerOverride = '', targetProfiles = settingsAiProviderProfiles) {
  const profile = readSettingsAiProviderProfile(kind, providerOverride);
  if (!profile) return;
  if (!targetProfiles[kind]) targetProfiles[kind] = {};
  targetProfiles[kind][profile.provider] = profile;
}

function restoreSettingsAiProviderProfile(kind, provider) {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const profile = settingsAiProviderProfiles?.[kind]?.[normalizedProvider] || null;
  const providerEl = document.getElementById(`settings-${prefix}-model-preset-provider`);
  const presetEl = document.getElementById(`settings-${prefix}-model-preset-code`);
  const nameEl = document.getElementById(`settings-${prefix}-model-name`);
  const baseUrlEl = document.getElementById(`settings-${prefix}-model-base-url`);
  const apiKeyEl = document.getElementById(`settings-${prefix}-model-api-key`);

  if (providerEl) providerEl.dataset.desiredValue = normalizedProvider;
  if (presetEl) presetEl.dataset.desiredValue = profile?.code || '';
  syncSettingsAiModelUi(kind);

  setManagedSettingsSecretValue(apiKeyEl, profile?.api_key || '');
  if (normalizedProvider === 'direct') {
    if (nameEl) nameEl.value = profile?.name || profile?.code || '';
    if (baseUrlEl) baseUrlEl.value = profile?.base_url || '';
  } else if (profile?.base_url && presetEl?.selectedOptions?.[0]?.textContent?.includes('카탈로그에 없음')) {
    if (baseUrlEl) baseUrlEl.value = profile.base_url;
  }
  resetSettingsAiModelTestResult(kind);
}

function handleSettingsAiProviderChange(kind) {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const providerEl = document.getElementById(`settings-${prefix}-model-preset-provider`);
  if (!providerEl) return;
  const previousProvider = String(providerEl.dataset.activeProvider || '').trim().toLowerCase();
  const nextProvider = String(providerEl.value || '').trim().toLowerCase();
  if (previousProvider && previousProvider !== nextProvider) {
    snapshotSettingsAiProviderProfile(kind, previousProvider);
  }
  restoreSettingsAiProviderProfile(kind, nextProvider);
}

function serializeSettingsAiProviderProfiles() {
  const profiles = cloneSettingsAiProviderProfiles();
  ['text', 'image', 'chat'].forEach((kind) => snapshotSettingsAiProviderProfile(kind, '', profiles));
  return profiles;
}

function getSettingsAiModelTestPayload(kind) {
  if (kind === 'chat' && getSelectedSettingsRadioValue('settings-chat-model-source', 'writing') === 'writing') {
    return getSettingsAiModelTestPayload('text');
  }
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  return {
    kind: kind === 'chat' ? 'text' : kind,
    provider: (document.getElementById(`settings-${prefix}-model-preset-provider`)?.value || '').trim(),
    presetCode: (document.getElementById(`settings-${prefix}-model-preset-code`)?.value || '').trim(),
    name: (document.getElementById(`settings-${prefix}-model-name`)?.value || '').trim(),
    baseUrl: (document.getElementById(`settings-${prefix}-model-base-url`)?.value || '').trim(),
    apiKey: getSettingsInputValue(`settings-${prefix}-model-api-key`).trim()
  };
}

function resetSettingsAiModelTestResult(kind) {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const resultEl = document.getElementById(`settings-${prefix}-model-test-result`);
  if (!resultEl) return;
  resultEl.textContent = 'API Key와 연결 정보를 확인합니다.';
  resultEl.style.color = 'var(--text-muted)';
}

async function runSettingsAiModelTest(kind) {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const buttonEl = document.getElementById(`settings-${prefix}-model-test-btn`);
  const resultEl = document.getElementById(`settings-${prefix}-model-test-result`);
  const payload = getSettingsAiModelTestPayload(kind);
  const modelCode = payload.provider === 'direct' ? payload.name : payload.presetCode;

  if (!modelCode) {
    if (resultEl) {
      resultEl.textContent = '❌ 테스트할 모델을 선택하거나 입력해 주세요.';
      resultEl.style.color = 'var(--danger)';
    }
    return;
  }
  if (payload.provider !== 'direct' && !payload.apiKey) {
    if (resultEl) {
      resultEl.textContent = '❌ 선택한 모델의 API Key를 입력해 주세요.';
      resultEl.style.color = 'var(--danger)';
    }
    return;
  }
  if (payload.provider === 'direct' && !payload.baseUrl) {
    if (resultEl) {
      resultEl.textContent = '❌ 직접 입력 모델의 Base URL을 입력해 주세요.';
      resultEl.style.color = 'var(--danger)';
    }
    return;
  }

  if (buttonEl) buttonEl.disabled = true;
  if (resultEl) {
    resultEl.textContent = '⏳ API Key와 연결 정보 확인 중...';
    resultEl.style.color = 'var(--text-muted)';
  }

  try {
    const result = await postJson('/api/v1/settings/test-ai-model', payload);
    const elapsed = Number.isFinite(Number(result?.latency_ms))
      ? ` · ${(Number(result.latency_ms) / 1000).toFixed(2)}초`
      : '';
    const credit = Number.isFinite(Number(result?.credit_balance))
      ? ` · 잔여 크레딧 ${Number(result.credit_balance).toLocaleString()}`
      : '';
    if (resultEl) {
      const roleLabel = kind === 'chat' ? 'Chat Model · ' : '';
      resultEl.textContent = `✅ ${roleLabel}${result?.display_name || modelCode} 연결 성공${credit}${elapsed}`;
      resultEl.style.color = 'var(--success)';
    }
  } catch (error) {
    if (resultEl) {
      const modelName = payload.name || modelCode || 'AI 모델';
      const errorMessage = String(error?.message || '연결 중 오류가 발생했습니다.');
      resultEl.textContent = errorMessage.includes('연결 실패')
        ? `❌ ${errorMessage}`
        : `❌ ${modelName} 연결 실패 · ${errorMessage}`;
      resultEl.style.color = 'var(--danger)';
    }
  } finally {
    if (buttonEl) buttonEl.disabled = false;
  }
}

function syncSettingsChatModelUi() {
  const source = getSelectedSettingsRadioValue('settings-chat-model-source', 'writing');
  const dedicatedCardEl = document.getElementById('settings-chat-model-dedicated-card');
  const writingSummaryEl = document.getElementById('settings-chat-model-writing-summary');
  if (dedicatedCardEl) dedicatedCardEl.style.display = source === 'dedicated' ? '' : 'none';

  const writingModelName = (
    document.getElementById('settings-text-model-name')?.value
    || document.getElementById('settings-text-model-preset-code')?.selectedOptions?.[0]?.textContent
    || document.getElementById('settings-text-model-preset-code')?.value
    || '현재 글쓰기 모델'
  ).trim();
  if (writingSummaryEl) {
    writingSummaryEl.textContent = source === 'writing'
      ? `현재 글쓰기 모델(${writingModelName})을 Chat Model 역할에도 사용합니다.`
      : 'Chat Model을 글쓰기 모델과 별도로 설정합니다.';
  }
  if (source === 'dedicated') syncSettingsAiModelUi('chat');
  syncSettingsSnsAiHint();
}

function markSettingsMajorPendingChanges(pending = true) {
  settingsMajorHasPendingBasicChanges = Boolean(pending);
  updateSettingsMajorSaveUi();
}

function updateSettingsMajorSaveUi() {
  const saveBtns = document.querySelectorAll('#settings-major-save-btn, .settings-major-save-btn');
  const statusEls = Array.from(document.querySelectorAll('.settings-major-save-status'));
  const isDirty = settingsMajorHasPendingBasicChanges === true;

  saveBtns.forEach((btn) => {
    btn.disabled = !isDirty || settingsMajorSaveInFlight;
  });

  if (statusEls.length === 0) return;
  if (settingsMajorSaveInFlight) {
    statusEls.forEach((statusEl) => {
      statusEl.textContent = '저장 중...';
      statusEl.style.color = 'var(--text-muted)';
    });
    return;
  }
  if (isDirty) {
    statusEls.forEach((statusEl) => {
      statusEl.textContent = '저장되지 않은 변경사항';
      statusEl.style.color = 'var(--warning, #d97706)';
    });
    return;
  }
  statusEls.forEach((statusEl) => {
    statusEl.textContent = '저장됨';
    statusEl.style.color = 'var(--success, #16a34a)';
  });
}

function syncScopedMajorSaveActions() {
  const blogSaveActionsEl = document.getElementById('blog-major-save-actions');
  if (blogSaveActionsEl) {
    const shouldShow = ['collect', 'auto'].includes(String(blogActiveTab || ''));
    blogSaveActionsEl.hidden = !shouldShow;
    blogSaveActionsEl.style.display = shouldShow ? 'inline-flex' : 'none';
  }

  const shoppingSaveActionsEl = document.getElementById('shopping-major-save-actions');
  if (shoppingSaveActionsEl) {
    const shouldShow = String(shoppingActiveTab || '') === 'auto';
    shoppingSaveActionsEl.hidden = !shouldShow;
    shoppingSaveActionsEl.style.display = shouldShow ? 'inline-flex' : 'none';
  }
}

function setSettingsMajorResultText(message) {
  const resultEls = document.querySelectorAll('.settings-major-result');
  resultEls.forEach(el => el.textContent = String(message || ''));
}

function stopSettingsTypingPreview() {
  if (settingsTypingPreviewTimer) {
    clearTimeout(settingsTypingPreviewTimer);
    settingsTypingPreviewTimer = null;
  }
}

function setSettingsTypingPreviewMeta(message) {
  const metaEl = document.getElementById('settings-typing-preview-meta');
  if (!metaEl) return;
  metaEl.textContent = String(message || '');
}

function getSettingsTypingPreviewDelay(speedKey) {
  const key = String(speedKey || '').trim().toUpperCase();
  const base = SETTINGS_TYPING_PREVIEW_DELAY[key] || SETTINGS_TYPING_PREVIEW_DELAY.NORMAL;
  const jitter = Math.floor(base * 0.35);
  const offset = Math.floor(Math.random() * (jitter * 2 + 1)) - jitter;
  return Math.max(1, base + offset);
}

function getSettingsTypingPreviewSourceText() {
  const inputEl = document.getElementById('settings-typing-preview-input');
  const raw = String(inputEl?.value || '').trim();
  if (raw) return raw;
  const placeholder = String(inputEl?.placeholder || '').trim();
  if (placeholder) return placeholder;
  return SETTINGS_TYPING_PREVIEW_DEFAULT_TEXT;
}

function playSettingsTypingPreview() {
  const targetEl = document.getElementById('settings-typing-preview-text');
  const speedEl = document.getElementById('settings-typing-speed');
  const sampleText = getSettingsTypingPreviewSourceText();
  if (!targetEl || !speedEl) return;
  if (!sampleText) {
    targetEl.textContent = '미리보기 문구를 입력해 주세요.';
    setSettingsTypingPreviewMeta('자동 재생: 대기');
    stopSettingsTypingPreview();
    return;
  }

  stopSettingsTypingPreview();
  const runId = ++settingsTypingPreviewRunId;
  const speedKey = String(speedEl.value || 'NORMAL').trim().toUpperCase();
  let cursor = 0;
  let repeatIndex = 1;
  targetEl.textContent = '';
  setSettingsTypingPreviewMeta(`자동 재생: ${repeatIndex}/${SETTINGS_TYPING_PREVIEW_REPEAT_COUNT}`);

  const tick = () => {
    if (runId !== settingsTypingPreviewRunId) return;
    if (cursor >= sampleText.length) {
      targetEl.textContent = sampleText;
      if (repeatIndex >= SETTINGS_TYPING_PREVIEW_REPEAT_COUNT) {
        setSettingsTypingPreviewMeta(`자동 재생 완료: ${SETTINGS_TYPING_PREVIEW_REPEAT_COUNT}회`);
        stopSettingsTypingPreview();
        return;
      }
      repeatIndex += 1;
      cursor = 0;
      setSettingsTypingPreviewMeta(`자동 재생: ${repeatIndex}/${SETTINGS_TYPING_PREVIEW_REPEAT_COUNT}`);
      settingsTypingPreviewTimer = setTimeout(tick, 420);
      return;
    }
    cursor += 1;
    targetEl.textContent = `${sampleText.slice(0, cursor)}▌`;
    settingsTypingPreviewTimer = setTimeout(tick, getSettingsTypingPreviewDelay(speedKey));
  };

  settingsTypingPreviewTimer = setTimeout(tick, 120);
}

function scheduleSettingsMajorAutoSave({ immediate = false } = {}) {
  if (settingsMajorApplyingForm || !settingsMajorLoadedOnce) return;
  const currentSignature = buildSettingsMajorBasicSignature();
  const isDirty = currentSignature !== settingsMajorLastSavedSignature;
  markSettingsMajorPendingChanges(isDirty);
  if (!isDirty) return;
  setSettingsMajorResultText('저장되지 않은 변경사항이 있습니다.');
}

async function loadSettingsMajor({ force = false, skipPendingConfirm = false } = {}) {
  const canReload = await shouldProceedWithMajorSettingsReload({
    force,
    skipPendingConfirm,
    contextLabel: '설정 화면'
  });
  if (!canReload) return false;

  const refreshBtns = document.querySelectorAll('.settings-major-refresh-btn');
  const resultEls = document.querySelectorAll('.settings-major-result');

  refreshBtns.forEach(btn => btn.disabled = true);
  updateSettingsStatus('.settings-major-result', '불러오는 중...', 'info');
  try {
    const data = await fetchJson('/api/v1/settings/major');
    applySettingsMajorToForm(data);
    await loadSettingsSnsRuntimeStatus();
    updateSettingsStatus('.settings-major-result', `불러오기 완료: ${data.configPath || '-'}`, 'success');
    return true;
  } catch (e) {
    updateSettingsStatus('.settings-major-result', `오류: ${e.message}`, 'error');
    return false;
  } finally {
    refreshBtns.forEach(btn => btn.disabled = false);
  }
}

function buildSettingsMajorPayload() {
  const imageSources = {};
  SETTINGS_SHOPPING_SLOT_ORDER.forEach((slot) => {
    const meta = SETTINGS_SHOPPING_SLOT_META[slot];
    const domValue = (document.getElementById(`settings-image-source-${slot}`)?.value || '').trim();
    // DOM input이 비어있을 수 있음 (쇼핑 설정 탭이 활성화되지 않으면 renderSettingsShoppingImageSlot이 값을 채우지 않음)
    // 그 경우 메모리에 있는 슬롯 데이터를 사용하여 기존 값이 유실되지 않도록 함
    const memoryValue = String(settingsShoppingImageSlots?.[slot]?.source || '').trim();
    imageSources[meta.key] = domValue || memoryValue;
  });

  const basic = getSettingsMajorBasicValuesFromDom();

  return {
    ...basic,
    ...imageSources
  };
}

function revokeSettingsShoppingObjectUrl(slot) {
  const current = settingsShoppingImageObjectUrls[slot];
  if (current) {
    URL.revokeObjectURL(current);
    delete settingsShoppingImageObjectUrls[slot];
  }
}

function buildSettingsShoppingPreviewUrl(slot, source) {
  const value = String(source || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const query = new URLSearchParams({
    slot,
    source: value,
    _t: String(Date.now())
  });
  return `/api/v1/settings/shopping-image/preview?${query.toString()}`;
}

function clearStagedSettingsShoppingImage(slot) {
  delete settingsShoppingImageFileState[slot];
  revokeSettingsShoppingObjectUrl(slot);
  const fileInput = document.getElementById(`settings-image-file-${slot}`);
  if (fileInput) fileInput.value = '';
}

function renderSettingsShoppingImageSlot(slot) {
  const slotData = settingsShoppingImageSlots[slot] || {};
  const sourceInput = document.getElementById(`settings-image-source-${slot}`);
  const previewWrap = document.getElementById(`settings-image-preview-wrap-${slot}`);
  const previewImg = document.getElementById(`settings-image-preview-${slot}`);
  const metaEl = document.getElementById(`settings-image-meta-${slot}`);
  if (!sourceInput || !previewWrap || !previewImg || !metaEl) return;

  let source = String(sourceInput.value || '').trim();
  if (!source) source = String(slotData.source || '').trim();
  sourceInput.value = source;

  const stagedFile = settingsShoppingImageFileState[slot];
  if (stagedFile) {
    revokeSettingsShoppingObjectUrl(slot);
    const objectUrl = URL.createObjectURL(stagedFile);
    settingsShoppingImageObjectUrls[slot] = objectUrl;
    previewImg.src = objectUrl;
    previewWrap.classList.add('has-image');
    metaEl.textContent = `선택됨(저장 시 반영): ${stagedFile.name}`;
    return;
  }

  revokeSettingsShoppingObjectUrl(slot);
  const previewUrl = buildSettingsShoppingPreviewUrl(slot, source);
  if (previewUrl) {
    const modeText = /^https?:\/\//i.test(source) ? '원격 URL' : '로컬 파일';
    metaEl.textContent = `현재 이미지: ${modeText}`;
    previewImg.onload = () => {
      previewWrap.classList.add('has-image');
    };
    previewImg.onerror = () => {
      previewWrap.classList.remove('has-image');
      metaEl.textContent = '현재 이미지: 미리보기를 불러오지 못했습니다.';
    };
    previewWrap.classList.remove('has-image');
    previewImg.src = previewUrl;
  } else {
    previewImg.onload = null;
    previewImg.onerror = null;
    previewImg.removeAttribute('src');
    previewWrap.classList.remove('has-image');
    metaEl.textContent = '현재 이미지: 설정 없음';
  }
}

function renderSettingsShoppingImageSlots() {
  SETTINGS_SHOPPING_SLOT_ORDER.forEach((slot) => {
    const sourceInput = document.getElementById(`settings-image-source-${slot}`);
    const source = String(settingsShoppingImageSlots?.[slot]?.source || '').trim();
    if (sourceInput) sourceInput.value = source;
    renderSettingsShoppingImageSlot(slot);
  });
}

function restoreSettingsShoppingDefault(slot) {
  const meta = SETTINGS_SHOPPING_SLOT_META[slot];
  if (!meta) return;
  clearStagedSettingsShoppingImage(slot);
  const source = String(settingsShoppingImageDefaults?.[meta.key] || '').trim();
  const sourceInput = document.getElementById(`settings-image-source-${slot}`);
  if (sourceInput) sourceInput.value = source;
  if (!settingsShoppingImageSlots[slot]) settingsShoppingImageSlots[slot] = {};
  settingsShoppingImageSlots[slot].source = source;
  renderSettingsShoppingImageSlot(slot);
}

function clearSettingsShoppingOptional(slot) {
  clearStagedSettingsShoppingImage(slot);
  const sourceInput = document.getElementById(`settings-image-source-${slot}`);
  if (sourceInput) sourceInput.value = '';
  if (!settingsShoppingImageSlots[slot]) settingsShoppingImageSlots[slot] = {};
  settingsShoppingImageSlots[slot].source = '';
  renderSettingsShoppingImageSlot(slot);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('파일이 선택되지 않았습니다.'));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

async function uploadShoppingImageFromSettings(slot, file) {
  if (!file) throw new Error('업로드할 이미지 파일을 먼저 선택해 주세요.');
  const dataUrl = await readFileAsDataUrl(file);
  return postJson('/api/v1/settings/shopping-image', {
    slot,
    fileName: file.name,
    mimeType: file.type || '',
    base64Data: dataUrl
  });
}

async function uploadPendingSettingsShoppingImages(resultEls) {
  for (const slot of SETTINGS_SHOPPING_SLOT_ORDER) {
    const file = settingsShoppingImageFileState[slot];
    if (!file) continue;
    const label = SETTINGS_SHOPPING_SLOT_META[slot]?.label || slot;
    if (resultEls) resultEls.forEach(el => el.textContent = `이미지 업로드 중... (${label}: ${file.name})`);
    const data = await uploadShoppingImageFromSettings(slot, file);
    const sourceValue = String(data?.value || '').trim();
    const sourceInput = document.getElementById(`settings-image-source-${slot}`);
    if (sourceInput) sourceInput.value = sourceValue;
    if (!settingsShoppingImageSlots[slot]) settingsShoppingImageSlots[slot] = {};
    settingsShoppingImageSlots[slot].source = sourceValue;
    clearStagedSettingsShoppingImage(slot);
  }
}

function ensureRequiredSettingsShoppingImages() {
  // 슬롯 데이터가 아직 로드되지 않은 경우 검증을 건너뜁니다
  if (!settingsShoppingImageSlots || Object.keys(settingsShoppingImageSlots).length === 0) return;
  for (const slot of SETTINGS_SHOPPING_SLOT_ORDER) {
    const meta = SETTINGS_SHOPPING_SLOT_META[slot];
    if (!meta?.required) continue;
    // DOM input 대신 메모리 상태로 검사 (렌더링 여부와 무관하게 항상 정확함)
    const slotSource = String(settingsShoppingImageSlots?.[slot]?.source || '').trim();
    const hasStagedFile = !!settingsShoppingImageFileState?.[slot];
    if (!slotSource && !hasStagedFile) {
      throw new Error(`${meta.label}는 필수입니다. 이미지를 선택하거나 기본 이미지로 복원해 주세요.`);
    }
  }
}

async function saveSettingsMajor({ mode = 'manual' } = {}) {
  const saveBtns = document.querySelectorAll('#settings-major-save-btn, .settings-major-save-btn');
  const resultEls = document.querySelectorAll('.settings-major-result');
  let savedResponse = null;

  if (settingsMajorSaveInFlight) {
    return;
  }

  settingsMajorSaveInFlight = true;
  updateSettingsMajorSaveUi();
  console.log(`[Settings] Save starting (mode: ${mode})`);

  try {
    updateSettingsStatus('.settings-major-result', '주요 설정 저장 중...', 'info');

    await uploadPendingSettingsShoppingImages(resultEls);
    ensureRequiredSettingsShoppingImages();

    const payload = buildSettingsMajorPayload();
    const data = await postJson('/api/v1/settings/major', payload);
    savedResponse = data;
    const warningMessages = Array.isArray(data?.warnings)
      ? data.warnings.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const warningSuffix = warningMessages.length > 0
      ? `\n확인 필요: ${warningMessages.join(' / ')}`
      : '';

    console.log('[Settings] Save successful');
    applySettingsMajorToForm(data);
    commitSettingsMajorSavedState();
    uiSheetsReady = false;
    invalidateWpCategoryCache();

    if (data.restarting) {
      updateSettingsStatus(
        '.settings-major-result',
        `${data.message || '주요 설정 저장 완료'}\n주소/포트 변경으로 인해 서버를 재시작 중입니다... 새 주소로 이동합니다.${warningSuffix}`,
        'success'
      );
      if (warningMessages.length > 0) {
        showUiToast({
          level: 'warn',
          title: '설정 저장 후 확인 필요',
          message: warningMessages.join(' / '),
          dedupeKey: 'settings-major-save-warnings',
          timeoutMs: 10000
        });
      }
      setTimeout(() => {
        window.location.href = `http://${data.newHost === '0.0.0.0' ? '127.0.0.1' : data.newHost}:${data.newPort}`;
      }, 1500);
      return;
    }

    const mcpStatusLine = data?.remoteMcpStatus?.running
      ? `\nMCP: ${data.remoteMcpStatus.endpoint || '-'}`
      : (data?.remoteMcpStatus?.enabled === false ? '\nMCP: 비활성화' : '');
    updateSettingsStatus(
      '.settings-major-result',
      `${data.message || '주요 설정 저장 완료'}\n${data.configPath || '-'}${mcpStatusLine}${warningSuffix}`,
      'success'
    );
    if (warningMessages.length > 0) {
      showUiToast({
        level: 'warn',
        title: '설정 저장 후 확인 필요',
        message: warningMessages.join(' / '),
        dedupeKey: 'settings-major-save-warnings',
        timeoutMs: 10000
      });
    }
    try {
      await Promise.all([loadConfigStatus(), loadDashboard()]);
      await loadSettingsSnsRuntimeStatus();
      if (uiConfigReady) {
        await ensureSheetsPreflightUi({ force: true, silent: true });
      }
      commitSettingsMajorSavedState();
    } catch (refreshError) {
      console.warn('[Settings] Post-save refresh failed:', refreshError);
      updateSettingsStatus(
        '.settings-major-result',
        `${data.message || '주요 설정 저장 완료'}\n일부 화면 갱신에 실패했습니다. 새로고침 후 다시 확인해 주세요.${warningSuffix}`,
        'success'
      );
      showUiToast({
        level: 'warn',
        title: '설정 저장 후 확인 필요',
        message: '설정은 저장됐지만 일부 화면 갱신에 실패했습니다. 새로고침 후 다시 확인해 주세요.',
        dedupeKey: 'settings-major-refresh-failed',
        timeoutMs: 9000
      });
    }
  } catch (e) {
    console.error('[Settings] Save failed:', e);
    if (savedResponse) {
      commitSettingsMajorSavedState();
      updateSettingsStatus(
        '.settings-major-result',
        `${savedResponse.message || '주요 설정 저장 완료'}\n일부 후속 작업에 실패했습니다: ${e.message}`,
        'success'
      );
      showUiToast({
        level: 'warn',
        title: '설정 저장 후 확인 필요',
        message: `설정은 저장됐지만 후속 작업 중 오류가 있었습니다: ${e.message}`,
        dedupeKey: 'settings-major-post-save-failed',
        timeoutMs: 9000
      });
    } else {
      updateSettingsStatus('.settings-major-result', `오류: ${e.message}`, 'error');
      showUiToast({
        level: 'error',
        title: '설정 저장 실패',
        message: `설정을 저장하지 못했습니다: ${e.message}`,
        dedupeKey: 'settings-major-save-failed',
        timeoutMs: 10000
      });
    }
  } finally {
    settingsMajorSaveInFlight = false;
    updateSettingsMajorSaveUi();
  }
}

async function regenerateSettingsMcpToken() {
  try {
    const data = await postJson('/api/v1/settings/mcp-token', {});
    setSettingsMcpTokenValue(String(data?.token || ''), { visible: true });
    syncSettingsMcpUi();
    refreshSettingsMajorPendingState();
    updateSettingsStatus('.settings-major-result', '새 MCP bearer token을 생성했습니다. 저장하면 파일에 반영됩니다.', 'success');
  } catch (e) {
    updateSettingsStatus('.settings-major-result', `MCP token 재발급 실패: ${e.message}`, 'error');
  }
}

function toggleSettingsMcpTokenVisibility() {
  settingsMcpTokenVisible = !settingsMcpTokenVisible;
  syncSettingsMcpUi();
}

async function copySettingsMcpToken() {
  const token = getSettingsMcpTokenValue();
  if (!token) {
    updateSettingsStatus('.settings-major-result', '복사할 Bearer Token이 없습니다.', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(token);
    updateSettingsStatus('.settings-major-result', 'Bearer Token을 클립보드에 복사했습니다.', 'success');
  } catch (e) {
    updateSettingsStatus('.settings-major-result', `Bearer Token 복사 실패: ${e.message}`, 'error');
  }
}

function buildGoogleSheetOpenUrl(rawInput) {
  const raw = String(rawInput || '').trim();
  if (!raw) return 'https://docs.google.com/spreadsheets';

  const lower = raw.toLowerCase();
  const hasPlaceholderHint =
    lower.includes('여기에') ||
    lower.includes('구글시트') ||
    lower.includes('your_') ||
    lower.includes('<') ||
    lower.includes('...');
  if (hasPlaceholderHint) return 'https://docs.google.com/spreadsheets';

  const extractId = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^[a-zA-Z0-9-_]{20,}$/.test(text)) return text;
    try {
      const u = new URL(text);
      const byPath = u.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
      if (byPath?.[1]) return byPath[1];
      const byQuery = u.searchParams.get('id');
      if (byQuery && /^[a-zA-Z0-9-_]{20,}$/.test(byQuery)) return byQuery;
    } catch (_e) { }
    return '';
  };

  const id = extractId(raw);
  if (id) return `https://docs.google.com/spreadsheets/d/${id}`;
  if (/^https?:\/\//i.test(raw) && !/^https?:\/\/docs\.google\.com\/spreadsheets/i.test(raw)) return raw;
  return 'https://docs.google.com/spreadsheets';
}

function openGoogleSheetFromUi() {
  const resultEls = document.querySelectorAll('.settings-major-result');
  const inputValue = (document.getElementById('settings-google-sheet-url')?.value || '').trim();
  const openUrl = buildGoogleSheetOpenUrl(inputValue);
  window.open(openUrl, '_blank', 'noopener,noreferrer');
  resultEls.forEach(el => {
    if (/^https?:\/\/docs\.google\.com\/spreadsheets\/d\//i.test(openUrl)) {
      el.textContent = `스프레드시트를 새 탭에서 열었습니다.\n${openUrl}`;
    } else {
      el.textContent = [
        '스프레드시트 목록 페이지를 열었습니다.',
        'Google 계정을 먼저 연결한 뒤, 사용할 문서의 URL을 GOOGLE_SHEET_URL에 입력하세요.',
        openUrl
      ].join('\n');
    }
  });
}

async function loadGoogleAuthStatus() {
  const statusById = document.getElementById('settings-google-auth-status');
  const statusByClass = Array.from(document.querySelectorAll('.settings-google-auth-status'));
  const statusEls = statusById
    ? [statusById, ...statusByClass.filter(el => el !== statusById)]
    : statusByClass;
  if (statusEls.length === 0) return;

  const detailsById = document.getElementById('settings-google-auth-details');
  const detailsByClass = Array.from(document.querySelectorAll('.settings-google-auth-details'));
  const detailEls = detailsById
    ? [detailsById, ...detailsByClass.filter(el => el !== detailsById)]
    : detailsByClass;

  statusEls.forEach(el => {
    el.textContent = '상태 확인 중...';
    el.className = 'status-badge';
  });
  detailEls.forEach(el => {
    el.textContent = '연결 상태 확인 중...';
  });

  try {
    const data = await fetchJson('/api/v1/google-oauth/status');
    const state = String(data?.state || '').trim().toLowerCase();
    const connectedEmail = String(data?.connectedEmail || data?.email || '').trim();
    const lastVerifiedAt = String(data?.lastVerifiedAt || '').trim();
    const lastVerifiedText = lastVerifiedAt
      ? new Date(lastVerifiedAt).toLocaleString()
      : '';
    const detailText = state === 'connected'
      ? [
        `연결 계정: ${connectedEmail || '-'}`,
        lastVerifiedText ? `마지막 확인: ${lastVerifiedText}` : '',
        data?.message || ''
      ].filter(Boolean).join('\n')
      : [
        data?.message || 'Google 계정 연결이 필요합니다.',
        connectedEmail ? `이전 연결 계정: ${connectedEmail}` : ''
      ].filter(Boolean).join('\n');

    statusEls.forEach(el => {
      if (state === 'connected') {
        el.textContent = '연결됨';
        el.className = 'status-badge success';
      } else if (state === 'reauth_required') {
        el.textContent = '다시 로그인 필요';
        el.className = 'status-badge error';
      } else {
        el.textContent = '미연결';
        el.className = 'status-badge error';
      }
    });
    detailEls.forEach(el => {
      el.textContent = detailText;
    });
  } catch (e) {
    statusEls.forEach(el => {
      el.textContent = '상태 확인 실패';
      el.className = 'status-badge error';
    });
    detailEls.forEach(el => {
      el.textContent = `상태 조회 실패\n오류: ${String(e?.message || 'unknown')}`;
    });
  }
}

async function pollGoogleOauthStatus(maxAttempts = 60, intervalMs = 2000) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    try {
      const data = await fetchJson('/api/v1/google-oauth/status');
      if (String(data?.state || '').trim().toLowerCase() === 'connected') {
        await loadGoogleAuthStatus();
        return data;
      }
    } catch (_) {
      // ignore transient polling errors
    }
  }
  return null;
}

async function startGoogleOauth() {
  updateSettingsStatus('.settings-google-auth-result', '브라우저에서 Google 로그인을 진행하세요.', 'info');
  try {
    const data = await postJson('/api/v1/google-oauth/start', {});
    if (!data?.authUrl) {
      throw new Error('Google 인증 URL을 생성하지 못했습니다.');
    }
    let resolved = false;
    const handleOauthMessage = async (event) => {
      if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(String(event.origin || ''))) return;
      if (event.data?.source !== 'google-oauth') return;
      window.removeEventListener('message', handleOauthMessage);
      resolved = true;
      await loadGoogleAuthStatus();
      uiSheetsReady = false;
      if (event.data?.status === 'success') {
        updateSettingsStatus('.settings-google-auth-result', `연결 완료\n계정: ${event.data?.email || '-'}`, 'success');
      } else {
        updateSettingsStatus('.settings-google-auth-result', `오류: ${event.data?.message || 'Google 연결에 실패했습니다.'}`, 'error');
      }
    };
    window.addEventListener('message', handleOauthMessage);
    const popup = window.open(data.authUrl, 'google-oauth-login', 'width=620,height=760');
    if (!popup) {
      window.removeEventListener('message', handleOauthMessage);
      throw new Error('브라우저 팝업을 열지 못했습니다. 팝업 차단을 확인하세요.');
    }
    const status = await pollGoogleOauthStatus();
    window.removeEventListener('message', handleOauthMessage);
    if (resolved || String(status?.state || '').trim().toLowerCase() === 'connected') {
      updateSettingsStatus('.settings-google-auth-result', `연결 완료\n계정: ${status?.connectedEmail || status?.email || '-'}`, 'success');
      uiSheetsReady = false;
      return;
    }
    updateSettingsStatus('.settings-google-auth-result', '브라우저에서 로그인을 완료한 뒤 다시 상태를 확인하세요.', 'info');
  } catch (e) {
    updateSettingsStatus('.settings-google-auth-result', `오류: ${e.message}`, 'error');
  }
}

async function disconnectGoogleOauth() {
  updateSettingsStatus('.settings-google-auth-result', '연결 해제 중...', 'info');
  try {
    await postJson('/api/v1/google-oauth/disconnect', {});
    await loadGoogleAuthStatus();
    uiSheetsReady = false;
    updateSettingsStatus('.settings-google-auth-result', 'Google 계정 연결을 해제했습니다.', 'success');
  } catch (e) {
    updateSettingsStatus('.settings-google-auth-result', `오류: ${e.message}`, 'error');
  }
}

async function testGoogleOauth() {
  updateSettingsStatus('.settings-google-auth-result', '연결 테스트 중...', 'info');
  try {
    const data = await postJson('/api/v1/google-oauth/test', {});
    await loadGoogleAuthStatus();
    uiSheetsReady = false;
    updateSettingsStatus(
      '.settings-google-auth-result',
      [
        '연결 테스트 성공',
        data?.email ? `계정: ${data.email}` : '',
        data?.sheetTitle ? `시트: ${data.sheetTitle}` : ''
      ].filter(Boolean).join('\n'),
      'success'
    );
  } catch (e) {
    updateSettingsStatus('.settings-google-auth-result', `오류: ${e.message}`, 'error');
  }
}

async function startNaverLoginFromUi() {
  renderNaverSessionStatus(null, { checking: true, detail: '로그인 완료를 기다리는 중...' });
  updateSettingsStatus('.settings-major-result', '로그인 시작 요청 중...', 'info');
  try {
    await postJson('/api/v1/session/naver-login/start', {});
    updateSettingsStatus('.settings-major-result', '브라우저에서 네이버 로그인을 완료해 주세요.', 'info');
    const loginResult = await pollNaverLoginStatus();
    await loadNaverSessionStatus({ force: true });
    if (String(loginResult?.status || '') === 'success') {
      updateSettingsStatus('.settings-major-result', '네이버 로그인이 완료되었습니다.', 'success');
    } else {
      updateSettingsStatus(
        '.settings-major-result',
        `네이버 로그인에 실패했습니다: ${loginResult?.error || loginResult?.message || '로그인 완료를 확인하지 못했습니다.'}`,
        'error'
      );
    }
  } catch (e) {
    await loadNaverSessionStatus({ force: true });
    updateSettingsStatus('.settings-major-result', `오류: ${e.message}`, 'error');
  }
}

function renderNaverSessionStatus(data, options = {}) {
  const badge = document.getElementById('settings-naver-session-badge');
  const detail = document.getElementById('settings-naver-session-detail');
  const loginBtn = document.getElementById('settings-naver-login-btn');
  const logoutBtn = document.getElementById('settings-naver-logout-btn');
  if (!badge || !detail) return;

  if (options.checking) {
    badge.textContent = '확인 중';
    badge.className = 'status-badge';
    detail.textContent = options.detail || '네이버 로그인 상태를 확인하고 있습니다.';
    if (loginBtn) loginBtn.disabled = true;
    if (logoutBtn) logoutBtn.disabled = true;
    return;
  }

  const valid = data?.valid === true;
  const reason = String(data?.reason || '').trim();
  if (valid) {
    badge.textContent = '로그인됨';
    badge.className = 'status-badge success';
    detail.textContent = '네이버 로그인 세션이 정상입니다.';
  } else if (reason === 'expired') {
    badge.textContent = '로그인 만료';
    badge.className = 'status-badge error';
    detail.textContent = '세션이 만료되었습니다. 다시 로그인해 주세요.';
  } else if (reason === 'check_failed') {
    badge.textContent = '확인 실패';
    badge.className = 'status-badge error';
    detail.textContent = data?.message || '로그인 상태를 확인하지 못했습니다.';
  } else {
    badge.textContent = '로그아웃됨';
    badge.className = 'status-badge';
    detail.textContent = '저장된 네이버 로그인 정보가 없습니다.';
  }

  if (loginBtn) {
    loginBtn.hidden = valid;
    loginBtn.disabled = false;
  }
  if (logoutBtn) {
    logoutBtn.hidden = !valid;
    logoutBtn.disabled = false;
  }
}

async function loadNaverSessionStatus({ force = false } = {}) {
  renderNaverSessionStatus(null, { checking: true });
  try {
    const suffix = force ? '?force=1' : '';
    const data = await fetchJson(`/api/v1/session/naver${suffix}`);
    renderNaverSessionStatus(data);
    return data;
  } catch (e) {
    renderNaverSessionStatus({
      valid: false,
      reason: 'check_failed',
      message: e.message
    });
    return null;
  }
}

async function pollNaverLoginStatus(maxAttempts = 150, intervalMs = 2000) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    const data = await fetchJson('/api/v1/session/naver-login');
    const status = String(data?.status || '').trim().toLowerCase();
    if (status === 'success' || status === 'failed') return data;
  }
  return {
    status: 'failed',
    message: '로그인 확인 시간이 초과되었습니다.'
  };
}

async function logoutNaverFromUi() {
  const confirmed = await showUiConfirm(
    '이 기기에 저장된 네이버 로그인 정보를 삭제하고 로그아웃할까요?',
    {
      title: '네이버 로그아웃',
      confirmText: '로그아웃',
      cancelText: '취소'
    }
  );
  if (!confirmed) return;

  renderNaverSessionStatus(null, { checking: true, detail: '로그아웃 중...' });
  try {
    await postJson('/api/v1/session/naver-login/logout', {});
    await loadNaverSessionStatus({ force: true });
    updateSettingsStatus('.settings-major-result', '이 기기의 네이버 로그인 정보를 삭제했습니다.', 'success');
  } catch (e) {
    await loadNaverSessionStatus({ force: true });
    updateSettingsStatus('.settings-major-result', `로그아웃 실패: ${e.message}`, 'error');
  }
}

async function verifyWordPressAuthFromUi() {
  const resultEl = document.getElementById('settings-wordpress-verify-result');
  const btn = document.getElementById('settings-wordpress-verify-btn');
  if (!resultEl) return;

  const wordpressUrl = (document.getElementById('settings-wordpress-url')?.value || '').trim();
  const wordpressUserId = (document.getElementById('settings-wordpress-user-id')?.value || '').trim();
  const wordpressAppPassword = getSettingsInputValue('settings-wordpress-app-password').trim();

  updateSettingsStatus('#settings-wordpress-verify-result', '연동 확인 중...', 'info');
  if (btn) btn.disabled = true;

  try {
    const res = await postJson('/api/v1/session/wordpress-verify', {
      wordpressUrl,
      wordpressUserId,
      wordpressAppPassword
    });
    if (res.success) {
      updateSettingsStatus('#settings-wordpress-verify-result', '✅ ' + res.message, 'success');
      invalidateWpCategoryCache(); // 인증 성공 시 카테고리 정보 갱신을 위해 캐시 초기화
      fetchWpCategories(); // 백그라운드에서 즉시 갱신 시작
    } else {
      updateSettingsStatus('#settings-wordpress-verify-result', '❌ ' + res.message, 'error');
    }
  } catch (e) {
    updateSettingsStatus('#settings-wordpress-verify-result', `❌ 오류: ${e.message}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}



function setBlogAutoResultText(message) {
  const resultEl = document.getElementById('blog-publish-auto-result');
  if (resultEl) resultEl.textContent = String(message || '');
}

function setBlogCollectResultText(message) {
  const resultEl = document.getElementById('blog-collect-trends-result');
  if (resultEl) resultEl.textContent = String(message || '');
}

function setBlogCollectResultText(message) {
  const resultEl = document.getElementById('blog-collect-result');
  if (resultEl) resultEl.textContent = String(message || '').replace(/\\n/g, '\n');
}

let currentRssConfigs = [];
window.addRssConfig = function () {
  currentRssConfigs.push({ enabled: true, url: '', interval: 60, includeKeywords: '', excludeKeywords: '', naver_category: '', wordpress_category: '' });
  renderBlogCollectRssUi(currentRssConfigs);
  scheduleSettingsMajorAutoSave({ immediate: true });
};
window.removeRssConfig = function (index) {
  currentRssConfigs.splice(index, 1);
  renderBlogCollectRssUi(currentRssConfigs);
  scheduleSettingsMajorAutoSave({ immediate: true });
};
window.updateRssConfig = function (index, key, value) {
  if (currentRssConfigs[index]) {
    currentRssConfigs[index][key] = value;
    scheduleSettingsMajorAutoSave({ immediate: true });
  }
};
window.toggleAllRssConfigs = function (checked) {
  currentRssConfigs.forEach(rss => { rss.enabled = checked; });
  renderBlogCollectRssUi(currentRssConfigs);
  scheduleSettingsMajorAutoSave({ immediate: true });
};
window.openRssTest = function (index) {
  const url = currentRssConfigs[index]?.url;
  if (url) window.open(url, '_blank');
};
function buildWpCategorySelectHtml(selectedValue, index) {
  const containerId = `rss-category-container-${index}`;
  const triggerId = `rss-category-trigger-${index}`;
  const textId = `rss-category-text-${index}`;
  const menuId = `rss-category-menu-${index}`;
  const searchId = `rss-category-search-${index}`;
  const optionsId = `rss-category-options-${index}`;

  const defaultText = selectedValue || '카테고리 선택 (미지정 시 기본)';

  return `
    <div class="custom-select-container rss-category-container" id="${containerId}" style="width: 100%; z-index: ${100 - index};">
      <div class="custom-select-trigger" id="${triggerId}" style="min-height: 32px; font-size: 13px; border-radius: 4px;">
        <span id="${textId}">${defaultText}</span>
        <i class="chevron-down-icon"></i>
      </div>
      <div class="custom-select-menu" id="${menuId}">
        <div class="custom-select-search">
          <input type="text" id="${searchId}" placeholder="검색 또는 직접 입력 후 Enter..." autocomplete="off">
        </div>
        <div class="custom-select-options" id="${optionsId}">
          <div class="custom-select-loading">카테고리 정보를 불러오는 중...</div>
        </div>
      </div>
    </div>
  `;
}

function renderBlogCollectRssUi(configs = []) {
  currentRssConfigs = Array.isArray(configs) ? configs : [];
  const tbody = document.getElementById('blog-collect-rss-tbody');
  if (!tbody) return;

  // Attempt to load WP categories asynchronously if needed
  if (!categoryCache && !window._wpCatFetchTriggeredForRss) {
    window._wpCatFetchTriggeredForRss = true;
    fetchWpCategories().finally(() => {
      if (!categoryCache) categoryCache = []; // Default to empty array to prevent refetch loops
      renderBlogCollectRssUi(currentRssConfigs);
    });
  }

  tbody.innerHTML = '';

  // 헤더 체크박스 상태 동기화
  const toggleAllEl = document.getElementById('blog-collect-rss-toggle-all');
  if (toggleAllEl) {
    toggleAllEl.checked = currentRssConfigs.length > 0 && currentRssConfigs.every(rss => rss.enabled);
  }

  if (currentRssConfigs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding: 20px; text-align: center; color: var(--text-muted);">등록된 RSS 피드가 없습니다.</td></tr>';
    return;
  }
  const initTasks = [];

  currentRssConfigs.forEach((rss, index) => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-color)';
    tr.innerHTML = `
      <td style="padding: 10px; text-align: center;">
        <input type="checkbox" onchange="updateRssConfig(${index}, 'enabled', this.checked); renderBlogCollectRssUi(currentRssConfigs);" ${rss.enabled ? 'checked' : ''}>
      </td>
      <td style="padding: 10px;">
        <input type="url" placeholder="RSS URL" value="${rss.url || ''}" onchange="updateRssConfig(${index}, 'url', this.value)" style="width: 100%; min-height: 32px; padding: 0 8px; box-sizing: border-box;">
      </td>
      <td style="padding: 10px;">
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <input type="text" placeholder="네이버" value="${rss.naver_category || ''}" onchange="updateRssConfig(${index}, 'naver_category', this.value)" onblur="scheduleSettingsMajorAutoSave({ immediate: true })" style="width: 100%; min-height: 28px; padding: 0 8px; font-size: 12px; box-sizing: border-box;">
          <input type="text" placeholder="워드프레스" value="${rss.wordpress_category || rss.category || ''}" onchange="updateRssConfig(${index}, 'wordpress_category', this.value)" onblur="scheduleSettingsMajorAutoSave({ immediate: true })" style="width: 100%; min-height: 28px; padding: 0 8px; font-size: 12px; box-sizing: border-box;">
        </div>
      </td>
      <td style="padding: 10px; text-align: center;">
        <input type="number" min="1" step="1" value="${rss.interval || 60}" onchange="updateRssConfig(${index}, 'interval', parseInt(this.value, 10))" style="width: 60px; min-height: 32px; text-align: center;">
      </td>
      <td style="padding: 10px;">
        <input type="text" placeholder="포함(쉼표 구분)" value="${Array.isArray(rss.includeKeywords) ? rss.includeKeywords.join(', ') : (rss.includeKeywords || '')}" onchange="updateRssConfig(${index}, 'includeKeywords', this.value)" style="width: 100%; min-height: 32px; padding: 0 8px; box-sizing: border-box;">
      </td>
      <td style="padding: 10px;">
        <input type="text" placeholder="제외(쉼표 구분)" value="${Array.isArray(rss.excludeKeywords) ? rss.excludeKeywords.join(', ') : (rss.excludeKeywords || '')}" onchange="updateRssConfig(${index}, 'excludeKeywords', this.value)" style="width: 100%; min-height: 32px; padding: 0 8px; box-sizing: border-box;">
      </td>
      <td style="padding: 10px; text-align: center; white-space: nowrap;">
        <div style="display: flex; gap: 4px; justify-content: center;">
          <button type="button" class="secondary compact" onclick="openRssTest(${index})">테스트</button>
          <button type="button" class="secondary compact" onclick="removeRssConfig(${index})">삭제</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);

  });

  // Execute initialization tasks after all rows are fully mounted to the DOM
  setTimeout(() => initTasks.forEach(task => task()), 0);
}

function normalizeCategoryToken(input) {
  return String(input || '').trim();
}

function parseCategoryTokens(input) {
  if (Array.isArray(input)) {
    return Array.from(new Set(input.map(normalizeCategoryToken).filter(Boolean)));
  }
  const raw = String(input || '').trim();
  if (!raw) return [];
  return Array.from(new Set(
    raw
      .split(/[\n,]/)
      .map(normalizeCategoryToken)
      .filter(Boolean)
  ));
}

function serializeSelectedBlogAutoCategories() {
  return Array.from(blogAutoCategorySelected.values()).join(', ');
}

function getBlogAutoSettingsFromUi() {
  const modeEl = document.getElementById('blog-collect-trends-enabled');
  const variationNewEl = document.getElementById('blog-collect-trends-filter-new');
  const variationDashEl = document.getElementById('blog-collect-trends-filter-dash');
  const variationNumberEnabledEl = document.getElementById('blog-collect-trends-filter-number-enabled');
  const variationMinEl = document.getElementById('blog-collect-trends-filter-min');
  const variationTopEl = document.getElementById('blog-collect-trends-filter-top');
  const variationTypeEl = document.getElementById('blog-collect-trends-filter-type');
  const keywordReuseGapEl = document.getElementById('blog-collect-trends-reuse-gap');
  const trendsTimeEl = document.getElementById('blog-collect-trends-time');

  const variationMinRaw = String(variationMinEl?.value ?? '').trim();
  if (variationMinRaw && !/^-?\d+$/.test(variationMinRaw)) throw new Error('증감 숫자 기준은 정수만 입력할 수 있습니다.');
  const variationMin = normalizeBlogAutoVariationNumberValue(variationMinRaw, 50);

  const variationTopRaw = String(variationTopEl?.value ?? '').trim();
  if (variationTopRaw && !/^-?\d+$/.test(variationTopRaw)) throw new Error('상위 랭킹 개수는 앞선 정수만 필요합니다.');
  const variationTopN = normalizeBlogAutoVariationNumberValue(variationTopRaw, 5);

  const keywordReuseGapRaw = String(keywordReuseGapEl?.value ?? '').trim();
  if (keywordReuseGapRaw && !/^\d+$/.test(keywordReuseGapRaw)) throw new Error('중복 키워드 금지 간격은 0 이상의 정수만 입력할 수 있습니다.');
  const keywordReuseGap = normalizeBlogAutoKeywordReuseGapValue(keywordReuseGapRaw, 15);

  const categories = serializeSelectedBlogAutoCategories();

  return {
    COLLECT_TRENDS_ENABLED: Boolean(modeEl?.checked),
    COLLECT_TRENDS_CATEGORIES: categories,
    COLLECT_TRENDS_WP_CATEGORY: localStorage.getItem('blog_collect_trends_wp_category_value') || '',
    COLLECT_TRENDS_TIME: (trendsTimeEl?.value || '07:30').trim(),
    COLLECT_TRENDS_FILTER_INCLUDE_NEW: Boolean(variationNewEl?.checked),
    COLLECT_TRENDS_FILTER_INCLUDE_DASH: Boolean(variationDashEl?.checked),
    COLLECT_TRENDS_FILTER_INCLUDE_NUMBER: Boolean(variationNumberEnabledEl?.checked),
    COLLECT_TRENDS_FILTER_TYPE: (variationTypeEl?.value || 'min').trim(),
    COLLECT_TRENDS_FILTER_MIN_INCR: variationMin,
    COLLECT_TRENDS_FILTER_TOP_N: variationTopN,
    COLLECT_TRENDS_REUSE_GAP_DAYS: keywordReuseGap
  };
}

function setSelectedBlogAutoCategories(categories = []) {
  blogAutoCategorySelected = new Set(parseCategoryTokens(categories));
}

function ensureSelectedCategoriesInCatalog() {
  if (!blogAutoCategorySelected.size) return;
  const existingKeys = new Set(blogAutoCategoryCatalog.map((v) => String(v).toLowerCase()));
  for (const category of blogAutoCategorySelected.values()) {
    const key = String(category).toLowerCase();
    if (!existingKeys.has(key)) {
      blogAutoCategoryCatalog.push(category);
      existingKeys.add(key);
    }
  }
}

function renderBlogAutoCategoryOptions() {
  const optionContainers = Array.from(document.querySelectorAll('[data-blog-category-options]'));
  if (optionContainers.length === 0) return;

  const categories = Array.from(new Set(blogAutoCategoryCatalog.map(normalizeCategoryToken).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'ko', { sensitivity: 'base' }));

  if (categories.length === 0) {
    optionContainers.forEach((el) => {
      el.innerHTML = '<p class="category-hint">표시할 카테고리가 없습니다.</p>';
    });
    return;
  }

  const html = categories
    .map((value) => {
      const escaped = escapeHtml(value);
      const active = blogAutoCategorySelected.has(value) ? 'active' : '';
      return `<button type="button" class="category-option-btn ${active}" data-blog-collect-trends-category-toggle="${escaped}">${escaped}</button>`;
    })
    .join('');
  optionContainers.forEach((el) => {
    el.innerHTML = html;
  });
}

function renderBlogAutoCategoryUi() {
  ensureSelectedCategoriesInCatalog();
  renderBlogAutoCategoryOptions();
}

function applyBlogAutoCategoryCatalog(data = {}) {
  const list = Array.isArray(data.categories) ? data.categories : [];
  blogAutoCategoryCatalog = parseCategoryTokens(list);
  blogAutoCategoryCatalogMeta = {
    runtimeCount: Number(data.runtimeCategories?.length || 0),
    trendCount: Number(data.trendCategories?.length || 0),
    updatedAt: String(data.updatedAt || '')
  };
}

async function loadBlogAutoCategoryCatalog(options = {}) {
  const force = options?.force === true;
  const silent = options?.silent === true;
  try {
    const query = force ? '?force=true' : '';
    const data = await fetchJson(`/api/v1/blog/auto/categories${query}`);
    applyBlogAutoCategoryCatalog(data);
    renderBlogAutoCategoryUi();
    if (!silent) {
      const base = `카테고리 목록 갱신 완료(${blogAutoCategoryCatalog.length}건)`;
      const detail = `(마스터 ${blogAutoCategoryCatalogMeta.runtimeCount} / 트렌드 ${blogAutoCategoryCatalogMeta.trendCount})`;
      setBlogAutoResultText(`${base} ${detail}`);
    }
  } catch (e) {
    if (!silent) setBlogAutoResultText(`카테고리 목록 갱신 실패: ${e.message}`);
  }
}

function clearAllBlogAutoCategories() {
  blogAutoCategorySelected.clear();
  renderBlogAutoCategoryUi();
  scheduleSettingsMajorAutoSave({ immediate: true });
}

function setShoppingAutoResultText(message) {
  const resultEl = document.getElementById('shopping-auto-result');
  if (resultEl) resultEl.textContent = String(message || '');
}

function normalizeShoppingAutoDailyPostsValue(rawValue) {
  let value = parseInt(String(rawValue || '').trim(), 10);
  if (!Number.isInteger(value) || value < 0) value = 0;
  return value;
}

function clampShoppingAutoDailyPostsInputValue(options = {}) {
  const force = options?.force === true;
  const inputEl = document.getElementById('shopping-auto-daily-posts');
  if (!inputEl) return;

  const raw = String(inputEl.value || '').trim();
  if (!raw) {
    if (force) inputEl.value = '0';
    return;
  }

  const parsed = parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    if (force) inputEl.value = '0';
    return;
  }

  const normalized = normalizeShoppingAutoDailyPostsValue(parsed);
  if (normalized !== parsed) {
    inputEl.value = String(normalized);
  }
}


function normalizeBlogAutoVariationNumberValue(rawValue, fallback = 50) {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return parsed;
}

function normalizeBlogAutoVariationNumberEnabledValue(rawValue, fallback = true) {
  if (typeof rawValue === 'boolean') return rawValue;
  const raw = String(rawValue ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['true', '1', 'yes', 'on', 'y'].includes(raw)) return true;
  if (['false', '0', 'no', 'off', 'n'].includes(raw)) return false;
  return fallback;
}

function normalizeBlogAutoKeywordReuseGapValue(rawValue, fallback = 15) {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

function syncBlogAutoVariationNumberUi() {
  const enabledEl = document.getElementById('blog-collect-trends-filter-number-enabled');
  const minWrap = document.getElementById('blog-collect-trends-filter-min-wrap');
  const topWrap = document.getElementById('blog-collect-trends-filter-top-wrap');
  if (!enabledEl) return;
  const enabled = Boolean(enabledEl.checked);

  if (minWrap) {
    const minInput = document.getElementById('blog-collect-trends-filter-min');
    if (minInput) minInput.disabled = !enabled;
    minWrap.classList.toggle('input-disabled', !enabled);
  }
  if (topWrap) {
    const topInput = document.getElementById('blog-collect-trends-filter-top');
    if (topInput) topInput.disabled = !enabled;
    topWrap.classList.toggle('input-disabled', !enabled);
  }
}

function syncBlogAutoVariationTypeUi() {
  const typeEl = document.getElementById('blog-collect-trends-filter-type');
  const minWrap = document.getElementById('blog-collect-trends-filter-min-wrap');
  const topWrap = document.getElementById('blog-collect-trends-filter-top-wrap');
  if (!typeEl || !minWrap || !topWrap) return;

  if (typeEl.value === 'top') {
    minWrap.style.display = 'none';
    topWrap.style.display = 'block';
  } else {
    minWrap.style.display = 'block';
    topWrap.style.display = 'none';
  }
}
function normalizeBlogAutoVariationNumberValue(rawValue, fallback = 50) {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return parsed;
}

function normalizeBlogAutoVariationNumberEnabledValue(rawValue, fallback = true) {
  if (typeof rawValue === 'boolean') return rawValue;
  const str = String(rawValue ?? '').toLowerCase();
  if (str === 'true') return true;
  if (str === 'false') return false;
  return fallback;
}


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
  const headlessEl = document.getElementById('blog-publish-auto-headless');

  setBlogAutoResultText('불러오는 중...');
  try {
    const data = await fetchJson('/api/v1/settings/major');
    const fields = data?.fields || {};

    if (publishEnabledEl) publishEnabledEl.checked = Boolean(fields.PUBLISH_AUTO_ENABLED);
    if (publishIntervalEl) publishIntervalEl.value = String(fields.PUBLISH_AUTO_INTERVAL_MIN || 60);
    if (publishBatchEl) publishBatchEl.value = String(fields.PUBLISH_AUTO_BATCH_SIZE || 1);
    if (postStatusEl) postStatusEl.value = fields.PUBLISH_AUTO_POST_STATUS === 'draft' ? 'draft' : 'publish';

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
        COLLECT_RSS_CONFIGS: currentRssConfigs
      }
    });
    if (resultEl) resultEl.textContent = `RSS 수집 완료: ${JSON.stringify(data.data?.summary || data)}`;
  } catch (e) {
    if (resultEl) resultEl.textContent = `오류: ${e.message}`;
  }
}

async function loadShoppingAutoSettings({ force = false, skipPendingConfirm = false } = {}) {
  const canReload = await shouldProceedWithMajorSettingsReload({
    force,
    skipPendingConfirm,
    contextLabel: '쇼핑 자동 포스팅 설정'
  });
  if (!canReload) return false;

  const publishEnabledEl = document.getElementById('shopping-publish-auto-enabled');
  const publishIntervalEl = document.getElementById('shopping-publish-auto-interval');
  const publishBatchEl = document.getElementById('shopping-publish-auto-batch');
  const startTimeEl = document.getElementById('shopping-publish-auto-start-time');
  const endTimeEl = document.getElementById('shopping-publish-auto-end-time');
  const notifyEnabledEl = document.getElementById('shopping-publish-auto-notify-enabled');
  const headlessEl = document.getElementById('shopping-publish-auto-headless');
  setShoppingAutoResultText('불러오는 중...');
  try {
    const data = await fetchJson('/api/v1/settings/major');
    const fields = data?.fields || {};
    if (publishEnabledEl) publishEnabledEl.checked = Boolean(fields.SHOPPING_PUBLISH_AUTO_ENABLED);
    if (publishIntervalEl) publishIntervalEl.value = String(fields.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN || 60);
    if (publishBatchEl) publishBatchEl.value = String(fields.SHOPPING_PUBLISH_AUTO_BATCH_SIZE || 1);
    if (startTimeEl) startTimeEl.value = String(fields.SHOPPING_PUBLISH_AUTO_START_TIME || '00:00');
    if (endTimeEl) endTimeEl.value = String(fields.SHOPPING_PUBLISH_AUTO_END_TIME || '23:59');
    if (headlessEl) headlessEl.checked = Boolean(fields.SHOPPING_PUBLISH_AUTO_HEADLESS ?? true);
    if (notifyEnabledEl) notifyEnabledEl.checked = Boolean(fields.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED);

    const targetChannels = Array.isArray(fields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS)
      ? fields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS
      : String(fields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS || 'naver').split(',').map(v => v.trim()).filter(Boolean);
    document.querySelectorAll('[data-shopping-publish-target]').forEach((el) => {
      el.checked = targetChannels.includes(el.getAttribute('data-shopping-publish-target'));
    });

    setShoppingAutoResultText([
      '불러오기 완료',
      '- 자동발행 기준을 확인했습니다.',
      '- 변경 후 상단의 저장 및 적용 버튼으로 반영할 수 있습니다.'
    ].join('\n'));
    return true;
  } catch (e) {
    setShoppingAutoResultText(`오류: ${e.message}`);
    return false;
  }
}

async function saveShoppingAutoSettings() {
  const publishEnabledEl = document.getElementById('shopping-publish-auto-enabled');
  const publishIntervalEl = document.getElementById('shopping-publish-auto-interval');
  const publishBatchEl = document.getElementById('shopping-publish-auto-batch');
  const startTimeEl = document.getElementById('shopping-publish-auto-start-time');
  const endTimeEl = document.getElementById('shopping-publish-auto-end-time');
  const headlessEl = document.getElementById('shopping-publish-auto-headless');
  const notifyEnabledEl = document.getElementById('shopping-publish-auto-notify-enabled');
  setShoppingAutoResultText('저장 중...');
  try {
    const major = await fetchJson('/api/v1/settings/major');
    const fields = { ...(major?.fields || {}) };
    const payload = {
      ...fields,
      SHOPPING_PUBLISH_AUTO_ENABLED: Boolean(publishEnabledEl?.checked),
      SHOPPING_PUBLISH_AUTO_INTERVAL_MIN: parseInt(publishIntervalEl?.value || '60', 10),
      SHOPPING_PUBLISH_AUTO_BATCH_SIZE: parseInt(publishBatchEl?.value || '1', 10),
      SHOPPING_PUBLISH_AUTO_START_TIME: (startTimeEl?.value || '00:00').trim(),
      SHOPPING_PUBLISH_AUTO_END_TIME: (endTimeEl?.value || '23:59').trim(),
      SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS: Array.from(document.querySelectorAll('[data-shopping-publish-target]:checked')).map(el => el.getAttribute('data-shopping-publish-target')).join(','),
      SHOPPING_PUBLISH_AUTO_HEADLESS: Boolean(headlessEl?.checked),
      SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED: Boolean(notifyEnabledEl?.checked)
    };
    const saved = await postJson('/api/v1/settings/major', payload);
    const savedFields = saved?.fields || {};
    if (publishEnabledEl) publishEnabledEl.checked = Boolean(savedFields.SHOPPING_PUBLISH_AUTO_ENABLED);
    if (publishIntervalEl) publishIntervalEl.value = String(savedFields.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN || 60);
    if (publishBatchEl) publishBatchEl.value = String(savedFields.SHOPPING_PUBLISH_AUTO_BATCH_SIZE || 1);
    if (startTimeEl) startTimeEl.value = String(savedFields.SHOPPING_PUBLISH_AUTO_START_TIME || '00:00');
    if (endTimeEl) endTimeEl.value = String(savedFields.SHOPPING_PUBLISH_AUTO_END_TIME || '23:59');
    if (headlessEl) headlessEl.checked = Boolean(savedFields.SHOPPING_PUBLISH_AUTO_HEADLESS ?? true);
    if (notifyEnabledEl) notifyEnabledEl.checked = Boolean(savedFields.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED);

    const targetChannels = Array.isArray(savedFields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS)
      ? savedFields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS
      : String(savedFields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS || 'naver').split(',').map(v => v.trim()).filter(Boolean);
    document.querySelectorAll('[data-shopping-publish-target]').forEach((el) => {
      el.checked = targetChannels.includes(el.getAttribute('data-shopping-publish-target'));
    });

    setShoppingAutoResultText([
      '저장 완료',
      '- 쇼핑 자동 포스팅 설정이 반영되었습니다.',
      '- 수동 실행으로 즉시 동작을 검증할 수 있습니다.'
    ].join('\n'));
  } catch (e) {
    setShoppingAutoResultText(`오류: ${e.message}`);
  }
}

async function runShoppingAutoManual() {
  if (!guardUiConfigReady('쇼핑 자동발행 수동 실행')) return;
  if (shoppingAutoManualRunInFlight) return;

  const resultEl = document.getElementById('shopping-auto-result');
  const batchEl = document.getElementById('shopping-publish-auto-batch');
  const headlessEl = document.getElementById('shopping-publish-auto-headless');

  let quota;
  try {
    quota = await getPublishQuotaPreflight(parseInt((batchEl?.value || '1').trim(), 10) || 1);
  } catch (error) {
    if (resultEl) resultEl.textContent = `사용량 확인 실패: ${error.message}`;
    return;
  }
  if (quota.executable === 0) {
    if (resultEl) resultEl.textContent = quota.message;
    return;
  }
  const shouldProceed = await showUiConfirm(quota.message, {
    title: '수동 실행 확인',
    confirmText: '진행',
    cancelText: '취소'
  });
  if (shouldProceed === false) {
    if (resultEl) resultEl.textContent = '수동 실행이 취소되었습니다.';
    return;
  }

  const batchSize = parseInt((batchEl?.value || '1').trim(), 10) || 1;
  const targets = Array.from(document.querySelectorAll('[data-shopping-publish-target]:checked')).map(el => el.getAttribute('data-shopping-publish-target')).join(',');
  const headless = Boolean(headlessEl?.checked);

  shoppingAutoManualRunInFlight = true;
  if (resultEl) resultEl.textContent = '쇼핑 자동발행 파이프라인 실행 중...';
  pauseDashboardPolling();
  try {
    const data = await postJson('/api/v1/auto/shopping/run', {
      settingsOverrides: {
        SHOPPING_PUBLISH_AUTO_BATCH_SIZE: batchSize,
        SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS: targets,
        SHOPPING_PUBLISH_AUTO_HEADLESS: headless
      }
    });
    const summary = data?.summary || {};
    const lines = [
      '쇼핑 수동 실행 완료',
      `- 시도 / 성공: ${Number(summary?.attempted || 0)
      } / ${Number(summary?.success || 0)}건`
    ];
    if (resultEl) resultEl.textContent = lines.join('\n');
    await Promise.all([
      loadDashboard(),
      loadBlogShopping({ silent: true })
    ]);
  } catch (e) {
    console.error('[Shopping][ManualRun] Failed:', e);
    if (resultEl) resultEl.textContent = `오류: ${e.message}`;
  } finally {
    shoppingAutoManualRunInFlight = false;
    resumeDashboardPolling();
  }
}

async function runBlogPublishAutoManual() {
  if (!guardUiConfigReady('자동발행 수동 실행')) return;
  if (blogAutoManualRunInFlight) return;

  const batchEl = document.getElementById('blog-publish-auto-batch');
  const postStatusEl = document.getElementById('blog-publish-auto-post-status');
  const headlessEl = document.getElementById('blog-publish-auto-headless');
  const resultEl = document.getElementById('blog-publish-auto-result');
  const batchSize = parseInt((batchEl?.value || '1').trim(), 10) || 1;
  const postStatus = postStatusEl?.value === 'draft' ? 'draft' : 'publish';
  const targets = Array.from(document.querySelectorAll('[data-publish-target]:checked')).map(el => el.getAttribute('data-publish-target')).join(',');
  const headless = Boolean(headlessEl?.checked);

  try {
    const quota = await getPublishQuotaPreflight(batchSize);
    if (quota.executable === 0) {
      if (resultEl) resultEl.textContent = quota.message;
      return;
    }
    if (await showUiConfirm(quota.message, { title: '발행 사용량 확인', confirmText: '실행', cancelText: '취소' }) === false) return;
  } catch (error) {
    if (resultEl) resultEl.textContent = `사용량 확인 실패: ${error.message}`;
    return;
  }

  blogAutoManualRunInFlight = true;

  try {
    await runWithLiveProgress({
      targetEl: resultEl,
      requestLabel: '수동 발행 실행',
      requestFn: () => postJson('/api/v1/auto/publish/run', {
        settingsOverrides: {
          PUBLISH_AUTO_BATCH_SIZE: batchSize,
          PUBLISH_AUTO_POST_STATUS: postStatus,
          PUBLISH_AUTO_TARGET_CHANNELS: targets,
          PUBLISH_AUTO_HEADLESS: headless
        }
      })
    });
    await Promise.all([
      loadDashboard(),
      loadBlogTopics({ silent: true })
    ]);
  } catch (e) {
    // runWithLiveProgress already shows error in the log area
  } finally {
    blogAutoManualRunInFlight = false;
  }
}

