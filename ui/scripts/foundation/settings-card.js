let uiSettingsCardPatternBound = false;

function setUiSettingsCardFeedback(id, message = '', tone = 'neutral') {
  const element = document.getElementById(id);
  if (!element) return;
  const text = String(message || '');
  element.textContent = text;
  element.title = text;
  element.dataset.tone = tone;
}

function setUiSettingsCardFooterDetail(id, message = '', tone = 'neutral') {
  const element = document.getElementById(id);
  if (!element) return;
  const text = String(message || '');
  element.textContent = text;
  element.title = text;
  element.dataset.tone = tone;
  element.hidden = !text;
}

function initUiSettingsCardPattern() {
  if (uiSettingsCardPatternBound) return;
  document.querySelectorAll('[data-settings-card-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.settingsCardTarget);
      if (!target) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  uiSettingsCardPatternBound = true;
}
