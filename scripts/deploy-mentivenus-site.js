'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Cloudflare = require('cloudflare');
const { createCloudflareSdkAdapter, createCloudflareStaticAssetsDeployer } = require('../packages/plugins/core/astro-site-hosting/cloudflare-static-assets-deployer');
const { ensureWorkerDomain } = require('./ensure-worker-domain');
const { checkUrl, checkWithRetry } = require('./production-trends-web-smoke');

const SITE_ID = 'www-mentivenus-com';
const SITE_ROOT = path.resolve(__dirname, '../workspace/site-hosting/sites/www-mentivenus-com');
const TARGETS = Object.freeze({
    development: { ref: 'refs/heads/dev', workerName: 'www-mentivenus-com-dev', hostname: 'www-dev.mentivenus.com' },
    production: { refPrefix: 'refs/heads/release/', workerName: 'www-mentivenus-com-production', hostname: 'www.mentivenus.com' }
});

function getTarget(environment, env) {
    const target = TARGETS[environment];
    if (!target) throw new Error('MENTIVENUS_ENV must be development or production.');
    const validRef = environment === 'development'
        ? env.GITHUB_REF === target.ref
        : String(env.GITHUB_REF || '').startsWith(target.refPrefix) && String(env.GITHUB_REF).length > target.refPrefix.length;
    if (env.GITHUB_ACTIONS !== 'true' || !['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME) || !validRef) {
        throw new Error(`MentiVenus ${environment} site operations require a matching GitHub push or workflow dispatch.`);
    }
    return target;
}

async function ensureSiteDomain(adapter, accountId, target) {
    return ensureWorkerDomain(adapter, {
        accountId,
        hostname: target.hostname,
        workerName: target.workerName,
        allowedCurrentOwners: [target.workerName],
        allowUnbound: true
    });
}

async function main(env = process.env) {
    const environment = String(env.MENTIVENUS_ENV || '').trim().toLowerCase();
    const target = getTarget(environment, env);
    const accessToken = String(env.CLOUDFLARE_API_TOKEN || '').trim();
    const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    if (!accessToken) throw new Error('CLOUDFLARE_API_TOKEN is required.');
    if (!/^[a-f\d]{32}$/i.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID is invalid.');
    if (!fs.existsSync(path.join(SITE_ROOT, 'dist', 'index.html'))) throw new Error('MentiVenus site build output is missing.');

    const client = new Cloudflare({ apiToken: accessToken, maxRetries: 1 });
    const adapter = createCloudflareSdkAdapter({ client });
    const deployer = createCloudflareStaticAssetsDeployer({
        createClient: (token) => new Cloudflare({ apiToken: token, maxRetries: 1 })
    });
    const deployment = await deployer.deploy({ id: SITE_ID, root_path: SITE_ROOT }, {
        accessToken,
        account: { id: accountId, name: `GitHub Actions ${environment}` }
    }, { environment, workerName: target.workerName });
    if (deployment.worker_name !== target.workerName) {
        throw new Error(`Deployment target mismatch: expected ${target.workerName}, received ${deployment.worker_name}.`);
    }
    await checkWithRetry(() => checkUrl(deployment.url, 'site'));
    const domain = await ensureSiteDomain(adapter, accountId, target);
    await checkWithRetry(() => checkUrl(`https://${target.hostname}/`, 'site'));
    console.info(JSON.stringify({ environment, worker_name: target.workerName, url: deployment.url, hostname: target.hostname, domain_changed: domain.changed, deployment_id: deployment.deployment_id, version_id: deployment.version_id }));
}

if (require.main === module) main().catch((error) => {
    console.error(`[MentiVenus site deploy] ${String(error?.message || error).split(process.env.CLOUDFLARE_API_TOKEN || '\0').join('[redacted]')}`);
    process.exitCode = 1;
});

module.exports = { TARGETS, getTarget, ensureSiteDomain, main };
