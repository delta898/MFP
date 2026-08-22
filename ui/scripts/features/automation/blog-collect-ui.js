function setBlogAutoResultText(message) {
  const resultEl = document.getElementById('blog-publish-auto-result');
  if (resultEl) resultEl.textContent = String(message || '');
}

function setBlogCollectResultText(message) {
  const resultEl = document.getElementById('blog-collect-trends-result');
  if (resultEl) resultEl.textContent = String(message || '');
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
