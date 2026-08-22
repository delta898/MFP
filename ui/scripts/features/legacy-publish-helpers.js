
/**
 * Common WordPress Category Custom Select Initializer
 * @param {string} optionsContainerId - ID of the container for dropdown options (e.g., 'quick-wp-category-options-v2')
 * @param {string} triggerTextId - ID of the text element on the trigger button (e.g., 'quick-wp-category-text')
 * @param {string} containerId - ID of the main wrapper (e.g., 'quick-wp-category-container')
 * @param {string} storagePrefix - Prefix for localStorage keys (e.g., 'quick_' or 'shopping_quick_')
 */
async function initWpCategorySelector({ optionsContainerId, triggerTextId, containerId, storagePrefix, onValueChange, initialValue, initialText }) {
  const optionsContainer = document.getElementById(optionsContainerId);
  const triggerText = document.getElementById(triggerTextId);
  const container = document.getElementById(containerId);
  const searchInput = container?.querySelector('input[type="text"]');

  // Helper to update selection
  const updateSelection = (val, text) => {
    const freshTriggerText = document.getElementById(triggerTextId);
    if (freshTriggerText) freshTriggerText.textContent = text;

    optionsContainer?.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.value === val);
    });
    if (storagePrefix) {
      localStorage.setItem(`${storagePrefix}wp_category_name`, text);
      localStorage.setItem(`${storagePrefix}wp_category_value`, val);
    }
    if (typeof onValueChange === 'function') {
      onValueChange(val);
    }
    const freshContainer = document.getElementById(containerId);
    if (freshContainer) freshContainer.classList.remove('open');
  };

  // Helper to render options
  const renderOptions = (items, filterQuery = '') => {
    if (!optionsContainer) return;
    optionsContainer.innerHTML = '';

    const q = filterQuery.toLowerCase().trim();

    // 1. "Use Custom Value" Option (Hybrid)
    if (q) {
      const customOpt = document.createElement('div');
      customOpt.className = 'custom-select-option custom-value';
      customOpt.dataset.value = q;
      customOpt.innerHTML = `<i class="plus-icon"></i> 직접 입력: <strong>${escapeHtml(q)}</strong>`;
      customOpt.addEventListener('click', (e) => {
        e.stopPropagation();
        updateSelection(q, q);
      });
      optionsContainer.appendChild(customOpt);
    }

    // 2. Default "No Selection" Option
    const defaultOpt = document.createElement('div');
    defaultOpt.className = 'custom-select-option';
    defaultOpt.dataset.value = '';
    defaultOpt.textContent = '카테고리 선택 (미지정 시 기본)';
    defaultOpt.style.display = (!q || defaultOpt.textContent.toLowerCase().includes(q)) ? '' : 'none';
    defaultOpt.addEventListener('click', (e) => {
      e.stopPropagation();
      updateSelection('', defaultOpt.textContent);
    });
    optionsContainer.appendChild(defaultOpt);

    // 3. Populate Categories
    let found = q ? false : true;
    items.forEach(cat => {
      const match = !q || cat.name.toLowerCase().includes(q);
      const opt = document.createElement('div');
      opt.className = 'custom-select-option';
      opt.dataset.value = cat.name;
      opt.textContent = `${cat.name} (${cat.count})`;
      opt.style.display = match ? '' : 'none';
      if (match) {
        found = true;
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          updateSelection(cat.name, opt.textContent);
        });
        optionsContainer.appendChild(opt);
      }
    });

    // Handle "No results" message
    if (!found && !q) {
      const noResultEl = document.createElement('div');
      noResultEl.className = 'custom-select-no-results';
      noResultEl.textContent = '검색 결과가 없습니다.';
      optionsContainer.appendChild(noResultEl);
    }
  };

  // 1. Initial Render or Restore
  const currentVal = initialValue !== undefined ? initialValue : (storagePrefix ? localStorage.getItem(`${storagePrefix}wp_category_value`) : '');
  const currentName = initialText !== undefined ? initialText : (storagePrefix ? localStorage.getItem(`${storagePrefix}wp_category_name`) : '');

  if (currentName && triggerText) {
    triggerText.textContent = currentName;
  }

  // Search Input Bindings
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderOptions(categoryCache || [], searchInput.value);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = searchInput.value.trim();
        if (q) {
          updateSelection(q, q);
          if (searchInput) searchInput.value = '';
        }
      }
    });
    searchInput.addEventListener('click', (e) => e.stopPropagation());
  }

  // Bind click trigger universally
  const triggerEl = container?.querySelector('.custom-select-trigger');

  if (triggerEl) {
    // 1. Remove old listeners by cloning the node
    const newTriggerEl = triggerEl.cloneNode(true);
    triggerEl.parentNode.replaceChild(newTriggerEl, triggerEl);

    // 2. Attach clean, fresh listener
    newTriggerEl.addEventListener('click', async (e) => {
      e.stopPropagation();
      const isOpen = container.classList.contains('open');
      document.querySelectorAll('.custom-select-container').forEach(c => {
        if (c !== container) c.classList.remove('open');
      });
      container.classList.toggle('open');

      // 🚀 Only fetch categories if not already loaded and the dropdown is being opened
      if (!isOpen) {
        if (searchInput) setTimeout(() => searchInput.focus(), 50);

        const hasOptions = optionsContainer && optionsContainer.querySelectorAll('.custom-select-option').length > 0;
        if (!hasOptions || !categoryCache) {
          if (optionsContainer) optionsContainer.innerHTML = '<div class="custom-select-loading">불러오는 중...</div>';
          try {
            const categories = await window.fetchWpCategories();
            renderOptions(categories || []);
            if (currentVal) {
              optionsContainer?.querySelectorAll('.custom-select-option').forEach(opt => {
                if (opt.dataset.value === currentVal) opt.classList.add('selected');
              });
            }
          } catch (err) {
            console.error(`WP Categories fetch failed:`, err);
            if (optionsContainer) optionsContainer.innerHTML = '<div class="custom-select-loading">호출 오류</div>';
          }
        }
      }
    });
  }
}

