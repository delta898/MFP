'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'startup-guard.js'), 'utf8');

function executeGuard() {
    const listeners = new Map();
    const messages = [];
    const window = {
        addEventListener(name, listener) { listeners.set(name, listener); }
    };
    vm.runInNewContext(source, {
        window,
        console: {
            error(message) { messages.push({ level: 'error', message }); },
            info(message) { messages.push({ level: 'info', message }); }
        }
    }, { filename: 'startup-guard.js' });
    return { listeners, messages, state: window.__BLOGGENIUS_STARTUP__ };
}

test('renderer startup guard captures early errors before readiness', () => {
    const guard = executeGuard();
    guard.listeners.get('error')({
        message: 'startup exploded', filename: 'http://127.0.0.1/app.js', lineno: 12, colno: 3,
        error: new Error('startup exploded')
    });
    guard.listeners.get('unhandledrejection')({ reason: new Error('async startup exploded') });

    assert.equal(guard.state.ready, false);
    assert.equal(guard.state.errors.length, 2);
    assert.match(guard.messages[0].message, /BLOGGENIUS_RENDERER_ERROR/);
    assert.match(guard.messages[1].message, /BLOGGENIUS_RENDERER_UNHANDLED_REJECTION/);
});
test('renderer startup guard exposes one immutable ready handshake', () => {
    const guard = executeGuard();
    assert.equal(guard.state.markReady({ surface: 'view-dashboard-beta' }), true);
    assert.equal(guard.state.markReady({ surface: 'other' }), false);
    assert.equal(guard.state.ready, true);
    assert.equal(guard.state.details.surface, 'view-dashboard-beta');
    assert.match(guard.messages[0].message, /BLOGGENIUS_RENDERER_READY/);
});
