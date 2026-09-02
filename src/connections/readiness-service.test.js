const test = require('node:test');
const assert = require('node:assert/strict');

const { createConnectionReadinessService } = require('./readiness-service');

function createService(overrides = {}) {
    const records = new Map();
    return createConnectionReadinessService({
        CONFIG: {
            WORDPRESS_URL: 'https://blog.example',
            WORDPRESS_USER_ID: 'editor',
            WORDPRESS_APP_PASSWORD: 'app-password'
        },
        async checkNaverSessionForUi() {
            return { ok: true };
        },
        WordPressClient: class {
            async verifyAuth() {
                return { success: true, connected: true, message: '연동 성공' };
            }
        },
        getWordPressVerification(config) {
            return records.get(JSON.stringify(config)) || null;
        },
        recordWordPressVerification(config, result) {
            const state = {
                status: result.success ? 'connected' : 'failed',
                connected: result.connected === true,
                message: result.message || '',
                checked_at: new Date().toISOString()
            };
            records.set(JSON.stringify(config), state);
            return state;
        },
        ...overrides
    });
}

test('readiness actively restores Naver and WordPress status after process start', async () => {
    const calls = [];
    const service = createService({
        async checkNaverSessionForUi(options) {
            calls.push(['naver', options]);
            return { ok: true };
        },
        WordPressClient: class {
            async verifyAuth() {
                calls.push(['wordpress']);
                return { success: true, connected: true, message: '연동 성공' };
            }
        }
    });

    const result = await service.getReadiness();

    assert.equal(result.naver.ok, true);
    assert.equal(result.wordpress.status, 'connected');
    assert.deepEqual(calls, [
        ['naver', { forceRefresh: false }],
        ['wordpress']
    ]);
});

test('WordPress readiness reuses a recent verification result', async () => {
    let verifyCount = 0;
    const recent = {
        status: 'connected',
        connected: true,
        checked_at: '2026-09-02T07:00:00.000Z'
    };
    const service = createService({
        now: () => new Date('2026-09-02T07:01:00.000Z').getTime(),
        getWordPressVerification() {
            return recent;
        },
        WordPressClient: class {
            async verifyAuth() {
                verifyCount += 1;
                return { success: true, connected: true };
            }
        }
    });

    const result = await service.checkWordPress();

    assert.equal(result.cached, true);
    assert.equal(verifyCount, 0);
});

test('concurrent WordPress readiness requests share one external verification', async () => {
    let verifyCount = 0;
    let resolveVerification;
    const verification = new Promise((resolve) => { resolveVerification = resolve; });
    const service = createService({
        WordPressClient: class {
            async verifyAuth() {
                verifyCount += 1;
                return verification;
            }
        }
    });

    const first = service.checkWordPress();
    const second = service.checkWordPress();
    resolveVerification({ success: true, connected: true, message: '연동 성공' });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(verifyCount, 1);
    assert.equal(firstResult.status, 'connected');
    assert.equal(secondResult.status, 'connected');
});

test('WordPress readiness skips external access when settings are incomplete', async () => {
    let verifyCount = 0;
    const service = createService({
        CONFIG: { WORDPRESS_URL: '' },
        WordPressClient: class {
            async verifyAuth() {
                verifyCount += 1;
                return { success: true };
            }
        }
    });

    const result = await service.checkWordPress();

    assert.equal(result.status, 'not_configured');
    assert.equal(verifyCount, 0);
});