// WordPress Quick Publish UI Helpers
window.toggleQuickWpOptions = async function () {
  // No longer using hybrid selector here

  // 2. Initialize Custom Post Status Selector
  const statusContainer = document.getElementById('quick-wp-status-container');
  const statusTrigger = document.getElementById('quick-wp-status-trigger');
  const statusText = document.getElementById('quick-wp-status-text');
  const statusOptions = document.getElementById('quick-wp-status-options');
  const hiddenStatusInput = document.getElementById('quick-wp-post-status');

  if (statusContainer && statusTrigger && statusOptions) {
    if (statusContainer.dataset.initialized) {
      // Already bound, just toggle visibility or sync state if needed
      return;
    }
    statusContainer.dataset.initialized = 'true';

    const updateStatus = (val, text) => {
      if (statusText) statusText.textContent = text;
      if (hiddenStatusInput) hiddenStatusInput.value = val;

      const options = statusOptions.querySelectorAll('.custom-select-option');
      options.forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.value === val);
      });

      localStorage.setItem('last_quick_wp_post_status', val);
      localStorage.setItem('last_quick_wp_post_status_text', text);

      // [Sync] Update hidden input if it exists
      if (hiddenStatusInput) {
        hiddenStatusInput.value = val;
        // Trigger change so other listeners (if any) know
        hiddenStatusInput.dispatchEvent(new Event('change'));
      }

      statusContainer.classList.remove('open');
      if (typeof window.toggleQuickWpScheduleDate === 'function') window.toggleQuickWpScheduleDate();
    };

    // Click trigger to toggle
    statusTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      statusContainer.classList.toggle('open');
    });

    // Click options
    statusOptions.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        updateStatus(opt.dataset.value, opt.textContent);
      });
    });

    // Restore saved
    const savedStatus = localStorage.getItem('last_quick_wp_post_status');
    const savedStatusText = localStorage.getItem('last_quick_wp_post_status_text');
    if (savedStatus) {
      updateStatus(savedStatus, savedStatusText || '즉시 발행');
    } else {
      // Default
      updateStatus('publish', '즉시 발행');
    }
  }

  // 3. Persistence for Date
  const wpDateEl = document.getElementById('quick-wp-schedule-date');
  if (wpDateEl) {
    const savedDate = localStorage.getItem('last_quick_wp_schedule_date');
    if (savedDate) wpDateEl.value = savedDate;
    wpDateEl.addEventListener('change', () => {
      localStorage.setItem('last_quick_wp_schedule_date', wpDateEl.value);
    });
  }
};

