'use strict';

function initWidgetSlotHost() {
  const slots = Array.from(document.querySelectorAll('[data-widget-slot]'));
  if (!slots.length || window.__widgetSlotHostInitialized) return;
  window.__widgetSlotHostInitialized = true;

  const frames = new Map();
  const shells = new Map();
  const widgetByFrame = new WeakMap();
  const openOverlays = new Map();
  let scheduled = false;
  let widgets = [];

  function scheduleReconcile() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      reconcile();
    });
  }

  function getActiveView(slot) {
    const view = slot.closest('.view');
    return !view || view.classList.contains('active');
  }

  function getFrame(widget) {
    const key = `${widget.pluginId}/${widget.id}`;
    if (frames.has(key)) return frames.get(key);
    const shell = document.createElement('div');
    shell.className = 'widget-plugin-frame-shell';
    const frame = document.createElement('iframe');
    frame.className = 'widget-plugin-frame';
    frame.title = widget.name;
    frame.loading = 'lazy';
    frame.referrerPolicy = 'no-referrer';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.src = widget.entryUrl;
    shell.appendChild(frame);
    widgetByFrame.set(frame, widget);
    shells.set(key, shell);
    frames.set(key, frame);
    return frame;
  }

  function closeWidgetOverlay(key, notifyFrame = false) {
    const state = openOverlays.get(key);
    const frame = frames.get(key);
    const shell = shells.get(key);
    if (!state || !frame || !shell) return;

    openOverlays.delete(key);
    shell.classList.remove('is-overlay-open');
    shell.style.zIndex = '';
    frame.style.height = `${state.widget.height}px`;
    frame.dataset.widgetHeight = String(state.widget.height);
    if (notifyFrame) {
      frame.contentWindow?.postMessage({ type: 'widget:host-close-overlay' }, '*');
    }
  }

  function openWidgetOverlay(widget, key, frame, requestedHeight) {
    const shell = shells.get(key);
    if (!shell?.parentElement) return;
    const height = Number.isFinite(requestedHeight)
      ? Math.min(widget.maxHeight, Math.max(widget.height, Math.ceil(requestedHeight)))
      : widget.maxHeight;
    openOverlays.set(key, { widget, slot: shell.parentElement });
    shell.classList.add('is-overlay-open');
    shell.style.zIndex = '100';
    frame.style.height = `${height}px`;
    frame.dataset.widgetHeight = String(height);
  }

  function reconcile() {
    const currentSlots = Array.from(document.querySelectorAll('[data-widget-slot]'));
    const activeWidgetKeys = new Set();
    widgets.forEach((widget) => {
      const key = `${widget.pluginId}/${widget.id}`;
      activeWidgetKeys.add(key);
      const target = currentSlots.find((slot) => slot.dataset.widgetSlot === widget.slot && getActiveView(slot));
      const frame = getFrame(widget);
      const shell = shells.get(key);
      if (openOverlays.has(key)) {
        if (target === openOverlays.get(key).slot) {
          if (shell.parentElement !== target) target.appendChild(shell);
          target.dataset.widgetSlotState = 'ready';
          return;
        }
        closeWidgetOverlay(key, true);
      }
      if (!target) {
        if (shell.parentElement) shell.remove();
        return;
      }
      const availableWidth = Math.min(window.innerWidth - 32, target.clientWidth || widget.width);
      const width = Math.min(widget.width, Math.max(120, availableWidth));
      shell.style.width = `${width}px`;
      shell.style.height = `${widget.height}px`;
      frame.style.width = `${width}px`;
      if (!frame.dataset.widgetHeight) {
        frame.style.height = `${widget.height}px`;
        frame.dataset.widgetHeight = String(widget.height);
      }
      if (shell.parentElement !== target) target.appendChild(shell);
      target.dataset.widgetSlotState = 'ready';
    });
    frames.forEach((frame, key) => {
      const shell = shells.get(key);
      if (!activeWidgetKeys.has(key) && shell?.parentElement) shell.remove();
    });
  }

  fetch('/api/v1/widget-plugins', { headers: { Accept: 'application/json' } })
    .then((response) => {
      if (!response.ok) throw new Error(`Widget Plugin discovery failed (${response.status}).`);
      return response.json();
    })
    .then((payload) => {
      widgets = Array.isArray(payload?.data?.widgets) ? payload.data.widgets : [];
      reconcile();
    })
    .catch((error) => {
      console.warn('[WidgetHost] 위젯을 불러오지 못했습니다:', error);
      slots.forEach((slot) => { slot.dataset.widgetSlotState = 'unavailable'; });
    });

  window.addEventListener('message', (event) => {
    if (event.source == null) return;
    // Sandboxed iframe origins serialize differently across Chromium/Electron versions.
    // Bind the expanded-state contract to the registered frame WindowProxy instead.
    const frame = Array.from(frames.values()).find((item) => item.contentWindow === event.source);
    if (!frame) return;
    const widget = widgetByFrame.get(frame);
    const message = event.data;
    if (!widget || !message) return;
    const key = `${widget.pluginId}/${widget.id}`;
    if (message.type === 'widget:resize' && Number.isFinite(message.height)) {
      if (openOverlays.has(key)) return;
      const height = Math.min(widget.maxHeight, Math.max(widget.height, Math.ceil(message.height)));
      const shell = shells.get(key);
      if (!shell) return;
      shell.style.height = `${height}px`;
      frame.style.height = `${height}px`;
      frame.dataset.widgetHeight = String(height);
      return;
    }
    if (message.type !== 'widget:overlay-state' || typeof message.open !== 'boolean') return;
    if (message.open) openWidgetOverlay(widget, key, frame, message.height);
    else closeWidgetOverlay(key);
  });

  document.addEventListener('pointerdown', (event) => {
    openOverlays.forEach((_, key) => {
      const frame = frames.get(key);
      const shell = shells.get(key);
      if (frame && shell && !shell.contains(event.target)) closeWidgetOverlay(key, true);
    });
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    openOverlays.forEach((_, key) => closeWidgetOverlay(key, true));
  }, true);
  window.addEventListener('resize', scheduleReconcile, { passive: true });

  const observer = new MutationObserver(scheduleReconcile);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'hidden']
  });
}
