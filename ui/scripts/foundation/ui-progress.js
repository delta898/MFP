/**
 * Shared, indeterminate progress-layer scopes. Add a type only when its
 * interaction/focus contract differs; never create a page-specific variant.
 */
const UI_PROGRESS_TYPES = Object.freeze({
  // Locks one content region while controls outside it remain available.
  REGION_INDETERMINATE: 'region-indeterminate',
  // Locks a transaction surface and prevents its enclosing dialog from closing.
  BLOCKING_INDETERMINATE: 'blocking-indeterminate'
});

/**
 * Show the common indeterminate progress layer on the smallest surface that
 * must remain stable. Always call the returned cleanup function in `finally`.
 * `surface` may belong to another same-origin document (for example a preview
 * window), so DOM nodes and focus checks must use its owning document realm.
 */
function showUiProgress(surface, options = {}) {
  if (!surface || surface.nodeType !== 1 || !surface.ownerDocument) return () => {};
  const ownerDocument = surface.ownerDocument;
  const OwnerHTMLElement = ownerDocument.defaultView?.HTMLElement;
  if (!OwnerHTMLElement || !(surface instanceof OwnerHTMLElement)) return () => {};

  const type = String(options.type || UI_PROGRESS_TYPES.BLOCKING_INDETERMINATE);
  if (!Object.values(UI_PROGRESS_TYPES).includes(type)) {
    throw new Error(`Unsupported UI progress type: ${type}`);
  }

  const layer = ownerDocument.createElement('div');
  layer.className = 'ui-progress-layer';
  if (type === UI_PROGRESS_TYPES.BLOCKING_INDETERMINATE) layer.classList.add('ui-blocking-progress');
  layer.dataset.uiProgressType = type;
  if (options.presentation === 'compact') layer.dataset.uiProgressPresentation = 'compact';
  if (options.visual === 'browser-preview') layer.dataset.uiProgressVisual = 'browser-preview';
  layer.setAttribute('role', 'status');
  layer.setAttribute('aria-live', 'polite');
  if (type === UI_PROGRESS_TYPES.BLOCKING_INDETERMINATE) layer.tabIndex = 0;
  layer.innerHTML = `
    <div class="ui-progress-layer-content">
      <span class="ui-progress-spinner" aria-hidden="true"></span>
      <span class="ui-progress-layer-title" hidden></span>
      <span class="ui-progress-indeterminate" aria-hidden="true"><span></span></span>
      <span class="ui-progress-layer-message"></span>
    </div>`;
  const title = layer.querySelector('.ui-progress-layer-title');
  if (options.title) {
    title.textContent = String(options.title);
    title.hidden = false;
  }
  layer.querySelector('.ui-progress-layer-message').textContent = String(options.message || '작업 중입니다.');

  const previousBusy = surface.getAttribute('aria-busy');
  const previousClass = surface.classList.contains('ui-progress-surface');
  const previousFocus = ownerDocument.activeElement;
  // Make existing surface content inert without making the newly appended
  // status layer inert; remember every prior value for exact cleanup.
  const inertChildren = [...surface.children]
    .filter((child) => child !== layer)
    .map((child) => ({ child, inert: child.inert }));
  const dialog = type === UI_PROGRESS_TYPES.BLOCKING_INDETERMINATE ? surface.closest('dialog') : null;
  const preventDialogCancel = (event) => event.preventDefault();

  surface.classList.add('ui-progress-surface');
  surface.setAttribute('aria-busy', 'true');
  inertChildren.forEach(({ child }) => { child.inert = true; });
  surface.append(layer);
  if (options.visual === 'browser-preview') ensureUiProgressBrowserPreviewStyles(ownerDocument);
  dialog?.addEventListener('cancel', preventDialogCancel);
  if (type === UI_PROGRESS_TYPES.BLOCKING_INDETERMINATE) layer.focus({ preventScroll: true });

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    dialog?.removeEventListener('cancel', preventDialogCancel);
    inertChildren.forEach(({ child, inert }) => {
      if (child.isConnected) child.inert = inert;
    });
    if (previousBusy === null) surface.removeAttribute('aria-busy');
    else surface.setAttribute('aria-busy', previousBusy);
    if (!previousClass) surface.classList.remove('ui-progress-surface');
    layer.remove();
    if (type === UI_PROGRESS_TYPES.BLOCKING_INDETERMINATE && previousFocus instanceof OwnerHTMLElement && previousFocus.isConnected && !previousFocus.closest('[inert]')) {
      previousFocus.focus({ preventScroll: true });
    }
  };
}

function ensureUiProgressBrowserPreviewStyles(ownerDocument) {
  if (ownerDocument.querySelector('style[data-ui-progress-browser-preview-fallback]')) return;
  const layer = ownerDocument.querySelector('.ui-progress-layer[data-ui-progress-visual="browser-preview"]');
  const hasSharedVisualStyles = Boolean(layer && ownerDocument.defaultView?.getComputedStyle(layer)
    .getPropertyValue('--ui-progress-browser-preview').trim() === '1');
  if (hasSharedVisualStyles) return;
  const style = ownerDocument.createElement('style');
  style.dataset.uiProgressBrowserPreviewFallback = '';
  style.textContent = `
    .ui-progress-surface { position: relative; }
    .ui-progress-layer[data-ui-progress-visual="browser-preview"] {
      --ui-progress-browser-preview: 1;
      position: absolute; z-index: 20; inset: 0; display: grid; place-items: center;
      padding: 24px; border-radius: inherit; background: rgba(48, 37, 31, .12);
      color: #30251f; cursor: progress;
    }
    .ui-progress-spinner { display: none; }
    .ui-progress-layer[data-ui-progress-visual="browser-preview"] .ui-progress-layer-content {
      display: grid; justify-items: center; gap: 14px; width: min(560px, 100%);
      padding: 32px 40px; border: 1px solid #e2d5c9; border-radius: 12px;
      background: #fffdfa; box-shadow: 0 12px 40px rgba(48, 37, 31, .12); text-align: center;
    }
    .ui-progress-layer[data-ui-progress-visual="browser-preview"] .ui-progress-spinner {
      display: block; width: 42px; height: 42px; border: 4px solid #e6e3dc;
      border-top-color: #4c6a5e; border-radius: 50%; animation: ui-progress-spin .8s linear infinite;
    }
    .ui-progress-layer[data-ui-progress-visual="browser-preview"] .ui-progress-layer-title {
      font: 700 1.45rem/1.35 system-ui, sans-serif;
    }
    .ui-progress-layer[data-ui-progress-visual="browser-preview"] .ui-progress-layer-message {
      font: 400 1.15rem/1.55 system-ui, sans-serif; color: #675c54;
    }
    @keyframes ui-progress-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) {
      .ui-progress-layer[data-ui-progress-visual="browser-preview"] .ui-progress-spinner { animation: none; }
    }
  `;
  ownerDocument.head.append(style);
}
