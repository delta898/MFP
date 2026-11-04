'use strict';

const API_WORKER = 'bloggenius-trends-api-production';
const SITE_WORKER = 'bg-www-bloggenius-kr';
const API_HOSTS = ['trendapi.hangadac.com', 'trendapi.bloggenius.kr'];
const SITE_HOST = 'www.bloggenius.kr';

function workerName(script) {
    return String(script?.id || script?.name || '');
}

function assertWorker(scripts, expectedName, label) {
    const matches = scripts.filter((script) => workerName(script) === expectedName);
    if (matches.length !== 1) throw new Error(`Expected existing ${label} Worker ${expectedName}; found ${matches.length}.`);
}

function assertDomainOwner(bindings, hostname, expectedWorker, { optional = false } = {}) {
    const matches = bindings.filter((binding) => String(binding?.hostname || '').toLowerCase() === hostname);
    if (optional && matches.length === 0) return;
    if (matches.length !== 1 || String(matches[0]?.service || '') !== expectedWorker) {
        const owner = matches.map((binding) => String(binding?.service || 'unknown')).join(', ') || 'none';
        throw new Error(`Domain ${hostname} must belong to ${expectedWorker}; found ${owner}.`);
    }
}

async function validateProductionTrendsWebTargets(adapter, accountId) {
    const scripts = await adapter.listWorkerScripts(accountId);
    assertWorker(scripts, API_WORKER, 'Production Trends API');
    assertWorker(scripts, SITE_WORKER, 'Production site');

    const apiBindings = await Promise.all(API_HOSTS.map((hostname) =>
        adapter.listWorkerDomains({ accountId, hostname })));
    assertDomainOwner(apiBindings[0], API_HOSTS[0], API_WORKER);
    // Wrangler creates this Custom Domain on first deployment. If it already
    // exists, it must already point to the intended Worker.
    assertDomainOwner(apiBindings[1], API_HOSTS[1], API_WORKER, { optional: true });
    if (!apiBindings[1].some((binding) => String(binding?.hostname || '').toLowerCase() === API_HOSTS[1])) {
        const zones = await adapter.listZones(accountId);
        const zone = zones
            .filter((item) => API_HOSTS[1] === item.name || API_HOSTS[1].endsWith(`.${item.name}`))
            .sort((left, right) => String(right.name).length - String(left.name).length)[0];
        if (!zone?.id) throw new Error(`No active Cloudflare zone owns ${API_HOSTS[1]}.`);
        const records = await adapter.listDnsRecords({ zoneId: zone.id, hostname: API_HOSTS[1] });
        if (records.length) throw new Error(`DNS records already exist for ${API_HOSTS[1]}; resolve the conflict before deploying its Custom Domain.`);
    }
    const siteBindings = await adapter.listWorkerDomains({ accountId, hostname: SITE_HOST });
    assertDomainOwner(siteBindings, SITE_HOST, SITE_WORKER);
    return { apiWorker: API_WORKER, siteWorker: SITE_WORKER, apiHosts: API_HOSTS, siteHost: SITE_HOST };
}

module.exports = { validateProductionTrendsWebTargets };
