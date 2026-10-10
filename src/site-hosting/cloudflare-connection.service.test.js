'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    createCloudflareConnectionService,
    DEFAULT_OAUTH_REQUESTED_SCOPES,
    normalizeRequestedScopes
} = require('./cloudflare-connection.service');

test('Cloudflare OAuth scope override is normalized and deduplicated', () => {
    assert.equal(
        normalizeRequestedScopes('memberships.read  workers-scripts.admin memberships.read'),
        'memberships.read workers-scripts.admin'
    );
    assert.equal(normalizeRequestedScopes(''), DEFAULT_OAUTH_REQUESTED_SCOPES.join(' '));
    assert.throws(() => normalizeRequestedScopes('workers-scripts.admin&prompt=consent'));
});

test('Cloudflare authorization requests the configured Workers Admin scope set', async () => {
    let openedUrl = '';
    const service = createCloudflareConnectionService({
        clientId: 'test-client',
        requestedScopes: [
            'memberships.read',
            'workers-scripts.admin',
            'workers-scripts.edit',
            'workers-routes.write',
            'dns.read',
            'zone.read',
            'offline_access'
        ],
        credentialStore: { read: async () => '', write: async () => {}, clear: async () => {} },
        createServer: () => ({ close: (callback) => callback?.() }),
        listen: async () => {},
        openExternal: async (url) => { openedUrl = url; }
    });

    const flow = await service.start();
    assert.equal(flow.status, 'pending');
    assert.deepEqual(
        new URL(openedUrl).searchParams.get('scope').split(' '),
        [
            'memberships.read',
            'workers-scripts.admin',
            'workers-scripts.edit',
            'workers-routes.write',
            'dns.read',
            'zone.read',
            'offline_access'
        ]
    );
    service.cancel(flow.flowId);
});
