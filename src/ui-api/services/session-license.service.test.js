const test = require('node:test');
const assert = require('node:assert/strict');
const { createSessionLicenseService } = require('./session-license.service');
const { createSessionLicenseController } = require('../controllers/session-license.controller');
const { createSessionLicenseRouteHandler } = require('../routes/session-license.routes');

function createService(overrides = {}) {
    return createSessionLicenseService({
        License: {},
        parseBoolQuery(value) {
            return value === '1' || value === true;
        },
        toFeatureMap(value) {
            return value || {};
        },
        async checkNaverSessionForUi() {
            return { ok: false, reason: 'missing_auth' };
        },
        async logoutNaverSessionForUi() {
            return { ok: true, removed: true };
        },
        getNaverLoginStatus() {
            return { status: 'idle' };
        },
        getNaverLoginState() {
            return { status: 'idle' };
        },
        setNaverLoginState() {},
        async runNaverLoginFlowForUi() {},
        WordPressClient: class {},
        CONFIG: {},
        recordWordPressVerification() {},
        ...overrides
    });
}

test('session service forces a fresh Naver session check when requested', async () => {
    let receivedOptions = null;
    const service = createService({
        async checkNaverSessionForUi(options) {
            receivedOptions = options;
            return { ok: true };
        }
    });

    const result = await service.getNaverSession({ forceRaw: '1' });

    assert.deepEqual(receivedOptions, { forceRefresh: true });
    assert.equal(result.valid, true);
    assert.ok(result.checkedAt);
});

test('session service returns an idempotent Naver logout result', async () => {
    const service = createService({
        async logoutNaverSessionForUi() {
            return { ok: true, removed: false };
        }
    });

    const result = await service.logoutNaverSession();

    assert.equal(result.loggedOut, true);
    assert.equal(result.removed, false);
    assert.match(result.message, /로그인 정보/);
});

test('WordPress verification requires publish permission for public or scheduled posts', async () => {
    const received = [];
    const service = createService({
        WordPressClient: class {
            async verifyAuth(options) {
                received.push(options);
                return { success: true };
            }
        },
        CONFIG: {
            WORDPRESS_URL: 'https://blog.example',
            WORDPRESS_USER_ID: 'editor',
            WORDPRESS_APP_PASSWORD: 'app-password'
        }
    });

    await service.verifyWordPressAuth({ postStatus: 'draft' });
    await service.verifyWordPressAuth({ postStatus: 'publish' });
    await service.verifyWordPressAuth({ postStatus: 'schedule' });

    assert.deepEqual(received, [
        { requirePublish: false, requireEdit: true },
        { requirePublish: true, requireEdit: false },
        { requirePublish: true, requireEdit: false }
    ]);
});

test('WordPress verification records the checked candidate settings and result', async () => {
    let recorded = null;
    const service = createService({
        WordPressClient: class {
            async verifyAuth() {
                return { success: false, connected: false, message: '인증 실패' };
            }
        },
        recordWordPressVerification(config, result) {
            recorded = { config, result };
        }
    });

    const result = await service.verifyWordPressAuth({
        wordpressUrl: 'https://blog.example',
        wordpressUserId: 'editor',
        wordpressAppPassword: 'wrong-password'
    });

    assert.equal(result.success, false);
    assert.deepEqual(recorded, {
        config: {
            url: 'https://blog.example',
            userId: 'editor',
            appPassword: 'wrong-password'
        },
        result: { success: false, connected: false, message: '인증 실패' }
    });
});

test('session route exposes Naver logout as a POST operation', async () => {
    let response = null;
    const controller = createSessionLicenseController({
        service: {
            async logoutNaverSession() {
                return { loggedOut: true };
            }
        },
        sendSuccess(_res, requestId, data) {
            response = { requestId, data };
            return true;
        },
        sendError() {
            throw new Error('unexpected error response');
        },
        logger: { info() {} }
    });
    const route = createSessionLicenseRouteHandler({ controller });

    const handled = await route({
        pathname: '/api/v1/session/naver-login/logout',
        method: 'POST',
        requestId: 'request-1',
        requestBody: {},
        searchParams: new URLSearchParams(),
        res: {}
    });

    assert.equal(handled, true);
    assert.deepEqual(response, {
        requestId: 'request-1',
        data: { loggedOut: true }
    });
});
