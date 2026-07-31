const test = require('node:test');
const assert = require('node:assert/strict');
const {
    BufferClient,
    BufferApiError,
    isTransientBufferError
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

test('shareNowMany sends channel posts as aliased mutations and preserves per-channel results', async () => {
    const axios = createAxiosMock([{
        status: 200,
        data: {
            data: {
                delivery0: {
                    __typename: 'PostActionSuccess',
                    post: { id: 'post-1', channelId: 'channel-1' }
                },
                delivery1: {
                    __typename: 'MutationError',
                    message: 'Channel is disconnected'
                }
            }
        }
    }]);
    const client = new BufferClient({ axios });

    const result = await client.shareNowMany('secret-key', [
        {
            deliveryKey: 'delivery-1',
            channelId: 'channel-1',
            text: '새 글\nhttps://blog.example/1',
            imageUrl: 'https://blog.example/image.jpg'
        },
        {
            deliveryKey: 'delivery-2',
            channelId: 'channel-2',
            text: '새 글\nhttps://blog.example/1'
        }
    ]);

    assert.equal(axios.calls.length, 1);
    assert.match(axios.calls[0].body.query, /delivery0: createPost/);
    assert.match(axios.calls[0].body.query, /delivery1: createPost/);
    assert.equal(axios.calls[0].body.variables.input0.mode, 'shareNow');
    assert.deepEqual(axios.calls[0].body.variables.input0.assets, [{
        image: { url: 'https://blog.example/image.jpg' }
    }]);
    assert.equal(axios.calls[0].body.variables.input1.assets, undefined);
    assert.deepEqual(result, [
        {
            success: true,
            deliveryKey: 'delivery-1',
            channelId: 'channel-1',
            bufferPostId: 'post-1'
        },
        {
            success: false,
            deliveryKey: 'delivery-2',
            channelId: 'channel-2',
            code: 'BUFFER_POST_REJECTED',
            message: 'Channel is disconnected',
            retriable: false
        }
    ]);
});

test('listRecentPosts queries recent scheduled, sending, and sent posts by channel', async () => {
    const axios = createAxiosMock([{
        status: 200,
        data: {
            data: {
                posts: {
                    edges: [
                        {
                            node: {
                                id: 'post-1',
                                channelId: 'channel-1',
                                text: '새 글',
                                status: 'sent',
                                createdAt: '2026-07-29T07:01:00.000Z',
                                sentAt: '2026-07-29T07:01:05.000Z',
                                externalLink: 'https://social.example/post-1'
                            }
                        }
                    ]
                }
            }
        }
    }]);
    const client = new BufferClient({ axios });

    const result = await client.listRecentPosts('secret-key', {
        organizationId: 'org-1',
        channelIds: ['channel-1', 'channel-1'],
        startDate: '2026-07-29T06:56:00.000Z',
        first: 20
    });

    assert.match(axios.calls[0].body.query, /status: \[scheduled, sending, sent\]/);
    assert.deepEqual(axios.calls[0].body.variables, {
        organizationId: 'org-1',
        channelIds: ['channel-1'],
        startDate: '2026-07-29T06:56:00.000Z',
        first: 20
    });
    assert.deepEqual(result, [{
        id: 'post-1',
        channelId: 'channel-1',
        text: '새 글',
        status: 'sent',
        createdAt: '2026-07-29T07:01:00.000Z',
        sentAt: '2026-07-29T07:01:05.000Z',
        externalLink: 'https://social.example/post-1'
    }]);
});

test('transient Buffer errors include connection, rate limit, and server failures', () => {
    assert.equal(isTransientBufferError(new BufferApiError('network', {
        code: 'BUFFER_CONNECTION_FAILED'
    })), true);
    assert.equal(isTransientBufferError(new BufferApiError('limited', {
        code: 'BUFFER_CONNECTION_FAILED',
        status: 429
    })), true);
    assert.equal(isTransientBufferError(new BufferApiError('server', {
        status: 503
    })), true);
    assert.equal(isTransientBufferError(new BufferApiError('invalid', {
        code: 'BUFFER_AUTH_INVALID',
        status: 401
    })), false);
});
