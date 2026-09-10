const CARD_NEWS_CUSTOM_SOURCE_LIMIT = 3;
const cardNewsSourceManagerState = {
  initialized: false,
  loading: false,
  saving: false,
  rssSources: []
};

function normalizeCardNewsSourceManagerRss(items = []) {
  return (Array.isArray(items) ? items : []).slice(0, CARD_NEWS_CUSTOM_SOURCE_LIMIT).map((item) => ({
    id: String(item?.id || ''),
    name: String(item?.name || '').slice(0, 80),
    url: String(item?.url || ''),
    enabled: item?.enabled !== false
  }));
}

function setCardNewsSourceManagerStatus(message = '', state = '') {
  const status = document.getElementById('card-news-source-manager-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function setCardNewsSourceManagerBusy(busy, mode = '') {
  cardNewsSourceManagerState.loading = busy && mode === 'loading';
  cardNewsSourceManagerState.saving = busy && mode === 'saving';
  const save = document.getElementById('card-news-source-manager-save');
  const add = document.getElementById('card-news-source-add');
  if (save) {
    save.disabled = busy;
    save.textContent = cardNewsSourceManagerState.saving ? '적용 중…' : '적용';
  }
  if (add) add.disabled = busy || cardNewsSourceManagerState.rssSources.length >= CARD_NEWS_CUSTOM_SOURCE_LIMIT;
  document.querySelectorAll('#card-news-source-manager input, #card-news-source-manager button').forEach((control) => {
    if (!['card-news-source-manager-save', 'card-news-source-add'].includes(control.id)) control.disabled = busy;
  });
}

function renderCardNewsSourceManagerRss() {
  const list = document.getElementById('card-news-source-manager-list');
  const add = document.getElementById('card-news-source-add');
  if (!list) return;
  if (!cardNewsSourceManagerState.rssSources.length) {
    list.innerHTML = '<div class="card-news-source-manager-empty">추가한 RSS가 없습니다.</div>';
  } else {
    list.innerHTML = cardNewsSourceManagerState.rssSources.map((source, index) => `
      <div class="card-news-source-manager-row" data-card-news-source-index="${index}">
        <label class="card-news-source-enabled" title="이 RSS 사용">
          <input type="checkbox" data-card-news-source-field="enabled" aria-label="이 RSS 사용" ${source.enabled ? 'checked' : ''}>
        </label>
        <label class="ui-workflow-field">
          <span>이름</span>
          <input type="text" maxlength="80" value="${escapeHtml(source.name)}" data-card-news-source-field="name" placeholder="소스 이름">
        </label>
        <label class="ui-workflow-field">
          <span>RSS 주소</span>
          <input type="url" value="${escapeHtml(source.url)}" data-card-news-source-field="url" placeholder="https://example.com/feed.xml">
        </label>
        <button class="ui-icon-action ui-danger-icon-action" type="button" data-card-news-source-remove aria-label="RSS 삭제" title="RSS 삭제">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16" />
            <path d="M9 7V4h6v3" />
            <path d="M7 7l1 13h8l1-13" />
            <path d="M10 11v5M14 11v5" />
          </svg>
        </button>
      </div>`).join('');
  }
  if (add) add.disabled = cardNewsSourceManagerState.rssSources.length >= CARD_NEWS_CUSTOM_SOURCE_LIMIT;
  list.querySelectorAll('[data-card-news-source-field]').forEach((input) => {
    input.addEventListener('input', updateCardNewsSourceManagerRss);
    input.addEventListener('change', updateCardNewsSourceManagerRss);
  });
  list.querySelectorAll('[data-card-news-source-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      const row = button.closest('[data-card-news-source-index]');
      cardNewsSourceManagerState.rssSources.splice(Number(row?.dataset.cardNewsSourceIndex), 1);
      renderCardNewsSourceManagerRss();
    });
  });
}

