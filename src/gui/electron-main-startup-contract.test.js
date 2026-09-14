'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'electron-main.js'), 'utf8');

test('bootstrap and fatal handlers are installed before the application graph loads', () => {
    const bootstrapIndex = source.indexOf("require('./startup-bootstrap')");
    const handlerIndex = source.indexOf("process.on('uncaughtException'");
    const configIndex = source.indexOf("require('../config-loader')");

    assert.ok(bootstrapIndex >= 0);
    assert.ok(handlerIndex > bootstrapIndex);
    assert.ok(configIndex > handlerIndex);
});

test('safe mode uses the minimal server and does not automatically disable the sandbox', () => {
    assert.match(source, /require\('\.\/safe-mode-server'\)/);
    assert.match(source, /app[.]disableHardwareAcceleration\(\)/);
    assert.doesNotMatch(source, /appendSwitch\(['"]no-sandbox/);
});

test('renderer readiness is persisted and the CI probe exits cleanly', () => {
    assert.match(source, /startup[.]markReady/);
    assert.match(source, /STARTUP_PROBE_COMPLETE/);
    assert.match(source, /setImmediate\(\(\) => app[.]quit\(\)\)/);
});

test('normal shutdown closes SQLite memory while safe mode keeps a no-op boundary', () => {
    assert.match(source, /closeAgentMemory = \(\) => \{\}/);
    assert.match(source, /\(\{ closeAgentMemory, startUiServer \} = require\('\.\.\/ui-server'\)\)/);
    assert.match(source, /app[.]on\('before-quit',[\s\S]{0,700}closeAgentMemory[?][.]\(\)/);
});
