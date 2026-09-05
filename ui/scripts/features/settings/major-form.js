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

  settingsCardNewsRssSources = normalizeSettingsCardNewsRssSources(fields.CARD_NEWS_RSS_SOURCES);
  renderSettingsCardNewsRssSources();
  const cardNewsBuiltinSources = new Set(Array.isArray(fields.CARD_NEWS_BUILTIN_SOURCES)
    ? fields.CARD_NEWS_BUILTIN_SOURCES
    : ['naver', 'wordpress']);
  sc(document.getElementById('settings-card-news-source-naver'), cardNewsBuiltinSources.has('naver'));
  sc(document.getElementById('settings-card-news-source-wordpress'), cardNewsBuiltinSources.has('wordpress'));

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
  if (!settingsWritingProfileDirty) {
    sv(document.getElementById('settings-blog-writing-mode'), fields.BLOG_WRITING_MODE || 'conversational');
    sv(document.getElementById('settings-blog-speech-level'), fields.BLOG_SPEECH_LEVEL || 'polite');
  }
  currentBlogWritingStrategy = fields.BLOG_WRITING_STRATEGY === 'discovery' ? 'discovery' : 'search';
  syncWritingStrategyInheritanceLabels();
  syncSettingsBlogWritingStyleDescription();
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
  sv(document.getElementById('blog-publish-auto-image-mode'), fields.PUBLISH_AUTO_IMAGE_MODE || 'generate');
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
    BLOG_WRITING_MODE: document.getElementById('settings-blog-writing-mode')?.value || 'conversational',
    BLOG_SPEECH_LEVEL: document.getElementById('settings-blog-speech-level')?.value || 'polite',
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
    CARD_NEWS_RSS_SOURCES: normalizeSettingsCardNewsRssSources(settingsCardNewsRssSources),
    CARD_NEWS_BUILTIN_SOURCES: ['naver', 'wordpress'].filter((source) => (
      Boolean(document.getElementById(`settings-card-news-source-${source}`)?.checked)
    )),

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
    PUBLISH_AUTO_IMAGE_MODE: (document.getElementById('blog-publish-auto-image-mode')?.value || 'generate').trim(),
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
