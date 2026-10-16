'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAstroSiteHostingAdapter } = require('./astro-site-hosting');

test('Astro Site Hosting adapter maps site operations onto Plugin Host operations', async () => {
    const calls = [];
    const adapter = createAstroSiteHostingAdapter({
        executeOperation: async (...args) => { calls.push(args); return { ok: true }; }
    });
    await adapter.build('project-1', 'site-1');
    await adapter.startPreview('project-1', 'site-1');
    await adapter.forAccount('account-1').listSiteDomainBindings({ accountId: 'account-1', hostname: 'blog.example.com' });
    assert.deepEqual(calls.map(([, operation]) => operation), ['astro.build', 'astro.preview', 'provider.call']);
    assert.deepEqual(calls[2][2], {
        action: 'site-domain-bindings.list', accountId: 'account-1',
        input: { accountId: 'account-1', hostname: 'blog.example.com' }
    });
});
