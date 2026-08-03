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
    assert.equal(axios.calls[0].options.timeout, 60000);
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

test('shareNowMany keeps the short timeout for text-only posts', async () => {
    const axios = createAxiosMock([{
        status: 200,
        data: {
            data: {
                delivery0: {
                    __typename: 'PostActionSuccess',
                    post: { id: 'post-1', channelId: 'channel-1' }
                }
            }
        }
    }]);
    const client = new BufferClient({ axios });

    await client.shareNowMany('secret-key', [{ channelId: 'channel-1', text: '텍스트만 발행' }]);

    assert.equal(axios.calls[0].options.timeout, 15000);
});

test('request exposes an explicit timeout error code', async () => {
    const timeoutError = new Error('timeout of 60000ms exceeded');
    timeoutError.code = 'ECONNABORTED';
    const axios = createAxiosMock([timeoutError]);
    const client = new BufferClient({ axios });

    await assert.rejects(
        () => client.shareNowMany('secret-key', [{
            channelId: 'channel-1',
            text: '이미지 발행',
            imageUrl: 'https://blog.example/image.jpg'
        }]),
        (error) => error instanceof BufferApiError
            && error.code === 'BUFFER_REQUEST_TIMEOUT'
            && /60초/.test(error.message)
    );
});

test('listRecentPosts queries recent posts without the unreliable API startDate filter', async () => {
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
                        },
                        {
                            node: {
                                id: 'old-post',
                                channelId: 'channel-1',
                                text: '이전 글',
                                status: 'sent',
                                createdAt: '2026-07-29T06:55:59.000Z',
                                sentAt: '2026-07-29T06:56:00.000Z'
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
    assert.doesNotMatch(axios.calls[0].body.query, /startDate/);
    assert.deepEqual(axios.calls[0].body.variables, {
        organizationId: 'org-1',
        channelIds: ['channel-1'],
        first: 20
    });
    assert.equal(axios.calls[0].options.timeout, 30000);
    assert.deepEqual(result, [{
        id: 'post-1',
        channelId: 'channel-1',
        text: '새 글',
        status: 'sent',
        createdAt: '2026-07-29T07:01:00.000Z',
        sentAt: '2026-07-29T07:01:05.000Z',
        externalLink: 'https://social.example/post-1',
        error: null
    }]);
});

test('getPostsByIds fetches terminal post state and publishing errors in one query', async () => {
    const axios = createAxiosMock([{
        status: 200,
        data: {
            data: {
                post0: {
                    id: 'post-1',
                    channelId: 'channel-1',
                    status: 'sent',
                    sentAt: '2026-08-03T01:02:03.000Z',
                    externalLink: 'https://social.example/1'
                },
                post1: {
                    id: 'post-2',
                    channelId: 'channel-2',
                    status: 'error',
                    error: { message: 'Image fetch failed', supportUrl: 'https://support.buffer.com/help' }
                }
            }
        }
    }]);
    const client = new BufferClient({ axios });

    const result = await client.getPostsByIds('secret-key', ['post-1', 'post-2']);

    assert.match(axios.calls[0].body.query, /post0: post\(input: \$input0\)/);
    assert.deepEqual(axios.calls[0].body.variables, {
        input0: { id: 'post-1' },
        input1: { id: 'post-2' }
    });
    assert.equal(result[0].status, 'sent');
    assert.equal(result[1].status, 'error');
    assert.equal(result[1].error.message, 'Image fetch failed');
});

test('transient Buffer errors include connection, rate limit, and server failures', () => {
    assert.equal(isTransientBufferError(new BufferApiError('network', {
        code: 'BUFFER_CONNECTION_FAILED'
    })), true);
    assert.equal(isTransientBufferError(new BufferApiError('timeout', {
        code: 'BUFFER_REQUEST_TIMEOUT'
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
