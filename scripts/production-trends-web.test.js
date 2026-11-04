'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { validateProductionTrendsWebTargets } = require('./production-trends-web-targets');
const { assertWorkflowContext } = require('./deploy-production-trends-site');
const { checkUrl, runSmoke } = require('./production-trends-web-smoke');
const productionWorkflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/deploy-trends-web-production.yml'), 'utf8');
const developmentWorkflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/environment-validation.yml'), 'utf8');
const siteSource = fs.readFileSync(path.join(__dirname, '../workspace/site-hosting/sites/www-bloggenius-kr/src/lib/site.ts'), 'utf8');

const expectedWorkers = [
    { id: 'bloggenius-trends-api-production' },
    { id: 'www-bloggenius-kr-production' }
];

function makeAdapter({ apiAliasOwner = '', siteOwner = 'bg-fca282ece0e348c4baf36294d0d3f0f0', siteWorkerExists = true, oldApiOwner = 'bloggenius-trends-api-production', aliasDns = [] } = {}) {
    return {
        listWorkerScripts: async () => siteWorkerExists ? expectedWorkers : expectedWorkers.slice(0, 1),
        listZones: async () => [{ id: 'zone-1', name: 'bloggenius.kr' }],
        listDnsRecords: async ({ hostname }) => hostname === 'trendapi.bloggenius.kr' ? aliasDns : [],
        listWorkerDomains: async ({ hostname }) => {
            const service = hostname === 'trendapi.hangadac.com' ? oldApiOwner
                : hostname === 'trendapi.bloggenius.kr' ? apiAliasOwner : siteOwner;
            return service ? [{ hostname, service }] : [];
        }
    };
}

test('Development and Production release workflows deploy the same three Worker roles', () => {
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
    assert.match(developmentWorkflow, /PUBLIC_TRENDS_API_BASE_URL: https:\/\/trendapi-dev\.bloggenius\.kr/);
    assert.match(productionWorkflow, /PUBLIC_TRENDS_API_BASE_URL: https:\/\/trendapi\.bloggenius\.kr/);
    const scopeBlocks = [...productionWorkflow.matchAll(/case "\$file" in([\s\S]*?)\n            esac/g)].map((match) => match[1]);
    assert.equal(scopeBlocks.length, 2);
    assert.match(scopeBlocks[0], /apps\/trends\/trends-api\/workers\/\*/) ;
    assert.doesNotMatch(scopeBlocks[1], /apps\/trends\/trends-api\/workers\/\*/);
    assert.match(scopeBlocks[1], /apps\/trends\/trends-api\/workers\/wrangler\.toml/);
});

test('Production targets require the API Worker and known site domain owner, while allowing a new site Worker', async () => {
    const result = await validateProductionTrendsWebTargets(makeAdapter(), 'a'.repeat(32));
    assert.equal(result.apiWorker, 'bloggenius-trends-api-production');
    assert.equal(result.siteWorker, 'www-bloggenius-kr-production');
    assert.equal(result.siteHost, 'www.bloggenius.kr');
    assert.equal(result.siteWorkerExists, true);
    const firstDeploy = await validateProductionTrendsWebTargets(makeAdapter({ siteWorkerExists: false }), 'a'.repeat(32));
    assert.equal(firstDeploy.siteWorkerExists, false);
    assert.equal(firstDeploy.siteHostOwner, 'bg-fca282ece0e348c4baf36294d0d3f0f0');
    await validateProductionTrendsWebTargets(makeAdapter({ apiAliasOwner: 'bloggenius-trends-api-production' }), 'a'.repeat(32));
    await assert.rejects(() => validateProductionTrendsWebTargets(makeAdapter({ apiAliasOwner: 'unexpected-worker' }), 'a'.repeat(32)), /trendapi.bloggenius.kr must belong/);
    await assert.rejects(() => validateProductionTrendsWebTargets(makeAdapter({ siteOwner: 'unexpected-worker' }), 'a'.repeat(32)), /known legacy Worker/);
    await assert.rejects(() => validateProductionTrendsWebTargets(makeAdapter({ oldApiOwner: 'unexpected-worker' }), 'a'.repeat(32)), /trendapi.hangadac.com must belong/);
    await assert.rejects(() => validateProductionTrendsWebTargets(makeAdapter({ aliasDns: [{ type: 'CNAME', name: 'trendapi.bloggenius.kr' }] }), 'a'.repeat(32)), /DNS records already exist/);
});

test('Production deploy wrapper accepts only workflow dispatch from release branches', () => {
    assert.doesNotThrow(() => assertWorkflowContext({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/release/v0.7.1', BLOGGENIUS_ENV: 'production' }));
    assert.throws(() => assertWorkflowContext({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', BLOGGENIUS_ENV: 'production' }), /release\/\*/);
    assert.throws(() => assertWorkflowContext({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/release/v0.7.1', BLOGGENIUS_ENV: 'production' }), /release\/\*/);
    assert.throws(() => assertWorkflowContext({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/release/v0.7.1', BLOGGENIUS_ENV: 'development' }), /BLOGGENIUS_ENV/);
});

test('Production migration preview must finish before the separately gated deploy job', () => {
    const preview = productionWorkflow.match(/  production-migration-preview:[\s\S]*?(?=\n  deploy:)/)?.[0] || '';
    const deploy = productionWorkflow.match(/  deploy:[\s\S]*$/)?.[0] || '';
    assert.match(preview, /environment: production/);
    assert.match(preview, /SUPABASE_DB_POOLER_URL: \$\{\{ secrets\.SUPABASE_DB_POOLER_URL \}\}/);
    assert.match(preview, /supabase db push --dry-run --remote="\$SUPABASE_DB_POOLER_URL"/);
    assert.doesNotMatch(preview, /supabase link/);
    assert.match(deploy, /needs: \[validate-release-ref, build, production-migration-preview\]/);
    assert.match(deploy, /needs\.production-migration-preview\.result == 'success'/);
    assert.match(deploy, /environment: production/);
    assert.match(deploy, /SUPABASE_DB_POOLER_URL: \$\{\{ secrets\.SUPABASE_DB_POOLER_URL \}\}/);
    assert.match(deploy, /required=\([^\n]*SUPABASE_DB_POOLER_URL/);
    assert.match(deploy, /Apply Production Supabase migrations[\s\S]*supabase db push --remote="\$SUPABASE_DB_POOLER_URL"/);
    assert.doesNotMatch(deploy, /supabase link/);
});

test('Production Worker deployment and site domain cutover are separate manual operations', () => {
    assert.match(productionWorkflow, /- deploy-workers[\s\S]*- cutover-site-domain[\s\S]*- rollback-site-domain/);
    const deploy = productionWorkflow.match(/  deploy:[\s\S]*?(?=\n  site-domain-cutover:)/)?.[0] || '';
    const cutover = productionWorkflow.match(/  site-domain-cutover:[\s\S]*$/)?.[0] || '';
    assert.match(deploy, /inputs\.operation == 'deploy-workers'/);
    assert.match(deploy, /Deploy or create the Production site Worker/);
    assert.doesNotMatch(deploy, /production-trends-web-smoke\.js site/);
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
