'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    createCloudflareConnectionService,
    DEFAULT_OAUTH_REQUESTED_SCOPES,
    normalizeRequestedScopes
} = require('./connection-service');

function createAccountProbeService(accounts, workerStatuses = {}) {
    return createCloudflareConnectionService({
        clientId: 'test-client',
        requestedScopes: 'memberships.read workers-scripts.admin offline_access',
        credentialStore: { read: async () => 'refresh-token', write: async () => {}, clear: async () => {} },
        safeStorage: {
            isEncryptionAvailable: () => true,
            decryptStringAsync: async () => 'refresh-token'
        },
        fetchImpl: async (url) => {
            if (String(url).includes('/oauth2/token')) {
                return { ok: true, status: 200, json: async () => ({ access_token: 'access-token', expires_in: 3600 }) };
            }
            if (String(url).includes('/memberships')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        success: true,
                        result: accounts.map((account) => ({
                            account: { id: account.id, name: account.name },
                            roles: account.roles || ['Administrator']
                        })),
                        result_info: { total_pages: 1 }
                    })
                };
            }
            const accountId = decodeURIComponent(String(url).match(/\/accounts\/([^/]+)\/workers\/scripts/u)?.[1] || '');
            const status = workerStatuses[accountId] || 200;
            return {
                ok: status >= 200 && status < 300,
                status,
                json: async () => status === 403
                    ? { success: false, errors: [{ code: 10000 }] }
                    : { success: true, result: [] }
            };
        }
    });
}

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

test('Cloudflare connection status filters memberships to accounts with Worker access', async () => {
    const accounts = [
        { id: 'account-first', name: 'First account', roles: ['Administrator'] },
        { id: 'account-second', name: 'Second account', roles: ['Administrator'] }
    ];
    const service = createAccountProbeService(accounts, { 'account-second': 403 });

    const status = await service.getStatus();
    assert.equal(status.connected, true);
    assert.deepEqual(status.accounts, [accounts[0]]);
});

test('Cloudflare deployment auto-selects one account and requires an explicit accessible choice for several', async () => {
    const accounts = [
        { id: 'account-first', name: 'First account' },
        { id: 'account-second', name: 'Second account' }
    ];
    const singleAccountService = createAccountProbeService(accounts, { 'account-second': 403 });
    const autoSelected = await singleAccountService.getDeploymentCredentials();
    assert.equal(autoSelected.account.id, 'account-first');

    const multiAccountService = createAccountProbeService(accounts);
    await assert.rejects(multiAccountService.getDeploymentCredentials(), { apiCode: 'CLOUDFLARE_ACCOUNT_SELECTION_REQUIRED' });
    const selected = await multiAccountService.getDeploymentCredentials('account-second');
    assert.equal(selected.account.id, 'account-second');
    await assert.rejects(multiAccountService.getDeploymentCredentials('account-unapproved'), { apiCode: 'CLOUDFLARE_ACCOUNT_NOT_ACCESSIBLE' });
});

test('Cloudflare status fails closed when account access could not be verified', async () => {
    const service = createAccountProbeService([{ id: 'account-first', name: 'First account' }], { 'account-first': 500 });
    await assert.rejects(service.getStatus(), { apiCode: 'CLOUDFLARE_ACCOUNT_ACCESS_CHECK_FAILED' });
});
