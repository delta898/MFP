'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { validateProductionTrendsWebTargets } = require('./production-trends-web-targets');
const { assertWorkflowContext } = require('./deploy-production-trends-site');
const { checkUrl, runSmoke } = require('./production-trends-web-smoke');
const productionWorkflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/deploy-trends-web-production.yml'), 'utf8');

const expectedWorkers = [
    { id: 'bloggenius-trends-api-production' },
    { id: 'bg-www-bloggenius-kr' }
];

function makeAdapter({ apiAliasOwner = '', siteOwner = 'bg-www-bloggenius-kr', oldApiOwner = 'bloggenius-trends-api-production', aliasDns = [] } = {}) {
    return {
        listWorkerScripts: async () => expectedWorkers,
        listZones: async () => [{ id: 'zone-1', name: 'bloggenius.kr' }],
        listDnsRecords: async ({ hostname }) => hostname === 'trendapi.bloggenius.kr' ? aliasDns : [],
        listWorkerDomains: async ({ hostname }) => {
            const service = hostname === 'trendapi.hangadac.com' ? oldApiOwner
                : hostname === 'trendapi.bloggenius.kr' ? apiAliasOwner : siteOwner;
            return service ? [{ hostname, service }] : [];
        }
    };
}

test('Production targets require exact existing Workers and hostname owners', async () => {
    const result = await validateProductionTrendsWebTargets(makeAdapter(), 'a'.repeat(32));
    assert.equal(result.apiWorker, 'bloggenius-trends-api-production');
    assert.equal(result.siteHost, 'www.bloggenius.kr');
    await validateProductionTrendsWebTargets(makeAdapter({ apiAliasOwner: 'bloggenius-trends-api-production' }), 'a'.repeat(32));
    await assert.rejects(() => validateProductionTrendsWebTargets(makeAdapter({ apiAliasOwner: 'unexpected-worker' }), 'a'.repeat(32)), /trendapi.bloggenius.kr must belong/);
    await assert.rejects(() => validateProductionTrendsWebTargets(makeAdapter({ siteOwner: 'unexpected-worker' }), 'a'.repeat(32)), /www.bloggenius.kr must belong/);
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
    assert.match(preview, /supabase link --project-ref "\$BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_REF" --password "\$SUPABASE_DB_PASSWORD"/);
    assert.match(preview, /supabase db push --dry-run/);
    assert.match(deploy, /needs: \[validate-release-ref, build, production-migration-preview\]/);
    assert.match(deploy, /needs\.production-migration-preview\.result == 'success'/);
    assert.match(deploy, /environment: production/);
    assert.match(deploy, /Configure ephemeral Production database connection[\s\S]*supabase link --project-ref "\$BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_REF" --password "\$SUPABASE_DB_PASSWORD"/);
    assert.match(deploy, /Apply Production Supabase migrations[\s\S]*supabase db push --remote="\$BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_REF"/);
    assert.doesNotMatch(deploy, /Preview Production migration changes/);
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
