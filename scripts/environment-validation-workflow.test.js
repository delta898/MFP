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
    assert.match(workflow, /supabase db push[\s\S]*--dry-run[\s\S]*--remote="\$BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF"/);
    assert.match(workflow, /supabase db push[\s\S]*--remote="\$BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF"[\s\S]*--yes/);
    assert.doesNotMatch(workflow, /supabase link/);
    assert.match(workflow, /supabase migration list[\s\S]*--remote="\$BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF"[\s\S]*--output-format json/);
    assert.match(workflow, /supabase functions list[\s\S]*--remote="\$BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF"[\s\S]*--output-format json/);
    assert.match(workflow, /npm run env:development:drift/);
    assert.match(workflow, /npm run env:development:smoke/);
    assert.match(workflow, /development-promotion-/);

    const dryRun = workflow.indexOf('Preview pending Development migrations');
    const apply = workflow.indexOf('Apply pending Development migrations');
    const drift = workflow.indexOf('Fail on migration or Function drift');
    const smoke = workflow.indexOf('Safe public HTTP smoke');
    assert.ok(dryRun >= 0 && dryRun < apply && apply < drift && drift < smoke);
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
    assert.match(workflow, /deploy-development-workers:[\s\S]*npm run deploy:development/);
});

test('environment validation uses Node 24 based artifact and Supabase actions', () => {
    assert.doesNotMatch(workflow, /actions\/(?:upload|download)-artifact@v4/);
    assert.doesNotMatch(workflow, /supabase\/setup-cli@v[12]/);
    assert.doesNotMatch(workflow, /version:\s*latest/);
    assert.match(workflow, /actions\/upload-artifact@v6/);
    assert.match(workflow, /actions\/download-artifact@v7/);
    assert.equal((workflow.match(/supabase\/setup-cli@v3/g) || []).length, 1);
    assert.equal((workflow.match(/version:\s*4\.0\.0/g) || []).length, 1);
});
