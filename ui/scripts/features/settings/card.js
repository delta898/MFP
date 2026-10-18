let uiSettingsCardPatternBound = false;
const uiSettingsCardFeedbackTimers = new Map();

function setUiSettingsCardFeedback(id, message = '', tone = 'neutral') {
  const element = document.getElementById(id);
  if (!element) return;
  const timer = uiSettingsCardFeedbackTimers.get(id);
  if (timer) clearTimeout(timer);
  uiSettingsCardFeedbackTimers.delete(id);
  const text = String(message || '');
  element.textContent = text;
  element.title = text;
  element.dataset.tone = tone;
  if (element.dataset.hideWhenEmpty === 'true') element.hidden = !text;
}

function setUiSettingsCardTransientFeedback(id, message = '', tone = 'success', durationMs = 4500) {
  setUiSettingsCardFeedback(id, message, tone);
  const element = document.getElementById(id);
  if (!element || !String(message || '')) return;
  element.hidden = false;
  const timer = setTimeout(() => {
    element.hidden = true;
    element.textContent = '';
    element.title = '';
    uiSettingsCardFeedbackTimers.delete(id);
  }, Math.max(1000, Number(durationMs) || 4500));
  uiSettingsCardFeedbackTimers.set(id, timer);
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

function prepareUiSettingsTargetScrollSpace(target) {
  const view = target.closest('.view');
  const scroller = target.closest('.main');
  if (!view || !scroller) return;

  let spacer = view.querySelector(':scope > .settings-navigation-scroll-spacer');
  if (!spacer) {
    spacer = document.createElement('div');
    spacer.className = 'settings-navigation-scroll-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    view.appendChild(spacer);
  }

  spacer.style.blockSize = '0px';
  void scroller.scrollHeight;
  const scrollerRect = scroller.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const scrollerCenter = scrollerRect.top + scroller.clientTop + scroller.clientHeight / 2;
  const targetCenter = targetRect.top + targetRect.height / 2;
  const desiredScrollTop = scroller.scrollTop + targetCenter - scrollerCenter;
  const currentMaximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  spacer.style.blockSize = `${Math.max(0, desiredScrollTop - currentMaximum)}px`;
}

function scrollUiSettingsTargetIntoView(target, { highlight = false, activeViewId = '' } = {}) {
  if (!target) return Promise.resolve(false);
  if (highlight) {
    target.classList.remove('settings-navigation-target');
    void target.offsetWidth;
    target.classList.add('settings-navigation-target');
    setTimeout(() => target.classList.remove('settings-navigation-target'), 1800);
  }

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (activeViewId && document.getElementById(activeViewId)?.classList.contains('active') !== true) {
          resolve(false);
          return;
        }
        if (!target.isConnected || target.getClientRects().length === 0) {
          resolve(false);
          return;
        }

        target.focus({ preventScroll: true });
        prepareUiSettingsTargetScrollSpace(target);
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
        target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center', inline: 'nearest' });
        resolve(true);
      });
    });
  });
}

function initUiSettingsCardPattern() {
  if (uiSettingsCardPatternBound) return;
  document.querySelectorAll('[data-settings-card-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.settingsCardTarget);
      if (!target) return;
      void scrollUiSettingsTargetIntoView(target);
    });
  });
  uiSettingsCardPatternBound = true;
}
