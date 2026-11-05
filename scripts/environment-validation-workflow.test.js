'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(process.cwd(), '.github/workflows/environment-validation.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('documentation and convenience launchers do not trigger environment validation', () => {
    const ignoredDocumentation = workflow.match(/- 'docs\/\*\*'/g) || [];
    const ignoredMarkdown = workflow.match(/- '\*\*\/\*\.md'/g) || [];
    const ignoredLaunchers = workflow.match(/- 'run_\*\.sh'/g) || [];

    assert.equal(ignoredDocumentation.length, 2);
    assert.equal(ignoredMarkdown.length, 2);
    assert.equal(ignoredLaunchers.length, 2);
});

test('environment CI relies on hosted development rather than rebuilding local Supabase', () => {
    assert.doesNotMatch(workflow, /local-validation/);
    assert.doesNotMatch(workflow, /npm run env:local:/);
    assert.doesNotMatch(workflow, /supabase stop --no-backup/);
});

test('Development migrations are previewed and applied before drift and smoke checks', () => {
    assert.match(workflow, /github\.ref == 'refs\/heads\/dev'/);
    assert.match(workflow, /github\.ref == 'refs\/heads\/dev' &&[\s\S]*inputs\.mode == 'development-drift'/);
    assert.match(workflow, /SUPABASE_ENV: development/);
    assert.match(workflow, /denoland\/setup-deno@v2[\s\S]*deno check supabase\/functions\/trends-mailing-list\/index\.ts[\s\S]*deno test supabase\/functions\/trends-mailing-list\/handler_test\.ts/);
    assert.match(workflow, /supabase db push[\s\S]*--dry-run[\s\S]*--remote="\$SUPABASE_DB_POOLER_URL"/);
    assert.match(workflow, /supabase db push[\s\S]*--remote="\$SUPABASE_DB_POOLER_URL"[\s\S]*--yes/);
    assert.match(workflow, /Apply pending Development migrations[\s\S]*if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/dev'/);
    const validation = workflow.match(/  validate-development-workers:[\s\S]*?(?=\n  validate-development-site:)/)?.[0] || '';
    assert.match(validation, /inputs\.mode == 'development-drift'/);
    assert.doesNotMatch(validation, /needs: development-drift/);
    const workerDeploy = workflow.match(/  deploy-development-workers:[\s\S]*?(?=\n  deploy-development-site:)/)?.[0] || '';
    assert.match(workerDeploy, /needs: \[deployment-changes, development-drift, validate-development-workers\]/);
    assert.match(workerDeploy, /needs\.deployment-changes\.outputs\.bloggenius == 'true'/);
    assert.match(workflow, /Deploy Development newsletter Edge Function[\s\S]*if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/dev'[\s\S]*supabase functions deploy trends-mailing-list[\s\S]*--remote="\$BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF"[\s\S]*--yes/);
    assert.match(workflow, /Sync Development Trends access-token Function secrets[\s\S]*TRENDS_READ_TOKEN_ISSUER:"bloggenius-development"[\s\S]*TRENDS_READ_TOKEN_AUDIENCE:"trends-api-development"[\s\S]*supabase secrets set[\s\S]*--project-ref "\$BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF"/);
    assert.match(workflow, /Deploy Development Trends access-token Edge Function[\s\S]*supabase functions deploy issue-trends-access-token[\s\S]*--remote="\$BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF"[\s\S]*--yes/);
    assert.doesNotMatch(workflow, /supabase link/);
    assert.match(workflow, /supabase migration list[\s\S]*--remote="\$SUPABASE_DB_POOLER_URL"[\s\S]*--output-format json/);
    assert.match(workflow, /supabase functions list[\s\S]*--remote="\$BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF"[\s\S]*--output-format json/);
    assert.match(workflow, /npm run env:development:drift/);
    assert.match(workflow, /npm run env:development:smoke/);
    assert.match(workflow, /https:\/\/www-dev\.bloggenius\.kr/);
    assert.match(workflow, /Production canonical metadata was found in the Development site artifact/);
    const siteBuild = workflow.match(/  build-development-site:[\s\S]*?(?=\n  validate-development-workers:|\n  deploy-development-workers:)/)?.[0] || '';
    assert.match(siteBuild, /environment: development/);
    assert.match(siteBuild, /PUBLIC_TRENDS_API_BASE_URL: \$\{\{ vars\.BLOGGENIUS_TRENDS_API_URL \}\}/);
    assert.match(siteBuild, /https:\/\/trendapi-dev\.bloggenius\.kr/);
    assert.match(workflow, /development-promotion-/);
    assert.match(workflow, /Deploy the Development site Worker and ensure its domain[\s\S]*node scripts\/deploy-development-site\.js/);

    const dryRun = workflow.indexOf('Preview pending Development migrations');
    const apply = workflow.indexOf('Apply pending Development migrations');
    const edgeDeploy = workflow.indexOf('Deploy Development newsletter Edge Function');
    const trendsTokenConfig = workflow.indexOf('Sync Development Trends access-token Function secrets');
    const trendsTokenDeploy = workflow.indexOf('Deploy Development Trends access-token Edge Function');
    const readFunctions = workflow.indexOf('Read remote Function state');
    const drift = workflow.indexOf('Fail on migration or Function drift');
    const smoke = workflow.indexOf('Safe public HTTP smoke');
    assert.ok(dryRun >= 0 && dryRun < apply && apply < edgeDeploy && edgeDeploy < trendsTokenConfig && trendsTokenConfig < trendsTokenDeploy && trendsTokenDeploy < readFunctions && readFunctions < drift && drift < smoke);
});

test('production remains a manual non-deploying checklist', () => {
    assert.match(workflow, /inputs\.mode == 'production-checklist'/);
    assert.match(workflow, /development_run_id is required/);
    assert.match(workflow, /npm run (?:--silent )?env:production:checklist/);
    const productionChecklist = workflow.split('  production-checklist:')[1];
    assert.ok(productionChecklist, 'production checklist job exists');
    assert.doesNotMatch(productionChecklist, /supabase db push/);
    assert.doesNotMatch(productionChecklist, /supabase functions deploy/);
    assert.doesNotMatch(productionChecklist, /supabase secrets set/);
    assert.match(workflow, /development-drift:[\s\S]*supabase db push/);
    assert.match(workflow, /deploy-development-workers:[\s\S]*SUPABASE_SECRET_KEY: \$\{\{ secrets\.TRENDS_SUPABASE_SECRET_KEY \}\}[\s\S]*TRENDS_API_TOKEN: \$\{\{ secrets\.TRENDS_API_TOKEN \}\}[\s\S]*TRENDS_READ_TOKEN_SECRET: \$\{\{ secrets\.TRENDS_READ_TOKEN_SECRET \}\}[\s\S]*TRENDS_NEWSLETTER_WORKER_TOKEN: \$\{\{ secrets\.TRENDS_NEWSLETTER_WORKER_TOKEN \}\}[\s\S]*wrangler deploy --env='' --secrets-file/);
    assert.equal((workflow.match(/supabase functions deploy trends-mailing-list/g) || []).length, 1);
    assert.equal((workflow.match(/supabase functions deploy issue-trends-access-token/g) || []).length, 1);
});

test('environment validation uses Node 24 based artifact and Supabase actions', () => {
    assert.doesNotMatch(workflow, /actions\/(?:upload|download)-artifact@v4/);
    assert.doesNotMatch(workflow, /supabase\/setup-cli@v[12]/);
    assert.doesNotMatch(workflow, /version:\s*latest/);
    assert.match(workflow, /actions\/upload-artifact@v6/);
    assert.match(workflow, /actions\/download-artifact@v7/);
    assert.equal((workflow.match(/supabase\/setup-cli@v3/g) || []).length, 2);
    assert.equal((workflow.match(/version:\s*3\.0\.0-beta\.17/g) || []).length, 2);
});
