(function installBlogGeniusStartupGuard() {
  'use strict';

  const MAX_ERRORS = 20;
  const MAX_TEXT_LENGTH = 2000;
  const compact = (value) => String(value || '').slice(0, MAX_TEXT_LENGTH);
  const state = {
    version: 1,
    startedAt: new Date().toISOString(),
    ready: false,
    readyAt: '',
    details: {},
    errors: []
  };

  function record(kind, input = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      kind: compact(kind),
      message: compact(input.message),
      source: compact(input.source),
      line: Number(input.line || 0),
      column: Number(input.column || 0),
      stack: compact(input.stack)
    };
    if (state.errors.length < MAX_ERRORS) state.errors.push(entry);
    console.error(`[BLOGGENIUS_RENDERER_${String(kind || 'ERROR').toUpperCase()}] ${JSON.stringify(entry)}`);
  }

  state.markReady = function markReady(details = {}) {
    if (state.ready) return false;
    state.ready = true;
    state.readyAt = new Date().toISOString();
    state.details = details && typeof details === 'object' ? details : {};
    console.info(`[BLOGGENIUS_RENDERER_READY] ${JSON.stringify({
      timestamp: state.readyAt,
      details: state.details,
      capturedErrorCount: state.errors.length
    })}`);
    return true;
  };

  window.addEventListener('error', (event) => {
    record('error', {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      stack: event.error?.stack
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    record('unhandled_rejection', {
      message: reason?.message || reason,
      stack: reason?.stack
    });
  });

  Object.defineProperty(window, '__BLOGGENIUS_STARTUP__', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: state
  });
})();
