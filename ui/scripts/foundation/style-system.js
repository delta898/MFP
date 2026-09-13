const DESIGN_STYLE_CONTRACT_VERSION = '1.0';
const DESIGN_STYLE_DEFAULT_ID = 'compatibility';
const DESIGN_STYLE_STORAGE_KEY = 'bloggenius.ui.style';

const DESIGN_STYLE_REQUIRED_TOKENS = Object.freeze([
  '--ui-canvas',
  '--ui-surface',
  '--ui-surface-translucent',
  '--ui-surface-muted',
  '--ui-surface-hover',
  '--ui-surface-emphasis',
  '--ui-overlay',
  '--ui-text-primary',
  '--ui-text-secondary',
  '--ui-text-muted',
  '--ui-text-inverse',
  '--ui-border-default',
  '--ui-border-strong',
  '--ui-border-focus',
  '--ui-action-primary',
  '--ui-action-primary-hover',
  '--ui-action-primary-soft',
  '--ui-action-secondary',
  '--ui-action-secondary-hover',
  '--ui-action-danger',
  '--ui-status-info',
  '--ui-status-success',
  '--ui-status-warning',
  '--ui-status-danger',
  '--ui-focus-ring',
  '--ui-font-sans',
  '--ui-font-mono',
  '--ui-type-display-size',
  '--ui-type-heading-size',
  '--ui-type-body-size',
  '--ui-type-label-size',
  '--ui-type-caption-size',
  '--ui-line-height-tight',
  '--ui-line-height-body',
  '--ui-weight-regular',
  '--ui-weight-medium',
  '--ui-weight-semibold',
  '--ui-weight-bold',
  '--ui-space-1',
  '--ui-space-2',
  '--ui-space-3',
  '--ui-space-4',
  '--ui-space-5',
  '--ui-space-6',
  '--ui-space-8',
  '--ui-space-10',
  '--ui-space-12',
  '--ui-radius-sm',
  '--ui-radius-md',
  '--ui-radius-lg',
  '--ui-radius-full',
  '--ui-density-page-gap',
  '--ui-density-section-padding',
  '--ui-density-action-padding',
  '--ui-density-field-gap',
  '--ui-density-control-min-height',
  '--ui-density-compact-control-min-height',
  '--ui-density-control-padding-inline',
  '--ui-density-control-radius',
  '--ui-shadow-sm',
  '--ui-shadow-md',
  '--ui-shadow-lg',
  '--ui-shadow-soft',
  '--ui-shadow-glass',
  '--ui-motion-fast',
  '--ui-motion-standard',
  '--ui-motion-slow',
  '--ui-ease-standard',
  '--ui-transition-interactive',
  '--ui-button-radius',
  '--ui-button-primary-background',
  '--ui-button-primary-hover',
  '--ui-button-primary-text',
  '--ui-button-primary-border',
  '--ui-button-secondary-background',
  '--ui-button-secondary-hover',
  '--ui-button-secondary-text',
  '--ui-button-secondary-border',
  '--ui-button-secondary-hover-border',
  '--ui-button-tertiary-background',
  '--ui-button-tertiary-hover',
  '--ui-button-tertiary-text',
  '--ui-button-tertiary-border',
  '--ui-button-danger-text',
  '--ui-button-danger-hover',
  '--ui-button-disabled-opacity',
  '--ui-action-group-gap',
  '--ui-card-background',
  '--ui-card-border',
  '--ui-card-radius',
  '--ui-card-shadow',
  '--ui-card-hover-shadow',
  '--ui-card-hover-transform',
  '--ui-segmented-active-shadow',
  '--ui-segmented-badge-shadow',
  '--ui-row-running-shadow',
  '--ui-table-header-divider-shadow',
  '--ui-sticky-footer-shadow'
]);

const DESIGN_STYLE_REGISTRY = Object.freeze({
  compatibility: Object.freeze({
    id: 'compatibility',
    label: 'Compatibility',
    contractVersion: DESIGN_STYLE_CONTRACT_VERSION,
    selectable: false
  }),
  'warm-editorial': Object.freeze({
    id: 'warm-editorial',
    label: '따뜻한 에디토리얼',
    blurb: '기본 화면. 종이 질감의 따뜻함과 여유로운 밀도입니다.',
    contractVersion: DESIGN_STYLE_CONTRACT_VERSION,
    selectable: true
  }),
  'quiet-sage-studio': Object.freeze({
    id: 'quiet-sage-studio',
    label: '고요한 세이지 스튜디오',
    blurb: '차분한 세이지 색감의 조용한 밀도입니다.',
    contractVersion: DESIGN_STYLE_CONTRACT_VERSION,
    selectable: true
  }),
  'autumn-night-library': Object.freeze({
    id: 'autumn-night-library',
    label: '가을밤 서재',
    blurb: '짙은 월넛과 구리빛으로 집중감을 높인 어두운 스타일입니다.',
    contractVersion: DESIGN_STYLE_CONTRACT_VERSION,
    selectable: true
  }),
  'hanji-dancheong': Object.freeze({
    id: 'hanji-dancheong',
    label: '한지 위의 단청',
    blurb: '한지의 여백에 먹색과 절제된 단청색을 더한 반듯한 스타일입니다.',
    contractVersion: DESIGN_STYLE_CONTRACT_VERSION,
    selectable: true
  })
});

function resolveDesignStyleId(candidate) {
  const normalized = String(candidate || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(DESIGN_STYLE_REGISTRY, normalized)
    ? normalized
    : DESIGN_STYLE_DEFAULT_ID;
}

function getSelectableDesignStyles() {
  return Object.values(DESIGN_STYLE_REGISTRY).filter((style) => style.selectable === true);
}

function readStoredDesignStyleId() {
  try {
    const stored = String(window.localStorage?.getItem(DESIGN_STYLE_STORAGE_KEY) || '').trim().toLowerCase();
    if (!stored) return '';
    const entry = DESIGN_STYLE_REGISTRY[stored];
    return entry && entry.selectable === true ? stored : '';
  } catch (error) {
    return '';
  }
}

function persistDesignStyleId(styleId) {
  try {
    window.localStorage?.setItem(DESIGN_STYLE_STORAGE_KEY, styleId);
    return true;
  } catch (error) {
    return false;
  }
}

function applyDesignStyle(candidate, root = document.documentElement) {
  const styleId = resolveDesignStyleId(candidate);
  if (root?.dataset) root.dataset.style = styleId;
  return DESIGN_STYLE_REGISTRY[styleId];
}

function initDesignStyleSystem(root = document.documentElement) {
  const stored = readStoredDesignStyleId();
  if (stored) return applyDesignStyle(stored, root);
  return applyDesignStyle(root?.dataset?.style, root);
}

try {
  initDesignStyleSystem();
} catch (error) {
  console.warn('Design style initialization failed:', error);
}
