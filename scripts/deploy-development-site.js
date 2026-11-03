'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Cloudflare = require('cloudflare');
const {
    createCloudflareSdkAdapter,
    createCloudflareStaticAssetsDeployer
} = require('../packages/plugins/core/astro-site-hosting/cloudflare-static-assets-deployer');

const SITE_ID = 'www-bloggenius-kr';
const WORKER_NAME = 'bg-www-bloggenius-kr-dev';
const SITE_ROOT = path.resolve(__dirname, '../workspace/site-hosting/sites/www-bloggenius-kr');

async function main(env = process.env) {
    if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_REF !== 'refs/heads/dev') {
        throw new Error('The site deployment script only runs on a GitHub Actions push to dev.');
    }
    if (String(env.BLOGGENIUS_ENV || '').trim().toLowerCase() !== 'development') {
        throw new Error('Development site deployment requires BLOGGENIUS_ENV=development.');
    }
    const accessToken = String(env.CLOUDFLARE_API_TOKEN || '').trim();
    const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    if (!accessToken) throw new Error('CLOUDFLARE_API_TOKEN is required.');
    if (!/^[a-f\d]{32}$/i.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID is invalid.');
    if (!fs.existsSync(path.join(SITE_ROOT, 'dist', 'index.html'))) {
        throw new Error('Development site build output is missing.');
    }

    const client = new Cloudflare({ apiToken: accessToken, maxRetries: 1 });
    const adapter = createCloudflareSdkAdapter({ client });
    const scripts = await adapter.listWorkerScripts(accountId);
    const matches = scripts.filter((script) => String(script?.id || script?.name || '') === WORKER_NAME);
    if (matches.length !== 1) {
        throw new Error(`Expected the existing Development Worker ${WORKER_NAME}; found ${matches.length}.`);
    }

    const deployer = createCloudflareStaticAssetsDeployer({
        createClient: (token) => new Cloudflare({ apiToken: token, maxRetries: 1 })
    });
    const deployment = await deployer.deploy({ id: SITE_ID, root_path: SITE_ROOT }, {
        accessToken,
        account: { id: accountId, name: 'GitHub Actions Development' }
    }, { environment: 'development' });

    if (deployment.worker_name !== WORKER_NAME) {
        throw new Error(`Deployment target mismatch: expected ${WORKER_NAME}, received ${deployment.worker_name}.`);
    }
    console.info(JSON.stringify({
        environment: 'development',
        worker_name: deployment.worker_name,
        url: deployment.url,
        deployment_id: deployment.deployment_id,
        version_id: deployment.version_id
    }));
}

main().catch((error) => {
    console.error(`[Development site deploy] ${String(error?.message || error).split(process.env.CLOUDFLARE_API_TOKEN || '\0').join('[redacted]')}`);
    process.exitCode = 1;
});
