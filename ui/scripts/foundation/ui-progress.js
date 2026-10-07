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
  layer.setAttribute('role', 'status');
  layer.setAttribute('aria-live', 'polite');
  if (type === UI_PROGRESS_TYPES.BLOCKING_INDETERMINATE) layer.tabIndex = 0;
  layer.innerHTML = `
    <div class="ui-progress-layer-content">
      <span class="ui-progress-indeterminate" aria-hidden="true"><span></span></span>
      <span class="ui-progress-layer-message"></span>
    </div>`;
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
