'use strict';

function createAstroSiteHostingAdapter(options = {}) {
    if (typeof options.executeOperation !== 'function') throw new TypeError('Astro Site Hosting adapter requires executeOperation().');
    const execute = options.executeOperation;
    const providerActions = [
        'domains.list', 'site-resources.list', 'site-domain-bindings.list', 'site-domain-records.list',
        'site-domain.bind', 'site-domain.unbind', 'site-resource.delete', 'site-deployments.list'
    ];
    const adapter = {
        build(projectId, siteId, context = {}) { return execute('astro-site-hosting', 'astro.build', { projectId, siteId }, context); },
        getBuildStatus(projectId, siteId, context = {}) { return execute('astro-site-hosting', 'astro.build-status', { projectId, siteId }, context); },
        startPreview(projectId, siteId, context = {}) { return execute('astro-site-hosting', 'astro.preview', { action: 'start', projectId, siteId }, context); },
        stopPreview(projectId, siteId, context = {}) { return execute('astro-site-hosting', 'astro.preview', { action: 'stop', projectId, siteId }, context); },
        startDraftPreview(draft, context = {}) { return execute('astro-site-hosting', 'astro.preview', { action: 'start-draft', draft }, context); },
        stopDraftPreview(projectId, draftId, context = {}) { return execute('astro-site-hosting', 'astro.preview', { action: 'stop-draft', projectId, draftId }, context); },
        deploy(site, credentials, context = {}) { return execute('astro-site-hosting', 'hosting.deploy', { site, credentials, context }, context); },
        providerCall(action, accountId, input = {}, context = {}) {
            return execute('astro-site-hosting', 'provider.call', { action, ...(accountId ? { accountId } : {}), input }, context);
        }
    };
    adapter.forAccount = (accountId) => {
        const methods = {
            'domains.list': 'listDomains', 'site-resources.list': 'listSiteResources',
            'site-domain-bindings.list': 'listSiteDomainBindings', 'site-domain-records.list': 'listSiteDomainRecords',
            'site-domain.bind': 'bindSiteDomain', 'site-domain.unbind': 'unbindSiteDomain',
            'site-resource.delete': 'deleteSiteResource', 'site-deployments.list': 'listSiteDeployments'
        };
        const scoped = {};
        for (const action of providerActions) {
            const method = methods[action];
            scoped[method] = (input = {}, context = {}) => {
                const argument = typeof input === 'string' ? {} : input;
                const requestedAccount = typeof input === 'string' ? input : accountId;
                return adapter.providerCall(action, requestedAccount, argument, context);
            };
        }
        scoped.listDomains = (_input = {}, context = {}) => adapter.providerCall('domains.list', accountId, {}, context);
        scoped.listSiteResources = (_input = {}, context = {}) => adapter.providerCall('site-resources.list', accountId, {}, context);
        return Object.freeze(scoped);
    };
    return Object.freeze(adapter);
}

module.exports = { createAstroSiteHostingAdapter };
