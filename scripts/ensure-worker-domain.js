'use strict';

async function ensureWorkerDomain(adapter, { accountId, hostname, workerName, allowedCurrentOwners = [] }) {
    const scripts = await adapter.listWorkerScripts(accountId);
    const targets = scripts.filter((script) => String(script?.id || script?.name || '') === workerName);
    if (targets.length !== 1) throw new Error(`Target Worker ${workerName} must exist exactly once before changing ${hostname}; found ${targets.length}.`);

    const domains = await adapter.listWorkerDomains({ accountId, hostname });
    const bindings = domains.filter((item) => String(item?.hostname || '').toLowerCase() === hostname.toLowerCase());
    if (bindings.length > 1) throw new Error(`Multiple Worker domain bindings exist for ${hostname}; refusing to change them.`);
    const current = bindings[0];
    if (current?.service === workerName) return { hostname, workerName, changed: false };
    const currentOwner = String(current?.service || '');
    if (current && !allowedCurrentOwners.includes(currentOwner)) {
        throw new Error(`Domain ${hostname} belongs to unexpected Worker ${currentOwner}; refusing to change it.`);
    }
    if (!current) throw new Error(`Domain ${hostname} has no existing Worker binding; refusing implicit creation.`);

    await adapter.attachWorkerDomain({
        accountId,
        hostname,
        workerName,
        ...(current.zone_id ? { zoneId: current.zone_id } : {}),
        ...(current.zone_name ? { zoneName: current.zone_name } : {})
    });
    const verified = (await adapter.listWorkerDomains({ accountId, hostname }))
        .filter((item) => String(item?.hostname || '').toLowerCase() === hostname.toLowerCase());
    if (verified.length !== 1 || String(verified[0]?.service || '') !== workerName) {
        throw new Error(`Cloudflare did not confirm ${hostname} is attached to ${workerName}.`);
    }
    return { hostname, workerName, changed: true, previousWorkerName: currentOwner };
}

module.exports = { ensureWorkerDomain };
