const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createUiSessionRuntime } = require('./session-runtime');
const {
    configureConnectionVerificationState,
    createConnectionSignature,
    readConnectionVerification
} = require('../connections/verification-state');

function createRuntime(overrides = {}) {
    return createUiSessionRuntime({
        CONFIG: {
            AUTH_FILE_PATH: '/tmp/naver-auth-test.json',
            GOOGLE_SHEET_ID: 'sheet-id'
        },
        Utils: {},
        Logger: {
            info() {},
            error() {}
        },
        async checkAuthSessionValid() {
            return { ok: true };
        },
        peekAuthSessionState() {
            return { ok: false, reason: 'not_checked', checked: false };
        },
        clearAuthSession() {
            return { ok: true, removed: true };
        },
        async runInteractiveNaverLoginFlow() {
            return { authPath: '/tmp/naver-auth-test.json', detectedBy: 'test' };
        },
        ...overrides
    });
}

test('UI session runtime forwards forced Naver session checks', async () => {
    let receivedOptions = null;
    const runtime = createRuntime({
        async checkAuthSessionValid(options) {
            receivedOptions = options;
            return { ok: true };
        }
    });

    const result = await runtime.checkNaverSessionForUi({ forceRefresh: true });

    assert.equal(result.ok, true);
    assert.equal(receivedOptions.forceRefresh, true);
    assert.equal(receivedOptions.cacheTtlMs, 120000);
});

test('UI session runtime exposes cached Naver state without an active check', () => {
    const runtime = createRuntime({
        peekAuthSessionState() {
            return { ok: true, checked: true, checkedAt: 1234 };
        }
    });

    assert.deepEqual(runtime.peekNaverSessionForUi(), { ok: true, checked: true, checkedAt: 1234 });
});

test('UI session runtime clears persisted Naver auth and resets login flow state', async () => {
    let receivedOptions = null;
    const runtime = createRuntime({
        clearAuthSession(options) {
            receivedOptions = options;
            return { ok: true, removed: true };
        }
    });
    runtime.setNaverLoginState({
        status: 'success',
        message: '로그인 완료',
        startedAt: new Date().toISOString()
    });

    const result = await runtime.logoutNaverSessionForUi();
    const state = runtime.getNaverLoginStatus();

    assert.deepEqual(receivedOptions, { authPath: '/tmp/naver-auth-test.json' });
    assert.equal(result.removed, true);
    assert.equal(state.status, 'idle');
    assert.equal(state.message, '로그아웃됨');
    assert.equal(state.startedAt, null);
});

test('sheets preflight records verification for restart-safe status', async () => {
    const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sheets-verify-')), 'connection_verification.json');
    configureConnectionVerificationState({ fs, path, filePath });
    const signature = createConnectionSignature(['sheet-id']);

    const runtime = createRuntime({
        Utils: { ensureAllSheetsExist: async () => ({ success: true, spreadsheetId: 'sheet-id' }) }
    });
    const result = await runtime.ensureSheetsReadyForUi({ force: true });
    assert.equal(result.ok, true);
    assert.equal(readConnectionVerification('sheets', signature).status, 'connected');

    const failing = createRuntime({
        Utils: { ensureAllSheetsExist: async () => ({ success: false, message: 'access denied' }) }
    });
    await assert.rejects(failing.ensureSheetsReadyForUi({ force: true }));
    const failed = readConnectionVerification('sheets', signature);
    assert.equal(failed.status, 'failed');
    assert.match(failed.message, /access denied/);
});
