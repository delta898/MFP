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