window.toggleQuickWpScheduleDate = function () {
  const input = document.getElementById('quick-wp-schedule-date');
  const status = document.getElementById('quick-wp-post-status')?.value;
  if (input) {
    input.disabled = (status !== 'schedule');
  }
};

/**
 * Unify and Persistence Publish Settings (Headless, Targets) across all tabs
 */
function initGlobalPublishSettingsSync() {
  const syncGroups = [
    {
      key: 'pub_pref_headless',
      ids: ['quick-headless', 'quick-manuscript-headless', 'quick-pasted-headless', 'blog-trends-headless', 'blog-batch-headless', 'shopping-quick-headless', 'shopping-batch-headless', 'shopping-publish-auto-headless', 'blog-publish-auto-headless'],
      type: 'checkbox',
      default: true
    },
    {
      key: 'pub_pref_target_naver',
      ids: ['quick-target-naver', 'quick-manuscript-target-naver', 'quick-pasted-target-naver', 'blog-batch-target-naver', 'shopping-quick-target-naver', 'shopping-batch-target-naver', 'blog-publish-auto-target-naver', 'shopping-publish-auto-target-naver'],
      type: 'checkbox',
      default: true
    },
    {
      key: 'pub_pref_target_wordpress',
      ids: ['quick-target-wordpress', 'quick-manuscript-target-wordpress', 'quick-pasted-target-wordpress', 'blog-batch-target-wordpress', 'shopping-quick-target-wordpress', 'shopping-batch-target-wordpress', 'blog-publish-auto-target-wordpress', 'shopping-publish-auto-target-wordpress'],
      type: 'checkbox',
      default: false
    },
    {
      key: 'pub_pref_image_generation',
      ids: ['quick-image-generation', 'quick-manuscript-image-generation', 'quick-pasted-image-generation'], // extensible
      type: 'checkbox',
      default: false
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
window.toggleShoppingQuickWpOptions = function () {
  const panel = document.getElementById('shopping-quick-wp-options-panel');
  const checkbox = document.getElementById('shopping-quick-target-wordpress');

  if (panel && checkbox) {
    panel.style.display = checkbox.checked ? 'block' : 'none';
  }
};

window.toggleShoppingQuickWpScheduleDate = function () {
  const input = document.getElementById('shopping-quick-wp-schedule-date');
  const status = document.getElementById('shopping-quick-wp-post-status')?.value;
  if (!input) return;

  const isSchedule = status === 'schedule';
  input.disabled = !isSchedule;

  if (isSchedule && !input.value) {
    // 현재 시간 + 10분을 기본값으로 설정
    const now = new Date(Date.now() + 10 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const defaultVal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    input.value = defaultVal;
  }
};

// Shopping quick publish - localStorage 지속
function initShoppingQuickCategoryPersistence() {
  const naverCatEl = document.getElementById('shopping-quick-naver-category');
  const wpCatEl = document.getElementById('shopping-quick-wp-category');

  if (naverCatEl) {
    const saved = localStorage.getItem('last_shopping_quick_naver_category') || '';
    naverCatEl.value = saved;
    naverCatEl.addEventListener('input', () => {
      localStorage.setItem('last_shopping_quick_naver_category', naverCatEl.value.trim());
    });
  }

  if (wpCatEl) {
    const saved = localStorage.getItem('last_shopping_quick_wp_category') || '';
    wpCatEl.value = saved;
    wpCatEl.addEventListener('input', () => {
      localStorage.setItem('last_shopping_quick_wp_category', wpCatEl.value.trim());
    });
  }
}
