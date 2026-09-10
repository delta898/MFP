function initGlobalPublishSettingsSync() {
  const syncGroups = [
    {
      key: 'pub_pref_headless',
      ids: ['quick-headless', 'quick-manuscript-headless', 'quick-pasted-headless', 'blog-trends-headless', 'blog-batch-headless', 'shopping-quick-headless', 'shopping-batch-headless', 'blog-publish-auto-headless', 'blog-next-runner-headless', 'blog-next-folder-headless', 'blog-next-paste-headless'],
      type: 'checkbox',
      default: true
    },
    {
      key: 'pub_pref_target_naver',
      ids: ['quick-target-naver', 'quick-manuscript-target-naver', 'quick-pasted-target-naver', 'blog-batch-target-naver', 'shopping-quick-target-naver', 'shopping-batch-target-naver', 'blog-publish-auto-target-naver'],
      type: 'checkbox',
      default: true
    },
    {
      key: 'pub_pref_target_wordpress',
      ids: ['quick-target-wordpress', 'quick-manuscript-target-wordpress', 'quick-pasted-target-wordpress', 'blog-batch-target-wordpress', 'shopping-quick-target-wordpress', 'shopping-batch-target-wordpress', 'blog-publish-auto-target-wordpress'],
      type: 'checkbox',
      default: false
    },
    {
      key: 'pub_pref_blog_image_mode',
      ids: ['quick-image-mode', 'quick-manuscript-image-mode', 'quick-pasted-image-mode'],
      type: 'input',
      default: 'prompt_only'
    },
    {
      key: 'pub_pref_external_reference',
      ids: ['quick-external-reference'], // extensible
      type: 'checkbox',
      default: true
    },
    {
      key: 'last_quick_naver_category',
      ids: ['quick-naver-category', 'quick-manuscript-naver-category', 'quick-pasted-naver-category'],
      type: 'input',
      default: ''
    },
    {
      key: 'last_quick_wp_category',
      ids: ['quick-wp-category', 'quick-manuscript-wp-category', 'quick-pasted-wp-category'],
      type: 'input',
      default: ''
    }
  ].filter(Boolean);

  // Helper to update all elements in a group
  const updateGroupUi = (group, value) => {
    group.ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (group.type === 'checkbox') {
        el.checked = (value === 'true' || value === true);
      } else {
        el.value = value;
      }
    });
    // Special Trigger: If WP target changed, sync WP options visibility
    if (group.key === 'pub_pref_target_wordpress') {
      if (typeof toggleQuickWpOptions === 'function') toggleQuickWpOptions();
      if (typeof toggleShoppingQuickWpOptions === 'function') toggleShoppingQuickWpOptions();
    }
  };

  // 1. Initial Load & Apply
  syncGroups.forEach(group => {
    let saved = localStorage.getItem(group.key);
    if (saved === null) {
      saved = String(group.default);
      localStorage.setItem(group.key, saved);
    }
    updateGroupUi(group, saved);
  });

  // 2. Event Listeners for Syncing
  syncGroups.forEach(group => {
    group.ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;

      el.addEventListener('change', () => {
        const newValue = (group.type === 'checkbox') ? el.checked : el.value;
        localStorage.setItem(group.key, String(newValue));
        updateGroupUi(group, newValue);
      });
    });
  });

  // 3. Keep other Quick Publish specific options that are not shared but need persistence
  const quickSpecific = [
    { key: 'last_quick_wp_post_status', id: 'quick-wp-post-status', type: 'select', default: 'publish' },
    { key: 'last_quick_wp_schedule_date', id: 'quick-wp-schedule-date', type: 'input', default: '' },
    { key: 'quick_manuscript_post_status', id: 'quick-manuscript-post-status', type: 'select', default: 'publish' },
    { key: 'quick_manuscript_schedule_date', id: 'quick-manuscript-schedule-date', type: 'input', default: '' },
    { key: 'quick_pasted_post_status', id: 'quick-pasted-post-status', type: 'select', default: 'publish' },
    { key: 'quick_pasted_schedule_date', id: 'quick-pasted-schedule-date', type: 'input', default: '' },
    { key: 'shopping_quick_wp_post_status', id: 'shopping-quick-wp-post-status', type: 'select', default: 'publish' },
    { key: 'shopping_quick_wp_schedule_date', id: 'shopping-quick-wp-schedule-date', type: 'input', default: '' }
  ];

  quickSpecific.forEach(item => {
    const el = document.getElementById(item.id);
    if (!el) return;

    // Restore
    const saved = localStorage.getItem(item.key);
    if (saved !== null) el.value = saved;
    else if (item.default) el.value = item.default;

    // Listener
    el.addEventListener('change', () => {
      localStorage.setItem(item.key, el.value);
      if (item.id === 'quick-wp-post-status' && typeof toggleQuickWpScheduleDate === 'function') {
        toggleQuickWpScheduleDate();
      } else if (item.id === 'quick-manuscript-post-status' && typeof window.toggleQuickManuscriptScheduleDate === 'function') {
        window.toggleQuickManuscriptScheduleDate();
      } else if (item.id === 'quick-pasted-post-status' && typeof window.toggleQuickPastedScheduleDate === 'function') {
        window.toggleQuickPastedScheduleDate();
      } else if (item.id === 'shopping-quick-wp-post-status' && typeof toggleShoppingQuickWpScheduleDate === 'function') {
        toggleShoppingQuickWpScheduleDate();
      }
    });
  });

  // Initial dependency sync
  if (typeof toggleQuickWpScheduleDate === 'function') toggleQuickWpScheduleDate();
  if (typeof window.toggleQuickManuscriptScheduleDate === 'function') window.toggleQuickManuscriptScheduleDate();
  if (typeof window.toggleQuickPastedScheduleDate === 'function') window.toggleQuickPastedScheduleDate();
}

// Shopping Connect Quick Publish WP Helpers
