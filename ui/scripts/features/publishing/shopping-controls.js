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
