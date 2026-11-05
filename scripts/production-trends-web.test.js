'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { validateProductionTrendsWebTargets } = require('./production-trends-web-targets');
const { assertWorkflowContext, ensureProductionSiteDomain } = require('./deploy-production-trends-site');
const { checkUrl, createProductionReadSmokeToken, runSmoke } = require('./production-trends-web-smoke');
const productionWorkflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/deploy-trends-web-production.yml'), 'utf8');
const developmentWorkflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/environment-validation.yml'), 'utf8');
const developmentSiteWorkflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/deploy-trends-web-development.yml'), 'utf8');
const siteSource = fs.readFileSync(path.join(__dirname, '../workspace/site-hosting/sites/www-bloggenius-kr/src/lib/site.ts'), 'utf8');

const expectedWorkers = [
    { id: 'bloggenius-trends-api-production' },
    { id: 'www-bloggenius-kr-production' }
];

function makeAdapter({ apiAliasOwner = '', siteOwner = 'bg-fca282ece0e348c4baf36294d0d3f0f0', apiWorkerExists = true, siteWorkerExists = true, oldApiOwner = 'bloggenius-trends-api-production', aliasDns = [] } = {}) {
    return {
        listWorkerScripts: async () => [
            ...(apiWorkerExists ? [expectedWorkers[0]] : []),
            ...(siteWorkerExists ? [expectedWorkers[1]] : [])
        ],
        listZones: async () => [
            { id: 'zone-1', name: 'bloggenius.kr' },
            { id: 'zone-2', name: 'hangadac.com' }
        ],
        listDnsRecords: async ({ hostname }) => hostname === 'trendapi.bloggenius.kr' ? aliasDns : [],
        listWorkerDomains: async ({ hostname }) => {
            const service = hostname === 'trendapi.hangadac.com' ? oldApiOwner
                : hostname === 'trendapi.bloggenius.kr' ? apiAliasOwner : siteOwner;
            return service ? [{ hostname, service }] : [];
        }
    };
}

