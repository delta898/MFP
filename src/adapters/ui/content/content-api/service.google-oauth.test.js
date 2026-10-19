'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createContentApiService } = require('./service');

test('Google OAuth start fails clearly when generated app configuration is missing', async () => {
    const service = createContentApiService({
        GoogleOAuth: {
            getConfigurationStatus() {
                return { configured: false, missing: ['client_id', 'client_secret'] };
            }
        }
    });

    await assert.rejects(
        () => service.startGoogleOauth(),
        (error) => {
            assert.equal(error.apiCode, 'GOOGLE_OAUTH_CLIENT_NOT_READY');
            assert.match(error.message, /앱 설정 또는 버전/);
            return true;
        }
    );
});

test('Google OAuth status delegates directly to the desktop OAuth client', async () => {
    let calls = 0;
    const service = createContentApiService({
        GoogleOAuth: {
            async getStatus() {
                calls += 1;
                return { state: 'disconnected', configured: true };
            }
        }
    });

    assert.deepEqual(await service.getGoogleOauthStatus(), {
        state: 'disconnected',
        configured: true
    });
    assert.equal(calls, 1);
});

test('Google OAuth flow opens externally, exposes callback completion, and can be cancelled', async () => {
    const openedUrls = [];
    const callbackServer = {
        once() {},
        listen(_port, _host, callback) { callback(); },
        address() { return { port: 43127 }; },
        setTimeout() {},
        close(callback) { callback?.(); }
    };
    const service = createContentApiService({
        GoogleOAuth: {
            getConfigurationStatus() { return { configured: true, missing: [] }; },
            buildAuthUrl({ redirectUri }) {
                return { authUrl: `https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=${encodeURIComponent(redirectUri)}` };
            }
        },
        openExternal: async (url) => openedUrls.push(url),
        createGoogleOauthCallbackServer: () => callbackServer
    });

    const started = await service.startGoogleOauth({ mode: 'picker' });
    assert.ok(started.flowId);
    assert.equal(Object.hasOwn(started, 'authUrl'), false);
    assert.equal((await service.getGoogleOauthFlow(started.flowId)).status, 'pending');
    await service.openGoogleOauthFlow(started.flowId);
    assert.equal(openedUrls.length, 1);
    assert.match(openedUrls[0], /^https:\/\/accounts\.google\.com\//);
    await service.cancelGoogleOauthFlow(started.flowId);
    assert.equal((await service.getGoogleOauthFlow(started.flowId)).status, 'cancelled');
});
