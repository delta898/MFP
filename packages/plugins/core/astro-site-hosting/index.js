'use strict';

const PACKAGE_VERSION = require('./package.json').version;
const manifest = require('./package.json').bloggeniusPlugin;

function createPlugin(deps = {}) {
    const { astroRuntime, cloudflareDeployer, getCredentials, createCloudflareAdapter } = deps;
    if (!astroRuntime || typeof astroRuntime !== 'object') throw new TypeError('Astro Site Hosting requires astroRuntime.');
    if (!cloudflareDeployer || typeof cloudflareDeployer.deploy !== 'function') throw new TypeError('Astro Site Hosting requires a deployment provider.');
    if (typeof getCredentials !== 'function' || typeof createCloudflareAdapter !== 'function') {
        throw new TypeError('Astro Site Hosting requires hosting-provider credential and adapter ports.');
    }
    const providerActions = {
        'domains.list': (adapter, accountId) => adapter.listZones(accountId),
        'site-resources.list': (adapter, accountId) => adapter.listWorkerScripts(accountId),
        'site-domain-bindings.list': (adapter, accountId, input) => adapter.listWorkerDomains({ accountId, ...input }),
        'site-domain-records.list': (adapter, _accountId, input) => adapter.listDnsRecords(input),
        'site-domain.bind': (adapter, _accountId, input) => adapter.attachWorkerDomain(input),
        'site-domain.unbind': (adapter, _accountId, input) => adapter.detachWorkerDomain(input),
        'site-resource.delete': (adapter, _accountId, input) => adapter.deleteWorker(input),
        'site-deployments.list': (adapter, _accountId, input) => adapter.listDeployments(input)
    };
    const operations = {
        'astro.build': { execute: ({ projectId, siteId }) => astroRuntime.build(projectId, siteId) },
        'astro.build-status': { execute: ({ projectId, siteId }) => astroRuntime.getBuildStatus(projectId, siteId) },
        'astro.preview': { execute: (input) => {
            switch (input.action) {
                case 'start': return astroRuntime.startPreview(input.projectId, input.siteId);
                case 'stop': return astroRuntime.stopPreview(input.projectId, input.siteId);
                case 'start-draft': return astroRuntime.startDraftPreview(input.draft);
                case 'stop-draft': return astroRuntime.stopDraftPreview(input.projectId, input.draftId);
                default: throw new TypeError('Unsupported Astro preview action.');
            }
        } },
        'hosting.deploy': { execute: async ({ site, credentials, context = {} }) => {
            const build = await astroRuntime.build(site.project_id, site.id);
            const deployment = await cloudflareDeployer.deploy(site, credentials, context);
            return { ...deployment, screenshot: build?.screenshot || null, screenshot_error: build?.screenshot_error || '' };
        } },
        'provider.call': { execute: async ({ action, accountId, input }) => {
            const credentials = await getCredentials(accountId);
            if (!credentials?.accessToken || !credentials?.account?.id) throw Object.assign(new Error('Hosting provider credentials are unavailable.'), { code: 'HOSTING_CREDENTIALS_REQUIRED' });
            const resolvedAccountId = String(credentials.account.id);
            if (accountId && resolvedAccountId !== String(accountId)) throw Object.assign(new Error('The connected provider account does not match this site.'), { code: 'HOSTING_ACCOUNT_MISMATCH' });
            if (action === 'account.resolve') return { account: { id: resolvedAccountId, name: String(credentials.account.name || '') } };
            const adapter = createCloudflareAdapter({ accessToken: credentials.accessToken });
            const invoke = providerActions[action];
            if (!invoke) throw new TypeError('Unsupported hosting-provider action.');
            return invoke(adapter, resolvedAccountId, input);
        } }
    };
    return Object.freeze({ manifest, version: PACKAGE_VERSION, operations: Object.freeze(operations) });
}

module.exports = { createPlugin };