function updateCardNewsSourceManagerRss(event) {
  const row = event.currentTarget.closest('[data-card-news-source-index]');
  const source = cardNewsSourceManagerState.rssSources[Number(row?.dataset.cardNewsSourceIndex)];
  if (!source) return;
  const field = event.currentTarget.dataset.cardNewsSourceField;
  source[field] = field === 'enabled' ? event.currentTarget.checked : event.currentTarget.value;
}

function closeCardNewsSourceManager() {
  const dialog = document.getElementById('card-news-source-manager');
  if (dialog?.open) dialog.close();
}

async function openCardNewsSourceManager() {
  const dialog = document.getElementById('card-news-source-manager');
  if (!dialog || cardNewsSourceManagerState.loading || cardNewsSourceManagerState.saving) return;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  setCardNewsSourceManagerStatus('', '');
  setCardNewsSourceManagerBusy(true, 'loading');
  try {
    const result = await fetchJson('/api/v1/settings/card-news-sources');
    const fields = result?.fields || {};
    const builtins = new Set(Array.isArray(fields.CARD_NEWS_BUILTIN_SOURCES) ? fields.CARD_NEWS_BUILTIN_SOURCES : []);
    document.querySelectorAll('[data-card-news-builtin-source]').forEach((input) => {
      input.checked = builtins.has(input.value);
    });
    cardNewsSourceManagerState.rssSources = normalizeCardNewsSourceManagerRss(fields.CARD_NEWS_RSS_SOURCES);
    renderCardNewsSourceManagerRss();
  } catch (error) {
    setCardNewsSourceManagerStatus(error.message || '소스 설정을 불러오지 못했습니다.', 'error');
  } finally {
    setCardNewsSourceManagerBusy(false);
  }
}

async function saveCardNewsSourceManager(event) {
  event.preventDefault();
  if (cardNewsSourceManagerState.saving || cardNewsSourceManagerState.loading) return;
  document.querySelectorAll('[data-card-news-source-field]').forEach((input) => {
    input.dispatchEvent(new Event(input.type === 'checkbox' ? 'change' : 'input'));
  });
  setCardNewsSourceManagerStatus('', '');
  setCardNewsSourceManagerBusy(true, 'saving');
  try {
    await postJson('/api/v1/settings/card-news-sources', {
      values: {
        CARD_NEWS_BUILTIN_SOURCES: [...document.querySelectorAll('[data-card-news-builtin-source]:checked')].map((input) => input.value),
        CARD_NEWS_RSS_SOURCES: cardNewsSourceManagerState.rssSources
      }
    });
    markCardNewsSourcesStale();
    closeCardNewsSourceManager();
    await loadCardNewsSources();
  } catch (error) {
    setCardNewsSourceManagerStatus(error.message || '소스 설정을 적용하지 못했습니다.', 'error');
  } finally {
    setCardNewsSourceManagerBusy(false);
  }
}

function bindCardNewsSourceManager() {
  if (cardNewsSourceManagerState.initialized) return;
  cardNewsSourceManagerState.initialized = true;
  document.getElementById('card-news-source-manage')?.addEventListener('click', () => void openCardNewsSourceManager());
  document.getElementById('card-news-source-manager-form')?.addEventListener('submit', (event) => void saveCardNewsSourceManager(event));
  document.getElementById('card-news-source-manager-cancel')?.addEventListener('click', closeCardNewsSourceManager);
  document.getElementById('card-news-source-add')?.addEventListener('click', () => {
    if (cardNewsSourceManagerState.rssSources.length >= CARD_NEWS_CUSTOM_SOURCE_LIMIT) return;
    cardNewsSourceManagerState.rssSources.push({ id: '', name: '', url: '', enabled: true });
    renderCardNewsSourceManagerRss();
    const rows = document.querySelectorAll('[data-card-news-source-index]');
    rows[rows.length - 1]?.querySelector('[data-card-news-source-field="name"]')?.focus();
  });
}
