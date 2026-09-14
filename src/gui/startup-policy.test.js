'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildSafeModeArgs,
    isSafeMode,
    isStartupProbe,
    isShortLivedCommand,
    shouldRetryInSafeMode
} = require('./startup-policy');

test('safe mode adds compatibility switches without disabling the Chromium sandbox', () => {
    const args = buildSafeModeArgs(['--example']);
    assert.deepEqual(args, [
        '--example',
        '--bloggenius-safe-mode',
        '--disable-gpu',
        '--no-stdio-init'
    ]);
    assert.equal(args.includes('--no-sandbox'), false);
});

test('safe mode switch detection and deduplication are stable', () => {
    const args = buildSafeModeArgs(['--disable-gpu', '--bloggenius-safe-mode']);
    assert.equal(isSafeMode(args), true);
    assert.equal(args.filter((arg) => arg === '--disable-gpu').length, 1);
});

test('short-lived commands and successful processes never trigger fallback', () => {
    assert.equal(isShortLivedCommand(['--version']), true);
    assert.equal(shouldRetryInSafeMode({ exitCode: -36861, ready: false, args: ['--version'] }), false);
    assert.equal(shouldRetryInSafeMode({ exitCode: 0, ready: false, args: [] }), false);
    assert.equal(shouldRetryInSafeMode({ exitCode: -1, ready: true, args: [] }), false);
});

test('packaged startup probe is explicit and does not alter safe-mode arguments', () => {
    assert.equal(isStartupProbe(['--bloggenius-startup-probe']), true);
    assert.equal(isStartupProbe([]), false);
    assert.equal(buildSafeModeArgs(['--bloggenius-startup-probe']).includes('--bloggenius-startup-probe'), true);
});

test('one abnormal pre-ready normal-mode exit is eligible for safe fallback', () => {
    assert.equal(shouldRetryInSafeMode({ exitCode: -36861, ready: false, args: [] }), true);
    assert.equal(shouldRetryInSafeMode({
        exitCode: -36861,
        ready: false,
        args: ['--bloggenius-safe-mode']
    }), false);
});
