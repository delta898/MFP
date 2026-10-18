
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
