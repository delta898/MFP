'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Cloudflare = require('cloudflare');
const {
    createCloudflareSdkAdapter,
    createCloudflareStaticAssetsDeployer
} = require('../packages/plugins/core/astro-site-hosting/cloudflare-static-assets-deployer');
const { ensureWorkerDomain } = require('./ensure-worker-domain');
const { checkUrl, checkWithRetry } = require('./production-trends-web-smoke');

const SITE_ID = 'www-bloggenius-kr';
const WORKER_NAME = 'www-bloggenius-kr-dev';
const SITE_HOST = 'www-dev.bloggenius.kr';
const LEGACY_WORKER = 'bg-www-bloggenius-kr-dev';
const SITE_ROOT = path.resolve(__dirname, '../workspace/site-hosting/sites/www-bloggenius-kr');

function assertWorkflowContext(env) {
    const isDevelopmentPush = env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/dev';
    const isDevelopmentDispatch = env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_REF === 'refs/heads/dev';
    if (env.GITHUB_ACTIONS !== 'true' || (!isDevelopmentPush && !isDevelopmentDispatch)) {
        throw new Error('Development site operations only run from a dev push or manual workflow dispatch on dev.');
    }
    if (String(env.BLOGGENIUS_ENV || '').trim().toLowerCase() !== 'development') {
        throw new Error('Development site operations require BLOGGENIUS_ENV=development.');
    }
}

async function ensureDevelopmentSiteDomain(adapter, accountId) {
    return ensureWorkerDomain(adapter, {
        accountId,
        hostname: SITE_HOST,
        workerName: WORKER_NAME,
        // Auto-create only when unbound, or accept the already-correct binding.
        // A legacy or unknown owner must be handled explicitly.
        allowedCurrentOwners: [WORKER_NAME],
        allowUnbound: true
    });
}

async function main(env = process.env) {
    assertWorkflowContext(env);
    const accessToken = String(env.CLOUDFLARE_API_TOKEN || '').trim();
    const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    if (!accessToken) throw new Error('CLOUDFLARE_API_TOKEN is required.');
    if (!/^[a-f\d]{32}$/i.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID is invalid.');
    const client = new Cloudflare({ apiToken: accessToken, maxRetries: 1 });
    const adapter = createCloudflareSdkAdapter({ client });
    const isCutover = process.argv.includes('--cutover-site-domain');
    const isRollback = process.argv.includes('--rollback-site-domain');

    if (isCutover || isRollback) {
        const targetWorker = isRollback ? LEGACY_WORKER : WORKER_NAME;
        const workers = await adapter.listWorkerScripts(accountId);
        if (!isRollback && !workers.some((script) => String(script?.id || script?.name || '') === targetWorker)) {
            throw new Error(`Development site Worker ${targetWorker} is missing; deploy and validate it before domain cutover.`);
        }
        const subdomain = await adapter.getWorkersSubdomain(accountId);
        if (!subdomain) throw new Error('Cloudflare account workers.dev subdomain is unavailable.');
        const workerUrl = `https://${targetWorker}.${subdomain}.workers.dev/`;
        if (!isRollback) await checkWithRetry(() => checkUrl(workerUrl, 'site'));
        const result = await ensureWorkerDomain(adapter, {
            accountId,
            hostname: SITE_HOST,
            workerName: targetWorker,
            allowedCurrentOwners: [LEGACY_WORKER, WORKER_NAME],
            // A one-time manual detach may leave the hostname unbound before cutover.
            allowUnbound: true
        });
        await checkWithRetry(() => checkUrl(`https://${SITE_HOST}/`, 'site'));
        console.info(JSON.stringify({ environment: 'development', operation: isRollback ? 'rollback-site-domain' : 'cutover-site-domain', worker_name: targetWorker, worker_url: workerUrl, ...result }));
        return;
    }

    if (!fs.existsSync(path.join(SITE_ROOT, 'dist', 'index.html'))) {
        throw new Error('Development site build output is missing.');
    }
    const deployer = createCloudflareStaticAssetsDeployer({
        createClient: (token) => new Cloudflare({ apiToken: token, maxRetries: 1 })
    });
    const deployment = await deployer.deploy({ id: SITE_ID, root_path: SITE_ROOT }, {
        accessToken,
        account: { id: accountId, name: 'GitHub Actions Development' }
    }, { environment: 'development', workerName: WORKER_NAME });

    if (deployment.worker_name !== WORKER_NAME) {
        throw new Error(`Deployment target mismatch: expected ${WORKER_NAME}, received ${deployment.worker_name}.`);
    }
    await checkWithRetry(() => checkUrl(deployment.url, 'site'));
    const domain = await ensureDevelopmentSiteDomain(adapter, accountId);
    await checkWithRetry(() => checkUrl(`https://${SITE_HOST}/`, 'site'));
    console.info(JSON.stringify({
        environment: 'development',
        worker_name: deployment.worker_name,
        url: deployment.url,
        hostname: SITE_HOST,
        domain_changed: domain.changed,
        deployment_id: deployment.deployment_id,
        version_id: deployment.version_id
    }));
}

if (require.main === module) main().catch((error) => {
    console.error(`[Development site deploy] ${String(error?.message || error).split(process.env.CLOUDFLARE_API_TOKEN || '\0').join('[redacted]')}`);
    process.exitCode = 1;
});

module.exports = { assertWorkflowContext, ensureDevelopmentSiteDomain, main };