test('Development and Production push workflows deploy the same three Worker roles and canary', () => {
    assert.match(developmentWorkflow, /^name: Development \| Deploy Trends Release/m);
    assert.match(productionWorkflow, /^name: Production \| Deploy Trends Release/m);
    for (const role of [
        /newsletter Workflow Worker[\s\S]*wrangler deploy/,
        /Trends API Worker[\s\S]*wrangler deploy/,
        /site Worker[\s\S]*deploy-development-site\.js/
    ]) {
        assert.match(developmentWorkflow, role);
    }
    for (const role of [
        /newsletter Workflow Worker[\s\S]*wrangler deploy/,
        /Trends API Worker[\s\S]*wrangler deploy/,
        /site Worker[\s\S]*deploy-production-trends-site\.js/
    ]) {
    assert.match(productionWorkflow, role);
    }
    assert.match(developmentWorkflow, /SUPABASE_DB_POOLER_URL/);
    assert.match(productionWorkflow, /SUPABASE_DB_POOLER_URL/);
    assert.match(siteSource, /import\.meta\.env\.SITE/);
    assert.match(developmentWorkflow, /rel="canonical" href="https:\/\/www-dev\.bloggenius\.kr\//);
    assert.match(productionWorkflow, /rel="canonical" href="https:\/\/www\.bloggenius\.kr\//);
    assert.match(developmentWorkflow, /build-development-site:[\s\S]*environment: development[\s\S]*PUBLIC_TRENDS_API_BASE_URL: \$\{\{ vars\.BLOGGENIUS_TRENDS_API_URL \}\}/);
    assert.match(developmentSiteWorkflow, /environment: development[\s\S]*PUBLIC_TRENDS_API_BASE_URL: \$\{\{ vars\.BLOGGENIUS_TRENDS_API_URL \}\}/);
    assert.match(productionWorkflow, /push:[\s\S]*branches:[\s\S]*'release\/\*\*'/);
    assert.match(productionWorkflow, /Build and validate Production candidates/);
    assert.match(productionWorkflow, /Send fixed-recipient canary[\s\S]*scripts\/newsletter\/send-canary\.js/);
    assert.match(productionWorkflow, /Enable Production live delivery after canary success/);
    assert.match(productionWorkflow, /build:[\s\S]*environment: production[\s\S]*PUBLIC_TRENDS_API_BASE_URL: \$\{\{ vars\.BLOGGENIUS_TRENDS_API_URL \}\}/);
    assert.match(developmentWorkflow, /Development \| Send administrator canary/);
    assert.match(developmentWorkflow, /NEWSLETTER_EMAIL_MODE=disabled/);
    assert.match(developmentWorkflow, /Enable Development live delivery after canary success/);
    assert.ok(developmentWorkflow.indexOf('Disable Development newsletter delivery before database changes') < developmentWorkflow.indexOf('Apply pending Development migrations'));
    assert.ok(developmentWorkflow.indexOf('Send canary and wait for Telegram-backed Worker summary') < developmentWorkflow.indexOf('Enable Development live delivery after canary success'));
    assert.doesNotMatch(developmentWorkflow, /api\.telegram\.org|sendMessage/);
    assert.doesNotMatch(productionWorkflow, /api\.telegram\.org|sendMessage/);
});

test('Production releases deploy matching access-token Function from a release push', () => {
    const deploy = productionWorkflow.match(/  deploy-bloggenius:[\s\S]*?(?=\n  deploy-mentivenus:)/)?.[0] || '';
    assert.match(deploy, /required=\([^\n]*TRENDS_READ_TOKEN_SECRET/);
    assert.match(deploy, /Sync Production access-token Function secrets[\s\S]*SUPABASE_URL:process\.env\.SUPABASE_URL[\s\S]*SUPABASE_SECRET_KEY:process\.env\.SUPABASE_SECRET_KEY[\s\S]*TRENDS_READ_TOKEN_SECRET:process\.env\.TRENDS_READ_TOKEN_SECRET[\s\S]*TRENDS_READ_TOKEN_ISSUER:"bloggenius-license"[\s\S]*TRENDS_READ_TOKEN_AUDIENCE:"trends-api"[\s\S]*supabase secrets set/);
    assert.match(deploy, /Deploy Production access-token Edge Function[\s\S]*supabase functions deploy issue-trends-access-token/);
    assert.match(productionWorkflow, /- 'release\/\*\*'/);
    assert.match(deploy, /NEWSLETTER_RELEASE_SHA: \$\{\{ github\.sha \}\}/);
});

test('authenticated Production API smoke accepts the same token through legacy and canonical hosts', async () => {
    const requested = [];
    const results = await runSmoke('api-auth', async (url, options) => {
        requested.push({ url, authorization: options.headers.Authorization });
        return Response.json({ success: true, categories: ['IT·컴퓨터'], availableDates: ['2026-11-04'] });
    }, { TRENDS_READ_TOKEN_SECRET: 'production-smoke-test-secret' });
    assert.equal(results.length, 2);
    assert.deepEqual(requested.map(({ url }) => url), [
        'https://trendapi.hangadac.com/api/v1/trends/meta',
        'https://trendapi.bloggenius.kr/api/v1/trends/meta'
    ]);
    assert.equal(requested[0].authorization, requested[1].authorization);
    const claims = JSON.parse(Buffer.from(requested[0].authorization.split('.')[1], 'base64url').toString());
    assert.equal(claims.iss, 'bloggenius-license');
    assert.equal(claims.aud, 'trends-api');
    assert.throws(() => createProductionReadSmokeToken(''), /TRENDS_READ_TOKEN_SECRET is required/);
});

test('Production targets allow first-time Workers and unbound domains while rejecting conflicts', async () => {
    const result = await validateProductionTrendsWebTargets(makeAdapter(), 'a'.repeat(32));
    assert.equal(result.apiWorker, 'bloggenius-trends-api-production');
    assert.equal(result.apiWorkerExists, true);
    assert.equal(result.siteWorker, 'www-bloggenius-kr-production');
    assert.equal(result.siteHost, 'www.bloggenius.kr');
    assert.equal(result.siteWorkerExists, true);
    const firstDeploy = await validateProductionTrendsWebTargets(makeAdapter({ siteWorkerExists: false }), 'a'.repeat(32));
    assert.equal(firstDeploy.siteWorkerExists, false);
    assert.equal(firstDeploy.siteHostOwner, 'bg-fca282ece0e348c4baf36294d0d3f0f0');
    const unbound = await validateProductionTrendsWebTargets(makeAdapter({ siteOwner: '' }), 'a'.repeat(32));
    assert.equal(unbound.siteHostOwner, null);
    const freshWorkers = await validateProductionTrendsWebTargets(makeAdapter({ apiWorkerExists: false, siteWorkerExists: false, oldApiOwner: '', siteOwner: '' }), 'a'.repeat(32));
    assert.equal(freshWorkers.apiWorkerExists, false);
    assert.equal(freshWorkers.siteWorkerExists, false);
    await validateProductionTrendsWebTargets(makeAdapter({ apiAliasOwner: 'bloggenius-trends-api-production' }), 'a'.repeat(32));
    await assert.rejects(() => validateProductionTrendsWebTargets(makeAdapter({ apiAliasOwner: 'unexpected-worker' }), 'a'.repeat(32)), /trendapi.bloggenius.kr must belong/);
    await assert.rejects(() => validateProductionTrendsWebTargets(makeAdapter({ siteOwner: 'unexpected-worker' }), 'a'.repeat(32)), /known legacy Worker/);
    await assert.rejects(() => validateProductionTrendsWebTargets(makeAdapter({ oldApiOwner: 'unexpected-worker' }), 'a'.repeat(32)), /trendapi.hangadac.com must belong/);
    await assert.rejects(() => validateProductionTrendsWebTargets(makeAdapter({ aliasDns: [{ type: 'CNAME', name: 'trendapi.bloggenius.kr' }] }), 'a'.repeat(32)), /DNS records already exist/);
});

test('Production site deploy attaches an unbound hostname, keeps its target binding, and preserves the known legacy owner', async () => {
    const makeDomainAdapter = (owner) => {
        let currentOwner = owner;
        const attached = [];
        return {
            attached,
            listWorkerScripts: async () => [{ id: 'www-bloggenius-kr-production' }],
            listWorkerDomains: async ({ hostname }) => currentOwner ? [{ hostname, service: currentOwner }] : [],
            attachWorkerDomain: async ({ workerName, ...details }) => {
                attached.push({ workerName, ...details });
                currentOwner = workerName;
            },
            get owner() { return currentOwner; }
        };
    };

    const unbound = makeDomainAdapter('');
    const attached = await ensureProductionSiteDomain(unbound, 'account-1');
    assert.equal(attached.changed, true);
    assert.equal(unbound.owner, 'www-bloggenius-kr-production');
    assert.equal(unbound.attached.length, 1);

    const alreadyBound = makeDomainAdapter('www-bloggenius-kr-production');
    const kept = await ensureProductionSiteDomain(alreadyBound, 'account-1');
    assert.equal(kept.changed, false);
    assert.equal(alreadyBound.attached.length, 0);

    const legacy = makeDomainAdapter('bg-fca282ece0e348c4baf36294d0d3f0f0');
    const preserved = await ensureProductionSiteDomain(legacy, 'account-1');
    assert.equal(preserved.preservedLegacyOwner, true);
    assert.equal(legacy.owner, 'bg-fca282ece0e348c4baf36294d0d3f0f0');
    assert.equal(legacy.attached.length, 0);

    const unexpected = makeDomainAdapter('unexpected-worker');
    await assert.rejects(() => ensureProductionSiteDomain(unexpected, 'account-1'), /unexpected Worker/);
});

test('Production deploy wrapper accepts release pushes and manual release operations only', () => {
    assert.doesNotThrow(() => assertWorkflowContext({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/release/v0.7.1', BLOGGENIUS_ENV: 'production' }));
    assert.throws(() => assertWorkflowContext({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', BLOGGENIUS_ENV: 'production' }), /release\/\*/);
    assert.doesNotThrow(() => assertWorkflowContext({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/release/v0.7.1', BLOGGENIUS_ENV: 'production' }));
    assert.throws(() => assertWorkflowContext({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/release/v0.7.1', BLOGGENIUS_ENV: 'development' }), /BLOGGENIUS_ENV/);
});

test('Production migration preview must finish before the separately gated deploy job', () => {
    const preview = productionWorkflow.match(/  production-migration-preview:[\s\S]*?(?=\n  deploy-bloggenius:)/)?.[0] || '';
    const deploy = productionWorkflow.match(/  deploy-bloggenius:[\s\S]*?(?=\n  deploy-mentivenus:)/)?.[0] || '';
    assert.match(preview, /environment: production/);
    assert.match(preview, /SUPABASE_DB_POOLER_URL: \$\{\{ secrets\.SUPABASE_DB_POOLER_URL \}\}/);
    assert.match(preview, /supabase db push --dry-run --remote="\$SUPABASE_DB_POOLER_URL"/);
    assert.doesNotMatch(preview, /supabase link/);
    assert.match(deploy, /needs: \[deployment-changes, validate-release-ref, build, production-migration-preview\]/);
    assert.match(deploy, /needs\.production-migration-preview\.result == 'success'/);
    assert.match(deploy, /environment: production/);
    assert.match(deploy, /SUPABASE_DB_POOLER_URL: \$\{\{ secrets\.SUPABASE_DB_POOLER_URL \}\}/);
    assert.match(deploy, /required=\([^\n]*SUPABASE_DB_POOLER_URL/);
    assert.match(deploy, /Apply Production Supabase migrations through the Session Pooler[\s\S]*supabase db push --remote="\$SUPABASE_DB_POOLER_URL"/);
    assert.doesNotMatch(deploy, /supabase link/);
});

test('Production API Worker deployment includes the newsletter forwarding token', () => {
    const apiDeploy = productionWorkflow.match(/      - name: Deploy Production Trends API Worker[\s\S]*?(?=\n      - uses: actions\/download-artifact@v7)/)?.[0] || '';
    assert.match(apiDeploy, /names=\[[^\]]*"TRENDS_NEWSLETTER_WORKER_TOKEN"/);
    assert.match(apiDeploy, /npx wrangler deploy --env production --secrets-file/);
});

test('Production deploy is push-driven, ensures an unbound site hostname, and keeps legacy cutover manual', () => {
    assert.match(productionWorkflow, /- deploy-workers[\s\S]*- cutover-site-domain[\s\S]*- rollback-site-domain/);
    const deploy = productionWorkflow.match(/  deploy-bloggenius:[\s\S]*?(?=\n  deploy-mentivenus:)/)?.[0] || '';
    const cutover = productionWorkflow.match(/  site-domain-cutover:[\s\S]*$/)?.[0] || '';
    assert.match(deploy, /needs\.deployment-changes\.outputs\.bloggenius == 'true'/);
    assert.match(deploy, /needs\.production-migration-preview\.result == 'success'/);
    assert.match(deploy, /Deploy Production site Worker and ensure its domain/);
    assert.match(deploy, /deploy-production-trends-site\.js/);
    const deployScript = fs.readFileSync(path.join(__dirname, 'deploy-production-trends-site.js'), 'utf8');
    assert.match(deployScript, /await ensureProductionSiteDomain\(adapter, accountId\)/);
    assert.match(deployScript, /allowUnbound: true/);
    assert.match(deployScript, /preservedLegacyOwner: true/);
    assert.match(deployScript, /checkUrl\(`https:\/\/\$\{SITE_HOST\}\/`, 'site'\)/);
    assert.match(cutover, /environment: production/);
    assert.match(cutover, /--\$\{\{ inputs\.operation \}\}/);
});

test('API smoke verifies healthy Production response from both configured hostnames', async () => {
    const requested = [];
    const results = await runSmoke('api', async (url) => {
        requested.push(url);
        return url.endsWith('/health')
            ? Response.json({ success: true, service: 'trends-api', environment: 'production' })
            : Response.json({ success: true, categories: ['IT·컴퓨터'], availableDates: ['2026-11-04'] });
    });
    assert.equal(results.length, 4);
    assert.deepEqual(requested, [
        'https://trendapi.hangadac.com/health', 'https://trendapi.hangadac.com/api/v1/public/trends/meta',
        'https://trendapi.bloggenius.kr/health', 'https://trendapi.bloggenius.kr/api/v1/public/trends/meta'
    ]);
    await assert.rejects(() => checkUrl('https://trendapi.bloggenius.kr/health', 'api', async () =>
        Response.json({ success: true, service: 'trends-api', environment: 'development' })), /healthy Production/);
    await assert.rejects(() => checkUrl('https://www.bloggenius.kr/', 'site', async () => new Response('down', { status: 503 })), /HTTP 503/);
});
