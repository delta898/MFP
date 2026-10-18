let settingsNextAppearanceBound = false;
let settingsNextSidebarPositionBound = false;
const SETTINGS_NEXT_SIDEBAR_POSITION_STORAGE_KEY = 'bloggenius.ui.sidebar-position';

function getSettingsNextSidebarPosition() {
  const position = String(document.documentElement?.dataset?.sidebarPosition || '').trim().toLowerCase();
  return position === 'right' ? 'right' : 'left';
}

function syncSettingsNextSidebarPosition() {
  const position = getSettingsNextSidebarPosition();
  document.querySelectorAll('[data-sidebar-position-option]').forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.sidebarPositionOption === position ? 'true' : 'false');
  });
}

function applySettingsNextSidebarPosition(candidate) {
  const position = String(candidate || '').trim().toLowerCase();
  if (position !== 'left' && position !== 'right') return false;
  document.documentElement.dataset.sidebarPosition = position;
  syncSettingsNextSidebarPosition();
  let persisted = false;
  try {
    window.localStorage?.setItem(SETTINGS_NEXT_SIDEBAR_POSITION_STORAGE_KEY, position);
    persisted = true;
  } catch (_error) { }
  const feedback = document.getElementById('settings-next-sidebar-position-feedback');
  if (feedback) feedback.textContent = persisted ? '' : '메뉴 위치를 바꿨지만 이 기기에 저장하지 못했습니다.';
  window.dispatchEvent(new Event('resize'));
  return true;
}

function initSettingsNextSidebarPosition() {
  syncSettingsNextSidebarPosition();
  if (settingsNextSidebarPositionBound) return;
  settingsNextSidebarPositionBound = true;
  document.querySelectorAll('[data-sidebar-position-option]').forEach((button) => {
    button.addEventListener('click', () => applySettingsNextSidebarPosition(button.dataset.sidebarPositionOption));
  });
}

function getSettingsNextAppearanceCopy(styleId) {
  const entry = typeof getDesignStyleEntry === 'function' ? getDesignStyleEntry(styleId) : null;
  if (!entry) return '';
  if (entry.blurb) return entry.blurb;
  return `${entry.label} 스타일로 화면을 바꿉니다.`;
}

function getSettingsNextAppearanceCurrentId() {
  const rootId = String(document.documentElement?.dataset?.style || '').trim().toLowerCase();
  if (typeof getDesignStyleEntry === 'function'
    && getDesignStyleEntry(rootId)?.selectable === true) return rootId;
  const firstSelectable = typeof getSelectableDesignStyles === 'function'
    ? getSelectableDesignStyles()[0]
    : null;
  if (firstSelectable?.id) return firstSelectable.id;
  return typeof resolveDesignStyleId === 'function' ? resolveDesignStyleId() : '';
}

function createSettingsNextAppearancePreview(styleId) {
  const preview = document.createElement('span');
  preview.className = 'appearance-style-preview';
  preview.setAttribute('data-style', styleId);
  preview.setAttribute('aria-hidden', 'true');
  const card = document.createElement('span');
  card.className = 'appearance-preview-card';
  const title = document.createElement('strong');
  title.textContent = '미리보기 제목';
  const body = document.createElement('span');
  body.textContent = '본문과 설명이 이렇게 보입니다.';
  const row = document.createElement('span');
  row.className = 'appearance-preview-row';
  const primary = document.createElement('span');
  primary.className = 'appearance-preview-primary';
  primary.textContent = '확인';
  const badge = document.createElement('span');
  badge.className = 'ui-status-badge';
  badge.dataset.state = 'ready';
  badge.textContent = '연결됨';
  row.append(primary, badge);
  card.append(title, body, row);
  preview.appendChild(card);
  if (typeof applyDesignStyle === 'function') applyDesignStyle(styleId, preview);
  return preview;
}

function renderSettingsNextAppearance() {
  const grid = document.getElementById('settings-next-appearance-grid');
  if (!grid) return false;
  const styles = typeof getSelectableDesignStyles === 'function' ? getSelectableDesignStyles() : [];
  const currentId = getSettingsNextAppearanceCurrentId();
  grid.replaceChildren();
  styles.forEach((style) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'appearance-style-card';
    card.dataset.appearanceStyle = style.id;
    card.setAttribute('aria-pressed', style.id === currentId ? 'true' : 'false');
    card.appendChild(createSettingsNextAppearancePreview(style.id));
    const copy = document.createElement('span');
    copy.className = 'appearance-style-copy';
    const name = document.createElement('strong');
    name.textContent = style.label;
    const detail = document.createElement('small');
    detail.textContent = getSettingsNextAppearanceCopy(style.id);
    copy.append(name, detail);
    card.appendChild(copy);
    card.addEventListener('click', () => void applySettingsNextAppearance(style.id));
    grid.appendChild(card);
  });
  return true;
}

function setSettingsNextAppearanceFeedback(message) {
  const feedback = document.getElementById('settings-next-appearance-feedback');
  if (feedback) feedback.textContent = String(message || '');
}

async function applySettingsNextAppearance(styleId) {
  const normalized = String(styleId || '').trim().toLowerCase();
  const entry = typeof getDesignStyleEntry === 'function' ? getDesignStyleEntry(normalized) : null;
  if (!entry || entry.selectable !== true) return false;
  if (typeof applyDesignStyle === 'function') applyDesignStyle(normalized);
  const persisted = typeof persistDesignStyleId === 'function' ? persistDesignStyleId(normalized) : false;
  document.querySelectorAll('[data-appearance-style]').forEach((card) => {
    card.setAttribute('aria-pressed', card.dataset.appearanceStyle === normalized ? 'true' : 'false');
  });
  setSettingsNextAppearanceFeedback(persisted ? '' : '외모를 적용했지만 이 기기에 저장하지 못했습니다.');
  return true;
}

function initSettingsNextAppearance() {
  if (settingsNextAppearanceBound) return;
  const grid = document.getElementById('settings-next-appearance-grid');
  if (!grid) return;
  settingsNextAppearanceBound = true;
  initSettingsNextSidebarPosition();
  if (typeof refreshRemoteDesignStyles === 'function') {
    void refreshRemoteDesignStyles().finally(() => renderSettingsNextAppearance());
  } else {
    renderSettingsNextAppearance();
  }
}
