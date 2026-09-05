const SETTINGS_CARD_NEWS_RSS_SOURCE_LIMIT = 3;

function normalizeSettingsCardNewsRssSources(value) {
  return (Array.isArray(value) ? value : []).slice(0, SETTINGS_CARD_NEWS_RSS_SOURCE_LIMIT).map((source) => ({
    id: String(source?.id || ''),
    name: String(source?.name || '').slice(0, 80),
    url: String(source?.url || '').slice(0, 4000),
    enabled: source?.enabled !== false
  }));
}

function renderSettingsCardNewsRssSources() {
  const list = document.getElementById('settings-card-news-rss-list');
  if (!list) return;
  if (!settingsCardNewsRssSources.length) {
    list.innerHTML = '<div class="card-news-rss-settings-empty">추가한 RSS가 없습니다.</div>';
    return;
  }
  list.innerHTML = settingsCardNewsRssSources.map((source, index) => `
    <div class="card-news-rss-settings-row" data-card-news-rss-index="${index}">
      <label class="card-news-rss-enabled" title="이 RSS 사용">
        <input type="checkbox" data-card-news-rss-field="enabled" aria-label="이 RSS 사용" ${source.enabled ? 'checked' : ''}>
      </label>
      <input type="text" data-card-news-rss-field="name" maxlength="80" value="${escapeHtml(source.name)}" placeholder="소스 이름" aria-label="RSS 소스 이름">
      <input type="url" data-card-news-rss-field="url" value="${escapeHtml(source.url)}" placeholder="https://example.com/feed.xml" aria-label="RSS 주소">
      <button class="card-news-rss-remove" type="button" data-card-news-rss-remove aria-label="RSS 삭제" title="RSS 삭제">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
        </svg>
      </button>
    </div>
  `).join('');

  list.querySelectorAll('[data-card-news-rss-field]').forEach((input) => {
    input.addEventListener('input', handleSettingsCardNewsRssChange);
    input.addEventListener('change', handleSettingsCardNewsRssChange);
  });
  list.querySelectorAll('[data-card-news-rss-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      const row = button.closest('[data-card-news-rss-index]');
      const index = Number(row?.dataset.cardNewsRssIndex);
      if (!Number.isInteger(index)) return;
      settingsCardNewsRssSources.splice(index, 1);
      renderSettingsCardNewsRssSources();
      scheduleSettingsMajorAutoSave();
    });
  });
}

function handleSettingsCardNewsRssChange(event) {
  const row = event.currentTarget.closest('[data-card-news-rss-index]');
  const index = Number(row?.dataset.cardNewsRssIndex);
  const field = event.currentTarget.dataset.cardNewsRssField;
  const source = settingsCardNewsRssSources[index];
  if (!source || !field) return;
  source[field] = field === 'enabled' ? Boolean(event.currentTarget.checked) : event.currentTarget.value;
  scheduleSettingsMajorAutoSave();
}

function addSettingsCardNewsRssSource() {
  if (settingsCardNewsRssSources.length >= SETTINGS_CARD_NEWS_RSS_SOURCE_LIMIT) {
    showUiToast({ title: 'RSS 추가 불가', message: `추가 RSS는 최대 ${SETTINGS_CARD_NEWS_RSS_SOURCE_LIMIT}개까지 등록할 수 있습니다.`, level: 'warning' });
    return;
  }
  settingsCardNewsRssSources.push({ id: '', name: '', url: '', enabled: true });
  renderSettingsCardNewsRssSources();
  const rows = document.querySelectorAll('[data-card-news-rss-index]');
  rows[rows.length - 1]?.querySelector('[data-card-news-rss-field="name"]')?.focus();
}
