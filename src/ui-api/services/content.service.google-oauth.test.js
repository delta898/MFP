'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createContentService } = require('./content.service');

test('Google OAuth start fails clearly when generated app configuration is missing', async () => {
    const service = createContentService({
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
    const service = createContentService({
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
