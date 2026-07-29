const test = require('node:test');
const assert = require('node:assert/strict');
const {
    BufferClient,
    BufferApiError
} = require('./buffer-client');

function createAxiosMock(responses = []) {
    const calls = [];
    return {
        calls,
        async post(url, body, options) {
            calls.push({ url, body, options });
            const next = responses.shift();
            if (next instanceof Error) throw next;
            return next;
        }
    };
}

test('inspectConnection auto-selects a single organization and returns normalized channels', async () => {
    const axios = createAxiosMock([
        {
            status: 200,
            data: {
                data: {
                    account: {
                        organizations: [{ id: 'org-1', name: 'My Org' }]
                    }
                }
            }
        },
        {
            status: 200,
            data: {
                data: {
                    channels: [{
                        id: 'channel-1',
                        name: 'Fallback Name',
                        displayName: '@bloggenius',
                        service: 'Instagram',
                        avatar: 'https://example.com/avatar.png',
                        externalLink: 'https://instagram.com/bloggenius',
                        descriptor: 'Instagram Business',
                        isDisconnected: false,
                        isLocked: false
                    }]
                }
            }
        }
    ]);
    const client = new BufferClient({ axios });

    const result = await client.inspectConnection('secret-key');

    assert.equal(result.organization_id, 'org-1');
    assert.deepEqual(result.channels, [{
        id: 'channel-1',
        name: '@bloggenius',
        display_name: '@bloggenius',
        service: 'instagram',
        avatar: 'https://example.com/avatar.png',
        external_link: 'https://instagram.com/bloggenius',
        descriptor: 'Instagram Business',
        is_disconnected: false,
        is_locked: false
    }]);
    assert.equal(axios.calls[0].options.headers.Authorization, 'Bearer secret-key');
    assert.equal(axios.calls[1].body.variables.organizationId, 'org-1');
});

test('inspectConnection waits for organization selection when more than one exists', async () => {
    const axios = createAxiosMock([{
        status: 200,
        data: {
            data: {
                account: {
                    organizations: [
                        { id: 'org-1', name: 'First' },
                        { id: 'org-2', name: 'Second' }
                    ]
                }
            }
        }
    }]);
    const client = new BufferClient({ axios });

    const result = await client.inspectConnection('secret-key');

    assert.equal(result.organization_id, '');
    assert.deepEqual(result.channels, []);
    assert.equal(axios.calls.length, 1);
});

test('request converts GraphQL authorization errors to a stable error code', async () => {
    const axios = createAxiosMock([{
        status: 200,
        data: {
            errors: [{
                message: 'Not authorized',
                extensions: { code: 'UNAUTHORIZED' }
            }]
        }
    }]);
    const client = new BufferClient({ axios });

    await assert.rejects(
        () => client.listOrganizations('bad-key'),
        (error) => error instanceof BufferApiError && error.code === 'BUFFER_AUTH_INVALID'
    );
});
