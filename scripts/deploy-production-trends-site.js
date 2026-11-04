'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Cloudflare = require('cloudflare');
const { createCloudflareSdkAdapter, createCloudflareStaticAssetsDeployer } = require('../packages/plugins/core/astro-site-hosting/cloudflare-static-assets-deployer');
const { validateProductionTrendsWebTargets } = require('./production-trends-web-targets');

const SITE_ROOT = path.resolve(__dirname, '../workspace/site-hosting/sites/www-bloggenius-kr');

function assertWorkflowContext(env) {
    if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || !/^refs\/heads\/release\/.+/.test(env.GITHUB_REF || '')) {
        throw new Error('Production site deployment requires a manual workflow dispatch from a release/* branch.');
    }
    if (String(env.BLOGGENIUS_ENV || '').trim().toLowerCase() !== 'production') {
        throw new Error('Production site deployment requires BLOGGENIUS_ENV=production.');
    }
}

async function main(env = process.env) {
    assertWorkflowContext(env);
    const accessToken = String(env.CLOUDFLARE_API_TOKEN || '').trim();
    const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    if (!accessToken) throw new Error('CLOUDFLARE_API_TOKEN is required.');
    if (!/^[a-f\d]{32}$/i.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID is invalid.');
    const client = new Cloudflare({ apiToken: accessToken, maxRetries: 1 });
    const adapter = createCloudflareSdkAdapter({ client });
    const targets = await validateProductionTrendsWebTargets(adapter, accountId);
    if (process.argv.includes('--preflight')) {
        console.info(JSON.stringify({ environment: 'production', preflight: 'passed', ...targets }));
        return;
    }
    if (!fs.existsSync(path.join(SITE_ROOT, 'dist', 'index.html'))) throw new Error('Production site build output is missing.');

    const deployer = createCloudflareStaticAssetsDeployer({
        createClient: (token) => new Cloudflare({ apiToken: token, maxRetries: 1 })
    });
    const deployment = await deployer.deploy({ id: 'www-bloggenius-kr', root_path: SITE_ROOT }, {
        accessToken,
        account: { id: accountId, name: 'GitHub Actions Production' }
    }, { environment: 'production' });
    if (deployment.worker_name !== targets.siteWorker) {
        throw new Error(`Deployment target mismatch: expected ${targets.siteWorker}, received ${deployment.worker_name}.`);
    }
    console.info(JSON.stringify({ environment: 'production', worker_name: deployment.worker_name, url: deployment.url, deployment_id: deployment.deployment_id, version_id: deployment.version_id }));
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`[Production site deploy] ${String(error?.message || error).split(process.env.CLOUDFLARE_API_TOKEN || '\0').join('[redacted]')}`);
        process.exitCode = 1;
    });
}

module.exports = { assertWorkflowContext, main };
