'use strict';

const API_WORKER = 'bloggenius-trends-api-production';
const SITE_WORKER = 'www-bloggenius-kr-production';
const LEGACY_SITE_WORKERS = ['bg-fca282ece0e348c4baf36294d0d3f0f0'];
const API_HOSTS = ['trendapi.hangadac.com', 'trendapi.bloggenius.kr'];
const SITE_HOST = 'www.bloggenius.kr';

function workerName(script) {
    return String(script?.id || script?.name || '');
}

function assertDomainOwner(bindings, hostname, expectedWorker, { optional = false } = {}) {
    const matches = bindings.filter((binding) => String(binding?.hostname || '').toLowerCase() === hostname);
    if (optional && matches.length === 0) return;
    if (matches.length !== 1 || String(matches[0]?.service || '') !== expectedWorker) {
        const owner = matches.map((binding) => String(binding?.service || 'unknown')).join(', ') || 'none';
        throw new Error(`Domain ${hostname} must belong to ${expectedWorker}; found ${owner}.`);
    }
}

function assertSiteDomainOwner(bindings) {
    const matches = bindings.filter((binding) => String(binding?.hostname || '').toLowerCase() === SITE_HOST);
    if (matches.length > 1) throw new Error(`Domain ${SITE_HOST} must have at most one Worker binding; found ${matches.length}.`);
    if (matches.length === 0) return null;
    const owner = String(matches[0]?.service || '');
    if (![SITE_WORKER, ...LEGACY_SITE_WORKERS].includes(owner)) {
        throw new Error(`Domain ${SITE_HOST} must belong to ${SITE_WORKER} or a known legacy Worker; found ${owner || 'unknown'}.`);
    }
    return owner;
}

async function validateProductionTrendsWebTargets(adapter, accountId) {
    const scripts = await adapter.listWorkerScripts(accountId);
    const apiWorkers = scripts.filter((script) => workerName(script) === API_WORKER);
    if (apiWorkers.length > 1) throw new Error(`Expected at most one Production Trends API Worker ${API_WORKER}; found ${apiWorkers.length}.`);
    const siteWorkers = scripts.filter((script) => workerName(script) === SITE_WORKER);
    if (siteWorkers.length > 1) throw new Error(`Expected at most one Production site Worker ${SITE_WORKER}; found ${siteWorkers.length}.`);

    const apiBindings = await Promise.all(API_HOSTS.map((hostname) =>
        adapter.listWorkerDomains({ accountId, hostname })));
    // Wrangler creates these Custom Domains on first deployment. A pre-existing
    // binding must already point to the intended Worker; never take it over.
    assertDomainOwner(apiBindings[0], API_HOSTS[0], API_WORKER, { optional: true });
    assertDomainOwner(apiBindings[1], API_HOSTS[1], API_WORKER, { optional: true });
    for (const [index, hostname] of API_HOSTS.entries()) {
        if (apiBindings[index].some((binding) => String(binding?.hostname || '').toLowerCase() === hostname)) continue;
        const zones = await adapter.listZones(accountId);
        const zone = zones
            .filter((item) => hostname === item.name || hostname.endsWith(`.${item.name}`))
            .sort((left, right) => String(right.name).length - String(left.name).length)[0];
        if (!zone?.id) throw new Error(`No active Cloudflare zone owns ${hostname}.`);
        const records = await adapter.listDnsRecords({ zoneId: zone.id, hostname });
        if (records.length) throw new Error(`DNS records already exist for ${hostname}; resolve the conflict before deploying its Custom Domain.`);
    }
    const siteBindings = await adapter.listWorkerDomains({ accountId, hostname: SITE_HOST });
    const siteHostOwner = assertSiteDomainOwner(siteBindings);
    return { apiWorker: API_WORKER, apiWorkerExists: apiWorkers.length === 1, siteWorker: SITE_WORKER, siteWorkerExists: siteWorkers.length === 1, siteHostOwner, apiHosts: API_HOSTS, siteHost: SITE_HOST };
}

module.exports = { API_WORKER, SITE_WORKER, LEGACY_SITE_WORKERS, API_HOSTS, SITE_HOST, validateProductionTrendsWebTargets };
