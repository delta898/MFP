// Shared presentation for controls that start an AI request.
function createUiAiIcon() {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.classList.add('ui-ai-icon');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#ui-icon-ai');
  icon.appendChild(use);
  return icon;
}

function setUiAiActionButton(button, label, options = {}) {
  if (!button) return;
  const { ai = true, visuallyHiddenLabel = false, accessibleLabel } = options;
  const text = document.createElement('span');
  text.className = visuallyHiddenLabel ? 'visually-hidden' : 'ui-ai-action-label';
  text.textContent = String(label || '');
  button.replaceChildren(...(ai ? [createUiAiIcon(), text] : [text]));
  button.classList.add('ui-ai-action-button');
  button.dataset.uiAiAction = ai ? 'true' : 'false';
  const resolvedAccessibleLabel = accessibleLabel === undefined
    ? (ai ? `AI ${String(label || '')}` : String(label || ''))
    : String(accessibleLabel || '');
  if (resolvedAccessibleLabel) button.setAttribute('aria-label', resolvedAccessibleLabel);
  else button.removeAttribute('aria-label');
}
