const DESIGN_STYLE_CONTRACT_VERSION = '0.1';
const DESIGN_STYLE_DEFAULT_ID = 'compatibility';

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
  '--ui-shadow-sm',
  '--ui-shadow-md',
  '--ui-shadow-lg',
  '--ui-shadow-soft',
  '--ui-shadow-glass',
  '--ui-motion-fast',
  '--ui-motion-standard',
  '--ui-motion-slow',
  '--ui-ease-standard',
  '--ui-transition-interactive'
]);

const DESIGN_STYLE_REGISTRY = Object.freeze({
  compatibility: Object.freeze({
    id: 'compatibility',
    label: 'Compatibility',
    contractVersion: DESIGN_STYLE_CONTRACT_VERSION,
    selectable: false
  })
});

function resolveDesignStyleId(candidate) {
  const normalized = String(candidate || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(DESIGN_STYLE_REGISTRY, normalized)
    ? normalized
    : DESIGN_STYLE_DEFAULT_ID;
}

function applyDesignStyle(candidate, root = document.documentElement) {
  const styleId = resolveDesignStyleId(candidate);
  if (root?.dataset) root.dataset.style = styleId;
  return DESIGN_STYLE_REGISTRY[styleId];
}

function initDesignStyleSystem(root = document.documentElement) {
  return applyDesignStyle(root?.dataset?.style, root);
}

try {
  initDesignStyleSystem();
} catch (error) {
  console.warn('Design style initialization failed:', error);
}
