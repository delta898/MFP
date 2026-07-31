const test = require('node:test');
const assert = require('node:assert/strict');
const { createUiSessionRuntime } = require('./session-runtime');

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
