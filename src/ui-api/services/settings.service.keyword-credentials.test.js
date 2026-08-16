const test = require('node:test');
const assert = require('node:assert/strict');
const { removeManagedKeywordCredentials } = require('./settings.service');

test('removeManagedKeywordCredentials removes legacy user-managed Naver API secrets', () => {
    const config = {
        NAVER_SEARCHAD_API_KEY: 'remove',
        NAVER_API_HUB_CLIENT_SECRET: 'remove',
        integrations: {
            buffer: { api_key: 'keep' },
            naver_searchad: { api_key: 'remove', secret_key: 'remove' },
            naver_api_hub: { client_id: 'remove', client_secret: 'remove' }
        },
        platforms: {
            naver: {
                user_id: 'keep',
                searchad_api_key: 'remove',
                searchad_secret_key: 'remove',
                searchad_customer_id: 'remove',
                api_hub_client_id: 'remove',
                api_hub_client_secret: 'remove'
            }
        }
    };

    removeManagedKeywordCredentials(config);

    assert.deepEqual(config.integrations, { buffer: { api_key: 'keep' } });
    assert.deepEqual(config.platforms.naver, { user_id: 'keep' });
    assert.equal('NAVER_SEARCHAD_API_KEY' in config, false);
    assert.equal('NAVER_API_HUB_CLIENT_SECRET' in config, false);
});
