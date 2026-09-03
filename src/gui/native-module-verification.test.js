'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    KUZU_SUCCESS_MARKER,
    isNativeModuleVerificationRequested,
    verifyPackagedNativeModules
} = require('./native-module-verification');

function createWriter() {
    let value = '';
    return {
        write(chunk) { value += String(chunk); },
        read() { return value; }
    };
}

test('native module verification is enabled only by the explicit packaged-app argument', () => {
    assert.equal(isNativeModuleVerificationRequested(['BlogGenius.exe']), false);
    assert.equal(isNativeModuleVerificationRequested(['BlogGenius.exe', '--verify-native-modules']), true);
});

test('native module verification requires Kuzu load success and emits a stable marker', () => {
    const stdout = createWriter();
    const stderr = createWriter();

    assert.equal(verifyPackagedNativeModules({ loadKuzu() { return {}; }, stdout, stderr }), true);
    assert.match(stdout.read(), new RegExp(KUZU_SUCCESS_MARKER));
    assert.equal(stderr.read(), '');
});

test('native module verification reports the loader failure and returns false', () => {
    const stdout = createWriter();
    const stderr = createWriter();

    assert.equal(verifyPackagedNativeModules({
        loadKuzu() { throw new Error('native load failed'); },
        stdout,
        stderr
    }), false);
    assert.equal(stdout.read(), '');
    assert.match(stderr.read(), /native load failed/);
});
