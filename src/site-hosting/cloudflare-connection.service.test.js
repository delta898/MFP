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
            'workers-routes.write',
            'dns.read',
            'zone.read',
            'offline_access'
        ]
    );
    assert.ok(DEFAULT_OAUTH_REQUESTED_SCOPES.includes('workers-scripts.admin'));
    assert.ok(!DEFAULT_OAUTH_REQUESTED_SCOPES.some((scope) => /workers-scripts\.(edit|read|write)/.test(scope)));
    service.cancel(flow.flowId);
});

test('Cloudflare status decrypts the stored refresh token once and reuses it in memory', async () => {
    let decryptCalls = 0;
    let credentialReads = 0;
    const service = createCloudflareConnectionService({
        clientId: 'test-client',
        requestedScopes: 'memberships.read offline_access',
        credentialStore: {
            read: async () => {
                credentialReads += 1;
                return Buffer.from('encrypted-refresh-token').toString('base64');
            },
            write: async () => {},
            clear: async () => {}
        },
        safeStorage: {
            isEncryptionAvailable: () => true,
            decryptStringAsync: async () => {
                decryptCalls += 1;
                return 'refresh-token';
            }
        },
        fetchImpl: async (url) => {
            if (String(url).includes('/oauth2/token')) {
                return {
                    ok: true,
                    json: async () => ({ access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 3600 })
                };
            }
            return {
                ok: true,
                json: async () => ({ success: true, result: [], result_info: { total_pages: 1 } })
            };
        }
    });

    await Promise.all([service.getStatus(), service.getStatus()]);
    assert.equal(decryptCalls, 1);
    assert.equal(credentialReads, 1);
    await service.getStatus();
    assert.equal(decryptCalls, 1);
    assert.equal(credentialReads, 1);
});
