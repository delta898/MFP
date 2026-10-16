'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCorePluginRegistry } = require('../../../../src/composition/core-plugin-registry');
const { createCorePluginRuntime } = require('../../../../src/composition/core-plugin-runtime');

test('Astro Site Hosting Plugin delegates build and deployment through declared operations', async () => {
    const calls = [];
    const runtime = createCorePluginRuntime({ registry: createCorePluginRegistry() });
    const { executeOperation } = runtime.ensurePlugins(['astro-site-hosting'], {
        'astro-site-hosting': {
            astroRuntime: { build: async (projectId, siteId) => { calls.push(['build', projectId, siteId]); return { screenshot: 'data:image/png;base64,AA==' }; } },
            cloudflareDeployer: { deploy: async (_site, credentials) => { calls.push(['deploy', credentials.account.id]); return { worker_name: 'bg-sample' }; } },
            getCredentials: async () => ({}),
            createCloudflareAdapter: () => ({})
        }
    });
    const result = await executeOperation('astro-site-hosting', 'hosting.deploy', {
        site: { id: 'site-1', project_id: 'project-1' },
        credentials: { account: { id: 'account-1' } }
    });
    assert.deepEqual(result, { worker_name: 'bg-sample', screenshot: 'data:image/png;base64,AA==', screenshot_error: '' });
    assert.deepEqual(calls, [['build', 'project-1', 'site-1'], ['deploy', 'account-1']]);
});

test('provider capability resolves credentials inside the Plugin and rejects account drift', async () => {
    const runtime = createCorePluginRuntime({ registry: createCorePluginRegistry() });
    const { executeOperation } = runtime.ensurePlugins(['astro-site-hosting'], {
        'astro-site-hosting': {
            astroRuntime: {}, cloudflareDeployer: { deploy: async () => ({}) },
            getCredentials: async () => ({ accessToken: 'secret', account: { id: 'actual' } }),
            createCloudflareAdapter: () => ({})
        }
    });
    await assert.rejects(executeOperation('astro-site-hosting', 'provider.call', {
        action: 'account.resolve', accountId: 'expected', input: {}
    }), { code: 'HOSTING_ACCOUNT_MISMATCH' });
});
