window.toggleShoppingQuickWpOptions = function () {
  const panel = document.getElementById('shopping-quick-wp-options-panel');
  const checkbox = document.getElementById('shopping-quick-target-wordpress');

  if (panel && checkbox) {
    panel.style.display = checkbox.checked ? 'block' : 'none';
  }

  updateShoppingQuickSettingsSummaries();
};

window.toggleShoppingQuickWpScheduleDate = function () {
  const input = document.getElementById('shopping-quick-wp-schedule-date');
  const status = document.getElementById('shopping-quick-wp-post-status')?.value;
  const requiredLabel = document.getElementById('shopping-quick-schedule-required');
  if (!input) return;

  const isSchedule = status === 'schedule';
  input.disabled = !isSchedule;
  input.required = isSchedule;
  if (requiredLabel) requiredLabel.hidden = !isSchedule;

  if (isSchedule && !input.value) {
    // 현재 시간 + 10분을 기본값으로 설정
    const now = new Date(Date.now() + 10 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const defaultVal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    input.value = defaultVal;
  }

  updateShoppingQuickSettingsSummaries();
};

function updateShoppingQuickSettingsSummaries() {
  const strategy = document.getElementById('shopping-quick-writing-strategy');
  const writingSummary = document.getElementById('shopping-quick-writing-summary');
  if (writingSummary) {
    const focus = document.getElementById('shopping-quick-content-focus');
    const focusLabels = {
      auto: '자동 구성',
      product_intro: '상품 소개',
      comparison: '비교·선택 가이드',
      usage: '사용 상황 제안'
    };
    const strategyLabel = strategy?.value === 'discovery' ? '발견 중심' : '검색 중심';
    writingSummary.textContent = `${strategyLabel} · ${focusLabels[focus?.value] || focusLabels.auto}`;
  }

  const publishSummary = document.getElementById('shopping-quick-publish-summary');
  if (!publishSummary) return;
  const targets = [
    document.getElementById('shopping-quick-target-naver')?.checked ? '네이버' : '',
    document.getElementById('shopping-quick-target-wordpress')?.checked ? '워드프레스' : ''
  ].filter(Boolean);
  const status = document.getElementById('shopping-quick-wp-post-status')?.value || 'publish';
  const statusLabel = status === 'draft' ? '임시 저장' : (status === 'schedule' ? '예약 발행' : '즉시 발행');
  publishSummary.textContent = `${targets.length > 0 ? targets.join('·') : '발행 대상 선택'} · ${statusLabel}`;
}

// Shopping quick publish - localStorage 지속
function initShoppingQuickCategoryPersistence() {
  const naverCatEl = document.getElementById('shopping-quick-naver-category');
  const wpCatEl = document.getElementById('shopping-quick-wp-category');
  const strategyEl = document.getElementById('shopping-quick-writing-strategy');
  const contentFocusEl = document.getElementById('shopping-quick-content-focus');
  const postStatusEl = document.getElementById('shopping-quick-wp-post-status');
  const targetEls = [
    document.getElementById('shopping-quick-target-naver'),
    document.getElementById('shopping-quick-target-wordpress')
  ].filter(Boolean);

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

  if (strategyEl) {
    const saved = localStorage.getItem('last_shopping_quick_writing_strategy');
    if (saved === 'search' || saved === 'discovery') strategyEl.value = saved;
    strategyEl.addEventListener('change', () => {
      localStorage.setItem('last_shopping_quick_writing_strategy', strategyEl.value);
      updateShoppingQuickSettingsSummaries();
    });
  }

  if (contentFocusEl) {
    const saved = localStorage.getItem('last_shopping_quick_content_focus');
    if (['auto', 'product_intro', 'comparison', 'usage'].includes(saved)) contentFocusEl.value = saved;
    contentFocusEl.addEventListener('change', () => {
      localStorage.setItem('last_shopping_quick_content_focus', contentFocusEl.value);
      updateShoppingQuickSettingsSummaries();
    });
  }

  postStatusEl?.addEventListener('change', toggleShoppingQuickWpScheduleDate);
  targetEls.forEach((input) => input.addEventListener('change', updateShoppingQuickSettingsSummaries));
  toggleShoppingQuickWpScheduleDate();
  updateShoppingQuickSettingsSummaries();
}
